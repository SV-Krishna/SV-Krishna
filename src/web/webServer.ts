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

interface UploadResult {
  fileName: string;
  fullPath: string;
}

interface VoiceApi {
  runOnce: () => Promise<VoiceRunResult>;
  executeRelay: (command: RelayCommand) => Promise<{ statusLine: string }>;
}

const json = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
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
      grid-template-rows: auto 1fr auto;
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

      <div class="upload-form">
        <label for="pdf">Upload PDF into the RAG inbox</label>
        <input id="pdf" name="pdf" type="file" accept="application/pdf" />
        <button id="uploadButton" type="button">Upload PDF</button>
        <div id="uploadStatus" class="status"></div>
      </div>

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
        </div>
      </header>

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
    </main>
  </div>

  <script>
    const messages = document.getElementById("messages");
    const chatForm = document.getElementById("chatForm");
    const prompt = document.getElementById("prompt");
    const chatStatus = document.getElementById("chatStatus");
    const uploadButton = document.getElementById("uploadButton");
    const uploadStatus = document.getElementById("uploadStatus");
    const refreshButton = document.getElementById("refreshButton");
    const listenButton = document.getElementById("listenButton");
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
            body: JSON.stringify({ command }),
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
        addMessage("assistant", payload.reply || "[empty reply]", payload.sources || []);
        chatStatus.textContent = payload.sources?.length
          ? "Used local PDF context."
          : "No matching PDF context was needed.";
      } catch (error) {
        addMessage("assistant", "Request failed: " + error.message);
        chatStatus.textContent = "Request failed.";
      }
    });

    uploadButton.addEventListener("click", async () => {
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
        listenButton.disabled = false;
      }
    });

    loadDocuments().catch((error) => {
      chatStatus.textContent = "Failed to load docs: " + error.message;
    });
  </script>
</body>
</html>`;

export class WebServer {
  private readonly logger: Logger;
  private readonly chat: ChatService;
  private server: Server | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly apis?: {
      voice?: VoiceApi;
    },
  ) {
    this.logger = new Logger(config.logLevel);
    this.chat = new ChatService(config);
  }

  async start(): Promise<void> {
    if (!this.config.enableWebUi || this.server) {
      return;
    }

    await mkdir(this.config.ragSourceDir, { recursive: true });
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

      const result = await this.chat.ask(message);
      json(response, 200, result);
      return;
    }

    if (method === "POST" && url.pathname === "/api/rag/upload") {
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

      const result = await api.runOnce();
      json(response, 200, result);
      return;
    }

    if (method === "POST" && url.pathname === "/api/relay/execute") {
      const api = this.apis?.voice;
      if (!api) {
        json(response, 501, { error: "relay api not configured" });
        return;
      }

      const payload = await readJsonBody<{ command?: RelayCommand }>(request);
      if (!payload.command) {
        json(response, 400, { error: "command is required" });
        return;
      }

      const result = await api.executeRelay(payload.command);
      json(response, 200, result);
      return;
    }

    json(response, 404, { error: "not found" });
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
