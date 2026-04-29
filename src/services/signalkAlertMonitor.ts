import type { AppConfig } from "../types";

export interface SpokenSignalKAlert {
  path: string;
  message: string;
}

interface AlertState {
  fingerprint: string;
  lastSpokenAt: number;
}

const ACTIVE_STATES = new Set(["alarm", "emergency", "warn", "warning", "alert", "critical"]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizePath = (path: string): string => path.replace(/^notifications\./, "").trim();

const getNestedValue = (root: unknown, dottedPath: string): unknown => {
  let current: unknown = root;
  for (const part of dottedPath.split(".")) {
    if (!isObject(current)) {
      return null;
    }
    current = current[part];
  }
  return current;
};

const extractAlertMessage = (value: unknown): string | null => {
  if (!isObject(value)) {
    return null;
  }
  if (typeof value.message === "string" && value.message.trim()) {
    return value.message.trim();
  }
  if (isObject(value.value) && typeof value.value.message === "string" && value.value.message.trim()) {
    return value.value.message.trim();
  }
  return null;
};

const extractState = (value: unknown): string => {
  if (!isObject(value)) {
    return "";
  }
  if (typeof value.state === "string") {
    return value.state.trim().toLowerCase();
  }
  if (isObject(value.value) && typeof value.value.state === "string") {
    return value.value.state.trim().toLowerCase();
  }
  return "";
};

export const extractSpokenSignalKAlerts = (
  payload: unknown,
  requestedPaths: string[],
): SpokenSignalKAlert[] => {
  if (!isObject(payload)) {
    return [];
  }
  const notifications = payload.notifications;
  if (!isObject(notifications)) {
    return [];
  }

  const alerts: SpokenSignalKAlert[] = [];
  for (const rawPath of requestedPaths) {
    const path = normalizePath(rawPath);
    if (!path) {
      continue;
    }
    const node = getNestedValue(notifications, path);
    const message = extractAlertMessage(node);
    const state = extractState(node);
    if (!message || !ACTIVE_STATES.has(state)) {
      continue;
    }
    alerts.push({ path, message });
  }

  return alerts;
};

export class SignalKAlertMonitor {
  private timer?: NodeJS.Timeout;
  private readonly seen = new Map<string, AlertState>();

  constructor(
    private readonly config: AppConfig,
    private readonly onAlert: (alert: SpokenSignalKAlert) => Promise<void>,
  ) {}

  start(): void {
    if (!this.config.signalkAlertMonitorEnabled || this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, Math.max(500, this.config.signalkAlertPollMs));
    void this.pollOnce();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async pollOnce(): Promise<void> {
    const headers: Record<string, string> = {};
    if (this.config.signalKToken) {
      headers.Authorization = `Bearer ${this.config.signalKToken}`;
    }

    const base = this.config.signalKUrl.replace(/\/+$/, "");
    const response = await fetch(`${base}/signalk/v1/api/vessels/self`, { headers });
    if (!response.ok) {
      return;
    }

    const body = (await response.json()) as unknown;
    const alerts = extractSpokenSignalKAlerts(body, this.config.signalkAlertPaths);
    if (alerts.length === 0) {
      return;
    }

    const now = Date.now();
    for (const alert of alerts) {
      const fingerprint = `${alert.path}|${alert.message}`;
      const prior = this.seen.get(alert.path);
      const cooldownMs = Math.max(5, this.config.signalkAlertRepeatSeconds) * 1000;
      if (prior && prior.fingerprint === fingerprint && now - prior.lastSpokenAt < cooldownMs) {
        continue;
      }
      this.seen.set(alert.path, { fingerprint, lastSpokenAt: now });
      await this.onAlert(alert);
    }
  }
}
