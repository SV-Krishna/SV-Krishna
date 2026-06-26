import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { resolve } from "node:path";
import type { Readable } from "node:stream";
import { Logger } from "../logger";
import type { AppConfig, PreflightCheck } from "../types";
import { commandExists } from "../audio/linuxAudio";

export interface WakeWordEvent {
  event: "wake-detected" | "wake-captured";
  phrase: string;
  score: number;
  detectedAt: string;
  filePath?: string;
}

export interface WakeWordRuntimeStatus {
  running: boolean;
  lastError: string | null;
}

interface WakeWordDetectorOutput {
  event?: string;
  phrase?: unknown;
  score?: unknown;
  detectedAt?: unknown;
  filePath?: unknown;
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const scriptPath = resolve(process.cwd(), "python", "wakeword_detector.py");

export class WakeWordService {
  private readonly logger: Logger;
  private process: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private stdoutBuffer = "";
  private lastError: string | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly onWake: (event: WakeWordEvent) => Promise<void>,
  ) {
    this.logger = new Logger(config.logLevel);
  }

  async runPreflightChecks(): Promise<PreflightCheck[]> {
    const checks: PreflightCheck[] = [];
    const pythonOk = await commandExists(this.config.wakeWordPythonPath);
    checks.push({
      name: "wakeword-python",
      ok: pythonOk,
      detail: pythonOk ? this.config.wakeWordPythonPath : `install or configure ${this.config.wakeWordPythonPath}`,
    });

    const modelOk = await fileExists(this.config.wakeWordModelPath);
    checks.push({
      name: "wakeword-model",
      ok: modelOk,
      detail: modelOk ? this.config.wakeWordModelPath : `missing model at ${this.config.wakeWordModelPath}`,
    });

    const scriptOk = await fileExists(scriptPath);
    checks.push({
      name: "wakeword-script",
      ok: scriptOk,
      detail: scriptOk ? scriptPath : `missing detector script ${scriptPath}`,
    });

    const captureOk = (await commandExists("arecord")) || (await commandExists("sox"));
    checks.push({
      name: "wakeword-capture",
      ok: captureOk,
      detail: captureOk ? "microphone capture command available" : "install `arecord` or `sox`",
    });

    return checks;
  }

  getRuntimeStatus(): WakeWordRuntimeStatus {
    return {
      running: this.process !== null,
      lastError: this.lastError,
    };
  }

  async start(): Promise<void> {
    if (this.process) {
      return;
    }

    const checks = await this.runPreflightChecks();
    const failed = checks.find((check) => !check.ok);
    if (failed) {
      this.lastError = failed.detail;
      this.logger.warn(`Wake word listener not started: ${failed.detail}`);
      return;
    }

    this.lastError = null;
    this.stdoutBuffer = "";
    const child = spawn(
      this.config.wakeWordPythonPath,
      [
        scriptPath,
        "--model-path",
        this.config.wakeWordModelPath,
        "--inference-framework",
        this.config.wakeWordModelPath.toLowerCase().endsWith(".onnx") ? "onnx" : "tflite",
        "--phrase",
        this.config.wakeWordPhrase,
        "--input-device",
        this.config.audioInputDevice,
        "--input-channels",
        String(this.config.audioInputChannels),
        "--channel-select",
        this.config.audioInputChannelSelect,
        "--threshold",
        String(this.config.wakeWordThreshold),
        "--chunk-size",
        String(this.config.wakeWordChunkSize),
        "--cooldown-ms",
        String(this.config.wakeWordCooldownMs),
        "--sample-rate",
        String(this.config.audioSampleRate),
        "--command-seconds",
        String(this.config.audioRecordSeconds),
        "--output-dir",
        this.config.audioWorkDir,
        "--preroll-ms",
        "800",
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    this.process = child;

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.stdoutBuffer += chunk;
      this.flushStdoutBuffer();
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const detail = chunk.trim();
      if (detail.length > 0) {
        this.lastError = detail;
        this.logger.debug(`Wake word stderr: ${detail}`);
      }
    });

    child.on("close", (code) => {
      this.process = null;
      if (code !== 0 && code !== null) {
        this.lastError = `wake word detector exited with code ${code}`;
        this.logger.warn(this.lastError);
      }
    });

    child.on("error", (error) => {
      this.process = null;
      this.lastError = error.message;
      this.logger.warn(`Wake word detector failed: ${error.message}`);
    });

    this.logger.info(`Wake word listener starting for "${this.config.wakeWordPhrase}".`);
  }

  stop(): void {
    if (!this.process) {
      return;
    }

    const active = this.process;
    this.process = null;
    active.kill("SIGTERM");
  }

  async stopAndWait(timeoutMs = 1_000): Promise<void> {
    if (!this.process) {
      return;
    }

    const active = this.process;
    this.process = null;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      };

      active.once("close", finish);
      active.once("error", finish);
      active.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) {
          active.kill("SIGKILL");
          finish();
        }
      }, timeoutMs);
    });
  }

  private flushStdoutBuffer(): void {
    while (true) {
      const newlineIndex = this.stdoutBuffer.indexOf("\n");
      if (newlineIndex === -1) {
        return;
      }

      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      void this.handleDetectorLine(line);
    }
  }

  private async handleDetectorLine(line: string): Promise<void> {
    try {
      const parsed = JSON.parse(line) as WakeWordDetectorOutput;
      if (parsed.event !== "wake-detected" && parsed.event !== "wake-captured") {
        return;
      }

      const phrase = typeof parsed.phrase === "string" ? parsed.phrase : this.config.wakeWordPhrase;
      const score = typeof parsed.score === "number" ? parsed.score : 0;
      const detectedAt = typeof parsed.detectedAt === "string" ? parsed.detectedAt : new Date().toISOString();
      const filePath = typeof parsed.filePath === "string" ? parsed.filePath : undefined;
      await this.onWake({ event: parsed.event, phrase, score, detectedAt, filePath });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.lastError = detail;
      this.logger.debug(`Wake word output parse failed: ${detail}`);
    }
  }
}
