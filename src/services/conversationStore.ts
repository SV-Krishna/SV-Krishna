import { randomUUID } from "node:crypto";

export type ConversationRole = "user" | "assistant";

export interface ConversationMessage {
  role: ConversationRole;
  content: string;
  createdAt: number;
}

export interface ConversationSnapshot {
  sessionId: string;
  messages: ConversationMessage[];
}

const normalizeText = (value: string): string => value.replace(/\s+/g, " ").trim();

const DEFAULT_OPTIONS = {
  maxMessages: 20,
  maxChars: 9000,
  maxSessions: 50,
  sessionTtlMs: 1000 * 60 * 60 * 24,
} as const;

export class ConversationStore {
  private readonly sessions = new Map<string, { messages: ConversationMessage[]; lastSeen: number }>();
  private readonly options: {
    maxMessages: number;
    maxChars: number;
    maxSessions: number;
    sessionTtlMs: number;
  };

  constructor(options: {
    maxMessages?: number;
    maxChars?: number;
    maxSessions?: number;
    sessionTtlMs?: number;
  } = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  ensureSession(sessionId?: string | null): string {
    this.pruneExpired();
    const trimmed = (sessionId || "").trim();
    if (trimmed.length >= 8 && trimmed.length <= 128) {
      const existing = this.sessions.get(trimmed);
      if (existing) {
        const ttl = Math.max(60_000, this.options.sessionTtlMs);
        if (ttl > 0 && Date.now() - existing.lastSeen > ttl) {
          this.sessions.delete(trimmed);
          return randomUUID();
        }

        existing.lastSeen = Date.now();
      }
      return trimmed;
    }

    return randomUUID();
  }

  get(sessionId: string): ConversationSnapshot {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.lastSeen = Date.now();
      return { sessionId, messages: [...existing.messages] };
    }
    return { sessionId, messages: [] };
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  append(sessionId: string, role: ConversationRole, content: string): void {
    const normalized = normalizeText(content);
    if (!normalized) {
      return;
    }

    this.pruneExpired();

    const next: ConversationMessage = {
      role,
      content: normalized,
      createdAt: Date.now(),
    };

    const existing = this.sessions.get(sessionId);
    const messages = existing?.messages ?? [];
    messages.push(next);
    this.sessions.set(sessionId, { messages: this.trim(messages), lastSeen: Date.now() });
    this.pruneOverflow();
  }

  private trim(messages: ConversationMessage[]): ConversationMessage[] {
    const maxMessages = Math.max(2, this.options.maxMessages);
    const maxChars = Math.max(256, this.options.maxChars);

    let window = messages.slice(-maxMessages);
    while (window.length > 2 && window.reduce((sum, msg) => sum + msg.content.length, 0) > maxChars) {
      window = window.slice(1);
    }

    return window;
  }

  private pruneExpired(): void {
    const ttl = Math.max(60_000, this.options.sessionTtlMs);
    if (!ttl || this.sessions.size === 0) {
      return;
    }

    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastSeen > ttl) {
        this.sessions.delete(sessionId);
      }
    }
  }

  private pruneOverflow(): void {
    const maxSessions = Math.max(5, this.options.maxSessions);
    if (!maxSessions || this.sessions.size <= maxSessions) {
      return;
    }

    const entries = [...this.sessions.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    const excess = entries.length - maxSessions;
    for (let idx = 0; idx < excess; idx += 1) {
      this.sessions.delete(entries[idx][0]);
    }
  }
}
