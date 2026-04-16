import { mkdir } from "node:fs/promises";
import { LinuxAudio } from "./audio/linuxAudio";
import { Logger } from "./logger";
import { checkServiceHealth } from "./services/health";
import { OllamaClient } from "./services/ollamaClient";
import { PiperClient } from "./services/piperClient";
import { RagStore } from "./services/ragStore";
import { WhisperClient } from "./services/whisperClient";
import { TerminalInput } from "./terminal/input";
import { TerminalRenderer } from "./terminal/renderer";
import type { AppConfig, ControllerState, PreflightCheck, ServiceHealth } from "./types";

export class ControllerApp {
  private readonly logger: Logger;
  private readonly renderer = new TerminalRenderer();
  private readonly input = new TerminalInput();
  private readonly audio: LinuxAudio;
  private readonly whisper: WhisperClient;
  private readonly ollama: OllamaClient;
  private readonly piper: PiperClient;
  private readonly rag: RagStore;
  private state: ControllerState = "starting";
  private busy = false;

  constructor(private readonly config: AppConfig) {
    this.logger = new Logger(config.logLevel);
    this.audio = new LinuxAudio(config);
    this.whisper = new WhisperClient(config);
    this.ollama = new OllamaClient(config);
    this.piper = new PiperClient(config);
    this.rag = new RagStore(config);
  }

  async start(): Promise<void> {
    await mkdir(this.config.audioWorkDir, { recursive: true });

    const health = await Promise.all(
      this.config.services.map((service) => checkServiceHealth(service)),
    );
    const checks = await this.runPreflightChecks();
    await this.indexRagAtStartup();

    this.renderer.renderStartup(this.config, health, checks);
    this.renderer.renderHelp();

    const unhealthy = health.filter((service) => service.enabled && !service.ok);
    const failedChecks = checks.filter((check) => !check.ok);
    if (unhealthy.length > 0 || failedChecks.length > 0) {
      this.setState("error", this.buildStartupFailureMessage(unhealthy, failedChecks));
    } else {
      this.setState("idle", `Ready for push-to-talk testing. ${this.rag.getStatusLine()}`);
    }

    this.registerInputHandlers(health);
    this.input.start(this.config.pushToTalkKey);
  }

  stop(): void {
    this.input.stop();
    this.logger.info("Controller stopped.");
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

      if (this.state === "error") {
        this.setState("error", "Push-to-talk blocked while dependencies are unhealthy.");
        const failedNames = health
          .filter((service) => service.enabled && !service.ok)
          .map((service) => service.name)
          .join(", ");
        this.logger.warn(`Unavailable services: ${failedNames}`);
        return;
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
          this.setState(
            "playing",
            `Playing sample through ${this.config.audioOutputDevice}...`,
          );
          await this.audio.playFile(recordingPath);
        }

        this.setState(
          "transcribing",
          `Sending sample to Whisper at ${this.getServiceUrl("whisper")}...`,
        );
        const transcript = await this.whisper.transcribe(recordingPath);
        if (transcript) {
          this.logger.info(`Transcript: ${transcript}`);
          const prompt = await this.buildPromptWithRag(transcript);
          this.setState(
            "thinking",
            `Sending transcript to Ollama at ${this.getServiceUrl("ollama")}...`,
          );
          const reply = await this.ollama.respond(prompt);
          if (reply) {
            this.logger.info(`Assistant reply: ${reply}`);
            if (this.config.enableTts) {
              this.setState("speaking", "Synthesizing reply with Piper...");
              const speechPath = await this.piper.synthesize(reply);
              if (speechPath) {
                await this.audio.playFile(speechPath);
              }
            }
            this.setState("idle", `You: ${transcript}\nAssistant: ${reply}`);
          } else {
            this.setState("idle", `You: ${transcript}\nAssistant: [empty reply]`);
          }
        } else {
          this.setState("idle", "Whisper returned an empty transcript.");
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.setState("error", `Voice pipeline failed: ${detail}`);
      } finally {
        this.busy = false;
      }
    });

    this.input.on("text-mode", async () => {
      if (this.busy) {
        this.logger.warn("Typed prompt ignored while another task is running.");
        return;
      }

      if (!this.isServiceHealthy(health, "ollama")) {
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
        const promptWithRag = await this.buildPromptWithRag(prompt);
        this.setState(
          "thinking",
          `Sending typed prompt to Ollama at ${this.getServiceUrl("ollama")}...`,
        );

        const reply = await this.ollama.respond(promptWithRag);
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
        const count = await this.rag.rebuildNow();
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
    ]);
    return checks.flat();
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

  private async buildPromptWithRag(prompt: string): Promise<string> {
    if (!this.config.enableRag) {
      return prompt;
    }

    const results = await this.rag.search(prompt);
    if (results.length === 0) {
      return prompt;
    }

    this.logger.info(
      `RAG matched ${results.length} chunks from ${new Set(results.map((result) => result.source)).size} PDFs.`,
    );
    return this.rag.buildPrompt(prompt, results);
  }

  private async indexRagAtStartup(): Promise<void> {
    if (!this.config.enableRag) {
      return;
    }

    try {
      await this.rag.ensureIndexed();
      this.logger.info(this.rag.getStatusLine());
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`RAG startup indexing failed: ${detail}`);
    }
  }
}
