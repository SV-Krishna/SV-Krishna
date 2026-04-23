import { mkdir } from "node:fs/promises";
import { LinuxAudio } from "./audio/linuxAudio";
import { Logger } from "./logger";
import { ChatService } from "./services/chatService";
import { checkServiceHealth } from "./services/health";
import { PiperClient } from "./services/piperClient";
import { RagStore } from "./services/ragStore";
import type { RelayCommand } from "./services/chatService";
import type { ConversationMessage } from "./services/conversationStore";
import { RelayService } from "./services/relayService";
import { WhisperClient } from "./services/whisperClient";
import { TerminalInput } from "./terminal/input";
import { TerminalRenderer } from "./terminal/renderer";
import type { AppConfig, ControllerState, PreflightCheck, ServiceHealth } from "./types";

type RelayActionResult =
  | { kind: "none" }
  | { kind: "planned"; summary: string; command: RelayCommand }
  | { kind: "executed"; summary: string; statusLine: string };

export interface VoiceRunResult {
  transcript: string | null;
  reply: string | null;
  relay: RelayActionResult;
}

export class ControllerApp {
  private readonly logger: Logger;
  private readonly renderer = new TerminalRenderer();
  private readonly input = new TerminalInput();
  private readonly audio: LinuxAudio;
  private readonly whisper: WhisperClient;
  private readonly piper: PiperClient;
  private readonly rag: RagStore;
  private readonly chat: ChatService;
  private readonly relay?: RelayService;
  private piperReady = false;
  private serviceHealth: ServiceHealth[] = [];
  private healthTimer?: NodeJS.Timeout;
  private state: ControllerState = "starting";
  private busy = false;

  constructor(private readonly config: AppConfig) {
    this.logger = new Logger(config.logLevel);
    this.audio = new LinuxAudio(config);
    this.whisper = new WhisperClient(config);
    this.piper = new PiperClient(config);
    this.rag = new RagStore(config);
    this.chat = new ChatService(config);
    this.relay = config.relayControlEnabled ? new RelayService(config) : undefined;
  }

  async start(options?: { enableTerminalInput?: boolean }): Promise<void> {
    const enableTerminalInput = options?.enableTerminalInput ?? true;
    await mkdir(this.config.audioWorkDir, { recursive: true });

    const health = await this.refreshServiceHealth();
    const checks = await this.runPreflightChecks();
    await this.indexRagAtStartup();

    this.renderer.renderStartup(this.config, health, checks);
    this.renderer.renderHelp();

    const unhealthy = health.filter((service) => service.enabled && !service.ok);
    this.piperReady = isPiperReady(checks);
    const fatalChecks = checks.filter(
      (check) => !check.ok && this.isFatalPreflightFailure(check),
    );
    if (unhealthy.length > 0 || fatalChecks.length > 0) {
      this.setState("error", this.buildStartupFailureMessage(unhealthy, fatalChecks));
    } else {
      this.setState("idle", `Ready for push-to-talk testing. ${this.chat.getKnowledgeStatusLine()}`);
    }

    this.startHealthPolling();
    if (enableTerminalInput) {
      this.registerInputHandlers(health);
      this.input.start(this.config.pushToTalkKey);
    }
  }

  stop(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = undefined;
    }
    this.input.stop();
    this.logger.info("Controller stopped.");
  }

  async runVoiceOnce(options?: { history?: ConversationMessage[] }): Promise<VoiceRunResult> {
    if (this.busy) {
      throw new Error("Busy.");
    }

    const history = options?.history ?? [];
    const currentHealth = await this.refreshServiceHealth();
    const whisperOk = this.isServiceHealthy(currentHealth, "whisper");
    const ollamaOk = this.isServiceHealthy(currentHealth, "ollama");
    if (!whisperOk || !ollamaOk) {
      throw new Error("Core services unavailable (whisper/ollama).");
    }

    this.busy = true;
    try {
      this.setState(
        "listening",
        `Recording ${this.config.audioRecordSeconds}s sample from ${this.config.audioInputDevice}...`,
      );
      const recordingPath = await this.audio.recordSample();
      this.logger.info(`Recorded sample to ${recordingPath}`);

      if (this.config.enableAudioPlaybackDebug) {
        this.setState("playing", `Playing sample through ${this.config.audioOutputDevice}...`);
        await this.audio.playFile(recordingPath);
      }

      this.setState(
        "transcribing",
        `Sending sample to Whisper at ${this.getServiceUrl("whisper")}...`,
      );
      const transcript = await this.whisper.transcribe(recordingPath);
      if (!transcript) {
        this.setState("idle", "Whisper returned an empty transcript.");
        return { transcript: null, reply: null, relay: { kind: "none" } };
      }

      this.logger.info(`Transcript: ${transcript}`);

      const relayResult = await this.planOrExecuteRelay(transcript);
      if (relayResult.kind !== "none") {
        if (relayResult.kind === "planned") {
          this.setState("idle", `Relay action planned: ${relayResult.summary}`);
        } else {
          this.setState("idle", `Relay action executed: ${relayResult.summary}. ${relayResult.statusLine}`);
        }

        return { transcript, reply: null, relay: relayResult };
      }

      this.setState("thinking", `Sending transcript to Ollama at ${this.getServiceUrl("ollama")}...`);
      const { reply } = await this.chat.ask(transcript, history);
      const safeReply = reply || "";

      if (safeReply) {
        this.logger.info(`Assistant reply: ${safeReply}`);
        if (this.config.enableTts && this.piperReady) {
          this.setState("speaking", "Synthesizing reply with Piper...");
          const speechPath = await this.piper.synthesize(safeReply);
          if (speechPath) {
            await this.audio.playFile(speechPath);
          }
        }

        this.setState("idle", `You: ${transcript}\nAssistant: ${safeReply}`);
      } else {
        this.setState("idle", `You: ${transcript}\nAssistant: [empty reply]`);
      }

      return { transcript, reply: safeReply || null, relay: { kind: "none" } };
    } finally {
      this.busy = false;
    }
  }

  async executeRelay(
    command: RelayCommand,
  ): Promise<{ statusLine: string }> {
    if (!this.relay) {
      throw new Error("Relay control is disabled.");
    }

    if (command.action === "status") {
      return { statusLine: await this.relay.getStatusLine() };
    }

    if (command.action === "all") {
      if (command.state === "on") {
        await this.relay.allOn();
      } else {
        await this.relay.allOff();
      }
      return { statusLine: await this.relay.getStatusLine() };
    }

    if (command.action === "set") {
      await this.relay.setChannel(command.channel, command.state);
      return { statusLine: await this.relay.getStatusLine() };
    }

    throw new Error("Nothing to execute.");
  }

  private registerInputHandlers(health: ServiceHealth[]): void {
    this.input.on("help", () => {
      this.renderer.renderHelp();
    });

    this.input.on("quit", () => {
      this.stop();
      process.exit(0);
    });

    this.input.on("push-to-talk", async () => {
      if (this.busy) {
        this.logger.warn("Push-to-talk ignored while another audio task is running.");
        return;
      }

      const currentHealth = await this.refreshServiceHealth();
      const whisperOk = this.isServiceHealthy(currentHealth, "whisper");
      const ollamaOk = this.isServiceHealthy(currentHealth, "ollama");
      if (!whisperOk || !ollamaOk) {
        this.setState("error", "Push-to-talk blocked while core services are unavailable.");
        const failedNames = currentHealth
          .filter((service) => service.enabled && !service.ok)
          .map((service) => service.name)
          .join(", ");
        this.logger.warn(`Unavailable services: ${failedNames}`);
        return;
      }

      try {
        await this.runVoiceOnce();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.setState("error", `Voice pipeline failed: ${detail}`);
      }
    });

    this.input.on("text-mode", async () => {
      if (this.busy) {
        this.logger.warn("Typed prompt ignored while another task is running.");
        return;
      }

      const currentHealth = await this.refreshServiceHealth();
      if (!this.isServiceHealthy(currentHealth, "ollama")) {
        this.setState("error", "Typed prompt blocked while Ollama is unavailable.");
        return;
      }

      this.busy = true;

      try {
        const prompt = await this.input.promptText("You> ");
        if (!prompt) {
          this.setState("idle", "Typed prompt cancelled.");
          return;
        }

        this.logger.info(`Typed prompt: ${prompt}`);

        const relayHandled = await this.tryHandleRelayCommand(prompt);
        if (relayHandled) {
          return;
        }

        this.setState(
          "thinking",
          `Sending typed prompt to Ollama at ${this.getServiceUrl("ollama")}...`,
        );

        const { reply } = await this.chat.ask(prompt);
        if (reply) {
          this.logger.info(`Assistant reply: ${reply}`);
          this.setState("idle", `You: ${prompt}\nAssistant: ${reply}`);
          return;
        }

        this.setState("idle", `You: ${prompt}\nAssistant: [empty reply]`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.setState("error", `Typed prompt failed: ${detail}`);
      } finally {
        this.busy = false;
      }
    });

    this.input.on("reindex-rag", async () => {
      if (this.busy) {
        this.logger.warn("RAG reindex ignored while another task is running.");
        return;
      }

      this.busy = true;

      try {
        this.setState("thinking", "Rebuilding local PDF RAG store...");
        const count = await this.chat.rebuildKnowledge();
        this.setState("idle", `RAG store rebuilt. Indexed ${count} PDF files.`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.setState("error", `RAG rebuild failed: ${detail}`);
      } finally {
        this.busy = false;
      }
    });
  }

  private setState(state: ControllerState, message: string): void {
    this.state = state;
    this.renderer.renderState(state, message);
    this.logger.info(message);
  }

  private async runPreflightChecks(): Promise<PreflightCheck[]> {
    const checks = await Promise.all([
      this.audio.runPreflightChecks(),
      this.piper.runPreflightChecks(),
      this.rag.runPreflightChecks(),
      this.relay?.runPreflightChecks() ?? Promise.resolve([]),
    ]);
    return checks.flat();
  }

  private startHealthPolling(): void {
    if (this.healthTimer) {
      return;
    }

    this.healthTimer = setInterval(() => {
      void this.pollHealthOnce();
    }, 5_000);
  }

  private async pollHealthOnce(): Promise<void> {
    const health = await this.refreshServiceHealth();
    const unhealthy = health.filter((service) => service.enabled && !service.ok);
    if (unhealthy.length === 0 && this.state === "error") {
      this.setState("idle", `Ready. ${this.chat.getKnowledgeStatusLine()}`);
      return;
    }
  }

  private async refreshServiceHealth(): Promise<ServiceHealth[]> {
    const health = await Promise.all(
      this.config.services.map((service) => checkServiceHealth(service)),
    );
    this.serviceHealth = health;
    return health;
  }

  private isFatalPreflightFailure(check: PreflightCheck): boolean {
    if (check.name === "audio-record") {
      return true;
    }

    if (this.config.enableRag && check.name.startsWith("rag-")) {
      return true;
    }

    return false;
  }

  private buildStartupFailureMessage(
    unhealthy: ServiceHealth[],
    failedChecks: PreflightCheck[],
  ): string {
    const serviceNames = unhealthy.map((service) => service.name);
    const checkNames = failedChecks.map((check) => check.name);
    const parts: string[] = [];

    if (serviceNames.length > 0) {
      parts.push(`services unavailable: ${serviceNames.join(", ")}`);
    }

    if (checkNames.length > 0) {
      parts.push(`preflight failed: ${checkNames.join(", ")}`);
    }

    return parts.join("; ");
  }

  private getServiceUrl(name: ServiceHealth["name"]): string {
    return this.config.services.find((service) => service.name === name)?.url || "unknown";
  }

  private isServiceHealthy(health: ServiceHealth[], name: ServiceHealth["name"]): boolean {
    return health.find((service) => service.name === name)?.ok ?? false;
  }

  private async indexRagAtStartup(): Promise<void> {
    if (!this.config.enableRag) {
      return;
    }

    try {
      await this.chat.ensureKnowledgeReady();
      this.logger.info(this.chat.getKnowledgeStatusLine());
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`RAG startup indexing failed: ${detail}`);
    }
  }

  private async tryHandleRelayCommand(userText: string): Promise<boolean> {
    if (!this.relay || !looksLikeRelayIntent(userText)) {
      return false;
    }

    try {
      const planned = await this.planOrExecuteRelay(userText);
      if (planned.kind === "none") {
        return false;
      }

      if (planned.kind === "planned") {
        const confirm = await this.input.promptText(`Confirm: ${planned.summary}? (y/N)> `);
        if (confirm.toLowerCase() !== "y" && confirm.toLowerCase() !== "yes") {
          this.setState("idle", "Relay action cancelled.");
          return true;
        }

        const result = await this.executeRelay(planned.command);
        this.setState("idle", `Relays updated. ${result.statusLine}`);
        return true;
      }

      this.setState("idle", `Relays updated. ${planned.statusLine}`);
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.setState("idle", `Relay unavailable: ${detail}`);
      return true;
    }
  }

  private async planOrExecuteRelay(userText: string): Promise<RelayActionResult> {
    if (!this.relay || !looksLikeRelayIntent(userText)) {
      return { kind: "none" };
    }

    this.setState("thinking", "Planning relay action...");
    const command = await this.chat.planRelayCommand(userText);
    if (command.action === "none") {
      return { kind: "none" };
    }

    const summary =
      command.action === "status"
        ? "Read relay status"
        : command.action === "all"
          ? `Turn ALL relays ${command.state.toUpperCase()}`
          : `Set relay CH${command.channel} ${command.state.toUpperCase()}`;

    if (this.config.relayRequireConfirmation) {
      return { kind: "planned", summary, command };
    }

    const result = await this.executeRelay(command);
    return { kind: "executed", summary, statusLine: result.statusLine };
  }
}

const looksLikeRelayIntent = (text: string): boolean => {
  const normalized = text.toLowerCase();
  if (normalized.includes("relay") || normalized.includes("relays")) {
    return true;
  }

  if (/\bch\s*[1-6]\b/i.test(text) || /\bchannel\s*[1-6]\b/i.test(text)) {
    return true;
  }

  return false;
};

const isPiperReady = (checks: PreflightCheck[]): boolean => {
  const piperChecks = checks.filter((check) => check.name.startsWith("piper-"));
  if (piperChecks.length === 0) {
    return false;
  }
  return piperChecks.every((check) => check.ok);
};
