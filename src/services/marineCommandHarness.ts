import type { AppConfig } from "../types";
import type { ConversationMessage } from "./conversationStore";
import type { OllamaChatMessage, OllamaFunctionTool, OllamaToolCall } from "./ollamaClient";
import { OllamaClient } from "./ollamaClient";

type RelayState = "on" | "off";

export interface MarineCommandHarnessTools {
  readDepth?: () => Promise<string | null>;
  readSpeed?: () => Promise<string | null>;
  readWindSpeed?: () => Promise<string | null>;
  readBatteryVoltage?: () => Promise<string | null>;
  readCabinTemperature?: () => Promise<string | null>;
  readRelayStatus?: () => Promise<string | null>;
  setRelay?: (channel: number, state: RelayState) => Promise<string | null>;
  setAllRelays?: (state: RelayState) => Promise<string | null>;
  dropAnchor?: (rodeLengthMeters: number) => Promise<string | null>;
}

type HarnessCommand =
  | { kind: "read_depth" }
  | { kind: "read_speed" }
  | { kind: "read_wind_speed" }
  | { kind: "read_battery_voltage" }
  | { kind: "read_cabin_temperature" }
  | { kind: "read_relay_status" }
  | { kind: "set_relay"; channel: number; state: RelayState }
  | { kind: "set_all_relays"; state: RelayState }
  | { kind: "drop_anchor"; rodeLengthMeters: number };

const toOllamaHistory = (history: ConversationMessage[]): OllamaChatMessage[] =>
  history.map((message) => ({
    role: message.role,
    content: message.content,
  }));

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonString = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const parsePositiveNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

const parseRelayState = (value: unknown): RelayState | null => {
  if (value === "on" || value === "off") {
    return value;
  }
  return null;
};

const parseChannel = (value: unknown): number | null => {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 6 ? numeric : null;
};

const parseChannelFromText = (text: string): number | null => {
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

const parseDeterministicRelayCommand = (
  text: string,
): Extract<HarnessCommand, { kind: "read_relay_status" | "set_relay" | "set_all_relays" }> | null => {
  const normalized = text.toLowerCase().replace(/[.?!]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  if (normalized.includes("status") && normalized.includes("relay")) {
    return { kind: "read_relay_status" };
  }

  const wantsOn =
    /\b(turn|switch)?\s*on\b/.test(normalized) ||
    normalized.startsWith("on ") ||
    normalized === "on";
  const wantsOff =
    /\b(turn|switch)?\s*off\b/.test(normalized) ||
    normalized.startsWith("off ") ||
    normalized === "off";
  if (!wantsOn && !wantsOff) {
    return null;
  }

  const state: RelayState | null = wantsOn && !wantsOff ? "on" : wantsOff && !wantsOn ? "off" : null;
  if (!state) {
    return null;
  }

  if (normalized.includes("all") && normalized.includes("relay")) {
    return { kind: "set_all_relays", state };
  }

  if (!normalized.includes("relay") && !/\bchannel\b/.test(normalized) && !/\bch\b/.test(normalized)) {
    return null;
  }

  const channel = parseChannelFromText(normalized);
  if (channel) {
    return { kind: "set_relay", channel, state };
  }

  if (normalized.includes("relay")) {
    return { kind: "set_relay", channel: 1, state };
  }

  return null;
};

const parseDeterministicTelemetryCommand = (
  text: string,
): Extract<
  HarnessCommand,
  | { kind: "read_depth" }
  | { kind: "read_speed" }
  | { kind: "read_wind_speed" }
  | { kind: "read_battery_voltage" }
  | { kind: "read_cabin_temperature" }
> | null => {
  const normalized = text.toLowerCase().replace(/[.?!]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  if (normalized.includes("depth")) {
    return { kind: "read_depth" };
  }

  if (normalized.includes("wind") && normalized.includes("speed")) {
    return { kind: "read_wind_speed" };
  }

  if ((normalized.includes("battery") || normalized.includes("voltage")) && normalized.includes("voltage")) {
    return { kind: "read_battery_voltage" };
  }

  if (
    normalized.includes("cabin temperature") ||
    normalized.includes("inside temperature") ||
    (normalized.includes("cabin") && normalized.includes("temp")) ||
    (normalized.includes("temperature") && normalized.includes("cabin"))
  ) {
    return { kind: "read_cabin_temperature" };
  }

  if (
    normalized.includes("current speed") ||
    normalized.includes("speed over ground") ||
    (normalized.includes("speed") && !normalized.includes("wind"))
  ) {
    return { kind: "read_speed" };
  }

  return null;
};

const looksLikeTelemetryPrompt = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("depth") ||
    normalized.includes("speed") ||
    normalized.includes("wind") ||
    normalized.includes("battery") ||
    normalized.includes("voltage") ||
    normalized.includes("temperature") ||
    normalized.includes("cabin")
  );
};

const looksLikeRelayPrompt = (text: string, history: ConversationMessage[]): boolean => {
  const normalized = text.toLowerCase();
  if (
    normalized.includes("relay") ||
    normalized.includes("relays") ||
    /\bch\s*[1-6]\b/i.test(text) ||
    /\bchannel\s*[1-6]\b/i.test(text)
  ) {
    return true;
  }

  const shortCommand =
    normalized === "off" ||
    normalized === "on" ||
    normalized === "turn off" ||
    normalized === "turn on" ||
    normalized === "switch off" ||
    normalized === "switch on" ||
    normalized === "all off" ||
    normalized === "all on";
  if (!shortCommand) {
    return false;
  }

  return history
    .slice(-4)
    .some((message) => /relay|relays|ch\s*[1-6]|channel\s*[1-6]/i.test(message.content));
};

const looksLikeDropAnchorPrompt = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("drop anchor") ||
    ((normalized.includes("anchor alarm") || normalized.includes("anchoralarm")) &&
      (normalized.includes("switch on") || normalized.includes("turn on") || normalized.includes("enable")))
  );
};

export class MarineCommandHarness {
  private readonly ollama: OllamaClient;

  constructor(
    config: AppConfig,
    private readonly tools: MarineCommandHarnessTools,
  ) {
    this.ollama = new OllamaClient(config);
  }

  async tryRespond(userText: string, history: ConversationMessage[] = []): Promise<string | null> {
    if (!this.isInScope(userText, history)) {
      return null;
    }

    if (looksLikeDropAnchorPrompt(userText) && !/\d/.test(userText)) {
      return null;
    }

    const toolDefinitions = this.buildTools();
    if (toolDefinitions.length === 0) {
      return null;
    }

    const deterministicTelemetryCommand = parseDeterministicTelemetryCommand(userText);
    if (deterministicTelemetryCommand) {
      return await this.execute(deterministicTelemetryCommand);
    }

    const deterministicRelayCommand = parseDeterministicRelayCommand(userText);
    if (deterministicRelayCommand) {
      return await this.execute(deterministicRelayCommand);
    }

    const systemPrompt = [
      "You are a tool-calling marine command harness for SV Krishna.",
      "Handle only these command families: telemetry reads, relay control, and drop-anchor with rode length.",
      "If the user's request is outside those families, do not call any tools.",
      "Call at most one tool.",
      "Use telemetry tools for:",
      "- current depth",
      "- current speed",
      "- current wind speed",
      "- current battery voltage",
      "- cabin temperature",
      "Use relay tools for relay status, relay on/off, and all relays on/off.",
      "Use drop_anchor only when the user clearly asks to drop anchor or switch on anchor alarm and gives rode length in meters.",
      "Do not invent numbers or channel values.",
      "If a request is ambiguous, do not call a tool.",
    ].join("\n");

    const messages: OllamaChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...toOllamaHistory(history.slice(-6)),
      { role: "user", content: userText },
    ];

    const response = await this.ollama.respondWithTools(
      messages,
      toolDefinitions,
      { num_predict: 96, temperature: 0 },
    );

    const command = this.parseCommand(response.toolCalls);
    if (!command) {
      return null;
    }

    return await this.execute(command);
  }

  private isInScope(userText: string, history: ConversationMessage[]): boolean {
    if (looksLikeTelemetryPrompt(userText)) {
      return true;
    }
    if (looksLikeRelayPrompt(userText, history)) {
      return true;
    }
    return looksLikeDropAnchorPrompt(userText);
  }

  private buildTools(): OllamaFunctionTool[] {
    const tools: OllamaFunctionTool[] = [];

    if (this.tools.readDepth) {
      tools.push(this.makeNoArgTool("read_depth", "Read the current vessel depth."));
    }
    if (this.tools.readSpeed) {
      tools.push(this.makeNoArgTool("read_speed", "Read the current vessel speed."));
    }
    if (this.tools.readWindSpeed) {
      tools.push(this.makeNoArgTool("read_wind_speed", "Read the current wind speed."));
    }
    if (this.tools.readBatteryVoltage) {
      tools.push(this.makeNoArgTool("read_battery_voltage", "Read the current battery voltage."));
    }
    if (this.tools.readCabinTemperature) {
      tools.push(this.makeNoArgTool("read_cabin_temperature", "Read the current cabin temperature."));
    }
    if (this.tools.readRelayStatus) {
      tools.push(this.makeNoArgTool("read_relay_status", "Read the current relay status."));
    }
    if (this.tools.setRelay) {
      tools.push({
        type: "function",
        function: {
          name: "set_relay",
          description: "Turn a single relay channel on or off.",
          parameters: {
            type: "object",
            properties: {
              channel: { type: "integer", minimum: 1, maximum: 6 },
              state: { type: "string", enum: ["on", "off"] },
            },
            required: ["channel", "state"],
          },
        },
      });
    }
    if (this.tools.setAllRelays) {
      tools.push({
        type: "function",
        function: {
          name: "set_all_relays",
          description: "Turn all relays on or off.",
          parameters: {
            type: "object",
            properties: {
              state: { type: "string", enum: ["on", "off"] },
            },
            required: ["state"],
          },
        },
      });
    }
    if (this.tools.dropAnchor) {
      tools.push({
        type: "function",
        function: {
          name: "drop_anchor",
          description: "Drop anchor / switch on anchor alarm using rode length in meters.",
          parameters: {
            type: "object",
            properties: {
              rodeLengthMeters: { type: "number", minimum: 0.1 },
            },
            required: ["rodeLengthMeters"],
          },
        },
      });
    }

    return tools;
  }

  private makeNoArgTool(name: string, description: string): OllamaFunctionTool {
    return {
      type: "function",
      function: {
        name,
        description,
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    };
  }

  private parseCommand(toolCalls: OllamaToolCall[]): HarnessCommand | null {
    for (const call of toolCalls) {
      const fn = call.function;
      if (!fn || typeof fn.name !== "string") {
        continue;
      }

      const args =
        typeof fn.arguments === "string"
          ? parseJsonString(fn.arguments)
          : fn.arguments;
      const parsedArgs = isObject(args) ? args : {};

      if (fn.name === "read_depth" && this.tools.readDepth) {
        return { kind: "read_depth" };
      }
      if (fn.name === "read_speed" && this.tools.readSpeed) {
        return { kind: "read_speed" };
      }
      if (fn.name === "read_wind_speed" && this.tools.readWindSpeed) {
        return { kind: "read_wind_speed" };
      }
      if (fn.name === "read_battery_voltage" && this.tools.readBatteryVoltage) {
        return { kind: "read_battery_voltage" };
      }
      if (fn.name === "read_cabin_temperature" && this.tools.readCabinTemperature) {
        return { kind: "read_cabin_temperature" };
      }
      if (fn.name === "read_relay_status" && this.tools.readRelayStatus) {
        return { kind: "read_relay_status" };
      }
      if (fn.name === "set_relay" && this.tools.setRelay) {
        const channel = parseChannel(parsedArgs.channel);
        const state = parseRelayState(parsedArgs.state);
        if (channel && state) {
          return { kind: "set_relay", channel, state };
        }
      }
      if (fn.name === "set_all_relays" && this.tools.setAllRelays) {
        const state = parseRelayState(parsedArgs.state);
        if (state) {
          return { kind: "set_all_relays", state };
        }
      }
      if (fn.name === "drop_anchor" && this.tools.dropAnchor) {
        const rodeLengthMeters = parsePositiveNumber(parsedArgs.rodeLengthMeters);
        if (rodeLengthMeters !== null) {
          return { kind: "drop_anchor", rodeLengthMeters };
        }
      }
    }

    return null;
  }

  private async execute(command: HarnessCommand): Promise<string | null> {
    if (command.kind === "read_depth") {
      return await this.tools.readDepth?.() ?? null;
    }
    if (command.kind === "read_speed") {
      return await this.tools.readSpeed?.() ?? null;
    }
    if (command.kind === "read_wind_speed") {
      return await this.tools.readWindSpeed?.() ?? null;
    }
    if (command.kind === "read_battery_voltage") {
      return await this.tools.readBatteryVoltage?.() ?? null;
    }
    if (command.kind === "read_cabin_temperature") {
      return await this.tools.readCabinTemperature?.() ?? null;
    }
    if (command.kind === "read_relay_status") {
      return await this.tools.readRelayStatus?.() ?? null;
    }
    if (command.kind === "set_relay") {
      return await this.tools.setRelay?.(command.channel, command.state) ?? null;
    }
    if (command.kind === "set_all_relays") {
      return await this.tools.setAllRelays?.(command.state) ?? null;
    }
    return await this.tools.dropAnchor?.(command.rodeLengthMeters) ?? null;
  }
}
