import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Logger } from "../logger";
import type { VoiceRunResult } from "../controller";
import { ConversationStore } from "../services/conversationStore";
import type { ConversationMessage } from "../services/conversationStore";
import type { AppConfig } from "../types";
import type { SignalKAlertMonitorSettings } from "../services/signalkAlertMonitorStore";

interface VoiceApi {
  runOnce: (options?: { history?: ConversationMessage[] }) => Promise<VoiceRunResult>;
  runTextCommand: (text: string, history?: ConversationMessage[]) => Promise<VoiceRunResult>;
  getWakeWordSettings?: () => Promise<{
    enabled: boolean;
    phrase: string;
    updatedAt: string | null;
    running?: boolean;
    lastError?: string | null;
  }>;
  setWakeWordEnabled?: (enabled: boolean) => Promise<{
    enabled: boolean;
    phrase: string;
    updatedAt: string | null;
    running?: boolean;
    lastError?: string | null;
  }>;
  getSignalKAlertMonitorSettings?: () => Promise<SignalKAlertMonitorSettings>;
  setSignalKAlertMonitorEnabled?: (enabled: boolean) => Promise<SignalKAlertMonitorSettings>;
  getStatus?: () => Promise<{
    state: string;
    message: string;
    busy: boolean;
    transcript?: string | null;
    wakeWordEnabled?: boolean;
    wakeWordPhrase?: string;
    signalkAlertMonitorEnabled?: boolean;
  }>;
}

const json = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
};

const readJsonBody = async <T>(request: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
};

const normalizeHeadingDegrees = (value: number): number => ((value % 360) + 360) % 360;

const readRadians = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const parseSignalKOrientation = (payload: any): {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  headingMagneticDeg: number;
  source: "attitude" | "derived";
} => {
  const unwrap = (node: any): unknown => (node && typeof node === "object" && "value" in node ? node.value : node);

  const attitudeRaw = unwrap(payload?.navigation?.attitude ?? payload?.attitude ?? null) as any;
  const yaw = readRadians(attitudeRaw?.yaw);
  const pitch = readRadians(attitudeRaw?.pitch);
  const roll = readRadians(attitudeRaw?.roll);
  const headingTrue = readRadians(unwrap(payload?.navigation?.headingTrue));
  const headingMagnetic = readRadians(unwrap(payload?.navigation?.headingMagnetic));

  const yawDeg = yaw !== null ? yaw * (180 / Math.PI) : (headingTrue ?? headingMagnetic ?? 0) * (180 / Math.PI);
  const headingMagneticDeg = normalizeHeadingDegrees((headingMagnetic ?? headingTrue ?? 0) * (180 / Math.PI));

  return {
    yawDeg: normalizeHeadingDegrees(yawDeg),
    pitchDeg: (pitch ?? 0) * (180 / Math.PI),
    rollDeg: (roll ?? 0) * (180 / Math.PI),
    headingMagneticDeg,
    source: yaw !== null ? "attitude" : "derived",
  };
};

export const sanitizeUploadFileName = (value: string): string => {
  const base = value.split(/[\\/]/).pop() ?? "upload.pdf";
  const normalized = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  const trimmed = normalized.replace(/^-+/, "").slice(0, 120);
  if (!trimmed.toLowerCase().endsWith(".pdf")) {
    return `${trimmed || "upload"}.pdf`;
  }

  return trimmed || "upload.pdf";
};

export const renderPage = (config: AppConfig): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SV Krishna Voice Control</title>
  <style>
    :root {
      --bg: #f5f1e7;
      --panel: rgba(255, 255, 255, 0.78);
      --ink: #182126;
      --muted: #5d6b70;
      --line: rgba(24, 33, 38, 0.12);
      --accent: #0f6b73;
      --accent-dark: #0b4449;
      --warm: #c8a25e;
      --error: #9b2f33;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(200,162,94,0.28), transparent 30%),
        radial-gradient(circle at bottom right, rgba(15,107,115,0.18), transparent 26%),
        linear-gradient(135deg, #f8f4eb 0%, #ece4d4 100%);
    }
    .shell {
      width: min(1120px, calc(100vw - 32px));
      margin: 24px auto;
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      gap: 18px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: 0 20px 48px rgba(12, 31, 36, 0.12);
      backdrop-filter: blur(10px);
    }
    .sidebar, .main {
      padding: 24px;
    }
    .sidebar {
      display: grid;
      gap: 18px;
      align-content: start;
    }
    .eyebrow {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--accent);
    }
    h1 {
      margin: 8px 0 0;
      font-family: "IBM Plex Serif", Georgia, serif;
      font-size: 34px;
      line-height: 1;
    }
    p, .meta, .status-copy { color: var(--muted); }
    .panel {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px;
      background: rgba(255,255,255,0.58);
    }
    .toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-weight: 700;
    }
    .toggle input {
      width: 18px;
      height: 18px;
      accent-color: var(--accent);
    }
    .stack {
      display: grid;
      gap: 10px;
    }
    .main {
      display: grid;
      gap: 18px;
    }
    .hero {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .hero-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    button, textarea {
      font: inherit;
    }
    button {
      border: 0;
      border-radius: 14px;
      padding: 11px 15px;
      background: var(--accent);
      color: white;
      font-weight: 700;
      cursor: pointer;
    }
    button.secondary {
      background: white;
      color: var(--accent-dark);
      border: 1px solid rgba(15,107,115,0.22);
    }
    button:disabled {
      opacity: 0.6;
      cursor: wait;
    }
    textarea {
      width: 100%;
      min-height: 110px;
      resize: vertical;
      border-radius: 18px;
      border: 1px solid rgba(24, 33, 38, 0.14);
      background: rgba(255,255,255,0.86);
      color: var(--ink);
      padding: 14px;
    }
    .composer {
      display: grid;
      gap: 12px;
    }
    .composer-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .status-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .status-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    .status-value {
      margin-top: 6px;
      font-size: 15px;
      line-height: 1.45;
      white-space: pre-wrap;
    }
    .messages {
      display: grid;
      gap: 12px;
      max-height: 420px;
      overflow: auto;
    }
    .bubble {
      padding: 14px 16px;
      border-radius: 18px;
      white-space: pre-wrap;
      line-height: 1.5;
    }
    .bubble.user {
      background: linear-gradient(135deg, var(--accent), var(--accent-dark));
      color: white;
      justify-self: end;
      max-width: 80%;
    }
    .bubble.assistant {
      background: rgba(255,255,255,0.88);
      border: 1px solid rgba(24, 33, 38, 0.08);
      max-width: 80%;
    }
    .hint, .status {
      font-size: 13px;
      color: var(--muted);
    }
    .status.error { color: var(--error); }
    @media (max-width: 900px) {
      .shell {
        grid-template-columns: 1fr;
      }
      .status-grid {
        grid-template-columns: 1fr;
      }
      .bubble.user, .bubble.assistant {
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="card sidebar">
      <div>
        <div class="eyebrow">Rasa Only Runtime</div>
        <h1>SV Krishna</h1>
        <p>Wake word, Whisper, Rasa, deterministic backend actions, and spoken replies.</p>
      </div>

      <section class="panel stack">
        <div class="eyebrow">Wake Word</div>
        <label class="toggle" for="wakeWordToggle">
          <span>Enable "${config.wakeWordPhrase}"</span>
          <input id="wakeWordToggle" type="checkbox" />
        </label>
        <div id="wakeWordStatus" class="status">Wake word is loading...</div>
      </section>

      <section class="panel stack">
        <div class="eyebrow">Pipeline</div>
        <div class="status-copy">Voice: wake word -> Whisper -> Rasa -> action -> TTS</div>
        <div class="status-copy">Typed: text -> Rasa -> action -> reply</div>
      </section>

      <section class="panel stack">
        <div class="eyebrow">Service Status</div>
        <div id="voiceStatus" class="status">Waiting for controller status...</div>
      </section>
    </aside>

    <main class="card main">
      <section class="hero">
        <div>
          <div class="eyebrow">Command Console</div>
          <p>Use typed commands or run a one-shot voice capture from the browser.</p>
        </div>
        <div class="hero-actions">
          <button id="listenButton" type="button">Run Voice</button>
          <button id="clearButton" type="button" class="secondary">Clear Session</button>
        </div>
      </section>

      <section class="status-grid">
        <div class="panel">
          <div class="status-label">Transcript</div>
          <div id="transcriptValue" class="status-value">Waiting for input.</div>
        </div>
        <div class="panel">
          <div class="status-label">Rasa Intent Route</div>
          <div id="intentValue" class="status-value">No intent parsed yet.</div>
        </div>
        <div class="panel">
          <div class="status-label">Action Result</div>
          <div id="actionValue" class="status-value">No action yet.</div>
        </div>
        <div class="panel">
          <div class="status-label">Spoken Reply</div>
          <div id="replyValue" class="status-value">No reply yet.</div>
        </div>
      </section>

      <section id="messages" class="messages">
        <div class="bubble assistant">The controller is ready for supported Rasa commands.</div>
      </section>

      <form id="commandForm" class="composer">
        <textarea id="prompt" placeholder="Try: what is our current depth, relay status, turn relay 2 off, switch on anchor alarm"></textarea>
        <div class="composer-row">
          <div id="commandStatus" class="hint">Typed requests are routed directly through Rasa.</div>
          <button id="sendButton" type="submit">Send</button>
        </div>
      </form>
    </main>
  </div>

  <script>
    const commandForm = document.getElementById("commandForm");
    const prompt = document.getElementById("prompt");
    const commandStatus = document.getElementById("commandStatus");
    const listenButton = document.getElementById("listenButton");
    const clearButton = document.getElementById("clearButton");
    const messages = document.getElementById("messages");
    const wakeWordToggle = document.getElementById("wakeWordToggle");
    const wakeWordStatus = document.getElementById("wakeWordStatus");
    const voiceStatus = document.getElementById("voiceStatus");
    const transcriptValue = document.getElementById("transcriptValue");
    const intentValue = document.getElementById("intentValue");
    const actionValue = document.getElementById("actionValue");
    const replyValue = document.getElementById("replyValue");

    const addMessage = (role, text) => {
      const bubble = document.createElement("div");
      bubble.className = "bubble " + role;
      bubble.textContent = text;
      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;
    };

    const updateResult = (payload) => {
      transcriptValue.textContent = payload.transcript || "No transcript captured.";
      intentValue.textContent = payload.normalizedTranscript || "No Rasa route produced.";
      actionValue.textContent = payload.relay && payload.relay.kind === "executed"
        ? payload.relay.statusLine
        : payload.reply || "No deterministic action executed.";
      replyValue.textContent = payload.reply || "No spoken reply.";
    };

    const setWakeWordStatus = (payload) => {
      wakeWordToggle.checked = Boolean(payload.enabled);
      const runtime = payload.running === false && payload.lastError
        ? " Disabled: " + payload.lastError
        : payload.running === true
          ? " Detector running."
          : "";
      wakeWordStatus.textContent = (payload.enabled ? "Enabled" : "Disabled") + " for " + payload.phrase + "." + runtime;
    };

    const refreshWakeWord = async () => {
      const response = await fetch("/api/wake-word");
      const payload = await response.json();
      setWakeWordStatus(payload);
    };

    const refreshStatus = async () => {
      const response = await fetch("/api/voice/status");
      const payload = await response.json();
      voiceStatus.textContent = payload.message || payload.state || "Unknown";
    };

    commandForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = prompt.value.trim();
      if (!message) {
        commandStatus.textContent = "Enter a command first.";
        return;
      }

      addMessage("user", message);
      commandStatus.textContent = "Sending to Rasa...";

      try {
        const response = await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Command failed");
        addMessage("assistant", payload.reply || "No reply.");
        updateResult(payload);
        commandStatus.textContent = "Done.";
        prompt.value = "";
      } catch (error) {
        commandStatus.textContent = "Request failed: " + error.message;
      }
    });

    listenButton.addEventListener("click", async () => {
      commandStatus.textContent = "Recording and routing through Whisper + Rasa...";
      listenButton.disabled = true;
      try {
        const response = await fetch("/api/voice/run", { method: "POST" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Voice run failed");
        if (payload.transcript) addMessage("user", payload.transcript);
        if (payload.reply) addMessage("assistant", payload.reply);
        updateResult(payload);
        commandStatus.textContent = "Voice run complete.";
      } catch (error) {
        commandStatus.textContent = "Voice failed: " + error.message;
      } finally {
        listenButton.disabled = false;
      }
    });

    clearButton.addEventListener("click", async () => {
      await fetch("/api/session/clear", { method: "POST" });
      messages.innerHTML = '<div class="bubble assistant">The controller is ready for supported Rasa commands.</div>';
      transcriptValue.textContent = "Waiting for input.";
      intentValue.textContent = "No intent parsed yet.";
      actionValue.textContent = "No action yet.";
      replyValue.textContent = "No reply yet.";
      commandStatus.textContent = "Session cleared.";
    });

    wakeWordToggle.addEventListener("change", async () => {
      wakeWordStatus.textContent = "Updating wake word...";
      const response = await fetch("/api/wake-word", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: wakeWordToggle.checked }),
      });
      const payload = await response.json();
      if (!response.ok) {
        wakeWordStatus.textContent = payload.error || "Wake word update failed.";
        return;
      }
      setWakeWordStatus(payload);
    });

    refreshWakeWord().catch((error) => {
      wakeWordStatus.textContent = "Failed to load wake word: " + error.message;
    });
    refreshStatus().catch((error) => {
      voiceStatus.textContent = "Failed to load status: " + error.message;
    });
    setInterval(() => {
      refreshStatus().catch(() => {});
    }, 2000);
  </script>
</body>
</html>`;

const renderKrishnaPage = (): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SV Krishna Orientation</title>
</head>
<body style="font-family: sans-serif; padding: 24px;">
  <h1>SV Krishna Orientation</h1>
  <p>Orientation data is available at <code>/api/krishna/orientation</code>.</p>
</body>
</html>`;

export class WebServer {
  private readonly logger: Logger;
  private readonly conversations = new ConversationStore({ maxMessages: 24, maxChars: 12000 });
  private server: Server | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly apis?: {
      voice?: VoiceApi;
    },
  ) {
    this.logger = new Logger(config.logLevel);
  }

  async start(): Promise<void> {
    if (!this.config.enableWebUi || this.server) {
      return;
    }

    this.server = createServer(async (request, response) => {
      try {
        await this.route(request, response);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.error(`Web UI request failed: ${detail}`);
        json(response, 500, { error: detail });
      }
    });

    await new Promise<void>((resolvePromise, rejectPromise) => {
      this.server?.once("error", rejectPromise);
      this.server?.listen(this.config.webUiPort, this.config.webUiHost, () => {
        this.server?.off("error", rejectPromise);
        resolvePromise();
      });
    });

    this.logger.info(`Web UI listening at http://${this.config.webUiHost}:${this.config.webUiPort}`);
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    const activeServer = this.server;
    this.server = null;
    await new Promise<void>((resolvePromise, rejectPromise) => {
      activeServer.close((error) => {
        if (error) {
          rejectPromise(error);
          return;
        }
        resolvePromise();
      });
    });
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const sessionId = this.getOrCreateSessionId(request, response);

    if (method === "GET" && url.pathname === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(renderPage(this.config));
      return;
    }

    if (method === "GET" && url.pathname === "/krishna") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(renderKrishnaPage());
      return;
    }

    if (method === "GET" && url.pathname === "/api/krishna/orientation") {
      const vesselEndpoint = `${this.config.signalKUrl.replace(/\/$/, "")}/signalk/v1/api/vessels/self`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (this.config.signalKToken) {
        headers.Authorization = `Bearer ${this.config.signalKToken}`;
      }

      try {
        const upstream = await fetch(vesselEndpoint, { headers });
        if (!upstream.ok) {
          json(response, 502, { error: `SignalK returned ${upstream.status}`, endpoint: vesselEndpoint });
          return;
        }
        const raw = await upstream.json();
        const parsed = parseSignalKOrientation(raw);
        json(response, 200, { ...parsed, endpoint: vesselEndpoint, timestamp: new Date().toISOString() });
      } catch (error) {
        json(response, 502, {
          error: error instanceof Error ? error.message : String(error),
          endpoint: vesselEndpoint,
        });
      }
      return;
    }

    if (method === "POST" && url.pathname === "/api/command") {
      const payload = await readJsonBody<{ message?: string }>(request);
      const message = payload.message?.trim();
      if (!message) {
        json(response, 400, { error: "message is required" });
        return;
      }

      const api = this.apis?.voice;
      if (!api) {
        json(response, 501, { error: "command api not configured" });
        return;
      }

      const history = this.conversations.get(sessionId).messages;
      const result = await api.runTextCommand(message, history);
      this.conversations.append(sessionId, "user", message);
      if (result.reply) {
        this.conversations.append(sessionId, "assistant", result.reply);
      }
      json(response, 200, result);
      return;
    }

    if (method === "POST" && url.pathname === "/api/voice/run") {
      const api = this.apis?.voice;
      if (!api) {
        json(response, 501, { error: "voice api not configured" });
        return;
      }

      const history = this.conversations.get(sessionId).messages;
      const result = await api.runOnce({ history });
      if (result.transcript) {
        this.conversations.append(sessionId, "user", result.transcript);
      }
      if (result.reply) {
        this.conversations.append(sessionId, "assistant", result.reply);
      }
      json(response, 200, result);
      return;
    }

    if (method === "GET" && url.pathname === "/api/voice/status") {
      const api = this.apis?.voice;
      if (!api?.getStatus) {
        json(response, 200, { state: "unknown", message: "Working...", busy: false });
        return;
      }
      json(response, 200, await api.getStatus());
      return;
    }

    if (method === "GET" && url.pathname === "/api/wake-word") {
      const settings = await this.apis?.voice?.getWakeWordSettings?.();
      if (!settings) {
        json(response, 200, { enabled: this.config.enableWakeWord, phrase: this.config.wakeWordPhrase, updatedAt: null });
        return;
      }
      json(response, 200, settings);
      return;
    }

    if (method === "PUT" && url.pathname === "/api/wake-word") {
      const payload = await readJsonBody<{ enabled?: boolean }>(request);
      if (typeof payload.enabled !== "boolean") {
        json(response, 400, { error: "enabled must be boolean" });
        return;
      }
      const settings = await this.apis?.voice?.setWakeWordEnabled?.(payload.enabled);
      if (!settings) {
        json(response, 501, { error: "wake word api not configured" });
        return;
      }
      json(response, 200, settings);
      return;
    }

    if (method === "GET" && url.pathname === "/api/signalk-alert-monitor") {
      const settings = await this.apis?.voice?.getSignalKAlertMonitorSettings?.();
      if (!settings) {
        json(response, 200, { enabled: this.config.signalkAlertMonitorEnabled, updatedAt: null, running: false });
        return;
      }
      json(response, 200, settings);
      return;
    }

    if (method === "PUT" && url.pathname === "/api/signalk-alert-monitor") {
      const payload = await readJsonBody<{ enabled?: boolean }>(request);
      if (typeof payload.enabled !== "boolean") {
        json(response, 400, { error: "enabled must be boolean" });
        return;
      }
      const settings = await this.apis?.voice?.setSignalKAlertMonitorEnabled?.(payload.enabled);
      if (!settings) {
        json(response, 501, { error: "signalk alert monitor api not configured" });
        return;
      }
      json(response, 200, settings);
      return;
    }

    if (method === "POST" && url.pathname === "/api/session/clear") {
      this.conversations.clear(sessionId);
      json(response, 200, { ok: true });
      return;
    }

    json(response, 404, { error: "not found" });
  }

  private getOrCreateSessionId(request: IncomingMessage, response: ServerResponse): string {
    const cookieHeader = request.headers.cookie ?? "";
    const sessionCookie = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("svk_session="));

    const existing = sessionCookie ? sessionCookie.split("=").slice(1).join("=") : null;
    const sessionId = this.conversations.ensureSession(existing);
    if (!existing || existing !== sessionId) {
      response.setHeader(
        "Set-Cookie",
        `svk_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`,
      );
    }

    return sessionId;
  }
}
