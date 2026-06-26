import { access, mkdir, rename, unlink } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { Logger } from "../logger";
import { commandExists } from "../audio/linuxAudio";
import type { AppConfig } from "../types";
import { PiperClient } from "./piperClient";

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const slugifyCueText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "cue";

export class AudioCueService {
  private readonly logger: Logger;
  private readonly enabled: boolean;
  private readonly cueText: string;
  private readonly cuePath: string;
  private readonly outputDevice: string;
  private preparing: Promise<void> | null = null;
  private player: ChildProcess | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly piper: PiperClient,
  ) {
    this.logger = new Logger(config.logLevel);
    this.enabled = config.enableTts && config.enableTranscribingCue;
    this.cueText = config.transcribingCueText;
    this.outputDevice = config.audioOutputDevice;
    this.cuePath = join(
      config.audioWorkDir,
      "cues",
      `transcribing-${slugifyCueText(this.cueText)}.wav`,
    );
  }

  async prepare(): Promise<void> {
    if (!this.enabled || this.preparing) {
      return await (this.preparing ?? Promise.resolve());
    }

    this.preparing = this.prepareInternal().finally(() => {
      this.preparing = null;
    });
    await this.preparing;
  }

  async playTranscribingCue(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (!(await fileExists(this.cuePath))) {
      return;
    }

    await this.stop();

    const useAplay = await commandExists("aplay");
    const usePlay = !useAplay && (await commandExists("play"));
    if (!useAplay && !usePlay) {
      return;
    }

    const child = useAplay
      ? spawn("aplay", ["-q", "-D", this.outputDevice, this.cuePath], {
          stdio: ["ignore", "ignore", "pipe"],
        })
      : spawn("play", ["-q", "-t", "wav", this.cuePath], {
          stdio: ["ignore", "ignore", "pipe"],
        });

    this.player = child;

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (this.player === child) {
        this.player = null;
      }
      if (code && code !== 0) {
        const detail = stderr.trim();
        if (detail.length > 0) {
          this.logger.debug(`Transcribing cue playback failed: ${detail}`);
        }
      }
    });

    child.on("error", (error) => {
      if (this.player === child) {
        this.player = null;
      }
      this.logger.debug(`Transcribing cue spawn failed: ${error.message}`);
    });
  }

  async stop(): Promise<void> {
    if (!this.player) {
      return;
    }

    const active = this.player;
    this.player = null;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      active.once("close", finish);
      active.once("error", finish);
      active.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) {
          active.kill("SIGKILL");
          finish();
        }
      }, 250);
    });
  }

  private async prepareInternal(): Promise<void> {
    await mkdir(dirname(this.cuePath), { recursive: true });
    if (await fileExists(this.cuePath)) {
      return;
    }

    const tempPath = `${this.cuePath}.tmp`;
    try {
      await this.piper.synthesizeToFile(this.cueText, tempPath);
      await rename(tempPath, this.cuePath);
      this.logger.info(`Prepared transcribing cue at ${this.cuePath}.`);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Failed to prepare transcribing cue: ${detail}`);
    }
  }
}
