import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import Busboy from "busboy";
import { Logger } from "../logger";
import { ChatService } from "../services/chatService";
import type { RelayCommand } from "../services/chatService";
import type { AppConfig } from "../types";
import type { VoiceRunResult } from "../controller";
import { ConversationStore } from "../services/conversationStore";
import type { ConversationMessage } from "../services/conversationStore";
import { VesselContextStore } from "../services/vesselContextStore";

interface UploadResult {
  fileName: string;
  fullPath: string;
}

interface VoiceApi {
  runOnce: (options?: { history?: ConversationMessage[] }) => Promise<VoiceRunResult>;
  executeRelay: (command: RelayCommand) => Promise<{ statusLine: string }>;
  getStatus?: () => Promise<{ state: string; message: string; busy: boolean }>;
}

type RelayApiResult =
  | { kind: "none" }
  | { kind: "planned"; summary: string; command: RelayCommand }
  | { kind: "executed"; summary: string; statusLine: string };

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

    return { action: "set", channel: 1, state };
  }

  return null;
};

const inferRelayCommandFromHistory = (text: string, history: ConversationMessage[]): RelayCommand | null => {
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

const summarizeRelayCommand = (command: RelayCommand): string => {
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

export const sanitizeUploadFileName = (value: string): string => {
  const base = value.split(/[\\/]/).pop() ?? "upload.pdf";
  const normalized = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  const trimmed = normalized.replace(/^-+/, "").slice(0, 120);
  if (!trimmed.toLowerCase().endsWith(".pdf")) {
    return `${trimmed || "upload"}.pdf`;
  }

  return trimmed || "upload.pdf";
};

const renderPage = (config: AppConfig): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SV Krishna Chat</title>
  <style>
    :root {
      --bg: #f4efe4;
      --panel: rgba(255,255,255,0.76);
      --ink: #162128;
      --muted: #5b6c72;
      --line: rgba(22,33,40,0.12);
      --accent: #0e6b73;
      --accent-strong: #09464d;
      --warm: #d9b36c;
      --error: #9c2f2f;
      --shadow: 0 22px 50px rgba(13, 42, 50, 0.12);
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(217,179,108,0.35), transparent 32%),
        radial-gradient(circle at bottom right, rgba(14,107,115,0.20), transparent 28%),
        linear-gradient(135deg, #f7f2e9 0%, #ebe5d8 100%);
      min-height: 100vh;
    }
    .shell {
      width: min(1180px, calc(100vw - 32px));
      margin: 24px auto;
      display: grid;
      grid-template-columns: 330px minmax(0, 1fr);
      gap: 18px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }
    .sidebar {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .eyebrow {
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.18em;
    }
    h1 {
      margin: 8px 0 0;
      font-family: "IBM Plex Serif", Georgia, serif;
      font-size: 32px;
      line-height: 1;
    }
    .subtle, .meta, .doc-list li {
      color: var(--muted);
    }
    .upload-form {
      border: 1px dashed rgba(14,107,115,0.3);
      border-radius: 18px;
      padding: 16px;
      background: rgba(255,255,255,0.56);
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    input[type="file"] {
      width: 100%;
      margin-bottom: 12px;
    }
    button, textarea {
      font: inherit;
    }
    button {
      border: 0;
      border-radius: 14px;
      padding: 11px 14px;
      background: var(--accent);
      color: white;
      font-weight: 700;
      cursor: pointer;
    }
    button.secondary {
      background: white;
      color: var(--accent-strong);
      border: 1px solid rgba(14,107,115,0.22);
    }
    button:disabled {
      opacity: 0.6;
      cursor: wait;
    }
    .status {
      font-size: 13px;
      min-height: 18px;
    }
    .status.error { color: var(--error); }
    .status.ok { color: var(--accent-strong); }
    .doc-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 320px;
      overflow: auto;
    }
    .doc-list li {
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(255,255,255,0.58);
      border: 1px solid rgba(22,33,40,0.08);
      font-size: 14px;
    }
    .chat {
      min-height: calc(100vh - 48px);
      display: grid;
      grid-template-rows: auto 1fr;
    }
    .chat-header {
      padding: 22px 24px 16px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .chat-header strong {
      display: block;
      font-size: 17px;
    }
    .chat-header span {
      color: var(--muted);
      font-size: 13px;
    }
    .tab-row {
      display: inline-flex;
      gap: 8px;
      background: rgba(255,255,255,0.72);
      border-radius: 12px;
      padding: 4px;
      border: 1px solid rgba(22,33,40,0.1);
    }
    .tab-button {
      border: 0;
      border-radius: 9px;
      padding: 8px 12px;
      background: transparent;
      color: var(--accent-strong);
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .tab-button.active {
      background: var(--accent);
      color: white;
    }
    .messages {
      padding: 24px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .bubble {
      max-width: 80%;
      padding: 14px 16px;
      border-radius: 18px;
      white-space: pre-wrap;
      line-height: 1.5;
      box-shadow: 0 10px 24px rgba(14,107,115,0.07);
    }
    .bubble.user {
      align-self: flex-end;
      background: linear-gradient(135deg, #0e6b73, #0b4d53);
      color: white;
      border-bottom-right-radius: 6px;
    }
    .bubble.assistant {
      align-self: flex-start;
      background: rgba(255,255,255,0.84);
      border: 1px solid rgba(22,33,40,0.08);
      border-bottom-left-radius: 6px;
    }
    .sources {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(22,33,40,0.08);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .source {
      font-size: 12px;
      color: var(--muted);
      background: rgba(14,107,115,0.06);
      padding: 9px 10px;
      border-radius: 12px;
    }
    .composer {
      border-top: 1px solid var(--line);
      padding: 18px;
      display: grid;
      gap: 10px;
    }
    .context-panel {
      padding: 18px 22px 22px;
      display: grid;
      gap: 12px;
      align-content: start;
    }
    .context-panel textarea {
      min-height: 420px;
      font-family: "IBM Plex Mono", "SFMono-Regular", Menlo, monospace;
      font-size: 13px;
      line-height: 1.5;
    }
    .context-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    .context-buttons {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    textarea {
      width: 100%;
      min-height: 96px;
      resize: vertical;
      border-radius: 18px;
      border: 1px solid rgba(22,33,40,0.14);
      padding: 14px;
      background: rgba(255,255,255,0.86);
      color: var(--ink);
    }
    .composer-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .hint {
      font-size: 12px;
      color: var(--muted);
    }
    @media (max-width: 900px) {
      .shell {
        grid-template-columns: 1fr;
      }
      .chat {
        min-height: auto;
      }
      .bubble {
        max-width: 100%;
      }
    }
  </style>
</head>
	<body>
	  <div class="shell">
	    <aside class="card sidebar">
	      <div>
        <div class="eyebrow">Offline bridge</div>
        <h1>SV Krishna</h1>
        <p class="subtle">Local Gemma chat with PDF-fed RAG on top of the existing offline Pi stack.</p>
      </div>

	      ${
          config.ragAllowIngest
            ? `<div class="upload-form">
	        <label for="pdf">Upload PDF into the RAG inbox</label>
	        <input id="pdf" name="pdf" type="file" accept="application/pdf" />
	        <button id="uploadButton" type="button">Upload PDF</button>
	        <div id="uploadStatus" class="status"></div>
	      </div>`
            : `<div class="upload-form">
	        <div class="eyebrow">RAG Inbox</div>
	        <p class="meta">This Pi is in read-only mode. Copy prebuilt RAG stores from the build machine.</p>
	      </div>`
        }

      <div>
        <div class="eyebrow">Knowledge base</div>
        <p class="meta">Inbox: ${config.ragSourceDir}</p>
        <ul id="documentList" class="doc-list"></ul>
      </div>
    </aside>

    <main class="card chat">
      <header class="chat-header">
        <div>
          <strong>Chat</strong>
          <span>Model: ${config.ollamaModel} · Web UI on ${config.webUiHost}:${config.webUiPort}</span>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <button id="listenButton" type="button">Listen</button>
          <button id="refreshButton" type="button" class="secondary">Refresh docs</button>
          <button id="clearContextButton" type="button" class="secondary">Clear context</button>
        </div>
      </header>

      <div class="composer" style="border-top:none; border-bottom:1px solid var(--line); padding:10px 18px;">
        <div class="tab-row">
          <button id="chatTabButton" type="button" class="tab-button active">Chat</button>
          <button id="vesselContextTabButton" type="button" class="tab-button">Vessel Context</button>
        </div>
      </div>

      <section id="messages" class="messages">
        <div class="bubble assistant">The web UI is ready. Upload a PDF on the left, then ask a question about it.</div>
      </section>

      <form id="chatForm" class="composer">
        <textarea id="prompt" placeholder="Ask a question about your onboard manuals, checklists, or local notes..."></textarea>
        <div class="composer-row">
          <div id="chatStatus" class="hint">Responses stay local to this Raspberry Pi.</div>
          <button id="sendButton" type="submit">Send</button>
        </div>
      </form>

      <section id="vesselContextPanel" class="context-panel" hidden>
        <div>
          <div class="eyebrow">Vessel Context</div>
          <p class="meta">Add your vessel-specific systems, normal ranges, and preferred SignalK paths (for example current speed and current depth paths).</p>
        </div>
        <textarea id="vesselContextText" placeholder="# My Vessel Systems"></textarea>
        <div class="context-row">
          <div id="vesselContextStatus" class="hint">Context is stored locally on this Pi.</div>
          <div class="context-buttons">
            <button id="reloadVesselContextButton" type="button" class="secondary">Reload</button>
            <button id="saveVesselContextButton" type="button">Save context</button>
          </div>
        </div>
      </section>
    </main>
  </div>

  <script>
    const messages = document.getElementById("messages");
    const chatForm = document.getElementById("chatForm");
    const prompt = document.getElementById("prompt");
    const chatStatus = document.getElementById("chatStatus");
    const chatTabButton = document.getElementById("chatTabButton");
    const vesselContextTabButton = document.getElementById("vesselContextTabButton");
    const vesselContextPanel = document.getElementById("vesselContextPanel");
    const vesselContextText = document.getElementById("vesselContextText");
    const vesselContextStatus = document.getElementById("vesselContextStatus");
    const saveVesselContextButton = document.getElementById("saveVesselContextButton");
    const reloadVesselContextButton = document.getElementById("reloadVesselContextButton");
	    const uploadButton = document.getElementById("uploadButton");
	    const uploadStatus = document.getElementById("uploadStatus");
    const refreshButton = document.getElementById("refreshButton");
    const listenButton = document.getElementById("listenButton");
    const clearContextButton = document.getElementById("clearContextButton");
    const documentList = document.getElementById("documentList");
    const fileInput = document.getElementById("pdf");

    const addMessage = (role, text, sources = []) => {
      const bubble = document.createElement("div");
      bubble.className = "bubble " + role;
      bubble.textContent = text;

      if (role === "assistant" && sources.length > 0) {
        const sourceWrap = document.createElement("div");
        sourceWrap.className = "sources";
        sources.forEach((source) => {
          const item = document.createElement("div");
          item.className = "source";
          const pageLabel = source.pageStart === source.pageEnd
            ? "p. " + source.pageStart
            : "pp. " + source.pageStart + "-" + source.pageEnd;
          item.textContent = source.source + " (" + pageLabel + "): " + source.text;
          sourceWrap.appendChild(item);
        });
        bubble.appendChild(sourceWrap);
      }

      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;
    };

    const setStatus = (element, message, kind = "") => {
      element.textContent = message;
      element.className = kind ? "status " + kind : "hint";
    };

    const addRelayPlannedMessage = (summary, command) => {
      const bubble = document.createElement("div");
      bubble.className = "bubble assistant";

      const text = document.createElement("div");
      text.textContent = "Planned relay action: " + summary;
      bubble.appendChild(text);

      const row = document.createElement("div");
      row.style.marginTop = "10px";
      row.style.display = "flex";
      row.style.gap = "10px";

      const confirmButton = document.createElement("button");
      confirmButton.textContent = "Execute relay";
      confirmButton.type = "button";

      const cancelButton = document.createElement("button");
      cancelButton.textContent = "Cancel";
      cancelButton.type = "button";
      cancelButton.className = "secondary";

      row.appendChild(confirmButton);
      row.appendChild(cancelButton);
      bubble.appendChild(row);
      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;

      cancelButton.addEventListener("click", () => {
        bubble.remove();
      });

      confirmButton.addEventListener("click", async () => {
        confirmButton.disabled = true;
        cancelButton.disabled = true;
        chatStatus.textContent = "Executing relay action...";
        try {
          const response = await fetch("/api/relay/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command, summary }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Relay execute failed");
          addMessage("assistant", "Relay updated. " + payload.statusLine);
          chatStatus.textContent = "Relay updated.";
          bubble.remove();
        } catch (error) {
          addMessage("assistant", "Relay failed: " + error.message);
          chatStatus.textContent = "Relay failed.";
        } finally {
          confirmButton.disabled = false;
          cancelButton.disabled = false;
        }
      });
    };

    const loadDocuments = async () => {
      const response = await fetch("/api/rag/documents");
      const payload = await response.json();
      documentList.innerHTML = "";

      if (!payload.documents.length) {
        const li = document.createElement("li");
        li.textContent = "No PDFs indexed yet.";
        documentList.appendChild(li);
        return;
      }

      payload.documents.forEach((doc) => {
        const li = document.createElement("li");
        li.textContent = doc.fileName + " · " + doc.chunkCount + " chunks";
        documentList.appendChild(li);
      });
    };

    const setActiveTab = (tab) => {
      const isChat = tab === "chat";
      chatTabButton.classList.toggle("active", isChat);
      vesselContextTabButton.classList.toggle("active", !isChat);
      messages.hidden = !isChat;
      chatForm.hidden = !isChat;
      vesselContextPanel.hidden = isChat;
    };

    const loadVesselContext = async () => {
      const response = await fetch("/api/vessel-context");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load vessel context");
      vesselContextText.value = payload.content || "";
      vesselContextStatus.textContent = payload.updatedAt
        ? "Saved " + new Date(payload.updatedAt).toLocaleString()
        : "Loaded default template.";
    };

    chatForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = prompt.value.trim();
      if (!message) return;

      addMessage("user", message);
      prompt.value = "";
      chatStatus.textContent = "Thinking...";

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Chat failed");

        if (payload.relay && payload.relay.kind === "planned") {
          addRelayPlannedMessage(payload.relay.summary, payload.relay.command);
          chatStatus.textContent = "Relay action planned (confirm).";
          return;
        }

        if (payload.relay && payload.relay.kind === "executed") {
          addMessage("assistant", "Relay action executed: " + payload.relay.summary + ". " + payload.relay.statusLine);
          chatStatus.textContent = "Relay updated.";
          return;
        }

        addMessage("assistant", payload.reply || "[empty reply]", payload.sources || []);
        chatStatus.textContent = payload.sources?.length
          ? "Used local PDF context."
          : "No matching PDF context was needed.";
      } catch (error) {
        addMessage("assistant", "Request failed: " + error.message);
        chatStatus.textContent = "Request failed.";
      }
    });

    chatTabButton.addEventListener("click", () => setActiveTab("chat"));
    vesselContextTabButton.addEventListener("click", async () => {
      setActiveTab("context");
      try {
        await loadVesselContext();
      } catch (error) {
        vesselContextStatus.textContent = "Failed to load: " + error.message;
      }
    });

    saveVesselContextButton.addEventListener("click", async () => {
      const content = vesselContextText.value.trim();
      if (!content) {
        vesselContextStatus.textContent = "Context cannot be empty.";
        return;
      }

      saveVesselContextButton.disabled = true;
      vesselContextStatus.textContent = "Saving...";
      try {
        const response = await fetch("/api/vessel-context", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to save vessel context");
        vesselContextStatus.textContent = "Saved " + new Date(payload.updatedAt).toLocaleString();
      } catch (error) {
        vesselContextStatus.textContent = "Save failed: " + error.message;
      } finally {
        saveVesselContextButton.disabled = false;
      }
    });

    reloadVesselContextButton.addEventListener("click", async () => {
      reloadVesselContextButton.disabled = true;
      try {
        await loadVesselContext();
      } catch (error) {
        vesselContextStatus.textContent = "Reload failed: " + error.message;
      } finally {
        reloadVesselContextButton.disabled = false;
      }
    });

    if (uploadButton) uploadButton.addEventListener("click", async () => {
      const file = fileInput.files?.[0];
      if (!file) {
        setStatus(uploadStatus, "Choose a PDF first.", "error");
        return;
      }

      const formData = new FormData();
      formData.append("pdf", file);
      uploadButton.disabled = true;
      setStatus(uploadStatus, "Uploading and rebuilding RAG...", "ok");

      try {
        const response = await fetch("/api/rag/upload", {
          method: "POST",
          body: formData,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Upload failed");
        setStatus(uploadStatus, "Uploaded " + payload.fileName + ".", "ok");
        await loadDocuments();
      } catch (error) {
        setStatus(uploadStatus, error.message, "error");
      } finally {
        uploadButton.disabled = false;
      }
    });

    refreshButton.addEventListener("click", () => {
      loadDocuments().catch((error) => {
        chatStatus.textContent = "Failed to refresh docs: " + error.message;
      });
    });

    listenButton.addEventListener("click", async () => {
      listenButton.disabled = true;
      chatStatus.textContent = "Listening...";
      const poller = setInterval(async () => {
        try {
          const statusResponse = await fetch("/api/voice/status");
          const statusPayload = await statusResponse.json();
          if (statusResponse.ok && statusPayload?.message) {
            chatStatus.textContent = statusPayload.message;
          }
        } catch {
          // ignore polling errors while the voice request is running
        }
      }, 400);
      try {
        const response = await fetch("/api/voice/run", { method: "POST" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Voice request failed");

        if (payload.transcript) {
          addMessage("user", payload.transcript);
        }

        if (payload.relay && payload.relay.kind === "planned") {
          addRelayPlannedMessage(payload.relay.summary, payload.relay.command);
          chatStatus.textContent = "Relay action planned (confirm).";
          return;
        }

        if (payload.relay && payload.relay.kind === "executed") {
          addMessage("assistant", "Relay action executed: " + payload.relay.summary + ". " + payload.relay.statusLine);
          chatStatus.textContent = "Relay updated.";
          return;
        }

        if (payload.reply) {
          addMessage("assistant", payload.reply);
          chatStatus.textContent = "Done.";
          return;
        }

        addMessage("assistant", "No transcript/reply produced.");
        chatStatus.textContent = "Done.";
      } catch (error) {
        addMessage("assistant", "Voice failed: " + error.message);
        chatStatus.textContent = "Voice failed.";
      } finally {
        clearInterval(poller);
        listenButton.disabled = false;
      }
    });

    clearContextButton.addEventListener("click", async () => {
      clearContextButton.disabled = true;
      chatStatus.textContent = "Clearing context...";
      try {
        const response = await fetch("/api/session/clear", { method: "POST" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Clear context failed");
        messages.innerHTML = "";
        addMessage("assistant", "Context cleared.");
        chatStatus.textContent = "Context cleared.";
      } catch (error) {
        chatStatus.textContent = "Clear context failed: " + error.message;
      } finally {
        clearContextButton.disabled = false;
      }
    });

    loadDocuments().catch((error) => {
      chatStatus.textContent = "Failed to load docs: " + error.message;
    });
    loadVesselContext().catch((error) => {
      vesselContextStatus.textContent = "Failed to load: " + error.message;
    });
  </script>
</body>
</html>`;

export class WebServer {
  private readonly logger: Logger;
  private readonly chat: ChatService;
  private readonly vesselContext: VesselContextStore;
  private readonly conversations = new ConversationStore({ maxMessages: 24, maxChars: 12000 });
  private server: Server | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly apis?: {
      voice?: VoiceApi;
    },
  ) {
    this.logger = new Logger(config.logLevel);
    this.chat = new ChatService(config);
    this.vesselContext = new VesselContextStore(config.vesselContextPath);
  }

  async start(): Promise<void> {
    if (!this.config.enableWebUi || this.server) {
      return;
    }

    await mkdir(this.config.ragSourceDir, { recursive: true });
    await this.vesselContext.get();
    await this.chat.ensureKnowledgeReady();

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

    this.logger.info(
      `Web UI listening at http://${this.config.webUiHost}:${this.config.webUiPort}`,
    );
  }

  async stop(): Promise<void> {
    await this.chat.shutdown();

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

    if (method === "GET" && url.pathname === "/api/rag/documents") {
      json(response, 200, { documents: await this.listDocuments() });
      return;
    }

    if (method === "POST" && url.pathname === "/api/chat") {
      const payload = await readJsonBody<{ message?: string }>(request);
      const message = payload.message?.trim();
      if (!message) {
        json(response, 400, { error: "message is required" });
        return;
      }

      const history = this.conversations.get(sessionId).messages;

      const api = this.apis?.voice;
      if (api && this.config.relayControlEnabled && looksLikeRelayIntentWithHistory(message, history)) {
        const inferred = inferRelayCommandFromHistory(message, history);
        const command = inferred ?? (await this.chat.planRelayCommandWithHistory(message, history));
        if (command.action !== "none") {
          const summary = summarizeRelayCommand(command);
          this.conversations.append(sessionId, "user", message);

          const executed = await api.executeRelay(command);
          this.conversations.append(sessionId, "assistant", summary);
          const relay: RelayApiResult = { kind: "executed", summary, statusLine: executed.statusLine };
          json(response, 200, { reply: summary, sources: [], relay });
          return;
        }
      }

      const result = await this.chat.ask(message, history);
      this.conversations.append(sessionId, "user", message);
      if (result.reply) {
        this.conversations.append(sessionId, "assistant", result.reply);
      }
      json(response, 200, { ...result, relay: { kind: "none" } as RelayApiResult });
      return;
    }

    if (method === "GET" && url.pathname === "/api/vessel-context") {
      const document = await this.vesselContext.get();
      json(response, 200, document);
      return;
    }

    if (method === "PUT" && url.pathname === "/api/vessel-context") {
      const payload = await readJsonBody<{ content?: string }>(request);
      const content = payload.content?.trim();
      if (!content) {
        json(response, 400, { error: "content is required" });
        return;
      }

      if (content.length > 100_000) {
        json(response, 400, { error: "content too large" });
        return;
      }

      await this.vesselContext.save(payload.content ?? "");
      json(response, 200, { ok: true, updatedAt: new Date().toISOString() });
      return;
    }

    if (method === "POST" && url.pathname === "/api/rag/upload") {
      if (!this.config.ragAllowIngest) {
        json(response, 403, { error: "RAG ingestion is disabled on this device." });
        return;
      }
      const upload = await this.handleUpload(request);
      await this.chat.rebuildKnowledge();
      json(response, 201, { fileName: upload.fileName });
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

      if (result.relay.kind === "executed") {
        this.conversations.append(
          sessionId,
          "assistant",
          result.relay.summary,
        );
      } else if (result.reply) {
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

    if (method === "POST" && url.pathname === "/api/relay/execute") {
      const api = this.apis?.voice;
      if (!api) {
        json(response, 501, { error: "relay api not configured" });
        return;
      }

      const payload = await readJsonBody<{ command?: RelayCommand; summary?: string }>(request);
      if (!payload.command) {
        json(response, 400, { error: "command is required" });
        return;
      }

      const result = await api.executeRelay(payload.command);
      const summary = payload.summary?.trim();
      this.conversations.append(
        sessionId,
        "assistant",
        summary ? `Relay updated: ${summary}. ${result.statusLine}` : `Relay updated. ${result.statusLine}`,
      );
      json(response, 200, result);
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

  private async handleUpload(request: IncomingMessage): Promise<UploadResult> {
    const contentType = request.headers["content-type"] ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new Error("expected multipart/form-data upload");
    }

    await mkdir(this.config.ragSourceDir, { recursive: true });

    return await new Promise<UploadResult>((resolvePromise, rejectPromise) => {
      const busboy = Busboy({ headers: request.headers });
      let foundPdf = false;
      let uploadResult: UploadResult | null = null;
      const pendingWrites: Array<Promise<void>> = [];

      busboy.on("file", (fieldName, file, info) => {
        if (fieldName !== "pdf") {
          file.resume();
          return;
        }

        if (
          info.mimeType !== "application/pdf" &&
          !(info.filename || "").toLowerCase().endsWith(".pdf")
        ) {
          file.resume();
          rejectPromise(new Error("only PDF uploads are supported"));
          return;
        }

        foundPdf = true;
        const fileName = sanitizeUploadFileName(info.filename || "upload.pdf");
        const fullPath = join(this.config.ragSourceDir, fileName);
        const output = createWriteStream(fullPath);
        uploadResult = { fileName, fullPath };

        file.pipe(output);
        pendingWrites.push(
          new Promise<void>((resolveWrite, rejectWrite) => {
            output.on("close", resolveWrite);
            output.on("error", rejectWrite);
            file.on("error", rejectWrite);
          }),
        );

        file.on("error", rejectPromise);
      });

      busboy.on("finish", async () => {
        if (!foundPdf || !uploadResult) {
          rejectPromise(new Error("no pdf file was provided"));
          return;
        }

        try {
          await Promise.all(pendingWrites);
          resolvePromise(uploadResult);
        } catch (error) {
          rejectPromise(error);
        }
      });

      busboy.on("error", async (error) => {
        rejectPromise(error);
      });

      request.pipe(busboy);
    }).catch(async (error) => {
      const detail = error instanceof Error ? error.message : String(error);
      const entries = await readdir(this.config.ragSourceDir).catch(() => []);
      await Promise.all(
        entries
          .filter((entry) => entry.startsWith("upload") && entry.endsWith(".pdf"))
          .map((entry) => rm(join(this.config.ragSourceDir, entry), { force: true })),
      );
      throw new Error(detail);
    });
  }

  private async listDocuments(): Promise<Array<{ fileName: string; chunkCount: number }>> {
    await this.chat.ensureKnowledgeReady();

    try {
      const raw = await readFile(this.config.ragStorePath, "utf8");
      const parsed = JSON.parse(raw) as {
        documents?: Array<{ fileName?: string; chunkIds?: string[] }>;
      };

      return (parsed.documents ?? []).map((doc) => ({
        fileName: doc.fileName ?? "unknown.pdf",
        chunkCount: doc.chunkIds?.length ?? 0,
      }));
    } catch {
      return [];
    }
  }
}
