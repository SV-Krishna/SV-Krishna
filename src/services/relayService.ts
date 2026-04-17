import type { AppConfig, PreflightCheck } from "../types";

type RelayState = "on" | "off";

const normalizeBaseUrl = (raw: string): string => raw.trim().replace(/\/+$/, "");

const toRelayState = (value: unknown): RelayState => (value === 1 || value === "1" ? "on" : "off");

const formatRelayState = (state: RelayState): string => (state === "on" ? "ON" : "OFF");

export class RelayService {
  private readonly baseUrl: string;

  constructor(private readonly config: AppConfig) {
    this.baseUrl = normalizeBaseUrl(config.relayBaseUrl);
  }

  async runPreflightChecks(): Promise<PreflightCheck[]> {
    if (!this.config.relayControlEnabled) {
      return [];
    }

    try {
      const flags = await this.getFlags();
      if (flags.length !== 6 || !flags.every((flag) => flag === 0 || flag === 1)) {
        return [
          {
            name: "relay:device",
            ok: false,
            detail: `Unexpected /getData payload: ${JSON.stringify(flags)}`,
          },
        ];
      }

      return [
        {
          name: "relay:device",
          ok: true,
          detail: `Connected to ${this.baseUrl}`,
        },
      ];
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return [
        {
          name: "relay:device",
          ok: false,
          detail,
        },
      ];
    }
  }

  async getStatusLine(): Promise<string> {
    const flags = await this.getFlags();
    const parts = flags.map((value, index) => `CH${index + 1}=${formatRelayState(toRelayState(value))}`);
    return parts.join(" ");
  }

  async setChannel(channel: number, state: RelayState): Promise<void> {
    if (!Number.isInteger(channel) || channel < 1 || channel > 6) {
      throw new Error("Relay channel must be 1-6.");
    }

    const flags = await this.getFlags();
    const current = toRelayState(flags[channel - 1]);
    if (current === state) {
      return;
    }

    await this.toggleChannel(channel);
  }

  async toggleChannel(channel: number): Promise<void> {
    if (!Number.isInteger(channel) || channel < 1 || channel > 6) {
      throw new Error("Relay channel must be 1-6.");
    }

    await this.requestText(`/Switch${channel}`);
  }

  async allOn(): Promise<void> {
    await this.requestText("/AllOn");
  }

  async allOff(): Promise<void> {
    await this.requestText("/AllOff");
  }

  private async getFlags(): Promise<number[]> {
    const payload = await this.requestJson("/getData");
    if (!Array.isArray(payload)) {
      throw new Error("Relay /getData did not return an array.");
    }

    return payload.map((value) => Number(value));
  }

  private async requestJson(path: string): Promise<unknown> {
    const response = await this.request(path);
    return await response.json();
  }

  private async requestText(path: string): Promise<string> {
    const response = await this.request(path);
    return await response.text();
  }

  private async request(path: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Relay device returned HTTP ${response.status} for ${path}.`);
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Relay device timed out for ${path}.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export type { RelayState };
