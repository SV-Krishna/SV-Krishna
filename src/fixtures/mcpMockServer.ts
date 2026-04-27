import { stdin, stdout } from "node:process";

type JsonRpcId = number;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

const serverType = process.argv[2] === "influx" ? "influx" : "signalk";

const availableTools =
  serverType === "signalk"
    ? [
        {
          name: "getPathValue",
          description: "Get a SignalK path value",
          inputSchema: { type: "object", properties: { path: { type: "string" } } },
        },
      ]
    : [
        {
          name: "query-data",
          description: "Query InfluxDB using Flux",
          inputSchema: {
            type: "object",
            properties: {
              org: { type: "string" },
              query: { type: "string" },
            },
          },
        },
      ];

const writeMessage = (payload: unknown): void => {
  stdout.write(`${JSON.stringify(payload)}\n`);
};

const handleRequest = (message: JsonRpcRequest): void => {
  if (message.method === "initialize") {
    writeMessage({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        serverInfo: {
          name: `mock-${serverType}`,
          version: "1.0.0",
        },
      },
    });
    return;
  }

  if (message.method === "tools/list") {
    writeMessage({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        tools: availableTools,
      },
    });
    return;
  }

  if (message.method === "tools/call") {
    const params = (message.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    if (serverType === "signalk" && params.name === "getPathValue") {
      const path = typeof params.arguments?.path === "string" ? params.arguments.path : "unknown";
      writeMessage({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          content: [
            {
              type: "text",
              text: `SIGNALK ${path}=12.6`,
            },
          ],
        },
      });
      return;
    }

    if (serverType === "influx" && params.name === "query-data") {
      writeMessage({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          content: [
            {
              type: "text",
              text: "INFLUX trend=stable",
            },
          ],
        },
      });
      return;
    }

    writeMessage({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32601,
        message: `Unknown tool for ${serverType}`,
      },
    });
    return;
  }

  if (message.method === "notifications/initialized") {
    return;
  }

  writeMessage({
    jsonrpc: "2.0",
    id: message.id,
    error: {
      code: -32601,
      message: `Unsupported method: ${message.method}`,
    },
  });
};

let buffer = "";

const processBuffer = (): void => {
  while (true) {
    const separator = buffer.indexOf("\n");
    if (separator === -1) {
      return;
    }

    const line = buffer.slice(0, separator).replace(/\r$/, "");
    buffer = buffer.slice(separator + 1);
    if (line.trim().length === 0) {
      continue;
    }

    try {
      const message = JSON.parse(line) as JsonRpcRequest;
      if (typeof message.id === "number" && typeof message.method === "string") {
        handleRequest(message);
      }
    } catch {
      // ignore malformed frame
    }
  }
};

stdin.on("data", (chunk: Buffer | string) => {
  buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
  processBuffer();
});

stdin.resume();
