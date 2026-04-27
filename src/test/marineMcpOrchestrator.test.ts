import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { loadConfig } from "../config";
import { MarineMcpOrchestrator } from "../services/marineMcpOrchestrator";
import type { AppConfig } from "../types";

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const startMockOllama = async (responses: { planner: string; synthesis: string }) => {
  let requestCount = 0;

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "POST" || request.url !== "/api/chat") {
      response.statusCode = 404;
      response.end("not found");
      return;
    }

    const payload = (await readJsonBody(request)) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const system = payload.messages?.find((item) => item.role === "system")?.content ?? "";

    requestCount += 1;

    const content = system.includes("marine MCP tool planner")
      ? responses.planner
      : responses.synthesis;

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
    assert.equal(ollama.requests(), 2);
  } finally {
    await orchestrator.shutdown();
    await ollama.close();
  }
});

test("MarineMcpOrchestrator skips MCP flow for non-marine prompts", async () => {
  const ollama = await startMockOllama({
    planner: JSON.stringify({ useMarine: true, calls: [] }),
    synthesis: "unused",
  });

  const orchestrator = new MarineMcpOrchestrator(buildConfig(ollama.endpoint));

  try {
    const reply = await orchestrator.tryRespond("Summarize this PDF chapter about bearings", []);
    assert.equal(reply, null);
    assert.equal(ollama.requests(), 0);
  } finally {
    await orchestrator.shutdown();
    await ollama.close();
  }
});
