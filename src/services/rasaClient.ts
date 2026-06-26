import type { AppConfig, PreflightCheck } from "../types";

interface RasaEntity {
  entity?: string;
  value?: unknown;
}

interface RasaParseResponse {
  intent?: {
    name?: string;
    confidence?: number;
  };
  entities?: RasaEntity[];
}

export interface RasaIntentResult {
  intentName: string;
  confidence: number;
  entities: RasaEntity[];
}

export class RasaClient {
  private readonly enabled: boolean;
  private readonly endpoint: string;

  constructor(config: AppConfig) {
    this.enabled = config.enableRasaIntentRouter;
    this.endpoint = config.rasaEndpoint.replace(/\/+$/, "");
  }

  async runPreflightChecks(): Promise<PreflightCheck[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await fetch(`${this.endpoint}/status`);
      return [
        {
          name: "rasa-endpoint",
          ok: response.ok,
          detail: response.ok ? "Rasa endpoint reachable" : `HTTP ${response.status}`,
        },
      ];
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return [
        {
          name: "rasa-endpoint",
          ok: false,
          detail,
        },
      ];
    }
  }

  async parse(text: string): Promise<RasaIntentResult | null> {
    if (!this.enabled) {
      return null;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }

    const response = await fetch(`${this.endpoint}/model/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed }),
    });

    if (!response.ok) {
      return null;
    }

    const parsed = (await response.json()) as RasaParseResponse;
    const intentName = parsed.intent?.name?.trim();
    const confidence = typeof parsed.intent?.confidence === "number" ? parsed.intent.confidence : 0;
    if (!intentName) {
      return null;
    }

    return {
      intentName,
      confidence,
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
    };
  }
}
