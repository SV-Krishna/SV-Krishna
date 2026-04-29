import type { AppConfig } from "../types";
import { Logger } from "../logger";
import type { ConversationMessage } from "./conversationStore";
import type { OllamaChatMessage, OllamaFunctionTool, OllamaToolCall } from "./ollamaClient";
import { OllamaClient } from "./ollamaClient";
import { McpStdioClient, type McpToolDefinition } from "./mcpStdioClient";

type McpServerName = "signalk" | "influx";

interface PlannedToolCall {
  server: McpServerName;
  tool: string;
  arguments?: Record<string, unknown>;
}

interface PlannedExecution {
  useMarine: boolean;
  notes?: string;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  calls: PlannedToolCall[];
}

interface ToolCallResult {
  server: McpServerName;
  tool: string;
  ok: boolean;
  output: string;
}

interface MetricReading {
  path?: string;
  value: string | number;
  units?: string;
}

interface ExecutableToolCall {
  server: McpServerName;
  tool: string;
  arguments: Record<string, unknown>;
}

export const MARINE_TELEMETRY_UNAVAILABLE_REPLY =
  "I couldn't retrieve live telemetry right now. Please try again in a moment.";

const toOllamaHistory = (history: ConversationMessage[]): OllamaChatMessage[] =>
  history.map((message) => ({
    role: message.role,
    content: message.content,
  }));

const parseFirstJsonObject = (text: string): unknown => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const DEPTH_PATH_CANDIDATES = [
  "environment.depth.belowTransducer",
  "navigation.depth.belowTransducer",
  "environment.depth.belowKeel",
  "navigation.depth.belowKeel",
  "environment.depth.belowSurface",
];

const SPEED_PATH_CANDIDATES = ["navigation.speedOverGround", "navigation.speedThroughWater"];
const WIND_SPEED_PATH_CANDIDATES = [
  "environment.wind.speedTrue",
  "environment.wind.speedApparent",
  "environment.wind.speedOverGround",
];

const isLikelyDepthPrompt = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return normalized.includes("depth") || normalized.includes("belowtransducer") || normalized.includes("belowkeel");
};

const isLikelySpeedPrompt = (text: string): boolean => {
  const normalized = text.toLowerCase();
  if (normalized.includes("wind")) {
    return false;
  }
  return (
    normalized.includes("speed") ||
    normalized.includes("sog") ||
    normalized.includes("speedoverground") ||
    normalized.includes("speedthroughwater")
  );
};

const isLikelyWindSpeedPrompt = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("wind speed") ||
    normalized.includes("speed true") ||
    normalized.includes("speedtrue") ||
    normalized.includes("apparent wind") ||
    normalized.includes("wind true")
  );
};

const isLikelyMarinePrompt = (text: string): boolean => {
  const normalized = text.toLowerCase();
  const hints = [
    "depth",
    "wind",
    "speed",
    "heading",
    "course",
    "position",
    "sog",
    "stw",
    "battery",
    "voltage",
    "soc",
    "temperature",
    "pressure",
    "bilge",
    "rpm",
    "fuel",
    "influx",
    "signalk",
    "telemetry",
  ];
  return hints.some((hint) => normalized.includes(hint));
};

const extractToolOutput = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractToolOutput(item)).join("\n").trim();
  }

  if (isObject(value)) {
    if (Array.isArray(value.content)) {
      const parts = value.content
        .map((item) => (isObject(item) && typeof item.text === "string" ? item.text : JSON.stringify(item)))
        .filter((item) => item.length > 0);
      if (parts.length > 0) {
        return parts.join("\n");
      }
    }

    return JSON.stringify(value, null, 2);
  }

  return String(value);
};

const parseJsonString = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const toMetricReading = (value: unknown): MetricReading | null => {
  if (!isObject(value)) {
    return null;
  }

  const directValue = value.value;
  const directPath = typeof value.path === "string" ? value.path : undefined;
  const directUnits = typeof value.units === "string" ? value.units : undefined;
  if (typeof directValue === "number" || typeof directValue === "string") {
    return { path: directPath, value: directValue, units: directUnits };
  }

  const nestedData = value.data;
  if (isObject(nestedData)) {
    const nestedValue = nestedData.value;
    const nestedUnits = typeof nestedData.units === "string" ? nestedData.units : undefined;
    if (typeof nestedValue === "number" || typeof nestedValue === "string") {
      return {
        path: directPath ?? (typeof nestedData.path === "string" ? nestedData.path : undefined),
        value: nestedValue,
        units: directUnits ?? nestedUnits,
      };
    }
  }

  const nestedResult = value.result;
  if (typeof nestedResult === "string") {
    const parsed = parseJsonString(nestedResult) ?? parseFirstJsonObject(nestedResult);
    if (parsed) {
      const parsedReading = toMetricReading(parsed);
      if (parsedReading) {
        return parsedReading;
      }
    }
  }

  return null;
};

const normalizeSignalkCode = (raw: string): string => {
  const code = raw.trim();
  if (!code) {
    return "";
  }

  // If model already returns the expected async IIFE form, keep it untouched.
  if (code.includes("(async () => {") && code.endsWith("})()")) {
    return code;
  }

  // Common small-model output: top-level `return ...` (illegal in isolate top-level).
  if (code.startsWith("return ")) {
    return ["(async () => {", `  ${code}`, "})()"].join("\n");
  }

  // If the model returns a single expression, return it as JSON from wrapper.
  if (!code.includes("\n") && !code.includes(";")) {
    return [
      "(async () => {",
      `  const value = ${code};`,
      "  return JSON.stringify(value);",
      "})()",
    ].join("\n");
  }

  // Default: wrap arbitrary snippet and preserve explicit returns if present.
  return ["(async () => {", code, "})()"].join("\n");
};

const formatMetric = (reading: MetricReading): string => {
  const rawValue = typeof reading.value === "number" ? String(reading.value) : reading.value;
  const units = reading.units?.trim();
  return units && units.length > 0 ? `${rawValue} ${units}` : rawValue;
};

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

const parsePlannedExecution = (
  raw: string,
  available: Record<McpServerName, Set<string>>,
  maxCalls: number,
): PlannedExecution | null => {
  const parsed = parseFirstJsonObject(raw);
  if (!isObject(parsed)) {
    return null;
  }

  const useMarine = parsed.useMarine === true;
  const notes = typeof parsed.notes === "string" ? parsed.notes : undefined;
  const needsClarification = parsed.needsClarification === true;
  const clarificationQuestion =
    typeof parsed.clarificationQuestion === "string" && parsed.clarificationQuestion.trim().length > 0
      ? parsed.clarificationQuestion.trim()
      : undefined;
  const callsRaw = Array.isArray(parsed.calls) ? parsed.calls : [];

  const calls: PlannedToolCall[] = [];
  for (const item of callsRaw) {
    if (!isObject(item)) {
      continue;
    }

    const server = item.server;
    const tool = item.tool;
    const args = isObject(item.arguments) ? item.arguments : {};

    if ((server !== "signalk" && server !== "influx") || typeof tool !== "string") {
      continue;
    }

    if (!available[server].has(tool)) {
      continue;
    }

    calls.push({ server, tool, arguments: args });
    if (calls.length >= maxCalls) {
      break;
    }
  }

  return {
    useMarine,
    notes,
    needsClarification,
    clarificationQuestion,
    calls,
  };
};

export class MarineMcpOrchestrator {
  private readonly logger: Logger;
  private readonly ollama: OllamaClient;
  private readonly signalkClient: McpStdioClient;
  private readonly influxClient: McpStdioClient;
  private readonly deterministicShortcutsEnabled: boolean;
  private readonly fastMarineMode: boolean;
  private readonly toolModel: string | null;
  private toolCatalog: Record<McpServerName, McpToolDefinition[]> = { signalk: [], influx: [] };
  private catalogFetchedAt = 0;

  constructor(private readonly config: AppConfig) {
    this.logger = new Logger(config.logLevel);
    this.ollama = new OllamaClient(config);
    this.deterministicShortcutsEnabled = process.env.MARINE_DETERMINISTIC_SHORTCUTS !== "false";
    this.fastMarineMode = process.env.MARINE_FAST_MODE !== "false";
    this.toolModel = config.ollamaToolModel.trim().length > 0 ? config.ollamaToolModel.trim() : null;

    const signalkEndpoint = new URL(config.signalKUrl);
    const signalkPort = signalkEndpoint.port || (signalkEndpoint.protocol === "https:" ? "443" : "80");

    this.signalkClient = new McpStdioClient(
      "signalk",
      config.signalkMcpCommand,
      config.signalkMcpArgs,
      {
        SIGNALK_HOST: signalkEndpoint.hostname,
        SIGNALK_PORT: signalkPort,
        SIGNALK_TLS: signalkEndpoint.protocol === "https:" ? "true" : "false",
        SIGNALK_TOKEN: config.signalKToken,
        EXECUTION_MODE: process.env.EXECUTION_MODE || "code",
      },
      config.marineMcpRequestTimeoutMs,
    );

    this.influxClient = new McpStdioClient(
      "influx",
      config.influxdbMcpCommand,
      config.influxdbMcpArgs,
      {
        INFLUXDB_URL: config.influxdbUrl,
        INFLUXDB_ORG: config.influxdbOrg,
        INFLUXDB_TOKEN: config.influxdbToken,
      },
      config.marineMcpRequestTimeoutMs,
    );
  }

  async tryRespond(
    userText: string,
    history: ConversationMessage[],
    vesselContext?: string,
  ): Promise<string | null> {
    const startedAt = Date.now();
    if (!this.config.marineTelemetryEnabled) {
      return null;
    }

    if (this.deterministicShortcutsEnabled) {
      const directDepth = await this.tryDepthShortcutDirectSignalK(userText);
      if (directDepth) {
        this.logger.debug(`Marine timing: total=${Date.now() - startedAt}ms (direct-signalk-depth path)`);
        return directDepth;
      }

      const directSpeed = await this.trySpeedShortcutDirectSignalK(userText);
      const directWindSpeed = await this.tryWindSpeedShortcutDirectSignalK(userText);
      if (directWindSpeed) {
        this.logger.debug(`Marine timing: total=${Date.now() - startedAt}ms (direct-signalk-wind-speed path)`);
        return directWindSpeed;
      }

      if (directSpeed) {
        this.logger.debug(`Marine timing: total=${Date.now() - startedAt}ms (direct-signalk-speed path)`);
        return directSpeed;
      }
    }

    const toolsStart = Date.now();
    const available = await this.getAvailableTools();
    this.logger.debug(`Marine timing: getAvailableTools=${Date.now() - toolsStart}ms`);
    if (available.signalk.size === 0 && available.influx.size === 0) {
      return null;
    }

    if (this.deterministicShortcutsEnabled) {
      const deterministicDepth = await this.tryDepthShortcut(userText, available);
      if (deterministicDepth) {
        this.logger.debug(`Marine timing: total=${Date.now() - startedAt}ms (deterministic-depth path)`);
        return deterministicDepth;
      }

      const deterministicSpeed = await this.trySpeedShortcut(userText, available);
      if (deterministicSpeed) {
        this.logger.debug(`Marine timing: total=${Date.now() - startedAt}ms (deterministic-speed path)`);
        return deterministicSpeed;
      }
    }

    // In fast mode, avoid high-latency LLM paths for telemetry.
    if (this.fastMarineMode && isLikelyMarinePrompt(userText)) {
      return MARINE_TELEMETRY_UNAVAILABLE_REPLY;
    }

    const nativeToolReply = await this.tryRespondViaNativeToolCalls(userText, history, available, vesselContext ?? null);
    if (nativeToolReply) {
      this.logger.debug(`Marine timing: total=${Date.now() - startedAt}ms (native-tools path)`);
      return nativeToolReply;
    }

    const plan = await this.planExecution(userText, history, available, vesselContext ?? null);
    if (!plan) {
      return null;
    }

    if (plan.needsClarification && plan.clarificationQuestion) {
      return plan.clarificationQuestion;
    }

    if (!plan.useMarine || plan.calls.length === 0) {
      return null;
    }

    const results: ToolCallResult[] = [];
    const planCallsStart = Date.now();
    for (const call of plan.calls.slice(0, this.config.marineMcpMaxCalls)) {
      const client = call.server === "signalk" ? this.signalkClient : this.influxClient;
      try {
        const response = await client.callTool(call.tool, call.arguments ?? {});
        results.push({
          server: call.server,
          tool: call.tool,
          ok: true,
          output: extractToolOutput(response),
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        results.push({
          server: call.server,
          tool: call.tool,
          ok: false,
          output: detail,
        });
      }
    }
    this.logger.debug(`Marine timing: planner mcp-calls=${Date.now() - planCallsStart}ms`);

    const hasSuccessfulTelemetry = results.some((result) => result.ok && result.output.trim().length > 0);
    if (!hasSuccessfulTelemetry) {
      return MARINE_TELEMETRY_UNAVAILABLE_REPLY;
    }

    const composeStart = Date.now();
    const final = await this.composeFinalAnswer(userText, history, plan, results, vesselContext ?? null);
    this.logger.debug(`Marine timing: composeFinalAnswer=${Date.now() - composeStart}ms`);
    this.logger.debug(`Marine timing: total=${Date.now() - startedAt}ms (planner path)`);
    return final;
  }

  async shutdown(): Promise<void> {
    this.signalkClient.shutdown();
    this.influxClient.shutdown();
  }

  private async getAvailableTools(): Promise<Record<McpServerName, Set<string>>> {
    const stale = Date.now() - this.catalogFetchedAt > 60_000;
    if (stale) {
      this.toolCatalog = { signalk: [], influx: [] };

      try {
        await this.signalkClient.start();
        this.toolCatalog.signalk = await this.signalkClient.listTools();
      } catch {
        this.toolCatalog.signalk = [];
      }

      try {
        await this.influxClient.start();
        this.toolCatalog.influx = await this.influxClient.listTools();
      } catch {
        this.toolCatalog.influx = [];
      }

      this.catalogFetchedAt = Date.now();
    }

    return {
      signalk: new Set(this.toolCatalog.signalk.map((tool) => tool.name)),
      influx: new Set(this.toolCatalog.influx.map((tool) => tool.name)),
    };
  }

  private async planExecution(
    userText: string,
    history: ConversationMessage[],
    available: Record<McpServerName, Set<string>>,
    vesselContext: string | null,
  ): Promise<PlannedExecution | null> {
    const planningPrompt = [
      "You are a marine MCP tool planner.",
      "Return ONLY one JSON object. No markdown or prose.",
      "Schema:",
      '{"useMarine":boolean,"needsClarification":boolean,"clarificationQuestion":"string","notes":"string","calls":[{"server":"signalk|influx","tool":"name","arguments":{}}]}',
      "Rules:",
      "- Decide intent from user wording and context. useMarine=true only for live boat telemetry or marine time-series analysis.",
      "- If user intent is marine but key detail is missing or ambiguous, set needsClarification=true and ask one short question in clarificationQuestion.",
      "- If needsClarification=true, set calls to [] and useMarine=true.",
      "- If not a marine telemetry request, set useMarine=false, needsClarification=false, calls=[].",
      "- choose at most 4 calls.",
      "- use only tools listed below.",
      "- for Influx queries use tool query-data with arguments {org, query}.",
      "- for SignalK use listed tools only.",
      "- prefer operator-provided Vessel context path mappings when selecting SignalK paths.",
      `Available SignalK tools: ${JSON.stringify([...available.signalk])}`,
      `Available Influx tools: ${JSON.stringify([...available.influx])}`,
      this.config.influxdbOrg
        ? `Default Influx org: ${this.config.influxdbOrg}`
        : "Default Influx org is not configured.",
      this.config.influxdbBucket
        ? `Default Influx bucket: ${this.config.influxdbBucket}`
        : "Default Influx bucket is not configured.",
      vesselContext ? `Vessel context:\n${vesselContext}` : "No vessel context provided.",
    ].join("\n");

    const messages: OllamaChatMessage[] = [
      { role: "system", content: planningPrompt },
      ...toOllamaHistory(history.slice(-6)),
      { role: "user", content: userText },
    ];

    const raw = await this.ollama.respondMessages(messages, this.toolModel ? { model: this.toolModel } : undefined);
    return parsePlannedExecution(raw, available, this.config.marineMcpMaxCalls);
  }

  private async tryRespondViaNativeToolCalls(
    userText: string,
    history: ConversationMessage[],
    available: Record<McpServerName, Set<string>>,
    vesselContext: string | null,
  ): Promise<string | null> {
    const tools = this.buildOllamaTools(available);
    if (tools.length === 0) {
      return null;
    }

    const systemPrompt = [
      "You are a marine telemetry assistant for SV Krishna.",
      "If the user asks for live or historical marine telemetry, call tools.",
      "Prefer SignalK for current/live values and Influx for historical trends.",
      "For current depth, prefer SignalK path environment.depth.belowTransducer first.",
      "When calling signalk_execute_code, return ONLY JavaScript code in this exact shape:",
      "(async () => {",
      "  const data = await getPathValue(\"environment.depth.belowTransducer\");",
      "  const value = data?.value ?? data?.data?.value ?? null;",
      "  const units = data?.units ?? data?.data?.units ?? \"m\";",
      "  return JSON.stringify({ path: \"environment.depth.belowTransducer\", value, units });",
      "})()",
      "Do not return top-level `return ...` without wrapper.",
      "Do not invent values.",
      vesselContext ? `Vessel context:\n${vesselContext}` : "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");

    const messages: OllamaChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...toOllamaHistory(history.slice(-6)),
      { role: "user", content: userText },
    ];

    const toolCallStart = Date.now();
    const response = await this.ollama.respondWithTools(
      messages,
      tools,
      {
        num_predict: 96,
        temperature: 0,
      },
      this.toolModel ? { model: this.toolModel } : undefined,
    );
    this.logger.debug(`Marine timing: native-tool-llm=${Date.now() - toolCallStart}ms`);
    this.logger.debug(
      `Marine native tool-call response: toolCalls=${response.toolCalls.length}, content=${JSON.stringify(response.content)}`,
    );
    if (response.toolCalls.length === 0) {
      return null;
    }

    let executableCalls = this.toExecutableToolCalls(response.toolCalls).slice(0, this.config.marineMcpMaxCalls);
    this.logger.debug(`Marine mapped tool calls: ${JSON.stringify(executableCalls)}`);
    if (executableCalls.length === 0 && this.toolModel) {
      const fallbackStart = Date.now();
      const fallbackResponse = await this.ollama.respondWithTools(messages, tools, {
        num_predict: 96,
        temperature: 0,
      });
      this.logger.debug(`Marine timing: native-tool-llm-fallback=${Date.now() - fallbackStart}ms`);
      this.logger.debug(
        `Marine native tool-call fallback response: toolCalls=${fallbackResponse.toolCalls.length}, content=${JSON.stringify(fallbackResponse.content)}`,
      );
      executableCalls = this.toExecutableToolCalls(fallbackResponse.toolCalls).slice(0, this.config.marineMcpMaxCalls);
      this.logger.debug(`Marine mapped tool calls after fallback: ${JSON.stringify(executableCalls)}`);
    }
    if (executableCalls.length === 0) {
      return null;
    }

    const results: ToolCallResult[] = [];
    const mcpCallsStart = Date.now();
    for (const call of executableCalls) {
      const client = call.server === "signalk" ? this.signalkClient : this.influxClient;
      try {
        const result = await client.callTool(call.tool, call.arguments);
        results.push({
          server: call.server,
          tool: call.tool,
          ok: true,
          output: extractToolOutput(result),
        });
        this.logger.debug(`Marine MCP call ok: ${call.server}.${call.tool}`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        results.push({
          server: call.server,
          tool: call.tool,
          ok: false,
          output: detail,
        });
        this.logger.warn(`Marine MCP call failed: ${call.server}.${call.tool} (${detail})`);
      }
    }
    this.logger.debug(`Marine timing: native-tool-mcp-calls=${Date.now() - mcpCallsStart}ms`);

    const hasSuccessfulTelemetry = results.some((result) => result.ok && result.output.trim().length > 0);
    this.logger.debug(`Marine MCP aggregated results: ${JSON.stringify(results)}`);
    if (!hasSuccessfulTelemetry) {
      return MARINE_TELEMETRY_UNAVAILABLE_REPLY;
    }

    if (this.fastMarineMode) {
      const quickReply = this.tryBuildFastTelemetryReply(userText, results);
      if (quickReply) {
        return quickReply;
      }
    }

    const composeStart = Date.now();
    const final = await this.composeFinalAnswer(
      userText,
      history,
      { useMarine: true, calls: [], notes: "Native Ollama tool-calling path" },
      results,
      vesselContext,
    );
    this.logger.debug(`Marine timing: native-tool-compose=${Date.now() - composeStart}ms`);
    return final;
  }

  private tryBuildFastTelemetryReply(userText: string, results: ToolCallResult[]): string | null {
    const metricKeywords = isLikelyDepthPrompt(userText)
      ? ["depth"]
      : isLikelySpeedPrompt(userText)
        ? ["speed"]
        : [];

    for (const result of results) {
      if (!result.ok || result.output.trim().length === 0) {
        continue;
      }

      const parsed = parseFirstJsonObject(result.output) ?? parseJsonString(result.output);
      const reading = parsed ? toMetricReading(parsed) : null;
      if (!reading) {
        continue;
      }

      if (metricKeywords.includes("depth")) {
        return `Current depth: ${formatMetric(reading)}\n\nSource: SignalK and/or InfluxDB MCP.`;
      }

      if (metricKeywords.includes("speed")) {
        return `Current speed: ${formatMetric(reading)}\n\nSource: SignalK and/or InfluxDB MCP.`;
      }

      return `Current value: ${formatMetric(reading)}\n\nSource: SignalK and/or InfluxDB MCP.`;
    }

    return null;
  }

  private buildOllamaTools(available: Record<McpServerName, Set<string>>): OllamaFunctionTool[] {
    const tools: OllamaFunctionTool[] = [];

    if (available.signalk.has("execute_code")) {
      tools.push({
        type: "function",
        function: {
          name: "signalk_execute_code",
          description:
            "Run JavaScript in SignalK MCP isolate to retrieve current vessel telemetry such as depth, speed, wind, position, alarms, and path values.",
          parameters: {
            type: "object",
            properties: {
              code: { type: "string" },
            },
            required: ["code"],
          },
        },
      });
    }

    if (available.influx.has("query-data")) {
      tools.push({
        type: "function",
        function: {
          name: "influx_query_data",
          description: "Query historical time-series data from InfluxDB using Flux.",
          parameters: {
            type: "object",
            properties: {
              org: { type: "string" },
              query: { type: "string" },
            },
            required: ["query"],
          },
        },
      });
    }

    return tools;
  }

  private toExecutableToolCalls(toolCalls: OllamaToolCall[]): ExecutableToolCall[] {
    const result: ExecutableToolCall[] = [];
    for (const call of toolCalls) {
      const fn = call.function;
      if (!fn || typeof fn.name !== "string") {
        continue;
      }

      const args =
        typeof fn.arguments === "string"
          ? ((parseJsonString(fn.arguments) as Record<string, unknown>) ?? {})
          : isObject(fn.arguments)
            ? (fn.arguments as Record<string, unknown>)
            : {};

      if (fn.name === "signalk_execute_code") {
        const code = typeof args.code === "string" ? args.code : "";
        const normalizedCode = normalizeSignalkCode(code);
        if (!normalizedCode) {
          continue;
        }
        result.push({
          server: "signalk",
          tool: "execute_code",
          arguments: { code: normalizedCode },
        });
        continue;
      }

      if (fn.name === "influx_query_data") {
        const query = typeof args.query === "string" ? args.query : "";
        if (!query.trim()) {
          continue;
        }
        const org = typeof args.org === "string" && args.org.trim().length > 0 ? args.org : this.config.influxdbOrg;
        result.push({
          server: "influx",
          tool: "query-data",
          arguments: { org, query },
        });
      }
    }

    return result;
  }

  private async composeFinalAnswer(
    userText: string,
    history: ConversationMessage[],
    plan: PlannedExecution,
    results: ToolCallResult[],
    vesselContext: string | null,
  ): Promise<string> {
    const synthesisPrompt = [
      "You are SV Krishna's marine assistant.",
      "Use tool results as the source of truth for live/history data.",
      "If tool calls failed or data is missing, say that clearly and briefly.",
      "Do not invent numeric values.",
      "Keep response concise.",
      "When relevant, end with one line: Source: SignalK and/or InfluxDB MCP.",
      plan.notes ? `Planner notes: ${plan.notes}` : "",
      vesselContext ? `Vessel context:\n${vesselContext}` : "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");

    const payload = {
      question: userText,
      toolResults: results,
    };

    const messages: OllamaChatMessage[] = [
      { role: "system", content: synthesisPrompt },
      ...toOllamaHistory(history.slice(-6)),
      { role: "user", content: JSON.stringify(payload, null, 2) },
    ];

    return await this.ollama.respondMessages(messages);
  }

  private async tryDepthShortcut(
    userText: string,
    available: Record<McpServerName, Set<string>>,
  ): Promise<string | null> {
    if (!isLikelyDepthPrompt(userText)) {
      return null;
    }

    const requestedPath =
      DEPTH_PATH_CANDIDATES.find((path) => userText.toLowerCase().includes(path.toLowerCase())) ?? null;
    const candidates = requestedPath ? [requestedPath, ...DEPTH_PATH_CANDIDATES] : [...DEPTH_PATH_CANDIDATES];
    const uniqueCandidates = [...new Set(candidates)];

    if (available.signalk.has("execute_code")) {
      const candidateJson = JSON.stringify(uniqueCandidates);
      const code = [
        "(async () => {",
        `  const paths = ${candidateJson};`,
        "  for (const path of paths) {",
        "    try {",
        "      const data = await getPathValue(path);",
        "      const candidate = data?.value ?? data?.data?.value;",
        "      if (candidate !== undefined && candidate !== null) {",
        "        const units = data?.units ?? data?.data?.units;",
        "        return JSON.stringify({ path, value: candidate, units });",
        "      }",
        "    } catch {}",
        "  }",
        "  return JSON.stringify({ path: null, value: null });",
        "})()",
      ].join("\n");

      try {
        const response = await this.signalkClient.callTool("execute_code", { code });
        const output = extractToolOutput(response);
        const parsed = parseFirstJsonObject(output);
        const reading = parsed ? toMetricReading(parsed) : null;
        if (reading) {
          return `Current depth is ${formatMetric(reading)}${reading.path ? ` (${reading.path})` : ""}.\nSource: SignalK MCP.`;
        }
      } catch {
        // fall through to legacy tool attempts
      }
    }

    const directPathTool = available.signalk.has("get_path_value")
      ? "get_path_value"
      : available.signalk.has("getPathValue")
        ? "getPathValue"
        : null;

    if (!directPathTool) {
      return null;
    }

    for (const path of uniqueCandidates) {
      try {
        const response = await this.signalkClient.callTool(directPathTool, { path });
        const output = extractToolOutput(response);
        const parsed = parseFirstJsonObject(output);
        const reading = parsed ? toMetricReading(parsed) : null;
        if (reading) {
          return `Current depth is ${formatMetric(reading)}${reading.path ? ` (${reading.path})` : ` (${path})`}.\nSource: SignalK MCP.`;
        }
      } catch {
        // try next path
      }
    }

    return null;
  }

  private async tryDepthShortcutDirectSignalK(userText: string): Promise<string | null> {
    if (!isLikelyDepthPrompt(userText)) {
      return null;
    }

    const reading = await this.fetchSignalKReadingForPaths(DEPTH_PATH_CANDIDATES);
    if (!reading) {
      return null;
    }

    return `Current depth is ${formatMetric(reading)}${reading.path ? ` (${reading.path})` : ""}.\nSource: SignalK API.`;
  }

  private async trySpeedShortcut(
    userText: string,
    available: Record<McpServerName, Set<string>>,
  ): Promise<string | null> {
    if (!isLikelySpeedPrompt(userText)) {
      return null;
    }

    const requestedPath =
      SPEED_PATH_CANDIDATES.find((path) => userText.toLowerCase().includes(path.toLowerCase())) ?? null;
    const candidates = requestedPath ? [requestedPath, ...SPEED_PATH_CANDIDATES] : [...SPEED_PATH_CANDIDATES];
    const uniqueCandidates = [...new Set(candidates)];

    if (available.signalk.has("execute_code")) {
      const candidateJson = JSON.stringify(uniqueCandidates);
      const code = [
        "(async () => {",
        `  const paths = ${candidateJson};`,
        "  for (const path of paths) {",
        "    try {",
        "      const data = await getPathValue(path);",
        "      const candidate = data?.value ?? data?.data?.value;",
        "      if (candidate !== undefined && candidate !== null) {",
        "        const units = data?.units ?? data?.data?.units;",
        "        return JSON.stringify({ path, value: candidate, units });",
        "      }",
        "    } catch {}",
        "  }",
        "  return JSON.stringify({ path: null, value: null });",
        "})()",
      ].join("\n");

      try {
        const response = await this.signalkClient.callTool("execute_code", { code });
        const output = extractToolOutput(response);
        const parsed = parseFirstJsonObject(output);
        const reading = parsed ? toMetricReading(parsed) : null;
        if (reading) {
          return `Current speed is ${formatMetric(reading)}${reading.path ? ` (${reading.path})` : ""}.\nSource: SignalK MCP.`;
        }
      } catch {
        // fall through to legacy tool attempts
      }
    }

    const directPathTool = available.signalk.has("get_path_value")
      ? "get_path_value"
      : available.signalk.has("getPathValue")
        ? "getPathValue"
        : null;

    if (!directPathTool) {
      return null;
    }

    for (const path of uniqueCandidates) {
      try {
        const response = await this.signalkClient.callTool(directPathTool, { path });
        const output = extractToolOutput(response);
        const parsed = parseFirstJsonObject(output);
        const reading = parsed ? toMetricReading(parsed) : null;
        if (reading) {
          return `Current speed is ${formatMetric(reading)}${reading.path ? ` (${reading.path})` : ` (${path})`}.\nSource: SignalK MCP.`;
        }
      } catch {
        // try next path
      }
    }

    return null;
  }

  private async trySpeedShortcutDirectSignalK(userText: string): Promise<string | null> {
    if (!isLikelySpeedPrompt(userText)) {
      return null;
    }

    const reading = await this.fetchSignalKReadingForPaths(SPEED_PATH_CANDIDATES);
    if (!reading) {
      return null;
    }

    return `Current speed is ${formatMetric(reading)}${reading.path ? ` (${reading.path})` : ""}.\nSource: SignalK API.`;
  }

  private async tryWindSpeedShortcutDirectSignalK(userText: string): Promise<string | null> {
    if (!isLikelyWindSpeedPrompt(userText)) {
      return null;
    }

    const reading = await this.fetchSignalKReadingForPaths(WIND_SPEED_PATH_CANDIDATES);
    if (!reading) {
      return null;
    }

    return `Current wind speed is ${formatMetric(reading)}${reading.path ? ` (${reading.path})` : ""}.\nSource: SignalK API.`;
  }

  private async fetchSignalKReadingForPaths(paths: string[]): Promise<MetricReading | null> {
    const endpoint = this.config.signalKUrl.replace(/\/+$/, "");
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.config.signalKToken.trim().length > 0) {
      headers.Authorization = `Bearer ${this.config.signalKToken}`;
    }

    try {
      const response = await fetch(`${endpoint}/signalk/v1/api/vessels/self`, { headers });
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as unknown;
      for (const path of paths) {
        const value = getNestedValue(payload, path);
        const reading = toMetricReading({ path, ...(isObject(value) ? value : { value }) });
        if (reading) {
          return reading;
        }
      }
    } catch {
      return null;
    }

    return null;
  }
}
