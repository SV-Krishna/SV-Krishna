import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { commandExists } from "../audio/linuxAudio";
import type { AppConfig, PreflightCheck } from "../types";

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export class PiperClient {
  private readonly enabled: boolean;
  private readonly binaryPath: string;
  private readonly modelPath: string;
  private readonly outputDir: string;

  constructor(config: AppConfig) {
    this.enabled = config.enableTts;
    this.binaryPath = config.piperBinaryPath;
    this.modelPath = config.piperModelPath;
    this.outputDir = config.audioWorkDir;
  }

  async runPreflightChecks(): Promise<PreflightCheck[]> {
    if (!this.enabled) {
      return [
        {
          name: "piper",
          ok: true,
          detail: "disabled",
        },
      ];
    }

    const checks: PreflightCheck[] = [];
    const binaryAvailable = await commandExists(this.binaryPath);
    checks.push({
      name: "piper-binary",
      ok: binaryAvailable,
      detail: binaryAvailable
        ? this.binaryPath
        : `binary not found: ${this.binaryPath}`,
    });

    const modelConfigured =
      Boolean(this.modelPath) &&
      this.modelPath !== "/path/to/piper/voice/model.onnx";
    checks.push({
      name: "piper-model",
      ok: modelConfigured,
      detail: modelConfigured
        ? this.modelPath
        : "set PIPER_MODEL_PATH to a real Piper voice model",
    });

    if (modelConfigured) {
      const modelExists = await fileExists(this.modelPath);
      checks.push({
        name: "piper-model-file",
        ok: modelExists,
        detail: modelExists
          ? this.modelPath
          : `model file not found: ${this.modelPath}`,
      });
    }

    return checks;
  }

  async synthesize(text: string): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }

    if (!this.modelPath || this.modelPath === "/path/to/piper/voice/model.onnx") {
      throw new Error("Piper model path is not configured.");
    }

    const outputPath = join(this.outputDir, `reply-${Date.now()}.wav`);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.binaryPath, [
        "--model",
        this.modelPath,
        "--output_file",
        outputPath,
      ], {
        stdio: ["pipe", "ignore", "pipe"],
      });

      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.stdin.write(text);
      child.stdin.end();

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`piper exited with code ${code}: ${stderr.trim()}`));
      });

      child.on("error", (error) => {
        reject(error);
      });
    });

    if (!(await fileExists(outputPath))) {
      throw new Error(`Piper did not produce an output file at ${outputPath}.`);
    }

    return outputPath;
  }
}
