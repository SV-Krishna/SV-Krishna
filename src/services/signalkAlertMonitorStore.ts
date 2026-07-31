import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface SignalKAlertMonitorSettings {
  enabled: boolean;
  updatedAt: string | null;
  running?: boolean;
}

interface SignalKAlertMonitorSettingsFile {
  enabled?: unknown;
  updatedAt?: unknown;
}

export class SignalKAlertMonitorStore {
  constructor(
    private readonly filePath: string,
    private readonly defaultEnabled: boolean,
  ) {}

  async get(): Promise<SignalKAlertMonitorSettings> {
    await this.ensureParentDir();

    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as SignalKAlertMonitorSettingsFile;
      return {
        enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : this.defaultEnabled,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      };
    } catch {
      const defaults: SignalKAlertMonitorSettings = {
        enabled: this.defaultEnabled,
        updatedAt: null,
      };
      await this.save(defaults.enabled);
      return defaults;
    }
  }

  async save(enabled: boolean): Promise<SignalKAlertMonitorSettings> {
    await this.ensureParentDir();
    const settings: SignalKAlertMonitorSettings = {
      enabled,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(this.filePath, JSON.stringify(settings, null, 2), "utf8");
    return settings;
  }

  private async ensureParentDir(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
  }
}
