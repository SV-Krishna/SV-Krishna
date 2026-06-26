import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import type { AppConfig, ControllerState, PreflightCheck } from "../types";

interface LedProfile {
  effect: 0 | 1 | 2 | 3 | 4;
  brightness?: number;
  speed?: number;
  color?: number;
  doaColor?: [number, number];
}

const COLOR = {
  blue: 0x0040ff,
  cyan: 0x00ffff,
  amber: 0xff8c00,
  purple: 0x8000ff,
  green: 0x00ff40,
  red: 0xff0000,
} as const;

const PROFILE_BY_STATE: Record<ControllerState, LedProfile> = {
  starting: { effect: 2, brightness: 48, speed: 1 },
  idle: { effect: 4, doaColor: [0x001030, COLOR.cyan] },
  listening: { effect: 3, color: COLOR.green, brightness: 144 },
  playing: { effect: 3, color: COLOR.green, brightness: 96 },
  transcribing: { effect: 3, color: COLOR.amber, brightness: 144 },
  thinking: { effect: 2, brightness: 120, speed: 2 },
  speaking: { effect: 1, color: COLOR.green, brightness: 160, speed: 3 },
  error: { effect: 3, color: COLOR.red, brightness: 160 },
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const runCommand = async (command: string, args: string[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        LD_LIBRARY_PATH: `${dirname(command)}:${process.env.LD_LIBRARY_PATH ?? ""}`,
      },
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
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}: ${stderr.trim()}`));
    });
    child.on("error", reject);
  });
};

export class ReSpeakerLedService {
  private readonly enabled: boolean;
  private readonly hostPath: string;
  private lastAppliedState: ControllerState | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(config: AppConfig) {
    this.enabled = config.reSpeakerLedEnabled;
    this.hostPath = config.reSpeakerLedHostPath;
  }

  async runPreflightChecks(): Promise<PreflightCheck[]> {
    if (!this.enabled) {
      return [];
    }

    const exists = await fileExists(this.hostPath);
    if (!exists) {
      return [
        {
          name: "respeaker-led-host",
          ok: false,
          detail: `missing xvf_host at ${this.hostPath}`,
        },
      ];
    }

    try {
      await runCommand(this.hostPath, ["VERSION"]);
      return [
        {
          name: "respeaker-led-host",
          ok: true,
          detail: "reSpeaker LED host reachable",
        },
      ];
    } catch (error) {
      return [
        {
          name: "respeaker-led-host",
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        },
      ];
    }
  }

  async applyState(state: ControllerState): Promise<void> {
    if (!this.enabled || this.lastAppliedState === state) {
      return;
    }
    this.lastAppliedState = state;
    const profile = PROFILE_BY_STATE[state];
    this.queue = this.queue
      .catch(() => undefined)
      .then(async () => {
        await this.ensureLedPower();
        await this.applyProfile(profile);
      });
    await this.queue;
  }

  private async ensureLedPower(): Promise<void> {
    await runCommand(this.hostPath, ["GPO_WRITE_VALUE", "33", "1"]);
  }

  private async applyProfile(profile: LedProfile): Promise<void> {
    await runCommand(this.hostPath, ["LED_EFFECT", String(profile.effect)]);
    if (profile.color !== undefined) {
      await runCommand(this.hostPath, ["LED_COLOR", `0x${profile.color.toString(16)}`]);
    }
    if (profile.doaColor) {
      await runCommand(this.hostPath, [
        "LED_DOA_COLOR",
        `0x${profile.doaColor[0].toString(16)}`,
        `0x${profile.doaColor[1].toString(16)}`,
      ]);
    }
    if (profile.speed !== undefined) {
      await runCommand(this.hostPath, ["LED_SPEED", String(profile.speed)]);
    }
    if (profile.brightness !== undefined) {
      await runCommand(this.hostPath, ["LED_BRIGHTNESS", String(profile.brightness)]);
    }
  }
}
