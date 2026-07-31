import type { AppConfig } from "../types";

export interface SpokenSignalKAlert {
  path: string;
  message: string;
  state: string;
}

interface AlertState {
  lastSpokenAt: number;
  severity: number;
}

interface SnoozedAlertState {
  until: number;
  severity: number;
}

const ACTIVE_STATES = new Set(["alarm", "emergency", "warn", "warning", "alert", "critical"]);
const ALERT_SEVERITY: Record<string, number> = {
  normal: 0,
  alert: 1,
  warn: 2,
  warning: 2,
  alarm: 3,
  critical: 3,
  emergency: 4,
};

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

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (isObject(value) && typeof value.value === "number" && Number.isFinite(value.value)) {
    return value.value;
  }
  return null;
};

const formatDepthAlertMessage = (payload: Record<string, unknown>, path: string, fallback: string): string => {
  if (path !== "environment.depth.belowTransducer") {
    return fallback;
  }
  const depthNode = getNestedValue(payload, path);
  const depthMeters = toNumber(depthNode);
  if (depthMeters === null) {
    return "Warning shallow depth.";
  }
  return `Warning shallow depth. Depth currently ${depthMeters.toFixed(1)} meters.`;
};

const getAlertSeverity = (state: string): number => ALERT_SEVERITY[state] ?? 0;

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
    alerts.push({ path, message: formatDepthAlertMessage(payload, path, message), state });
  }

  return alerts;
};

export class SignalKAlertMonitor {
  private timer?: NodeJS.Timeout;
  private readonly seen = new Map<string, AlertState>();
  private readonly activeAlerts = new Map<string, SpokenSignalKAlert>();
  private readonly snoozed = new Map<string, SnoozedAlertState>();
  private enabled: boolean;

  constructor(
    private readonly config: AppConfig,
    private readonly onAlert: (alert: SpokenSignalKAlert) => Promise<void>,
    enabled = config.signalkAlertMonitorEnabled,
  ) {
    this.enabled = enabled;
  }

  start(): void {
    if (!this.enabled || this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.pollOnce().catch(() => undefined);
    }, Math.max(500, this.config.signalkAlertPollMs));
    void this.pollOnce().catch(() => undefined);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.start();
      return;
    }
    this.stop();
    this.seen.clear();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isRunning(): boolean {
    return Boolean(this.timer);
  }

  snoozeActiveAlerts(): SpokenSignalKAlert[] {
    const activeAlerts = Array.from(this.activeAlerts.values());
    if (activeAlerts.length === 0) {
      return [];
    }

    const now = Date.now();
    const snoozeMs = Math.max(5, this.config.signalkAlertSnoozeSeconds) * 1000;
    for (const alert of activeAlerts) {
      this.snoozed.set(alert.path, { until: now + snoozeMs, severity: getAlertSeverity(alert.state) });
    }
    return activeAlerts;
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
    const activePaths = new Set(alerts.map((alert) => alert.path));
    for (const path of this.activeAlerts.keys()) {
      if (!activePaths.has(path)) {
        this.activeAlerts.delete(path);
        this.seen.delete(path);
        this.snoozed.delete(path);
      }
    }
    if (alerts.length === 0) {
      return;
    }

    const now = Date.now();
    for (const alert of alerts) {
      this.activeAlerts.set(alert.path, alert);
      const severity = getAlertSeverity(alert.state);
      const snoozed = this.snoozed.get(alert.path);
      if (snoozed && severity > snoozed.severity) {
        this.snoozed.delete(alert.path);
      } else if (snoozed && now < snoozed.until) {
        continue;
      } else if (snoozed && now >= snoozed.until) {
        this.snoozed.delete(alert.path);
      }

      const prior = this.seen.get(alert.path);
      const cooldownMs = Math.max(5, this.config.signalkAlertRepeatSeconds) * 1000;
      if (prior && severity <= prior.severity && now - prior.lastSpokenAt < cooldownMs) {
        continue;
      }
      this.seen.set(alert.path, { lastSpokenAt: now, severity });
      await this.onAlert(alert);
    }
  }
}
