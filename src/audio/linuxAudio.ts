import { access, rename, unlink } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { stat } from "node:fs/promises";
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

const runCommand = async (command: string, args: string[], allowedExitCodes: number[] = [0]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== null && allowedExitCodes.includes(code)) {
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
    const captureBoostEnabled = this.config.audioCaptureBoostDb > 0;
    const captureChannelProcessingRequired = this.config.audioInputChannels > 1;
    const capturePostprocessAvailable =
      (!captureBoostEnabled && !captureChannelProcessingRequired) ||
      (await commandExists("sox")) ||
      (await commandExists("ffmpeg"));

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
      {
        name: "audio-postprocess",
        ok: capturePostprocessAvailable,
        detail: capturePostprocessAvailable
          ? buildAudioPostprocessDetail(
              this.config.audioCaptureBoostDb,
              this.config.audioInputChannels,
              this.config.audioInputChannelSelect,
            )
          : captureBoostEnabled || captureChannelProcessingRequired
            ? "install `sox` or `ffmpeg` for capture channel processing/post-processing"
            : "capture post-processing disabled",
      },
    ];
  }

  async recordSample(options?: { disableVad?: boolean }): Promise<string> {
    const outputPath = join(
      this.config.audioWorkDir,
      `sample-${Date.now()}.wav`,
    );

    let attemptedVad = false;
    const shouldUseVad = this.config.audioUseVad && !options?.disableVad;
    if (shouldUseVad && (await commandExists("sox"))) {
      attemptedVad = true;
      const threshold = `${Math.max(1, this.config.audioVadThresholdPercent)}%`;
      const vadArgs = [
        "-t",
        "alsa",
        this.config.audioInputDevice,
        "-r",
        String(this.config.audioSampleRate),
        "-c",
        String(this.config.audioInputChannels),
        outputPath,
        "silence",
        "1",
        `${Math.max(1, this.config.audioVadMinSpeechSeconds)}.0`,
        threshold,
        "1",
        `${Math.max(1, this.config.audioVadSilenceSeconds)}.0`,
        threshold,
        "trim",
        "0",
        String(Math.max(this.config.audioRecordSeconds, this.config.audioVadMaxSeconds)),
      ];

      if (await commandExists("timeout")) {
        const timeoutSeconds = Math.max(this.config.audioRecordSeconds, this.config.audioVadMaxSeconds) + 2;
        await runCommand("timeout", [String(timeoutSeconds), "sox", ...vadArgs], [0, 124]);
      } else {
        await runCommand("sox", vadArgs);
      }
    }

    const hasUsableOutput = async (): Promise<boolean> => {
      if (!(await fileExists(outputPath))) {
        return false;
      }
      const info = await stat(outputPath);
      return info.size > 44;
    };

    if (attemptedVad && !(await hasUsableOutput())) {
      // Fallback for environments where VAD thresholds produce header-only files.
      if (await commandExists("arecord")) {
        const args = [
          "-D",
          this.config.audioInputDevice,
          "-d",
          String(this.config.audioRecordSeconds),
          "-f",
          "S16_LE",
          "-c",
          String(this.config.audioInputChannels),
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
          String(this.config.audioInputChannels),
          outputPath,
          "trim",
          "0",
          String(this.config.audioRecordSeconds),
        ];
        await runCommand("sox", args);
      }
    } else if (!attemptedVad && (await commandExists("arecord"))) {
      const args = [
        "-D",
        this.config.audioInputDevice,
        "-d",
        String(this.config.audioRecordSeconds),
        "-f",
        "S16_LE",
        "-c",
        String(this.config.audioInputChannels),
        "-r",
        String(this.config.audioSampleRate),
        outputPath,
      ];
      await runCommand("arecord", args);
    } else if (!attemptedVad && (await commandExists("sox"))) {
      const args = [
        "-t",
        "alsa",
        this.config.audioInputDevice,
        "-r",
        String(this.config.audioSampleRate),
        "-c",
        String(this.config.audioInputChannels),
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

    await this.normalizeCaptureChannels(outputPath);
    await this.postProcessRecording(outputPath);

    return outputPath;
  }

  private async normalizeCaptureChannels(outputPath: string): Promise<void> {
    if (this.config.audioInputChannels <= 1) {
      return;
    }

    const normalizedPath = `${outputPath}.mono.wav`;
    try {
      if (await commandExists("sox")) {
        const remixTarget =
          this.config.audioInputChannelSelect === "left"
            ? "1"
            : this.config.audioInputChannelSelect === "right"
              ? "2"
              : "1,2";
        await runCommand("sox", [outputPath, normalizedPath, "remix", remixTarget]);
      } else if (await commandExists("ffmpeg")) {
        const pan =
          this.config.audioInputChannelSelect === "left"
            ? "mono|c0=FL"
            : this.config.audioInputChannelSelect === "right"
              ? "mono|c0=FR"
              : "mono|c0=0.5*FL+0.5*FR";
        await runCommand("ffmpeg", ["-y", "-i", outputPath, "-af", `pan=${pan}`, normalizedPath]);
      } else {
        throw new Error("No supported capture channel processor found. Install `sox` or `ffmpeg`.");
      }

      await rename(normalizedPath, outputPath);
    } catch (error) {
      await unlink(normalizedPath).catch(() => undefined);
      throw error;
    }
  }

  private async postProcessRecording(outputPath: string): Promise<void> {
    if (this.config.audioCaptureBoostDb <= 0) {
      return;
    }

    const processedPath = `${outputPath}.processed.wav`;
    try {
      if (await commandExists("sox")) {
        await this.postProcessWithSox(outputPath, processedPath);
      } else if (await commandExists("ffmpeg")) {
        await this.postProcessWithFfmpeg(outputPath, processedPath);
      } else {
        throw new Error("No supported post-processor found. Install `sox` or `ffmpeg`.");
      }

      await rename(processedPath, outputPath);
    } catch (error) {
      await unlink(processedPath).catch(() => undefined);
      throw error;
    }
  }

  private async postProcessWithSox(inputPath: string, outputPath: string): Promise<void> {
    const args = [
      inputPath,
      outputPath,
      "highpass",
      String(Math.max(20, this.config.audioCaptureHighpassHz)),
      "lowpass",
      String(Math.max(1000, this.config.audioCaptureLowpassHz)),
      "gain",
      String(this.config.audioCaptureBoostDb),
      "gain",
      "-n",
      "-1",
    ];
    await runCommand("sox", args);
  }

  private async postProcessWithFfmpeg(inputPath: string, outputPath: string): Promise<void> {
    const filters = [
      `highpass=f=${Math.max(20, this.config.audioCaptureHighpassHz)}`,
      `lowpass=f=${Math.max(1000, this.config.audioCaptureLowpassHz)}`,
      `volume=${this.config.audioCaptureBoostDb}dB`,
      "alimiter=limit=0.92",
    ];
    const args = [
      "-y",
      "-i",
      inputPath,
      "-af",
      filters.join(","),
      "-c:a",
      "pcm_s16le",
      outputPath,
    ];
    await runCommand("ffmpeg", args);
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

const buildAudioPostprocessDetail = (
  boostDb: number,
  inputChannels: number,
  inputChannelSelect: AppConfig["audioInputChannelSelect"],
): string => {
  const parts: string[] = [];
  if (inputChannels > 1) {
    parts.push(`capture channel select ${inputChannelSelect} from ${inputChannels}ch input`);
  }
  if (boostDb > 0) {
    parts.push(`capture boost enabled at ${boostDb} dB`);
  }
  return parts.length > 0 ? parts.join("; ") : "capture post-processing disabled";
};
