import type { AppConfig } from "../types";

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OllamaToolCall {
  type: "function";
  function: {
    name: string;
    arguments: string | Record<string, unknown>;
  };
}

interface OllamaChatResponse {
  message?: {
    content?: string;
    tool_calls?: OllamaToolCall[];
  };
}

interface OllamaChatOptions {
  num_predict?: number;
  temperature?: number;
}

interface OllamaRequestOverrides {
  model?: string;
}

export class OllamaClient {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly systemPrompt: string;
  private readonly keepAlive: string;

  constructor(config: AppConfig) {
    const ollamaService = config.services.find((service) => service.name === "ollama");
    if (!ollamaService) {
      throw new Error("Ollama service configuration is missing.");
    }

    this.endpoint = ollamaService.url.replace(/\/+$/, "");
    this.model = config.ollamaModel;
    this.systemPrompt = config.ollamaSystemPrompt;
    this.keepAlive = config.ollamaKeepAlive;
  }

  async respond(
    userText: string,
    systemPromptOverride?: string,
    overrides?: OllamaRequestOverrides,
  ): Promise<string> {
    const messages: OllamaChatMessage[] = [
      { role: "system", content: systemPromptOverride ?? this.systemPrompt },
      { role: "user", content: userText },
    ];

    return await this.respondMessages(messages, overrides);
  }

  async respondMessages(messages: OllamaChatMessage[], overrides?: OllamaRequestOverrides): Promise<string> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: overrides?.model || this.model,
        messages,
        stream: false,
        keep_alive: this.keepAlive,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const suffix = detail ? ` ${detail.slice(0, 500)}` : "";
      throw new Error(`Ollama returned HTTP ${response.status}.${suffix}`);
    }

    const payload = (await response.json()) as OllamaChatResponse;
    return (payload.message?.content || "").trim();
  }

  async respondWithTools(
    messages: OllamaChatMessage[],
    tools: OllamaFunctionTool[],
    options?: OllamaChatOptions,
    overrides?: OllamaRequestOverrides,
  ): Promise<{ content: string; toolCalls: OllamaToolCall[] }> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: overrides?.model || this.model,
        messages,
        tools,
        options,
        stream: false,
        keep_alive: this.keepAlive,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const suffix = detail ? ` ${detail.slice(0, 500)}` : "";
      throw new Error(`Ollama returned HTTP ${response.status}.${suffix}`);
    }

    const payload = (await response.json()) as OllamaChatResponse;
    return {
      content: (payload.message?.content || "").trim(),
      toolCalls: Array.isArray(payload.message?.tool_calls) ? payload.message.tool_calls : [],
    };
  }

  async warmup(): Promise<void> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        keep_alive: this.keepAlive,
        options: { num_predict: 1, temperature: 0 },
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: "ok" },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const suffix = detail ? ` ${detail.slice(0, 500)}` : "";
      throw new Error(`Ollama returned HTTP ${response.status}.${suffix}`);
    }
  }
}
