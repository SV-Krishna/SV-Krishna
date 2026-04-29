import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { loadConfig } from "../config";
import { MarineMcpOrchestrator, MARINE_TELEMETRY_UNAVAILABLE_REPLY } from "../services/marineMcpOrchestrator";
import type { AppConfig } from "../types";

process.env.MARINE_FAST_MODE = "false";
process.env.MARINE_DETERMINISTIC_SHORTCUTS = "false";

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

interface MockOllamaResponses {
  planner: string;
  synthesis: string;
  nativeToolCalls?: Array<{
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

const startMockOllama = async (responses: MockOllamaResponses) => {
  let requestCount = 0;

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "POST" || request.url !== "/api/chat") {
      response.statusCode = 404;
      response.end("not found");
      return;
    }

    const payload = (await readJsonBody(request)) as {
      messages?: Array<{ role?: string; content?: string }>;
      tools?: unknown[];
    };
    const system = payload.messages?.find((item) => item.role === "system")?.content ?? "";

    requestCount += 1;
    if (Array.isArray(payload.tools) && payload.tools.length > 0) {
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          message: {
            content: "",
            tool_calls: responses.nativeToolCalls ?? [],
          },
        }),
      );
      return;
    }

    const content = system.includes("marine MCP tool planner") ? responses.planner : responses.synthesis;

    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ message: { content } }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind mock Ollama server");
  }

  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    requests: () => requestCount,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};

const buildConfig = (ollamaEndpoint: string): AppConfig => {
  const config = loadConfig();
  const fixturePath = join(process.cwd(), "dist", "fixtures", "mcpMockServer.js");

  return {
    ...config,
    marineTelemetryEnabled: true,
    signalKUrl: "http://127.0.0.1:3300",
    signalKToken: "",
    influxdbUrl: "http://127.0.0.1:8087",
    influxdbOrg: "svkrishna",
    influxdbBucket: "signalk",
    influxdbToken: "test-token",
    signalkMcpCommand: "node",
    signalkMcpArgs: `${fixturePath} signalk`,
    influxdbMcpCommand: "node",
    influxdbMcpArgs: `${fixturePath} influx`,
    marineMcpRequestTimeoutMs: 3000,
    marineMcpMaxCalls: 4,
    services: config.services.map((service) =>
      service.name === "ollama" ? { ...service, url: ollamaEndpoint } : service,
    ),
  };
};

test("MarineMcpOrchestrator executes planned MCP calls and synthesizes final reply", async () => {
  const ollama = await startMockOllama({
    planner: JSON.stringify({
      useMarine: true,
      notes: "Use live battery path and trend query",
      calls: [
        {
          server: "signalk",
          tool: "getPathValue",
          arguments: { path: "electrical.batteries.house.voltage" },
        },
        {
          server: "influx",
          tool: "query-data",
          arguments: {
            org: "svkrishna",
            query: 'from(bucket: "signalk") |> range(start: -6h) |> limit(n: 1)',
          },
        },
      ],
    }),
    synthesis: "House battery is at 12.6V and the recent trend appears stable. Source: SignalK and InfluxDB MCP.",
  });

  const orchestrator = new MarineMcpOrchestrator(buildConfig(ollama.endpoint));

  try {
    const reply = await orchestrator.tryRespond("What is my house battery now and trend over 6h?", []);
    assert.equal(
      reply,
      "House battery is at 12.6V and the recent trend appears stable. Source: SignalK and InfluxDB MCP.",
    );
    assert.equal(ollama.requests(), 3);
  } finally {
    await orchestrator.shutdown();
    await ollama.close();
  }
});

test("MarineMcpOrchestrator executes native Ollama tool calls before planner fallback", async () => {
  const ollama = await startMockOllama({
    planner: JSON.stringify({ useMarine: false, needsClarification: false, calls: [] }),
    synthesis: "Current depth is 12.6 m.\nSource: SignalK MCP.",
    nativeToolCalls: [
      {
        type: "function",
        function: {
          name: "signalk_execute_code",
          arguments: JSON.stringify({
            code: [
              "(async () => {",
              '  return JSON.stringify({ path: "environment.depth.belowTransducer", value: 12.6, units: "m" });',
              "})()",
            ].join("\n"),
          }),
        },
      },
    ],
  });

  const orchestrator = new MarineMcpOrchestrator(buildConfig(ollama.endpoint));

  try {
    const reply = await orchestrator.tryRespond("What is our current depth?", []);
    assert.equal(reply, "Current depth is 12.6 m.\nSource: SignalK MCP.");
    assert.equal(ollama.requests(), 2);
  } finally {
    await orchestrator.shutdown();
    await ollama.close();
  }
});

test("MarineMcpOrchestrator skips MCP flow for non-marine prompts", async () => {
  const ollama = await startMockOllama({
    planner: JSON.stringify({ useMarine: false, needsClarification: false, calls: [] }),
    synthesis: "unused",
  });

  const orchestrator = new MarineMcpOrchestrator(buildConfig(ollama.endpoint));

  try {
    const reply = await orchestrator.tryRespond("Summarize this PDF chapter about bearings", []);
    assert.equal(reply, null);
    assert.equal(ollama.requests(), 2);
  } finally {
    await orchestrator.shutdown();
    await ollama.close();
  }
});

test("MarineMcpOrchestrator returns clarification question for ambiguous marine requests", async () => {
  const ollama = await startMockOllama({
    planner: JSON.stringify({
      useMarine: true,
      needsClarification: true,
      clarificationQuestion: "Do you mean true wind speed or apparent wind speed?",
      calls: [],
    }),
    synthesis: "unused",
  });

  const orchestrator = new MarineMcpOrchestrator(buildConfig(ollama.endpoint));

  try {
    const reply = await orchestrator.tryRespond("What is our current wind speed?", []);
    assert.equal(reply, "Do you mean true wind speed or apparent wind speed?");
    assert.equal(ollama.requests(), 2);
  } finally {
    await orchestrator.shutdown();
    await ollama.close();
  }
});

test("MarineMcpOrchestrator returns unavailable message when tool calls fail", async () => {
  const ollama = await startMockOllama({
    planner: JSON.stringify({
      useMarine: true,
      needsClarification: false,
      calls: [
        {
          server: "signalk",
          tool: "getPathValue",
          arguments: { path: "force.error" },
        },
      ],
    }),
    synthesis: "unused",
  });

  const orchestrator = new MarineMcpOrchestrator(buildConfig(ollama.endpoint));

  try {
    const reply = await orchestrator.tryRespond("What is our current depth?", []);
    assert.equal(reply, MARINE_TELEMETRY_UNAVAILABLE_REPLY);
    assert.equal(ollama.requests(), 2);
  } finally {
    await orchestrator.shutdown();
    await ollama.close();
  }
});
