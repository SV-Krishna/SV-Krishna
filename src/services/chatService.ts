import type { AppConfig, ChatResponse } from "../types";
import { Logger } from "../logger";
import { OllamaClient } from "./ollamaClient";
import { hasTrustedSources, RagStore } from "./ragStore";

export type RelayCommand =
  | { action: "none" }
  | { action: "status" }
  | { action: "all"; state: "on" | "off" }
  | { action: "set"; channel: number; state: "on" | "off" };

export class ChatService {
  private readonly logger: Logger;
  private readonly ollama: OllamaClient;
  private readonly rag: RagStore;

  constructor(private readonly config: AppConfig) {
    this.logger = new Logger(config.logLevel);
    this.ollama = new OllamaClient(config);
    this.rag = new RagStore(config);
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

  async ask(userText: string): Promise<ChatResponse> {
    const sources = this.config.enableRag ? await this.rag.search(userText) : [];
    if (sources.length > 0) {
      this.logger.info(
        `RAG matched ${sources.length} chunks from ${new Set(sources.map((item) => item.source)).size} PDFs.`,
      );
    }

    const reply = await this.answerWithSources(userText, sources);
    return { reply, sources };
  }

  getKnowledgeStatusLine(): string {
    return this.rag.getStatusLine();
  }

  async answerWithSources(userText: string, sources: ChatResponse["sources"]): Promise<string> {
    if (this.config.enableRag && !hasTrustedSources(sources)) {
      return "I could not find sufficiently relevant material in the indexed documents to answer that reliably.";
    }

    const prompt = sources.length > 0 ? this.rag.buildPrompt(userText, sources) : userText;
    return await this.ollama.respond(
      prompt,
      sources.length > 0 ? this.buildGroundedSystemPrompt() : undefined,
    );
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
      "- If the user is ambiguous (e.g. 'turn it on' with no channel), return {\"action\":\"none\"}.",
      "- Prefer explicit set/all/status over toggling.",
    ].join("\n");

    const raw = await this.ollama.respond(userText, systemPrompt);
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
  }

  private buildGroundedSystemPrompt(): string {
    return [
      this.config.ollamaSystemPrompt,
      "When reference excerpts are provided, answer from them first.",
      "Do not invent procedures, settings, or specifications that are not supported by the excerpts.",
      "For procedural questions, prefer short numbered steps.",
      "Preserve control names, labels, and values exactly when they appear in the excerpts.",
      "If the excerpts are incomplete, say what is missing.",
      "Finish with a short 'Sources:' line citing the document name and page numbers you used.",
    ].join(" ");
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
