import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface WakeWordSettings {
  enabled: boolean;
  phrase: string;
  updatedAt: string | null;
  running?: boolean;
  lastError?: string | null;
}

interface WakeWordSettingsFile {
  enabled?: unknown;
  phrase?: unknown;
  updatedAt?: unknown;
}

export class WakeWordStore {
  constructor(
    private readonly filePath: string,
    private readonly defaultPhrase: string,
    private readonly defaultEnabled: boolean,
  ) {}

  async get(): Promise<WakeWordSettings> {
    await this.ensureParentDir();

    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as WakeWordSettingsFile;
      return {
        enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : this.defaultEnabled,
        phrase:
          typeof parsed.phrase === "string" && parsed.phrase.trim().length > 0
            ? parsed.phrase.trim()
            : this.defaultPhrase,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      };
    } catch {
      const defaults: WakeWordSettings = {
        enabled: this.defaultEnabled,
        phrase: this.defaultPhrase,
        updatedAt: null,
      };
      await this.save(defaults.enabled, defaults.phrase);
      return defaults;
    }
  }

  async save(enabled: boolean, phrase = this.defaultPhrase): Promise<WakeWordSettings> {
    await this.ensureParentDir();
    const settings: WakeWordSettings = {
      enabled,
      phrase: phrase.trim() || this.defaultPhrase,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(this.filePath, JSON.stringify(settings, null, 2), "utf8");
    return settings;
  }

  private async ensureParentDir(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
  }
}
