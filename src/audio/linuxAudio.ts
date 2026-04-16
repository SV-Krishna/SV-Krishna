import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { AppConfig, PreflightCheck } from "../types";

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export const commandExists = async (command: string): Promise<boolean> => {
  return await new Promise<boolean>((resolve) => {
    const child = spawn("sh", ["-lc", `command -v ${command}`], {
      stdio: "ignore",
    });

    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
};

const runCommand = async (command: string, args: string[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
};

export class LinuxAudio {
  constructor(private readonly config: AppConfig) {}

  async runPreflightChecks(): Promise<PreflightCheck[]> {
    const recorderAvailable =
      (await commandExists("arecord")) || (await commandExists("sox"));
    const playbackAvailable =
      (await commandExists("aplay")) || (await commandExists("play"));

    return [
      {
        name: "audio-record",
        ok: recorderAvailable,
        detail: recorderAvailable
          ? "recorder available"
          : "install `arecord` or `sox`",
      },
      {
        name: "audio-playback",
        ok: playbackAvailable,
        detail: playbackAvailable
          ? "playback command available"
          : "install `aplay` or `sox`",
      },
    ];
  }

  async recordSample(): Promise<string> {
    const outputPath = join(
      this.config.audioWorkDir,
      `sample-${Date.now()}.wav`,
    );

    if (await commandExists("arecord")) {
      const args = [
        "-D",
        this.config.audioInputDevice,
        "-d",
        String(this.config.audioRecordSeconds),
        "-f",
        "S16_LE",
        "-c",
        "1",
        "-r",
        String(this.config.audioSampleRate),
        outputPath,
      ];
      await runCommand("arecord", args);
    } else if (await commandExists("sox")) {
      const args = [
        "-t",
        "alsa",
        this.config.audioInputDevice,
        "-r",
        String(this.config.audioSampleRate),
        "-c",
        "1",
        outputPath,
        "trim",
        "0",
        String(this.config.audioRecordSeconds),
      ];
      await runCommand("sox", args);
    } else {
      throw new Error("No supported recorder found. Install `arecord` or `sox`.");
    }

    if (!(await fileExists(outputPath))) {
      throw new Error(`Recording did not produce an output file at ${outputPath}.`);
    }

    return outputPath;
  }

  async playFile(path: string): Promise<void> {
    if (await commandExists("aplay")) {
      await runCommand("aplay", ["-D", this.config.audioOutputDevice, path]);
      return;
    }

    if (await commandExists("play")) {
      await runCommand("play", ["-t", "wav", path]);
      return;
    }

    throw new Error("No supported playback command found. Install `aplay` or `sox`.");
  }
}
