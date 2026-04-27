import type { AppConfig } from "../types";
import type { ConversationMessage } from "./conversationStore";
import type { OllamaChatMessage } from "./ollamaClient";
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

const isLikelyMarinePrompt = (text: string): boolean => {
  const normalized = text.toLowerCase();
  const hints = [
    "boat",
    "vessel",
    "signalk",
    "ais",
    "anchor",
    "course",
    "heading",
    "speed",
    "gps",
    "position",
    "wind",
    "depth",
    "battery",
    "voltage",
    "current",
    "soc",
    "marine",
    "navigation",
    "history",
    "trend",
    "influx",
  ];

  return hints.some((hint) => normalized.includes(hint));
};

const DEPTH_PATH_CANDIDATES = [
  "environment.depth.belowTransducer",
  "navigation.depth.belowTransducer",
  "environment.depth.belowKeel",
  "navigation.depth.belowKeel",
];

const SPEED_PATH_CANDIDATES = ["navigation.speedOverGround", "navigation.speedThroughWater"];

const isLikelyDepthPrompt = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return normalized.includes("depth") || normalized.includes("belowtransducer") || normalized.includes("belowkeel");
};

const isLikelySpeedPrompt = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("speed") ||
    normalized.includes("sog") ||
    normalized.includes("speedoverground") ||
    normalized.includes("speedthroughwater")
  );
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

const formatMetric = (reading: MetricReading): string => {
  const rawValue = typeof reading.value === "number" ? String(reading.value) : reading.value;
  const units = reading.units?.trim();
  return units && units.length > 0 ? `${rawValue} ${units}` : rawValue;
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
    calls,
  };
};

export class MarineMcpOrchestrator {
  private readonly ollama: OllamaClient;
  private readonly signalkClient: McpStdioClient;
  private readonly influxClient: McpStdioClient;
  private readonly deterministicShortcutsEnabled: boolean;
  private toolCatalog: Record<McpServerName, McpToolDefinition[]> = { signalk: [], influx: [] };
  private catalogFetchedAt = 0;

  constructor(private readonly config: AppConfig) {
    this.ollama = new OllamaClient(config);
    this.deterministicShortcutsEnabled = process.env.MARINE_DETERMINISTIC_SHORTCUTS !== "false";

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
    if (!this.config.marineTelemetryEnabled || !isLikelyMarinePrompt(userText)) {
      return null;
    }

    const available = await this.getAvailableTools();
    if (available.signalk.size === 0 && available.influx.size === 0) {
      return null;
    }

    if (this.deterministicShortcutsEnabled) {
      const deterministicDepth = await this.tryDepthShortcut(userText, available);
      if (deterministicDepth) {
        return deterministicDepth;
      }

      const deterministicSpeed = await this.trySpeedShortcut(userText, available);
      if (deterministicSpeed) {
        return deterministicSpeed;
      }
    }

    const plan = await this.planExecution(userText, history, available, vesselContext ?? null);
    if (!plan || !plan.useMarine || plan.calls.length === 0) {
      return null;
    }

    const results: ToolCallResult[] = [];
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

    return await this.composeFinalAnswer(userText, history, plan, results, vesselContext ?? null);
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
      '{"useMarine":boolean,"notes":"string","calls":[{"server":"signalk|influx","tool":"name","arguments":{}}]}',
      "Rules:",
      "- useMarine=true only if the user asks for live boat telemetry or time-series trends.",
      "- choose at most 4 calls.",
      "- use only tools listed below.",
      "- for Influx queries use tool query-data with arguments {org, query}.",
      "- for SignalK use listed tools only.",
      "- when unsure, return useMarine=false with empty calls.",
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

    const raw = await this.ollama.respondMessages(messages);
    return parsePlannedExecution(raw, available, this.config.marineMcpMaxCalls);
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
}
