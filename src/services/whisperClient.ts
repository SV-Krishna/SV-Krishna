import type { AppConfig } from "../types";

interface WhisperResponse {
  filePath?: string;
  recognition?: string;
}

export class WhisperClient {
  private readonly endpoint: string;
  private readonly language: string;

  constructor(config: AppConfig) {
    const whisperService = config.services.find((service) => service.name === "whisper");
    if (!whisperService) {
      throw new Error("Whisper service configuration is missing.");
    }

    this.endpoint = whisperService.url.replace(/\/+$/, "");
    this.language = config.whisperLanguage;
  }

  async transcribe(filePath: string): Promise<string> {
    const response = await fetch(`${this.endpoint}/recognize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filePath,
        language: this.language,
      }),
    });

    if (!response.ok) {
      throw new Error(`Whisper returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as WhisperResponse;
    return (payload.recognition || "").trim();
  }
}
