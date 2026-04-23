import type { AppConfig } from "../types";

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
}

export class OllamaClient {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly systemPrompt: string;

  constructor(config: AppConfig) {
    const ollamaService = config.services.find((service) => service.name === "ollama");
    if (!ollamaService) {
      throw new Error("Ollama service configuration is missing.");
    }

    this.endpoint = ollamaService.url.replace(/\/+$/, "");
    this.model = config.ollamaModel;
    this.systemPrompt = config.ollamaSystemPrompt;
  }

  async respond(userText: string, systemPromptOverride?: string): Promise<string> {
    const messages: OllamaChatMessage[] = [
      { role: "system", content: systemPromptOverride ?? this.systemPrompt },
      { role: "user", content: userText },
    ];

    return await this.respondMessages(messages);
  }

  async respondMessages(messages: OllamaChatMessage[]): Promise<string> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, messages, stream: false }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as OllamaChatResponse;
    return (payload.message?.content || "").trim();
  }
}
