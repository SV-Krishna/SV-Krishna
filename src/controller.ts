import { mkdir } from "node:fs/promises";
import { LinuxAudio } from "./audio/linuxAudio";
import { Logger } from "./logger";
import { checkServiceHealth } from "./services/health";
import { AudioCueService } from "./services/audioCueService";
import { PiperClient } from "./services/piperClient";
import { MarineTelemetryService } from "./services/marineTelemetryService";
import { AnchorAlarmService } from "./services/anchorAlarmService";
import { SignalKAlertMonitor, type SpokenSignalKAlert } from "./services/signalkAlertMonitor";
import type { RelayCommand } from "./services/chatService";
import type { ConversationMessage } from "./services/conversationStore";
import { RasaClient, type RasaIntentResult } from "./services/rasaClient";
import { ReSpeakerLedService } from "./services/reSpeakerLedService";
import { ReSpeakerXvfService } from "./services/reSpeakerXvfService";
import { RelayService } from "./services/relayService";
import {
  SignalKAlertMonitorStore,
  type SignalKAlertMonitorSettings,
} from "./services/signalkAlertMonitorStore";
import { WakeWordStore, type WakeWordSettings } from "./services/wakeWordStore";
import { WakeWordService } from "./services/wakeWordService";
import { WhisperClient } from "./services/whisperClient";
import { TerminalInput } from "./terminal/input";
import { TerminalRenderer } from "./terminal/renderer";
import type { AppConfig, ControllerState, PreflightCheck, ServiceHealth } from "./types";

type RelayActionResult =
  | { kind: "none" }
  | { kind: "planned"; summary: string; command: RelayCommand }
  | { kind: "executed"; summary: string; statusLine: string; spokenReply: string };

export interface VoiceRunResult {
  transcript: string | null;
  normalizedTranscript: string | null;
  reply: string | null;
  relay: RelayActionResult;
}

type WakeTranscriptRecovery =
  | { transcript: string }
  | { result: VoiceRunResult };

interface TelemetryQuerySpec {
  path: string;
  label: string;
  format: (value: unknown, node: unknown) => string | null;
}
interface StatusAlert {
  path: string;
  message: string;
}

export class ControllerApp {
  private readonly logger: Logger;
  private readonly renderer = new TerminalRenderer();
  private readonly input = new TerminalInput();
  private readonly audio: LinuxAudio;
  private readonly whisper: WhisperClient;
  private readonly piper: PiperClient;
  private readonly audioCue?: AudioCueService;
  private readonly relay?: RelayService;
  private readonly marine?: MarineTelemetryService;
  private readonly anchorAlarm?: AnchorAlarmService;
  private readonly rasa?: RasaClient;
  private readonly reSpeakerLed?: ReSpeakerLedService;
  private readonly reSpeakerXvf?: ReSpeakerXvfService;
  private readonly wakeWordStore: WakeWordStore;
  private readonly signalkAlertMonitorStore: SignalKAlertMonitorStore;
  private readonly wakeWordService: WakeWordService;
  private readonly signalkAlertMonitor: SignalKAlertMonitor;
  private piperReady = false;
  private serviceHealth: ServiceHealth[] = [];
  private healthTimer?: NodeJS.Timeout;
  private state: ControllerState = "starting";
  private stateMessage = "Starting...";
  private latestTranscript: string | null = null;
  private awaitingAnchorRodeLength = false;
  private busy = false;
  private statusReportVariantIndex = 0;
  private wakeWordEnabled: boolean;
  private wakeWordPhrase: string;
  private wakeWordUpdatedAt: string | null = null;

  constructor(private readonly config: AppConfig) {
    this.logger = new Logger(config.logLevel);
    this.audio = new LinuxAudio(config);
    this.whisper = new WhisperClient(config);
    this.piper = new PiperClient(config);
    this.audioCue = config.enableTranscribingCue ? new AudioCueService(config, this.piper) : undefined;
    this.relay = config.relayControlEnabled ? new RelayService(config) : undefined;
    this.marine = config.marineTelemetryEnabled ? new MarineTelemetryService(config) : undefined;
    this.anchorAlarm = config.marineTelemetryEnabled ? new AnchorAlarmService(config) : undefined;
    this.rasa = config.enableRasaIntentRouter ? new RasaClient(config) : undefined;
    this.reSpeakerLed = config.reSpeakerLedEnabled ? new ReSpeakerLedService(config) : undefined;
    this.reSpeakerXvf = config.reSpeakerXvfEnabled ? new ReSpeakerXvfService(config) : undefined;
    this.wakeWordStore = new WakeWordStore(
      config.wakeWordConfigPath,
      config.wakeWordPhrase,
      config.enableWakeWord,
    );
    this.signalkAlertMonitorStore = new SignalKAlertMonitorStore(
      config.signalkAlertMonitorConfigPath,
      config.signalkAlertMonitorEnabled,
    );
    this.wakeWordService = new WakeWordService(config, async (event) => {
      await this.handleWakeWordDetected(event);
    });
    this.signalkAlertMonitor = new SignalKAlertMonitor(config, async (alert) => this.handleSignalKAlert(alert));
    this.wakeWordEnabled = config.enableWakeWord;
    this.wakeWordPhrase = config.wakeWordPhrase;
  }

  async start(options?: { enableTerminalInput?: boolean }): Promise<void> {
    const enableTerminalInput = options?.enableTerminalInput ?? true;
    await mkdir(this.config.audioWorkDir, { recursive: true });
    await this.loadWakeWordSettings();
    await this.loadSignalKAlertMonitorSettings();

    const health = await this.refreshServiceHealth();
    const checks = await this.runPreflightChecks();

    this.renderer.renderStartup(this.config, health, checks);
    this.renderer.renderHelp();

    await this.configureReSpeakerXvf();

    const unhealthy = health.filter((service) => service.enabled && !service.ok);
    this.piperReady = isPiperReady(checks);
    const fatalChecks = checks.filter(
      (check) => !check.ok && this.isFatalPreflightFailure(check),
    );
    if (unhealthy.length > 0 || fatalChecks.length > 0) {
      this.setState("error", this.buildStartupFailureMessage(unhealthy, fatalChecks));
    } else {
      this.setState("idle", "Ready for wake word, push-to-talk, and typed Rasa commands.");
    }

    this.startHealthPolling();
    this.signalkAlertMonitor.start();
    await this.syncWakeWordRuntime();
    void this.audioCue?.prepare().catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Transcribing cue preparation failed: ${detail}`);
    });
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
    this.signalkAlertMonitor.stop();
    this.wakeWordService.stop();
    void this.audioCue?.stop();
    this.logger.info("Controller stopped.");
  }

  async getStatus(): Promise<{
    state: ControllerState;
    message: string;
    busy: boolean;
    transcript: string | null;
    wakeWordEnabled: boolean;
    wakeWordPhrase: string;
    signalkAlertMonitorEnabled: boolean;
  }> {
    return {
      state: this.state,
      message: this.stateMessage,
      busy: this.busy,
      transcript: this.latestTranscript,
      wakeWordEnabled: this.wakeWordEnabled,
      wakeWordPhrase: this.wakeWordPhrase,
      signalkAlertMonitorEnabled: this.signalkAlertMonitor.isEnabled(),
    };
  }

  async getWakeWordSettings(): Promise<WakeWordSettings> {
    return {
      enabled: this.wakeWordEnabled,
      phrase: this.wakeWordPhrase,
      updatedAt: this.wakeWordUpdatedAt,
      running: this.wakeWordService.getRuntimeStatus().running,
      lastError: this.wakeWordService.getRuntimeStatus().lastError,
    };
  }

  async setWakeWordEnabled(enabled: boolean): Promise<WakeWordSettings> {
    const saved = await this.wakeWordStore.save(enabled, this.wakeWordPhrase);
    this.wakeWordEnabled = saved.enabled;
    this.wakeWordPhrase = saved.phrase;
    this.wakeWordUpdatedAt = saved.updatedAt;
    await this.syncWakeWordRuntime();
    this.logger.info(`Wake word ${this.wakeWordPhrase} ${enabled ? "enabled" : "disabled"}.`);
    return await this.getWakeWordSettings();
  }

  async getSignalKAlertMonitorSettings(): Promise<SignalKAlertMonitorSettings> {
    const settings = await this.signalkAlertMonitorStore.get();
    return {
      ...settings,
      enabled: this.signalkAlertMonitor.isEnabled(),
      running: this.signalkAlertMonitor.isRunning(),
    };
  }

  async setSignalKAlertMonitorEnabled(enabled: boolean): Promise<SignalKAlertMonitorSettings> {
    const saved = await this.signalkAlertMonitorStore.save(enabled);
    this.signalkAlertMonitor.setEnabled(saved.enabled);
    this.logger.info(`SignalK alert monitor ${enabled ? "enabled" : "disabled"}.`);
    return await this.getSignalKAlertMonitorSettings();
  }

  snoozeActiveSignalKAlerts(): { count: number; durationSeconds: number } {
    const snoozed = this.signalkAlertMonitor.snoozeActiveAlerts();
    return {
      count: snoozed.length,
      durationSeconds: Math.max(5, this.config.signalkAlertSnoozeSeconds),
    };
  }

  async runVoiceOnce(options?: {
    history?: ConversationMessage[];
    wakeTriggered?: boolean;
    recordingPath?: string;
  }): Promise<VoiceRunResult> {
    if (this.busy) {
      throw new Error("Busy.");
    }

    const history = options?.history ?? [];
    const currentHealth = await this.refreshServiceHealth();
    const whisperOk = this.isServiceHealthy(currentHealth, "whisper");
    const rasaOk = this.isServiceHealthy(currentHealth, "rasa");
    if (!whisperOk || !rasaOk) {
      throw new Error("Core services unavailable (whisper/rasa).");
    }

    this.busy = true;
    this.latestTranscript = null;
    const shouldSuspendWakeWord = !options?.wakeTriggered && this.wakeWordEnabled;
    try {
      if (shouldSuspendWakeWord) {
        await this.wakeWordService.stopAndWait();
      }

      let recordingPath = options?.recordingPath ?? null;
      if (recordingPath) {
        this.setState("listening", "Using wake-word captured sample...");
        this.logger.info(`Using wake-word captured sample ${recordingPath}`);
      } else {
        this.setState(
          "listening",
          `Recording sample from ${this.config.audioInputDevice}...`,
        );
        recordingPath = await this.audio.recordSample();
        this.logger.info(`Recorded sample to ${recordingPath}`);
      }

      if (this.config.enableAudioPlaybackDebug) {
        this.setState("playing", `Playing sample through ${this.config.audioOutputDevice}...`);
        await this.audio.playFile(recordingPath);
      }

      const transcript = await this.transcribeSample(recordingPath);
      if (!isUsableTranscript(transcript)) {
        const fallback = "I did not catch that. Please repeat your question.";
        if (this.config.enableTts && this.piperReady) {
          this.setState("speaking", "Synthesizing reply with Piper...");
          const speechPath = await this.piper.synthesize(fallback);
          if (speechPath) {
            await this.audio.playFile(speechPath);
          }
        }
        this.setState("idle", "Whisper returned an empty transcript.");
        return {
          transcript: null,
          normalizedTranscript: null,
          reply: fallback,
          relay: { kind: "none" },
        };
      }

      const recoveredTranscript = options?.wakeTriggered
        ? await this.recoverWakeTriggeredTranscript(transcript)
        : { transcript };
      if ("result" in recoveredTranscript) {
        return recoveredTranscript.result;
      }

      this.latestTranscript = recoveredTranscript.transcript;
      this.setState("thinking", `Parsed: ${recoveredTranscript.transcript}`);
      const result = await this.executeTextCommandInternal(recoveredTranscript.transcript, history, true);
      if (this.awaitingAnchorRodeLength) {
        return await this.captureAnchorRodeFollowUp(
          recoveredTranscript.transcript,
          result.normalizedTranscript ?? recoveredTranscript.transcript,
        );
      }
      return {
        transcript: recoveredTranscript.transcript,
        normalizedTranscript: result.normalizedTranscript,
        reply: result.reply,
        relay: result.relay,
      };
    } finally {
      this.latestTranscript = null;
      this.busy = false;
      if (shouldSuspendWakeWord) {
        await this.syncWakeWordRuntime();
      }
    }
  }

  async runTextCommand(
    userText: string,
    history: ConversationMessage[] = [],
  ): Promise<VoiceRunResult> {
    const result = await this.executeTextCommandInternal(userText, history, false);
    return {
      transcript: userText,
      normalizedTranscript: result.normalizedTranscript,
      reply: result.reply,
      relay: result.relay,
    };
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

    if (command.action === "power_cycle_pi") {
      await this.relay.powerCyclePi();
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

  async executeAnchorAlarmCommand(
    userText: string,
  ): Promise<string | null> {
    return await this.tryHandleAnchorAlarmCommand(userText);
  }

  async executeTelemetryQuery(userText: string): Promise<string | null> {
    if (!this.config.marineTelemetryEnabled) {
      return null;
    }
    if (looksLikeStatusReportIntent(userText)) {
      return await this.buildStatusReport();
    }
    if (looksLikeAnchorAlarmStatusIntent(userText)) {
      const response = await fetch(`${this.config.signalKUrl.replace(/\/+$/, "")}/signalk/v1/api/vessels/self`, {
        method: "GET",
        headers: this.config.signalKToken ? { Authorization: `Bearer ${this.config.signalKToken}` } : {},
      });
      if (!response.ok) {
        throw new Error(`SignalK anchor status query failed: HTTP ${response.status}`);
      }
      const payload = (await response.json()) as Record<string, unknown>;
      return formatAnchorLine(payload, 0);
    }
    const spec = inferTelemetryQuery(userText);
    if (!spec) {
      return null;
    }

    const response = await fetch(`${this.config.signalKUrl.replace(/\/+$/, "")}/signalk/v1/api/vessels/self`, {
      method: "GET",
      headers: this.config.signalKToken ? { Authorization: `Bearer ${this.config.signalKToken}` } : {},
    });
    if (!response.ok) {
      throw new Error(`SignalK telemetry query failed: HTTP ${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const node = getNodeByPath(payload, spec.path);
    const value = getByPath(payload, spec.path);
    const formatted = spec.format(value, node);
    if (!formatted) {
      return `I can't read ${spec.label.toLowerCase()} right now.`;
    }
    return `${spec.label} is ${formatted}.`;
  }

  private async executeTextCommandInternal(
    userText: string,
    history: ConversationMessage[],
    speakReply: boolean,
  ): Promise<Pick<VoiceRunResult, "normalizedTranscript" | "reply" | "relay">> {
    const routedPrompt = await this.normalizeTranscriptWithRasa(userText);
    this.logger.info(`User text: ${userText}`);
    if (routedPrompt !== userText) {
      this.logger.info(`Rasa-routed text: ${routedPrompt}`);
    }

    try {
      const notificationReply = await this.tryHandleSignalKAlertMonitorCommand(routedPrompt);
      if (notificationReply) {
        await this.speakReplyIfEnabled(
          notificationReply,
          "Synthesizing SignalK notification confirmation with Piper...",
          speakReply,
        );
        this.setState("idle", `You: ${userText}\nAssistant: ${notificationReply}`);
        return { normalizedTranscript: routedPrompt, reply: notificationReply, relay: { kind: "none" } };
      }

      const anchorReply = await this.tryHandleAnchorAlarmCommand(routedPrompt);
      if (anchorReply) {
        await this.speakReplyIfEnabled(anchorReply, "Synthesizing anchor alarm confirmation with Piper...", speakReply);
        this.setState("idle", `You: ${userText}\nAssistant: ${anchorReply}`);
        return { normalizedTranscript: routedPrompt, reply: anchorReply, relay: { kind: "none" } };
      }

      const telemetryReply = await this.executeTelemetryQuery(routedPrompt);
      if (telemetryReply) {
        await this.speakReplyIfEnabled(telemetryReply, "Synthesizing telemetry response with Piper...", speakReply);
        this.setState("idle", `You: ${userText}\nAssistant: ${telemetryReply}`);
        return { normalizedTranscript: routedPrompt, reply: telemetryReply, relay: { kind: "none" } };
      }

      const relayResult = await this.planOrExecuteRelay(routedPrompt, history);
      if (relayResult.kind === "executed") {
        await this.speakReplyIfEnabled(relayResult.spokenReply, "Synthesizing relay confirmation with Piper...", speakReply);
        this.setState("idle", relayResult.spokenReply);
        return { normalizedTranscript: routedPrompt, reply: relayResult.spokenReply, relay: relayResult };
      }
    } catch (error) {
      const friendly = humanizeOperationalError(error);
      this.logger.warn(`Rasa command execution failed: ${error instanceof Error ? error.message : String(error)}`);
      await this.speakReplyIfEnabled(friendly, "Synthesizing fallback reply with Piper...", speakReply);
      this.setState("idle", friendly);
      return { normalizedTranscript: routedPrompt, reply: friendly, relay: { kind: "none" } };
    }

    const fallback = "I can't help with that yet. Try a relay, telemetry, or anchor-alarm command.";
    await this.speakReplyIfEnabled(fallback, "Synthesizing fallback reply with Piper...", speakReply);
    this.setState("idle", `You: ${userText}\nAssistant: ${fallback}`);
    return { normalizedTranscript: routedPrompt, reply: fallback, relay: { kind: "none" } };
  }

  private async speakReplyIfEnabled(reply: string, stateMessage: string, speakReply: boolean): Promise<void> {
    if (!speakReply || !this.config.enableTts || !this.piperReady) {
      return;
    }

    this.setState("speaking", stateMessage);
    const speechPath = await this.piper.synthesize(reply);
    if (speechPath) {
      await this.audio.playFile(speechPath);
    }
  }

  private async buildStatusReport(): Promise<string> {
    const response = await fetch(`${this.config.signalKUrl.replace(/\/+$/, "")}/signalk/v1/api/vessels/self`, {
      method: "GET",
      headers: this.config.signalKToken ? { Authorization: `Bearer ${this.config.signalKToken}` } : {},
    });
    if (!response.ok) {
      throw new Error(`SignalK status report failed: HTTP ${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;

    const activeAlerts = collectActiveNotificationAlerts(payload);
    const variant = this.statusReportVariantIndex;
    this.statusReportVariantIndex = (this.statusReportVariantIndex + 1) % 4;

    const alertsLine = formatAlertsLine(activeAlerts, variant);
    const anchorLine = formatAnchorLine(payload, variant);

    const wind = formatWithConfiguredUnit(
      getByPath(payload, "environment.wind.speedApparent"),
      getNodeByPath(payload, "environment.wind.speedApparent"),
      (n) => `${n.toFixed(2)} meters per second`,
    );
    const leisureSoc = formatRatioPercent(getByPath(payload, "electrical.batteries.A.capacity.stateOfCharge"), 1);
    const starterSoc = formatRatioPercent(getByPath(payload, "electrical.batteries.B.capacity.stateOfCharge"), 1);

    const depth =
      formatMeters(getByPath(payload, "environment.depth.belowTransducer"), 1) ??
      formatMeters(getByPath(payload, "environment.depth.belowKeel"), 1);

    const windLine = formatWindLine(wind, variant);
    const batteryLine = formatBatteryLine(leisureSoc, starterSoc, variant);
    const depthLine = formatDepthLine(depth, variant);

    return `${alertsLine} ${anchorLine} ${windLine} ${batteryLine} ${depthLine}`.replace(/\s+/g, " ").trim();
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
      const rasaOk = this.isServiceHealthy(currentHealth, "rasa");
      if (!whisperOk || !rasaOk) {
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
      if (!this.isServiceHealthy(currentHealth, "rasa")) {
        this.setState("error", "Typed prompt blocked while Rasa is unavailable.");
        return;
      }

      this.busy = true;

      try {
        const prompt = await this.input.promptText("You> ");
        if (!prompt) {
          this.setState("idle", "Typed prompt cancelled.");
          return;
        }

        await this.runTextCommand(prompt);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.setState("error", `Typed prompt failed: ${detail}`);
      } finally {
        this.busy = false;
      }
    });

  }

  private async handleSignalKAlert(alert: SpokenSignalKAlert): Promise<void> {
    this.logger.warn(`SignalK alert ${alert.path}: ${alert.message}`);
    if (!this.config.enableTts || !this.piperReady) {
      return;
    }
    try {
      const speechPath = await this.piper.synthesize(alert.message);
      if (speechPath) {
        await this.audio.playFile(speechPath);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to speak SignalK alert: ${detail}`);
    }
  }

  private setState(state: ControllerState, message: string): void {
    this.state = state;
    this.stateMessage = message;
    this.renderer.renderState(state, message);
    this.logger.info(message);
    void this.reSpeakerLed?.applyState(state).catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.debug(`reSpeaker LED update failed: ${detail}`);
    });
  }

  private async runPreflightChecks(): Promise<PreflightCheck[]> {
    const checks = await Promise.all([
      this.audio.runPreflightChecks(),
      this.piper.runPreflightChecks(),
      this.relay?.runPreflightChecks() ?? Promise.resolve([]),
      this.marine?.runPreflightChecks() ?? Promise.resolve([]),
      this.rasa?.runPreflightChecks() ?? Promise.resolve([]),
      this.wakeWordService.runPreflightChecks(),
      this.reSpeakerLed?.runPreflightChecks() ?? Promise.resolve([]),
      this.reSpeakerXvf?.runPreflightChecks() ?? Promise.resolve([]),
    ]);
    return checks.flat();
  }

  private async loadWakeWordSettings(): Promise<void> {
    try {
      const settings = await this.wakeWordStore.get();
      this.wakeWordEnabled = settings.enabled;
      this.wakeWordPhrase = settings.phrase;
      this.wakeWordUpdatedAt = settings.updatedAt;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to load wake word settings: ${detail}`);
    }
  }

  private async loadSignalKAlertMonitorSettings(): Promise<void> {
    try {
      const settings = await this.signalkAlertMonitorStore.get();
      this.signalkAlertMonitor.setEnabled(settings.enabled);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to load SignalK alert monitor settings: ${detail}`);
    }
  }

  private async syncWakeWordRuntime(): Promise<void> {
    if (this.wakeWordEnabled) {
      await this.wakeWordService.start();
      return;
    }
    this.wakeWordService.stop();
  }

  private async transcribeSample(recordingPath: string): Promise<string> {
    this.setState(
      "transcribing",
      `Sending sample to Whisper at ${this.getServiceUrl("whisper")}...`,
    );
    void this.audioCue?.playTranscribingCue().catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Transcribing cue failed: ${detail}`);
    });

    try {
      return await this.whisper.transcribe(recordingPath);
    } finally {
      void this.audioCue?.stop().catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.debug(`Stopping transcribing cue failed: ${detail}`);
      });
    }
  }

  private async configureReSpeakerXvf(): Promise<void> {
    if (!this.reSpeakerXvf) {
      return;
    }

    try {
      await this.reSpeakerXvf.applyVoiceProfile();
      const snapshot = await this.reSpeakerXvf.readSnapshot();
      if (!snapshot) {
        return;
      }

      const parts = [
        snapshot.version,
        snapshot.leftRoute,
        snapshot.rightRoute,
      ].filter((value): value is string => Boolean(value));
      if (parts.length > 0) {
        this.logger.info(`ReSpeaker XVF configured: ${parts.join(" | ")}`);
      }
      if (snapshot.azimuths) {
        this.logger.debug(`ReSpeaker XVF azimuths: ${snapshot.azimuths}`);
      }
      if (snapshot.speechEnergy) {
        this.logger.debug(`ReSpeaker XVF speech energy: ${snapshot.speechEnergy}`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to configure reSpeaker XVF: ${detail}`);
    }
  }

  private async handleWakeWordDetected(event: { event: "wake-detected" | "wake-captured"; phrase: string; score: number; filePath?: string }): Promise<void> {
    if (!this.wakeWordEnabled) {
      return;
    }
    if (this.busy) {
      this.logger.debug(`Wake word ${event.phrase} ignored while busy.`);
      return;
    }

    if (event.event === "wake-detected") {
      this.logger.info(`Wake word detected: ${event.phrase} (${event.score.toFixed(3)})`);
      this.setState("listening", `Wake word heard. Listening for your command...`);
      return;
    }

    this.logger.info(`Wake word capture ready: ${event.phrase} (${event.score.toFixed(3)})`);
    await this.wakeWordService.stopAndWait();
    try {
      await this.runVoiceOnce({ wakeTriggered: true, recordingPath: event.filePath });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Wake word voice run failed: ${detail}`);
      this.setState("idle", humanizeOperationalError(error));
    } finally {
      await this.syncWakeWordRuntime();
    }
  }

  private async normalizeTranscriptWithRasa(transcript: string): Promise<string> {
    const normalizedAlias = normalizeKnownCommandAlias(transcript);
    if (normalizedAlias) {
      return normalizedAlias;
    }

    const normalizedTranscript = transcript.toLowerCase().replace(/[.?!]/g, " ").replace(/\s+/g, " ").trim();
    if (isSignalKAlertMonitorSnoozeCommand(normalizedTranscript)) {
      return transcript;
    }

    if (!this.rasa) {
      return transcript;
    }

    try {
      const result = await this.rasa.parse(transcript);
      if (!result) {
        return transcript;
      }
      if (result.confidence < this.config.rasaIntentMinConfidence / 100) {
        return transcript;
      }

      const mapped = mapRasaIntentToPrompt(result);
      if (!mapped) {
        return transcript;
      }

      // Preserve battery-targeting semantics when a generic mapped intent would
      // lose the exact battery bank or metric requested.
      if (shouldPreserveOriginalTelemetryPhrase(transcript, mapped)) {
        return transcript;
      }
      if (looksLikeStatusReportIntent(transcript) && !looksLikeStatusReportIntent(mapped)) {
        return transcript;
      }

      // Preserve original numeric utterances (for example "20 meters") when
      // intent mapping omits entity values, so downstream command parsing
      // still has access to the number.
      const originalHasNumber = /\d/.test(transcript);
      const mappedHasNumber = /\d/.test(mapped);
      if (originalHasNumber && !mappedHasNumber) {
        return transcript;
      }

      return mapped;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Rasa parse failed: ${detail}`);
      return transcript;
    }
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
      this.setState("idle", "Ready for Rasa commands.");
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

    if (check.name === "rasa-endpoint") {
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
        return false;
      }

      this.setState("idle", planned.spokenReply);
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.setState("idle", `Relay unavailable: ${detail}`);
      return true;
    }
  }

  private async planOrExecuteRelay(
    userText: string,
    history: ConversationMessage[] = [],
  ): Promise<RelayActionResult> {
    if (!this.relay || !looksLikeRelayIntentWithHistory(userText, history)) {
      return { kind: "none" };
    }

    this.setState("thinking", "Planning relay action...");
    const command = history.length > 0 ? inferRelayCommandFromHistory(userText, history) : parseRelayCommandFromText(userText);
    if (!command || command.action === "none") {
      return { kind: "none" };
    }

    const summary = summarizeRelayCommand(command);
    const result = await this.executeRelay(command);
    return {
      kind: "executed",
      summary,
      statusLine: result.statusLine,
      spokenReply: summarizeRelayExecution(command),
    };
  }

  private async tryHandleAnchorAlarmCommand(userText: string): Promise<string | null> {
    if (!this.anchorAlarm) {
      return null;
    }

    const normalized = userText.toLowerCase().replace(/[.?!]/g, " ").replace(/\s+/g, " ").trim();

    if (this.awaitingAnchorRodeLength) {
      const rodeLength = parseMeters(userText);
      if (rodeLength === null) {
        return "Please tell me the deployed rode length in meters.";
      }
      this.awaitingAnchorRodeLength = false;
      this.setState("thinking", `Enabling anchor alarm with rode length ${rodeLength.toFixed(1)} meters...`);
      return await this.anchorAlarm.enableWithRodeLength(rodeLength);
    }

    if (isAnchorAlarmOffCommand(normalized)) {
      this.awaitingAnchorRodeLength = false;
      this.setState("thinking", "Switching off anchor alarm...");
      return await this.anchorAlarm.disable();
    }

    if (isAnchorAlarmSetRadiusCommand(normalized)) {
      const radius = parseMeters(userText);
      if (radius === null) {
        return "Please tell me the anchor radius in meters.";
      }
      this.awaitingAnchorRodeLength = false;
      this.setState("thinking", `Setting anchor alarm radius to ${radius.toFixed(1)} meters...`);
      return await this.anchorAlarm.setRadius(radius);
    }

    if (isAnchorAlarmOnCommand(normalized)) {
      const rodeLength = parseMeters(userText);
      if (rodeLength !== null) {
        this.setState("thinking", `Enabling anchor alarm with rode length ${rodeLength.toFixed(1)} meters...`);
        return await this.anchorAlarm.enableWithRodeLength(rodeLength);
      }
      this.awaitingAnchorRodeLength = true;
      return "Anchor alarm acknowledged. What rode length has been deployed in meters?";
    }

    return null;
  }

  private async tryHandleSignalKAlertMonitorCommand(userText: string): Promise<string | null> {
    const normalized = userText.toLowerCase().replace(/[.?!]/g, " ").replace(/\s+/g, " ").trim();

    if (isSignalKAlertMonitorStatusCommand(normalized)) {
      const settings = await this.getSignalKAlertMonitorSettings();
      return settings.enabled
        ? "Signal K notifications are enabled."
        : "Signal K notifications are disabled.";
    }

    if (isSignalKAlertMonitorOnCommand(normalized)) {
      const settings = await this.getSignalKAlertMonitorSettings();
      if (settings.enabled) {
        return "Signal K notifications are already enabled.";
      }
      this.setState("thinking", "Enabling SignalK notifications...");
      await this.setSignalKAlertMonitorEnabled(true);
      return "Signal K notifications are now enabled.";
    }

    if (isSignalKAlertMonitorOffCommand(normalized)) {
      const settings = await this.getSignalKAlertMonitorSettings();
      if (!settings.enabled) {
        return "Signal K notifications are already disabled.";
      }
      this.setState("thinking", "Disabling SignalK notifications...");
      await this.setSignalKAlertMonitorEnabled(false);
      return "Signal K notifications are now disabled.";
    }

    if (isSignalKAlertMonitorSnoozeCommand(normalized)) {
      const snoozed = this.snoozeActiveSignalKAlerts();
      if (snoozed.count === 0) {
        return "There are no active Signal K notifications to snooze right now.";
      }
      return `Snoozed ${snoozed.count === 1 ? "that Signal K notification" : `${snoozed.count} Signal K notifications`} for ${formatDurationSeconds(snoozed.durationSeconds)}.`;
    }

    return null;
  }

  private async captureAnchorRodeFollowUp(
    initialTranscript: string,
    initialNormalizedTranscript: string,
  ): Promise<VoiceRunResult> {
    this.setState("listening", "Listening for rode length in meters...");
    // Start follow-up capture immediately; VAD-first capture can miss short numeric replies.
    const recordingPath = await this.audio.recordSample({ disableVad: true });
    this.logger.info(`Recorded rode-length follow-up to ${recordingPath}`);

    const transcript = await this.transcribeSample(recordingPath);
    if (!isUsableAnchorRodeTranscript(transcript)) {
      const fallback = "I did not catch the rode length. Please try dropping anchor again.";
      if (this.config.enableTts && this.piperReady) {
        this.setState("speaking", "Synthesizing follow-up prompt with Piper...");
        const speechPath = await this.piper.synthesize(fallback);
        if (speechPath) {
          await this.audio.playFile(speechPath);
        }
      }
      this.awaitingAnchorRodeLength = false;
      this.setState("idle", fallback);
      return {
        transcript: initialTranscript,
        normalizedTranscript: initialNormalizedTranscript,
        reply: fallback,
        relay: { kind: "none" },
      };
    }

    this.latestTranscript = transcript;
    this.setState("thinking", `Parsed: ${transcript}`);
    this.logger.info(`Rode-length transcript: ${transcript}`);
    const anchorReply = await this.tryHandleAnchorAlarmCommand(transcript);
    if (!anchorReply) {
      this.awaitingAnchorRodeLength = false;
      const fallback = "I heard you, but I still need the rode length in meters.";
      if (this.config.enableTts && this.piperReady) {
        this.setState("speaking", "Synthesizing follow-up clarification with Piper...");
        const speechPath = await this.piper.synthesize(fallback);
        if (speechPath) {
          await this.audio.playFile(speechPath);
        }
      }
      this.setState("idle", fallback);
      return {
        transcript,
        normalizedTranscript: transcript,
        reply: fallback,
        relay: { kind: "none" },
      };
    }

    if (this.config.enableTts && this.piperReady) {
      this.setState("speaking", "Synthesizing anchor alarm confirmation with Piper...");
      const speechPath = await this.piper.synthesize(anchorReply);
      if (speechPath) {
        await this.audio.playFile(speechPath);
      }
    }
    this.setState("idle", anchorReply);
    return {
      transcript,
      normalizedTranscript: transcript,
      reply: anchorReply,
      relay: { kind: "none" },
    };
  }

  private async recoverWakeTriggeredTranscript(
    transcript: string,
  ): Promise<WakeTranscriptRecovery> {
    if (!isWakeWordFillerTranscript(transcript, this.wakeWordPhrase)) {
      return { transcript: stripLeadingWakeWord(transcript, this.wakeWordPhrase) };
    }

    this.logger.info(`Wake-word follow-up looked like filler: ${transcript}`);

    const reprompt = "Go ahead.";
    if (this.config.enableTts && this.piperReady) {
      this.setState("speaking", "Synthesizing wake-word reprompt with Piper...");
      const speechPath = await this.piper.synthesize(reprompt);
      if (speechPath) {
        await this.audio.playFile(speechPath);
      }
    }

    this.setState("listening", `Wake word heard. Listening for your command...`);
    const retryRecordingPath = await this.audio.recordSample();
    this.logger.info(`Recorded wake-word retry sample to ${retryRecordingPath}`);

    const retryTranscript = await this.transcribeSample(retryRecordingPath);
    if (!isUsableTranscript(retryTranscript) || isWakeWordFillerTranscript(retryTranscript, this.wakeWordPhrase)) {
      if (retryTranscript) {
        this.logger.info(`Wake-word retry still looked like filler: ${retryTranscript}`);
      } else {
        this.logger.info("Wake-word retry returned no usable transcript.");
      }
      const fallback = `I heard ${this.wakeWordPhrase}, but I still need your command. Please say ${this.wakeWordPhrase} and your request together.`;
      if (this.config.enableTts && this.piperReady) {
        this.setState("speaking", "Synthesizing wake-word clarification with Piper...");
        const speechPath = await this.piper.synthesize(fallback);
        if (speechPath) {
          await this.audio.playFile(speechPath);
        }
      }
      this.setState("idle", fallback);
      return {
        result: {
          transcript: retryTranscript ?? transcript,
          normalizedTranscript: null,
          reply: fallback,
          relay: { kind: "none" },
        },
      };
    }

    const strippedRetryTranscript = stripLeadingWakeWord(retryTranscript, this.wakeWordPhrase);
    this.logger.info(`Wake-word retry captured command: ${strippedRetryTranscript}`);

    return { transcript: strippedRetryTranscript };
  }
}

const WAKE_WORD_FILLER_TOKENS = new Set([
  "ah",
  "er",
  "erm",
  "hello",
  "hey",
  "hi",
  "hmm",
  "mm",
  "ok",
  "okay",
  "uh",
  "um",
  "yeah",
  "yep",
]);

const normalizeSpokenText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isUsableTranscript = (value: string | null | undefined): value is string => {
  if (!value) {
    return false;
  }

  const normalized = value.trim();
  if (!/[a-z0-9]/i.test(normalized)) {
    return false;
  }

  return normalized.length >= 3;
};

const isUsableAnchorRodeTranscript = (value: string | null | undefined): value is string => {
  if (!value) {
    return false;
  }

  return isUsableTranscript(value) || parseMeters(value) !== null;
};

const isWakeWordFillerTranscript = (value: string, wakeWordPhrase: string): boolean => {
  const normalized = normalizeSpokenText(value);
  if (!normalized) {
    return false;
  }

  const wakeWord = normalizeSpokenText(wakeWordPhrase);
  if (normalized === wakeWord || looksWakeWordLike(normalized, wakeWordPhrase)) {
    return true;
  }

  const wakeWordTokens = new Set(wakeWord.split(" ").filter((token) => token.length > 0));
  const tokens = normalized.split(" ").filter((token) => token.length > 0);
  return (
    tokens.length > 0 &&
    tokens.every((token) => WAKE_WORD_FILLER_TOKENS.has(token) || wakeWordTokens.has(token))
  );
};

const stripLeadingWakeWord = (value: string, wakeWordPhrase: string): string => {
  const phrase = wakeWordPhrase.trim();
  if (!phrase) {
    return value.trim();
  }

  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripped = value.replace(new RegExp(`^\\s*${escaped}[,.:;!?-]*\\s*`, "i"), "").trim();
  if (stripped.length > 0 && stripped !== value.trim()) {
    return stripped;
  }

  const prefixMatch = value.match(/^\s*([^,.:;!?-]+)[,.:;!?-]+\s+(.+)$/);
  if (prefixMatch) {
    const prefix = normalizeSpokenText(prefixMatch[1] ?? "");
    const remainder = (prefixMatch[2] ?? "").trim();
    const prefixTokens = prefix.split(" ").filter((token) => token.length > 0);
    if (
      prefixTokens.length > 0 &&
      prefixTokens.length <= 2 &&
      looksLikeCommandStart(remainder) &&
      looksWakeWordLike(prefix, wakeWordPhrase)
    ) {
      return remainder;
    }
  }

  const tokenMatch = value.match(/^\s*([a-zA-Z]+)\s+(.+)$/);
  if (tokenMatch) {
    const firstToken = normalizeSpokenText(tokenMatch[1] ?? "");
    const remainder = (tokenMatch[2] ?? "").trim();
    if (looksLikeCommandStart(remainder) && looksWakeWordLike(firstToken, wakeWordPhrase)) {
      return remainder;
    }
  }

  return value.trim();
};

const COMMON_WAKE_WORD_VARIANTS = new Set([
  "hey christian",
  "hey krischna",
  "hey krishna",
  "hey krishnaa",
  "hey krishma",
  "hey krishnan",
  "hey krisna",
  "hey prichman",
  "ok krishna",
  "okay christian",
  "okay krischna",
  "okay krishna",
  "okay krishnaa",
  "okay krishma",
  "okay krishnan",
  "okay krisna",
  "okay prichman",
  "christian",
  "krischna",
  "krishna",
  "krishnaa",
  "krishma",
  "krishnan",
  "krisna",
  "prichman",
]);

const COMMAND_STARTERS = new Set([
  "all",
  "anchor",
  "current",
  "depth",
  "disable",
  "drop",
  "enable",
  "how",
  "relay",
  "set",
  "speed",
  "status",
  "switch",
  "tell",
  "turn",
  "what",
]);

const looksLikeCommandStart = (value: string): boolean => {
  const normalized = normalizeSpokenText(value);
  const firstToken = normalized.split(" ").find((token) => token.length > 0);
  return firstToken ? COMMAND_STARTERS.has(firstToken) : false;
};

const editDistance = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }

  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }
  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[left.length][right.length];
};

const looksWakeWordLike = (candidate: string, wakeWordPhrase: string): boolean => {
  const normalizedCandidate = normalizeSpokenText(candidate);
  if (!normalizedCandidate) {
    return false;
  }
  if (COMMON_WAKE_WORD_VARIANTS.has(normalizedCandidate)) {
    return true;
  }

  const wakeWordTokens = normalizeSpokenText(wakeWordPhrase)
    .split(" ")
    .filter((token) => token.length > 0);
  if (wakeWordTokens.length === 0) {
    return false;
  }

  return wakeWordTokens.some((token) => {
    if (normalizedCandidate === token) {
      return true;
    }
    const distance = editDistance(normalizedCandidate, token);
    return distance <= 2 || (normalizedCandidate.length >= 6 && distance <= 3);
  });
};

const parseMeters = (text: string): number | null => {
  const match = text.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const isAnchorAlarmOnCommand = (normalized: string): boolean =>
  (normalized.includes("anchor alarm") || normalized.includes("anchoralarm")) &&
  (/\bswitch on\b/.test(normalized) || /\bturn on\b/.test(normalized) || /\benable\b/.test(normalized));

const isAnchorAlarmOffCommand = (normalized: string): boolean =>
  (normalized.includes("anchor alarm") || normalized.includes("anchoralarm")) &&
  (/\bswitch off\b/.test(normalized) || /\bturn off\b/.test(normalized) || /\bdisable\b/.test(normalized));

const isAnchorAlarmSetRadiusCommand = (normalized: string): boolean =>
  (normalized.includes("anchor alarm") || normalized.includes("anchoralarm")) &&
  /\bradius\b/.test(normalized) &&
  (/\bset\b/.test(normalized) || /\bchange\b/.test(normalized) || /\bupdate\b/.test(normalized));

const refersToSignalKNotifications = (normalized: string): boolean => {
  const mentionsNotifications = /\bnotification(s)?\b/.test(normalized) || /\balert monitor\b/.test(normalized);
  if (!mentionsNotifications) {
    return false;
  }
  return /\b(signalk|signal k)\b/.test(normalized) || /\bnotification(s)?\b/.test(normalized);
};

const isSignalKAlertMonitorOnCommand = (normalized: string): boolean =>
  refersToSignalKNotifications(normalized) &&
  (/\benable\b/.test(normalized) || /\bturn on\b/.test(normalized) || /\bswitch on\b/.test(normalized));

const isSignalKAlertMonitorOffCommand = (normalized: string): boolean =>
  refersToSignalKNotifications(normalized) &&
  (/\bdisable\b/.test(normalized) || /\bturn off\b/.test(normalized) || /\bswitch off\b/.test(normalized));

const isSignalKAlertMonitorStatusCommand = (normalized: string): boolean =>
  refersToSignalKNotifications(normalized) &&
  (/\bstatus\b/.test(normalized) || /\bare\b/.test(normalized) || /\bwhat\b/.test(normalized));

const isSignalKAlertMonitorSnoozeCommand = (normalized: string): boolean =>
  /\bsnooze\b/.test(normalized) &&
  (
    /\bthat notification\b/.test(normalized) ||
    /\bthat alert\b/.test(normalized) ||
    /\bnotification(s)?\b/.test(normalized) ||
    /\balert(s)?\b/.test(normalized)
  );

const formatDurationSeconds = (seconds: number): string => {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} seconds`;
};

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

const looksLikeRelayIntentWithHistory = (text: string, history: ConversationMessage[]): boolean => {
  if (looksLikeRelayIntent(text)) {
    return true;
  }

  const normalized = text.toLowerCase().trim();
  const shortCommand =
    normalized === "off" ||
    normalized === "on" ||
    normalized === "turn off" ||
    normalized === "turn on" ||
    normalized === "switch off" ||
    normalized === "switch on" ||
    normalized === "all off" ||
    normalized === "all on";

  if (!shortCommand || history.length === 0) {
    return false;
  }

  const recent = history.slice(-4).map((msg) => msg.content.toLowerCase());
  return recent.some((content) => content.includes("relay") || content.includes("ch1") || content.includes("channel 1"));
};

const parseChannelNumber = (text: string): number | null => {
  const normalized = text.toLowerCase();
  const digit = normalized.match(/\b([1-6])\b/);
  if (digit) {
    return Number(digit[1]);
  }

  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
  };

  for (const [word, value] of Object.entries(words)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) {
      return value;
    }
  }

  return null;
};

const parseRelayCommandFromText = (text: string): RelayCommand | null => {
  const normalized = text.toLowerCase().replace(/[.?!]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  if (
    /(power\s*cycle|reboot|restart)/.test(normalized) &&
    /\b(pi|raspberry pi|computer)\b/.test(normalized)
  ) {
    return { action: "power_cycle_pi" };
  }

  if (normalized.includes("status") && normalized.includes("relay")) {
    return { action: "status" };
  }

  const wantsOn = /\b(turn|switch)?\s*on\b/.test(normalized) || /\bon\b/.test(normalized);
  const wantsOff = /\b(turn|switch)?\s*off\b/.test(normalized) || /\boff\b/.test(normalized);
  if (!wantsOn && !wantsOff) {
    return null;
  }

  const state = wantsOn && !wantsOff ? "on" : wantsOff && !wantsOn ? "off" : null;
  if (!state) {
    return null;
  }

  if (normalized.includes("all") && normalized.includes("relay")) {
    return { action: "all", state };
  }

  if (normalized.includes("relay")) {
    const channel = parseChannelNumber(normalized);
    if (channel) {
      return { action: "set", channel, state };
    }

    // Common user phrasing: "turn off the relay" (singular) -> CH1
    return { action: "set", channel: 1, state };
  }

  return null;
};

const inferRelayCommandFromHistory = (
  text: string,
  history: ConversationMessage[],
): RelayCommand | null => {
  const direct = parseRelayCommandFromText(text);
  if (direct) {
    return direct;
  }

  const normalized = text.toLowerCase().replace(/[.?!]/g, " ").replace(/\s+/g, " ").trim();
  const wantsOn =
    normalized === "on" || normalized === "turn on" || normalized === "switch on" || normalized === "all on";
  const wantsOff =
    normalized === "off" || normalized === "turn off" || normalized === "switch off" || normalized === "all off";
  if (!wantsOn && !wantsOff) {
    return null;
  }

  const state = wantsOn ? "on" : "off";
  const recent = history
    .slice(-10)
    .map((msg) => msg.content)
    .reverse();

  for (const content of recent) {
    const match =
      content.match(/\bch\s*([1-6])\b/i) ||
      content.match(/\bchannel\s*([1-6])\b/i) ||
      content.match(/\bch([1-6])\b/i);
    if (match) {
      const channel = Number(match[1]);
      if (Number.isInteger(channel) && channel >= 1 && channel <= 6) {
        return { action: "set", channel, state };
      }
    }

    if (/\ball\b/i.test(content) && /\brelay\b/i.test(content)) {
      return { action: "all", state };
    }
  }

  return null;
};

const isPiperReady = (checks: PreflightCheck[]): boolean => {
  const piperChecks = checks.filter((check) => check.name.startsWith("piper-"));
  if (piperChecks.length === 0) {
    return false;
  }
  return piperChecks.every((check) => check.ok);
};

const summarizeRelayCommand = (command: RelayCommand): string => {
  if (command.action === "status") {
    return "Read relay status";
  }
  if (command.action === "all") {
    return `Turn all relays ${command.state}`;
  }
  if (command.action === "set") {
    return `Turn relay ${command.channel} ${command.state}`;
  }
  return "Relay action";
};

const summarizeRelayExecution = (command: RelayCommand): string => {
  if (command.action === "status") {
    return "Here is the current relay status.";
  }
  if (command.action === "all") {
    return `All relays are now ${command.state}.`;
  }
  if (command.action === "set") {
    return `Relay ${command.channel} is now ${command.state}.`;
  }
  return "Relay updated.";
};

const findNumericEntity = (entities: Array<{ entity?: string; value?: unknown }>): number | null => {
  for (const item of entities) {
    const key = (item.entity ?? "").toLowerCase();
    if (!key.includes("channel") && key !== "number" && key !== "relay") {
      continue;
    }

    if (typeof item.value === "number" && Number.isInteger(item.value) && item.value >= 1 && item.value <= 6) {
      return item.value;
    }
    if (typeof item.value === "string") {
      const parsed = Number(item.value);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 6) {
        return parsed;
      }
    }
  }
  return null;
};

const findMeterEntity = (entities: Array<{ entity?: string; value?: unknown }>): number | null => {
  for (const item of entities) {
    const key = (item.entity ?? "").toLowerCase();
    if (!key.includes("radius") && !key.includes("rode") && !key.includes("length") && key !== "number") {
      continue;
    }

    if (typeof item.value === "number" && Number.isFinite(item.value) && item.value > 0) {
      return item.value;
    }
    if (typeof item.value === "string") {
      const parsed = Number(item.value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return null;
};

const mapRasaIntentToPrompt = (result: RasaIntentResult): string | null => {
  const intent = result.intentName.toLowerCase();
  const channel = findNumericEntity(result.entities);
  const meters = findMeterEntity(result.entities);

  if (intent === "relay_status") {
    return "relay status";
  }
  if (intent === "relay_all_on") {
    return "turn all relays on";
  }
  if (intent === "relay_all_off") {
    return "turn all relays off";
  }
  if (intent === "relay_on") {
    return channel ? `turn relay ${channel} on` : "turn relay 1 on";
  }
  if (intent === "relay_off") {
    return channel ? `turn relay ${channel} off` : "turn relay 1 off";
  }
  if (intent === "depth_query") {
    return "what is our current depth";
  }
  if (intent === "speed_query") {
    return "what is our current speed";
  }
  if (intent === "wind_speed_query") {
    return "what is our current wind speed";
  }
  if (intent === "battery_voltage_query") {
    return "what is our current battery voltage";
  }
  if (intent === "cabin_temperature_query") {
    return "what is the cabin temperature";
  }
  if (intent === "anchor_alarm_on") {
    return "switch on anchor alarm";
  }
  if (intent === "anchor_alarm_off") {
    return "switch off anchor alarm";
  }
  if (intent === "anchor_set_radius") {
    return meters ? `set anchor alarm radius ${meters} meters` : "set anchor alarm radius";
  }
  if (intent === "anchor_set_rode") {
    return meters ? `switch on anchor alarm ${meters} meters` : "switch on anchor alarm";
  }
  if (intent === "signalk_notifications_on") {
    return "enable signalk notifications";
  }
  if (intent === "signalk_notifications_off") {
    return "disable signalk notifications";
  }
  if (intent === "signalk_notifications_status") {
    return "what is the signalk notification status";
  }
  if (intent === "signalk_notifications_snooze") {
    return "snooze that notification";
  }
  if (intent === "leisure_battery_soc_query") {
    return "tell me the state of charge of the leisure battery";
  }
  if (intent === "leisure_battery_current_query") {
    return "tell me the current of the leisure battery";
  }
  if (intent === "leisure_battery_voltage_query") {
    return "tell me the voltage of the leisure battery";
  }
  if (intent === "starter_battery_soc_query") {
    return "tell me the state of charge of the starter battery";
  }
  if (intent === "starter_battery_current_query") {
    return "tell me the current of the starter battery";
  }
  if (intent === "starter_battery_voltage_query") {
    return "tell me the voltage of the starter battery";
  }
  if (intent === "depth_query") {
    return "tell me the depth";
  }
  if (intent === "engine_bay_pressure_query") {
    return "tell me the air pressure";
  }
  if (intent === "engine_bay_humidity_query") {
    return "tell me the humidity";
  }
  if (intent === "engine_bay_temperature_query") {
    return "tell me the engine bay temperature";
  }
  if (intent === "krishna_cpu_query") {
    return "tell me krishna cpu";
  }
  if (intent === "krishna_temperature_query") {
    return "tell me krishna temperature";
  }
  if (intent === "apparent_wind_speed_query") {
    return "tell me the apparent wind speed";
  }
  if (intent === "apparent_wind_angle_query") {
    return "tell me the apparent wind angle";
  }
  if (intent === "todays_date_query") {
    return "tell me todays date";
  }
  if (intent === "speed_over_ground_query") {
    return "tell me speed over ground";
  }
  if (intent === "speed_through_water_query") {
    return "tell me speed through the water";
  }
  if (intent === "status_report_query") {
    return "status report";
  }

  return null;
};

const getByPath = (root: Record<string, unknown>, path: string): unknown => {
  const parts = path.split(".");
  let current: unknown = root;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (current && typeof current === "object" && "value" in current) {
    return (current as { value?: unknown }).value ?? null;
  }
  return current;
};

const getNodeByPath = (root: Record<string, unknown>, path: string): unknown => {
  const parts = path.split(".");
  let current: unknown = root;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

const asFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asString = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

const getDisplayTargetUnit = (node: unknown): string | null => {
  if (!node || typeof node !== "object") {
    return null;
  }
  const meta = (node as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object") {
    return null;
  }
  const displayUnits = (meta as { displayUnits?: unknown }).displayUnits;
  if (!displayUnits || typeof displayUnits !== "object") {
    return null;
  }
  const targetUnit = (displayUnits as { targetUnit?: unknown }).targetUnit;
  return typeof targetUnit === "string" && targetUnit.trim() ? targetUnit.trim().toLowerCase() : null;
};

const formatWithConfiguredUnit = (
  value: unknown,
  node: unknown,
  fallback: (n: number) => string,
): string | null => {
  const n = asFiniteNumber(value);
  if (n === null) {
    return null;
  }
  const targetUnit = getDisplayTargetUnit(node);
  if (!targetUnit) {
    return fallback(n);
  }

  if (targetUnit === "kn") {
    return `${(n * 1.94384).toFixed(2)} knots`;
  }
  if (targetUnit === "c" || targetUnit === "°c") {
    return `${(n - 273.15).toFixed(1)} celsius`;
  }
  if (targetUnit === "mbar") {
    return `${(n * 0.01).toFixed(0)} millibars`;
  }
  if (targetUnit === "percent" || targetUnit === "%") {
    // Some feeds use ratio, others already provide percent-like values.
    const percent = n <= 1.5 ? n * 100 : n;
    return `${percent.toFixed(1)} percent`;
  }
  if (targetUnit === "degree" || targetUnit === "°") {
    return `${(n * 57.2958).toFixed(1)} degrees`;
  }

  return fallback(n);
};

const inferTelemetryQuery = (text: string): TelemetryQuerySpec | null => {
  const normalized = text.toLowerCase();
  const specs: Array<{ match: RegExp; spec: TelemetryQuerySpec }> = [
    { match: /leisure battery.*state of charge|state of charge.*leisure battery/, spec: { path: "electrical.batteries.A.capacity.stateOfCharge", label: "Leisure battery state of charge", format: (v, node) => formatWithConfiguredUnit(v, node, (n) => `${(n * 100).toFixed(1)} percent`) } },
    { match: /leisure battery.*current|current.*leisure battery/, spec: { path: "electrical.batteries.A.current", label: "Leisure battery current", format: (v) => { const n = asFiniteNumber(v); return n === null ? null : `${n.toFixed(2)} amps`; } } },
    { match: /leisure battery.*voltage|voltage.*leisure battery/, spec: { path: "electrical.batteries.A.voltage", label: "Leisure battery voltage", format: (v) => { const n = asFiniteNumber(v); return n === null ? null : `${n.toFixed(2)} volts`; } } },
    { match: /current battery voltage|battery voltage/, spec: { path: "electrical.batteries.A.voltage", label: "Battery voltage", format: (v) => { const n = asFiniteNumber(v); return n === null ? null : `${n.toFixed(2)} volts`; } } },
    { match: /starter battery.*state of charge|state of charge.*starter battery/, spec: { path: "electrical.batteries.B.capacity.stateOfCharge", label: "Starter battery state of charge", format: (v, node) => formatWithConfiguredUnit(v, node, (n) => `${(n * 100).toFixed(1)} percent`) } },
    { match: /starter battery.*current|current.*starter battery/, spec: { path: "electrical.batteries.B.current", label: "Starter battery current", format: (v) => { const n = asFiniteNumber(v); return n === null ? null : `${n.toFixed(2)} amps`; } } },
    { match: /starter battery.*voltage|voltage.*starter battery/, spec: { path: "electrical.batteries.B.voltage", label: "Starter battery voltage", format: (v) => { const n = asFiniteNumber(v); return n === null ? null : `${n.toFixed(2)} volts`; } } },
    { match: /\bdepth\b/, spec: { path: "environment.depth.belowKeel", label: "Depth", format: (v) => { const n = asFiniteNumber(v); return n === null ? null : `${n.toFixed(1)} meters`; } } },
    { match: /cabin temperature|inside temperature|cabin temp/, spec: { path: "environment.inside.temperature", label: "Cabin temperature", format: (v, node) => formatWithConfiguredUnit(v, node, (n) => `${n.toFixed(1)} celsius`) } },
    { match: /air pressure|engine bay pressure/, spec: { path: "environment.inside.engineBay.pressure", label: "Air pressure", format: (v, node) => formatWithConfiguredUnit(v, node, (n) => `${n.toFixed(0)} pascals`) } },
    { match: /\bhumidity\b/, spec: { path: "environment.inside.engineBay.relativeHumidity", label: "Humidity", format: (v, node) => formatWithConfiguredUnit(v, node, (n) => `${(n * 100).toFixed(1)} percent`) } },
    { match: /engine bay temperature/, spec: { path: "environment.inside.engineBay.temperature", label: "Engine bay temperature", format: (v, node) => formatWithConfiguredUnit(v, node, (n) => `${n.toFixed(1)} celsius`) } },
    { match: /krishna'?s cpu|krishna cpu|cpu utilisation/, spec: { path: "environment.inside.rpi.cpu.utilisation", label: "Krishna CPU", format: (v, node) => formatWithConfiguredUnit(v, node, (n) => `${(n * 100).toFixed(1)} percent`) } },
    { match: /krishna'?s temperature|krishna temperature|rpi cpu temperature/, spec: { path: "environment.inside.rpicpu.temperature", label: "Krishna temperature", format: (v, node) => formatWithConfiguredUnit(v, node, (n) => `${n.toFixed(1)} celsius`) } },
    { match: /current wind speed|wind speed now|\bwind speed\b/, spec: { path: "environment.wind.speedApparent", label: "Current wind speed", format: (v, node) => formatWithConfiguredUnit(v, node, (n) => `${n.toFixed(2)} meters per second`) } },
    { match: /apparent wind speed/, spec: { path: "environment.wind.speedApparent", label: "Apparent wind speed", format: (v, node) => formatWithConfiguredUnit(v, node, (n) => `${n.toFixed(2)} meters per second`) } },
    { match: /apparent wind angle/, spec: { path: "environment.wind.angleApparent", label: "Apparent wind angle", format: (v, node) => formatWithConfiguredUnit(v, node, (n) => `${(n * 57.2958).toFixed(1)} degrees`) } },
    { match: /todays date|today's date|today date|navigation date|current date/, spec: { path: "navigation.datetime", label: "Today's date", format: (v) => asString(v) } },
    { match: /current speed|boat speed|speed now/, spec: { path: "navigation.speedOverGround", label: "Current speed", format: (v, node) => formatWithConfiguredUnit(v, node, (n) => `${n.toFixed(2)} meters per second`) } },
    { match: /speed over ground/, spec: { path: "navigation.speedOverGround", label: "Speed over ground", format: (v, node) => formatWithConfiguredUnit(v, node, (n) => `${n.toFixed(2)} meters per second`) } },
    { match: /speed through the water|speed through water/, spec: { path: "navigation.speedThroughWater", label: "Speed through the water", format: (v, node) => formatWithConfiguredUnit(v, node, (n) => `${n.toFixed(2)} meters per second`) } },
  ];
  for (const item of specs) {
    if (item.match.test(normalized)) {
      return item.spec;
    }
  }
  return null;
};

const looksLikeStatusReportIntent = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    /status report|boat status|vessel status|full status|systems status|status update|current status/.test(normalized) ||
    /give me (a |an )?(status|update)/.test(normalized) ||
    /quick update/.test(normalized) ||
    /how are we looking/.test(normalized) ||
    /overview/.test(normalized)
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isActiveAlertState = (state: string): boolean =>
  ["alarm", "emergency", "warn", "warning", "alert", "critical"].includes(state);

const collectActiveNotificationAlerts = (payload: Record<string, unknown>): StatusAlert[] => {
  const notifications = payload.notifications;
  if (!isRecord(notifications)) {
    return [];
  }

  const alerts: StatusAlert[] = [];
  const walk = (node: unknown, pathParts: string[]): void => {
    if (!isRecord(node)) {
      return;
    }

    const source = typeof node.$source === "string" ? node.$source : "";
    const valueNode = isRecord(node.value) ? node.value : null;
    const stateCandidate = valueNode && typeof valueNode.state === "string" ? valueNode.state : typeof node.state === "string" ? node.state : "";
    const messageCandidate = valueNode && typeof valueNode.message === "string" ? valueNode.message : typeof node.message === "string" ? node.message : "";
    const state = stateCandidate.trim().toLowerCase();
    const message = messageCandidate.trim();
    if (source === "self.notificationhandler" && isActiveAlertState(state) && message) {
      alerts.push({
        path: pathParts.join("."),
        message,
      });
    }

    for (const [key, child] of Object.entries(node)) {
      if (key === "meta" || key === "value" || key.startsWith("$")) {
        continue;
      }
      walk(child, [...pathParts, key]);
    }
  };

  walk(notifications, []);
  return alerts;
};

const formatAlertsLine = (alerts: StatusAlert[], variant: number): string => {
  if (alerts.length === 0) {
    const options = [
      "No active alerts from the notification handler right now.",
      "Good news, there are no active alerts in the notification handler.",
      "At the moment, there are no active notification-handler alerts.",
      "No active warnings are currently showing in the notification handler.",
    ];
    return options[variant % options.length];
  }
  if (alerts.length === 1) {
    const options = [
      `I can see we have an alert which says "${alerts[0].message}".`,
      `I can see we have an active alert which says "${alerts[0].message}".`,
      `I can see an active warning which says "${alerts[0].message}".`,
      `I can see one alert at the moment, and it says "${alerts[0].message}".`,
    ];
    return options[variant % options.length];
  }
  const options = [
    `I can see we have ${alerts.length} active alerts. The latest says "${alerts[0].message}".`,
    `I can see ${alerts.length} active alerts, with the latest saying "${alerts[0].message}".`,
    `I can see ${alerts.length} active warnings right now, and the latest says "${alerts[0].message}".`,
    `I can see ${alerts.length} active alerts at the moment, with the most recent saying "${alerts[0].message}".`,
  ];
  return options[variant % options.length];
};

const formatAnchorLine = (payload: Record<string, unknown>, variant: number): string => {
  const anchorPosition = getByPath(payload, "navigation.anchor.position");
  const anchorRadius = asFiniteNumber(getByPath(payload, "navigation.anchor.maxRadius"));
  const anchorNotificationState = readNotificationAnchorState(payload);
  const anchorOn =
    (isRecord(anchorPosition) &&
      asFiniteNumber(anchorPosition.latitude) !== null &&
      asFiniteNumber(anchorPosition.longitude) !== null) ||
    anchorRadius !== null ||
    (anchorNotificationState !== null && anchorNotificationState !== "normal");

  if (!anchorOn) {
    const options = [
      "Anchor alarm is currently off.",
      "The anchor alarm is off at the moment.",
      "Anchor alarm status is off right now.",
      "At present, the anchor alarm is switched off.",
    ];
    return options[variant % options.length];
  }
  if (anchorRadius !== null) {
    const radius = `${anchorRadius.toFixed(1)} meters`;
    const options = [
      `Anchor alarm is on with a swing radius of ${radius}.`,
      `The anchor alarm is active, with a swing radius set to ${radius}.`,
      `Anchor watch is on, and the swing radius is ${radius}.`,
      `The anchor alarm is enabled, currently at a ${radius} swing radius.`,
    ];
    return options[variant % options.length];
  }
  const options = [
    "Anchor alarm is currently on.",
    "The anchor alarm is on at the moment.",
    "Anchor alarm status is on right now.",
    "At present, the anchor alarm is switched on.",
  ];
  return options[variant % options.length];
};

const readNotificationAnchorState = (payload: Record<string, unknown>): string | null => {
  const notification = getByPath(payload, "notifications.navigation.anchor");
  if (!isRecord(notification)) {
    return null;
  }
  const valueNode = isRecord(notification.value) ? notification.value : null;
  const state = valueNode && typeof valueNode.state === "string" ? valueNode.state : typeof notification.state === "string" ? notification.state : null;
  return state ? state.trim().toLowerCase() : null;
};

const formatMetersPerSecond = (value: unknown, decimals: number): string | null => {
  const n = asFiniteNumber(value);
  return n === null ? null : `${n.toFixed(decimals)} meters per second`;
};

const formatRatioPercent = (value: unknown, decimals: number): string | null => {
  const n = asFiniteNumber(value);
  return n === null ? null : `${(n * 100).toFixed(decimals)} percent`;
};

const formatMeters = (value: unknown, decimals: number): string | null => {
  const n = asFiniteNumber(value);
  return n === null ? null : `${n.toFixed(decimals)} meters`;
};

const formatWindLine = (wind: string | null, variant: number): string => {
  if (!wind) {
    const options = [
      "I cannot read apparent wind speed right now.",
      "I’m unable to read apparent wind speed at the moment.",
      "Apparent wind speed is currently unavailable.",
      "I can’t retrieve apparent wind speed right now.",
    ];
    return options[variant % options.length];
  }
  const options = [
    `Apparent wind is around ${wind}.`,
    `Current apparent wind speed is about ${wind}.`,
    `I’m reading apparent wind at roughly ${wind}.`,
    `Apparent wind speed is currently near ${wind}.`,
  ];
  return options[variant % options.length];
};

const formatBatteryLine = (leisureSoc: string | null, starterSoc: string | null, variant: number): string => {
  const leisure = leisureSoc ? `the leisure battery at ${leisureSoc}` : "the leisure battery unavailable";
  const starter = starterSoc ? `the starter battery at ${starterSoc}` : "the starter battery unavailable";
  const options = [
    `For the battery charge, I’m seeing ${leisure} and ${starter}.`,
    `Battery state of charge is ${leisure} and ${starter}.`,
    `For battery state of charge, I’m reading ${leisure}, with ${starter}.`,
    `Battery levels show ${leisure} and ${starter}.`,
  ];
  return options[variant % options.length];
};

const formatDepthLine = (depth: string | null, variant: number): string => {
  if (!depth) {
    const options = [
      "I cannot read current depth right now.",
      "Current depth is unavailable at the moment.",
      "I’m unable to retrieve depth right now.",
      "I can’t get a current depth reading right now.",
    ];
    return options[variant % options.length];
  }
  const options = [
    `Current depth is ${depth}.`,
    `Depth right now is ${depth}.`,
    `I’m reading a current depth of ${depth}.`,
    `Present depth is ${depth}.`,
  ];
  return options[variant % options.length];
};

const humanizeOperationalError = (error: unknown): string => {
  const detail = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (detail.includes("timed out")) {
    return "I'm unable to do that right now. Please try again in a moment.";
  }
  if (detail.includes("unavailable") || detail.includes("failed")) {
    return "I'm unable to do that right now. Please try again shortly.";
  }
  return "I'm unable to do that right now.";
};

const shouldPreserveOriginalTelemetryPhrase = (original: string, mapped: string): boolean => {
  const o = original.toLowerCase();
  const m = mapped.toLowerCase();

  const originalHasLeisure = /leisure battery|house battery/.test(o);
  const originalHasStarter = /starter battery/.test(o);
  const mappedHasLeisure = /leisure battery|house battery/.test(m);
  const mappedHasStarter = /starter battery/.test(m);
  if ((originalHasLeisure && !mappedHasLeisure) || (originalHasStarter && !mappedHasStarter)) {
    return true;
  }

  const originalSoc = /state of charge|\bsoc\b/.test(o);
  const mappedSoc = /state of charge|\bsoc\b/.test(m);
  if (originalSoc && !mappedSoc) {
    return true;
  }

  const originalCurrent = /\bcurrent\b/.test(o);
  const mappedCurrent = /\bcurrent\b/.test(m);
  if (originalCurrent && !mappedCurrent) {
    return true;
  }

  const originalVoltage = /\bvoltage\b/.test(o);
  const mappedVoltage = /\bvoltage\b/.test(m);
  if (originalVoltage && !mappedVoltage) {
    return true;
  }

  return false;
};

const normalizeKnownCommandAlias = (transcript: string): string | null => {
  const normalized = transcript.toLowerCase().replace(/['.?!]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const relayMatch = normalized.match(/^relay\s+([1-6])$/);
  if (relayMatch) {
    return `turn relay ${relayMatch[1]} on`;
  }
  if (normalized === "current speed") {
    return "what is our current speed";
  }
  if (normalized === "wind speed") {
    return "what is our current wind speed";
  }
  if (normalized === "battery voltage") {
    return "what is our current battery voltage";
  }
  if (normalized === "starter battery") {
    return "tell me the state of charge of the starter battery";
  }
  if (normalized === "cabin temperature") {
    return "what is the cabin temperature";
  }
  if (normalized === "anchor alarm" || normalized === "anchor watch") {
    return "what is the anchor alarm status";
  }
  if (normalized === "todays date" || normalized === "today s date" || normalized === "today date") {
    return "tell me todays date";
  }

  return null;
};

const looksLikeAnchorAlarmStatusIntent = (text: string): boolean => {
  const normalized = text.toLowerCase().replace(/[.?!]/g, " ").replace(/\s+/g, " ").trim();
  if (!(normalized.includes("anchor alarm") || normalized.includes("anchor watch"))) {
    return false;
  }
  return !isAnchorAlarmOnCommand(normalized) && !isAnchorAlarmOffCommand(normalized) && !isAnchorAlarmSetRadiusCommand(normalized);
};
