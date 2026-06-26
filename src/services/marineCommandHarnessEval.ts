import type { AppConfig } from "../types";
import type { ConversationMessage } from "./conversationStore";
import type { OllamaChatMessage, OllamaFunctionTool, OllamaToolCall } from "./ollamaClient";
import { OllamaClient } from "./ollamaClient";
import type { MarineCommandHarnessTools } from "./marineCommandHarness";

type RelayState = "on" | "off";

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

export interface MarineCommandHarnessEvalTraceEntry {
  iteration: number;
  assistantContent: string;
  toolCalls: Array<{ name: string; arguments: unknown }>;
  toolResults: Array<{ name: string; arguments: unknown; result: string | null }>;
}

export interface MarineCommandHarnessEvalResult {
  finalAnswer: string;
  refusalReason: string | null;
  toolTrace: MarineCommandHarnessEvalTraceEntry[];
  promptVersion: string;
  toolsExposed: string[];
  latencyMs: number;
  transcript: string;
}

const PROMPT_VERSION = "marine-harness-eval-v1";

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

const buildToolResultMessage = (name: string, result: string | null): string => {
  const normalized = result?.trim();
  if (normalized) {
    return `Tool ${name} returned: ${normalized}`;
  }
  return `Tool ${name} returned no result.`;
};

export class MarineCommandHarnessEval {
  private readonly ollama: OllamaClient;

  constructor(
    config: AppConfig,
    private readonly tools: MarineCommandHarnessTools,
  ) {
    this.ollama = new OllamaClient(config);
  }

  async run(userText: string, history: ConversationMessage[] = []): Promise<MarineCommandHarnessEvalResult> {
    const startedAt = Date.now();
    const toolDefinitions = this.buildTools();
    const toolsExposed = toolDefinitions.map((tool) => tool.function.name);
    const trace: MarineCommandHarnessEvalTraceEntry[] = [];

    if (toolDefinitions.length === 0) {
      return {
        finalAnswer: "No marine tools are available for harness evaluation.",
        refusalReason: "no_tools_configured",
        toolTrace: trace,
        promptVersion: PROMPT_VERSION,
        toolsExposed,
        latencyMs: Date.now() - startedAt,
        transcript: userText,
      };
    }

    const systemPrompt = [
      "You are a strict marine command harness evaluation agent for SV Krishna.",
      "This route is a controlled experiment. Do not rely on hidden routing or fallback behavior.",
      "You may only help by choosing from the provided tools.",
      "Supported scope: telemetry reads, relay status/control, and drop-anchor with explicit rode length in meters.",
      "If the request is out of scope, ambiguous, missing required numeric detail, or unsupported, do not call any tool and say so plainly.",
      "Do not normalize or rewrite the user's request.",
      "Use at most one tool call per iteration.",
      "After a tool result is provided, answer briefly using only that result.",
    ].join("\n");

    const messages: OllamaChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...toOllamaHistory(history.slice(-4)),
      { role: "user", content: userText },
    ];

    for (let iteration = 1; iteration <= 2; iteration += 1) {
      const response = await this.ollama.respondWithTools(
        messages,
        toolDefinitions,
        { num_predict: 128, temperature: 0 },
      );

      const entry: MarineCommandHarnessEvalTraceEntry = {
        iteration,
        assistantContent: response.content,
        toolCalls: response.toolCalls.map((call) => ({
          name: typeof call.function?.name === "string" ? call.function.name : "unknown",
          arguments: typeof call.function?.arguments === "string" ? parseJsonString(call.function.arguments) : call.function?.arguments,
        })),
        toolResults: [],
      };
      trace.push(entry);

      const command = this.parseCommand(response.toolCalls);
      if (!command) {
        const hasPriorToolResult = trace.some((item) => item.toolResults.length > 0);
        const refusalReason =
          hasPriorToolResult
            ? null
            : trace.some((item) => item.toolCalls.length > 0)
              ? "invalid_tool_call"
              : "no_tool_called";
        const finalAnswer = hasPriorToolResult
          ? response.content.trim() ||
            trace.at(-1)?.toolResults.at(-1)?.result?.trim() ||
            "The harness selected a tool, but it did not produce a usable result."
          : refusalReason === "invalid_tool_call"
            ? "I can't handle that in the harness evaluation route because the requested tool action was invalid or unsupported."
            : "I can't handle that in the harness evaluation route because it is ambiguous, unsupported, or outside scope.";
        return {
          finalAnswer,
          refusalReason,
          toolTrace: trace,
          promptVersion: PROMPT_VERSION,
          toolsExposed,
          latencyMs: Date.now() - startedAt,
          transcript: userText,
        };
      }

      const toolName = command.kind;
      const toolArgs = this.describeCommandArguments(command);
      const toolResult = await this.execute(command);
      entry.toolResults.push({ name: toolName, arguments: toolArgs, result: toolResult });

      messages.push({
        role: "assistant",
        content: response.content.trim() || `Calling tool ${toolName}.`,
      });
      messages.push({
        role: "user",
        content: `${buildToolResultMessage(toolName, toolResult)} Respond to the original request using this result only.`,
      });

      if (iteration === 2) {
        return {
          finalAnswer:
            toolResult?.trim() ||
            "The harness selected a tool, but it did not produce a usable result.",
          refusalReason: toolResult?.trim() ? null : "empty_tool_result",
          toolTrace: trace,
          promptVersion: PROMPT_VERSION,
          toolsExposed,
          latencyMs: Date.now() - startedAt,
          transcript: userText,
        };
      }
    }

    return {
      finalAnswer: "The harness evaluation loop ended without a final answer.",
      refusalReason: "max_iterations_reached",
      toolTrace: trace,
      promptVersion: PROMPT_VERSION,
      toolsExposed,
      latencyMs: Date.now() - startedAt,
      transcript: userText,
    };
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

  private describeCommandArguments(command: HarnessCommand): unknown {
    if (command.kind === "set_relay") {
      return { channel: command.channel, state: command.state };
    }
    if (command.kind === "set_all_relays") {
      return { state: command.state };
    }
    if (command.kind === "drop_anchor") {
      return { rodeLengthMeters: command.rodeLengthMeters };
    }
    return {};
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
