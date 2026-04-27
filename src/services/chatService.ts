import type { AppConfig, ChatResponse } from "../types";
import { Logger } from "../logger";
import type { OllamaChatMessage } from "./ollamaClient";
import { OllamaClient } from "./ollamaClient";
import { hasTrustedSources, RagStore } from "./ragStore";
import type { ConversationMessage } from "./conversationStore";
import { MarineMcpOrchestrator } from "./marineMcpOrchestrator";
import { readFile } from "node:fs/promises";

export type RelayCommand =
  | { action: "none" }
  | { action: "status" }
  | { action: "all"; state: "on" | "off" }
  | { action: "set"; channel: number; state: "on" | "off" };

const toOllamaHistory = (history: ConversationMessage[]): OllamaChatMessage[] =>
  history.map((message) => ({
    role: message.role,
    content: message.content,
  }));

export class ChatService {
  private readonly logger: Logger;
  private readonly ollama: OllamaClient;
  private readonly rag: RagStore;
  private readonly marineMcp?: MarineMcpOrchestrator;

  constructor(private readonly config: AppConfig) {
    this.logger = new Logger(config.logLevel);
    this.ollama = new OllamaClient(config);
    this.rag = new RagStore(config);
    this.marineMcp = config.marineTelemetryEnabled ? new MarineMcpOrchestrator(config) : undefined;
  }

  async ensureKnowledgeReady(): Promise<void> {
    if (!this.config.enableRag) {
      return;
    }

    await this.rag.ensureIndexed();
  }

  async rebuildKnowledge(): Promise<number> {
    return await this.rag.rebuildNow();
  }

  async ask(userText: string, history: ConversationMessage[] = []): Promise<ChatResponse> {
    const vesselContext = await this.getVesselContextSnippet();

    if (this.marineMcp) {
      try {
        const marineReply = await this.marineMcp.tryRespond(userText, history, vesselContext ?? undefined);
        if (marineReply) {
          return { reply: marineReply, sources: [] };
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Marine MCP orchestration failed: ${detail}`);
      }
    }

    const sources = this.config.enableRag ? await this.rag.search(userText) : [];
    const trusted = this.config.enableRag ? hasTrustedSources(sources) : false;

    if (sources.length > 0) {
      this.logger.info(
        `RAG matched ${sources.length} chunks from ${new Set(sources.map((item) => item.source)).size} PDFs.`,
      );
    }

    if (this.config.enableRag && !trusted) {
      const messages: OllamaChatMessage[] = [
        { role: "system", content: this.withVesselContext(this.config.ollamaSystemPrompt, vesselContext) },
        ...toOllamaHistory(history),
        { role: "user", content: userText },
      ];
      const reply = await this.ollama.respondMessages(messages);
      return { reply, sources: [] };
    }

    const prompt = sources.length > 0 ? this.rag.buildPrompt(userText, sources) : userText;
    if (history.length === 0) {
      const reply = await this.ollama.respond(
        prompt,
        sources.length > 0 ? this.buildGroundedSystemPrompt(vesselContext) : undefined,
      );
      return { reply, sources };
    }

    const systemPrompt =
      sources.length > 0
        ? this.buildGroundedSystemPrompt(vesselContext)
        : this.withVesselContext(this.config.ollamaSystemPrompt, vesselContext);
    const messages: OllamaChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...toOllamaHistory(history),
      { role: "user", content: prompt },
    ];
    const reply = await this.ollama.respondMessages(messages);
    return { reply, sources };
  }

  getKnowledgeStatusLine(): string {
    return this.rag.getStatusLine();
  }

  async answerWithSources(userText: string, sources: ChatResponse["sources"]): Promise<string> {
    const vesselContext = await this.getVesselContextSnippet();
    const prompt = sources.length > 0 ? this.rag.buildPrompt(userText, sources) : userText;
    return await this.ollama.respond(
      prompt,
      sources.length > 0 ? this.buildGroundedSystemPrompt(vesselContext) : undefined,
    );
  }

  async shutdown(): Promise<void> {
    await this.marineMcp?.shutdown();
  }

  async planRelayCommand(userText: string): Promise<RelayCommand> {
    const systemPrompt = [
      "You convert user requests into relay control commands for a Waveshare ESP32-S3-Relay-6CH device.",
      "Return ONLY a single JSON object (no markdown, no extra text).",
      "Allowed actions:",
      '- {"action":"set","channel":1-6,"state":"on"|"off"}',
      '- {"action":"all","state":"on"|"off"}',
      '- {"action":"status"}',
      '- {"action":"none"}',
      "Rules:",
      "- Use relay actions ONLY if the user clearly asks about relays/channels or turning something on/off.",
      "- If the user says something short like 'turn it off' and prior chat context is about relays, assume they mean the relays.",
      "- If the user is ambiguous (e.g. 'turn it on' with no channel), return {\"action\":\"none\"}.",
      "- Prefer explicit set/all/status over toggling.",
    ].join("\n");

    const raw = await this.ollama.respondMessages([
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ]);
    return parseRelayCommand(raw);
  }

  async planRelayCommandWithHistory(userText: string, history: ConversationMessage[]): Promise<RelayCommand> {
    const systemPrompt = [
      "You convert user requests into relay control commands for a Waveshare ESP32-S3-Relay-6CH device.",
      "Return ONLY a single JSON object (no markdown, no extra text).",
      "Allowed actions:",
      '- {"action":"set","channel":1-6,"state":"on"|"off"}',
      '- {"action":"all","state":"on"|"off"}',
      '- {"action":"status"}',
      '- {"action":"none"}',
      "Rules:",
      "- If the user says something short like 'turn it off' and the conversation is about relays, assume they mean the relays.",
      "- If the user is ambiguous and the conversation is not about relays, return {\"action\":\"none\"}.",
      "- Prefer explicit set/all/status over toggling.",
    ].join("\n");

    const raw = await this.ollama.respondMessages([
      { role: "system", content: systemPrompt },
      ...toOllamaHistory(history),
      { role: "user", content: userText },
    ]);

    return parseRelayCommand(raw);
  }

  private buildGroundedSystemPrompt(vesselContext: string | null): string {
    const base = [
      this.config.ollamaSystemPrompt,
      "When reference excerpts are provided, answer from them first.",
      "Do not invent procedures, settings, or specifications that are not supported by the excerpts.",
      "For procedural questions, prefer short numbered steps.",
      "Preserve control names, labels, and values exactly when they appear in the excerpts.",
      "If the excerpts are incomplete, say what is missing.",
      "Finish with a short 'Sources:' line citing the document name and page numbers you used.",
    ].join(" ");

    return this.withVesselContext(base, vesselContext);
  }

  private withVesselContext(basePrompt: string, vesselContext: string | null): string {
    if (!vesselContext) {
      return basePrompt;
    }

    return `${basePrompt}\n\nVessel context (operator-provided):\n${vesselContext}`;
  }

  private async getVesselContextSnippet(): Promise<string | null> {
    try {
      const content = (await readFile(this.config.vesselContextPath, "utf8")).trim();
      if (!content) {
        return null;
      }

      const maxChars = 4000;
      if (content.length <= maxChars) {
        return content;
      }

      return `${content.slice(0, maxChars)}\n\n[Context truncated to ${maxChars} chars]`;
    } catch {
      return null;
    }
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseFirstJsonObject = (text: string): unknown => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

const parseRelayCommand = (raw: string): RelayCommand => {
  const parsed = parseFirstJsonObject(raw);
  if (!isObject(parsed) || typeof parsed.action !== "string") {
    return { action: "none" };
  }

  if (parsed.action === "status") {
    return { action: "status" };
  }

  if (parsed.action === "all") {
    const state = parsed.state === "on" || parsed.state === "off" ? parsed.state : undefined;
    return state ? { action: "all", state } : { action: "none" };
  }

  if (parsed.action === "set") {
    const channel = Number(parsed.channel);
    const state = parsed.state === "on" || parsed.state === "off" ? parsed.state : undefined;
    if (!Number.isInteger(channel) || channel < 1 || channel > 6 || !state) {
      return { action: "none" };
    }
    return { action: "set", channel, state };
  }

  return { action: "none" };
};
