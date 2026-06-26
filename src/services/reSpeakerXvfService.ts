import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import type { AppConfig, PreflightCheck } from "../types";

interface XvfRoute {
  category: number;
  source: number;
}

export interface ReSpeakerXvfSnapshot {
  version: string | null;
  leftRoute: string | null;
  rightRoute: string | null;
  speechEnergy: string | null;
  azimuths: string | null;
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const runCommand = async (command: string, args: string[]): Promise<string> => {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        LD_LIBRARY_PATH: `${dirname(command)}:${process.env.LD_LIBRARY_PATH ?? ""}`,
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}: ${stderr.trim()}`));
    });
    child.on("error", reject);
  });
};

export class ReSpeakerXvfService {
  private readonly enabled: boolean;
  private readonly hostPath: string;
  private readonly autoRoute: boolean;
  private readonly leftRoute: XvfRoute;
  private readonly rightRoute: XvfRoute;

  constructor(config: AppConfig) {
    this.enabled = config.reSpeakerXvfEnabled;
    this.hostPath = config.reSpeakerXvfHostPath;
    this.autoRoute = config.reSpeakerXvfAutoRoute;
    this.leftRoute = {
      category: config.reSpeakerXvfOutputLeftCategory,
      source: config.reSpeakerXvfOutputLeftSource,
    };
    this.rightRoute = {
      category: config.reSpeakerXvfOutputRightCategory,
      source: config.reSpeakerXvfOutputRightSource,
    };
  }

  async runPreflightChecks(): Promise<PreflightCheck[]> {
    if (!this.enabled) {
      return [];
    }

    const exists = await fileExists(this.hostPath);
    if (!exists) {
      return [
        {
          name: "respeaker-xvf-host",
          ok: false,
          detail: `missing xvf_host at ${this.hostPath}`,
        },
      ];
    }

    try {
      await runCommand(this.hostPath, ["VERSION"]);
      return [
        {
          name: "respeaker-xvf-host",
          ok: true,
          detail: "reSpeaker XVF control reachable",
        },
      ];
    } catch (error) {
      return [
        {
          name: "respeaker-xvf-host",
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        },
      ];
    }
  }

  async applyVoiceProfile(): Promise<void> {
    if (!this.enabled || !this.autoRoute) {
      return;
    }

    await runCommand(this.hostPath, [
      "AUDIO_MGR_OP_L",
      String(this.leftRoute.category),
      String(this.leftRoute.source),
    ]);
    await runCommand(this.hostPath, [
      "AUDIO_MGR_OP_R",
      String(this.rightRoute.category),
      String(this.rightRoute.source),
    ]);
  }

  async readSnapshot(): Promise<ReSpeakerXvfSnapshot | null> {
    if (!this.enabled) {
      return null;
    }

    const [version, leftRoute, rightRoute, speechEnergy, azimuths] = await Promise.all([
      this.safeRead("VERSION"),
      this.safeRead("AUDIO_MGR_OP_L"),
      this.safeRead("AUDIO_MGR_OP_R"),
      this.safeRead("AEC_SPENERGY_VALUES"),
      this.safeRead("AEC_AZIMUTH_VALUES"),
    ]);

    return {
      version,
      leftRoute,
      rightRoute,
      speechEnergy,
      azimuths,
    };
  }

  private async safeRead(command: string): Promise<string | null> {
    try {
      return await runCommand(this.hostPath, [command]);
    } catch {
      return null;
    }
  }
}
