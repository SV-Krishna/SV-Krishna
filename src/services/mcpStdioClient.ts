import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: number;
  result: unknown;
}

interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: number;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcMessage = JsonRpcSuccess | JsonRpcFailure | JsonRpcNotification;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

const splitCommandArgs = (value: string): string[] => {
  const matches = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return matches.map((part) => part.replace(/^(["'])(.*)\1$/, "$2"));
};

const toError = (message: string, detail?: unknown): Error => {
  const suffix = detail ? ` (${JSON.stringify(detail)})` : "";
  return new Error(`${message}${suffix}`);
};

export class McpStdioClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private readBuffer = "";
  private initialized = false;

  constructor(
    private readonly name: string,
    private readonly command: string,
    private readonly argsRaw: string,
    private readonly env: NodeJS.ProcessEnv,
    private readonly requestTimeoutMs: number,
  ) {}

  async start(): Promise<void> {
    if (this.process && this.initialized) {
      return;
    }

    if (this.process) {
      this.shutdown();
    }

    const args = splitCommandArgs(this.argsRaw);
    this.process = spawn(this.command, args, {
      stdio: "pipe",
      env: {
        ...process.env,
        ...this.env,
      },
    });

    this.process.stdout.on("data", (chunk: Buffer | string) => {
      const payload = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
      this.readBuffer += payload;
      this.processFrames();
    });

    this.process.stderr.on("data", () => {
      // Servers log protocol status to stderr by design; keep quiet unless request fails.
    });

    this.process.on("exit", (code, signal) => {
      const reason = `MCP process '${this.name}' exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
      for (const [id, pending] of this.pending.entries()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(reason));
        this.pending.delete(id);
      }
      this.process = null;
      this.readBuffer = "";
      this.initialized = false;
    });

    const initResult = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "sv-krishna",
        version: "0.1.0",
      },
    });

    if (!initResult || typeof initResult !== "object") {
      throw new Error(`MCP initialize failed for ${this.name}`);
    }

    this.notify("notifications/initialized", {});
    this.initialized = true;
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const result = await this.request("tools/list", {});
    if (!result || typeof result !== "object") {
      return [];
    }

    const tools = (result as { tools?: unknown }).tools;
    if (!Array.isArray(tools)) {
      return [];
    }

    return tools
      .filter((tool) => typeof tool === "object" && tool !== null)
      .map((tool) => {
        const value = tool as Record<string, unknown>;
        return {
          name: typeof value.name === "string" ? value.name : "unknown",
          description: typeof value.description === "string" ? value.description : undefined,
          inputSchema: value.inputSchema,
        };
      })
      .filter((tool) => tool.name !== "unknown");
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return await this.request("tools/call", {
      name,
      arguments: args,
    });
  }

  shutdown(): void {
    if (!this.process) {
      return;
    }

    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`MCP process '${this.name}' was shut down`));
      this.pending.delete(id);
    }

    this.process.kill("SIGTERM");
    this.process = null;
    this.readBuffer = "";
    this.initialized = false;
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    if (!this.process) {
      throw new Error(`MCP client '${this.name}' is not running`);
    }

    const id = this.nextId++;
    const message: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timeout (${this.name} ${method})`));
      }, this.requestTimeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      this.writeMessage(message);
    });
  }

  private notify(method: string, params?: unknown): void {
    const message: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };
    this.writeMessage(message);
  }

  private writeMessage(message: JsonRpcRequest | JsonRpcNotification): void {
    if (!this.process) {
      return;
    }

    // MCP stdio transport uses newline-delimited JSON-RPC messages.
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private processFrames(): void {
    while (true) {
      const newlineIndex = this.readBuffer.indexOf("\n");
      if (newlineIndex === -1) {
        return;
      }

      const payloadRaw = this.readBuffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.readBuffer = this.readBuffer.slice(newlineIndex + 1);

      if (payloadRaw.trim().length === 0) {
        continue;
      }

      let message: JsonRpcMessage;
      try {
        message = JSON.parse(payloadRaw) as JsonRpcMessage;
      } catch {
        continue;
      }

      this.processMessage(message);
    }
  }

  private processMessage(message: JsonRpcMessage): void {
    if (!("id" in message) || typeof message.id !== "number") {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(message.id);

    if ("error" in message && message.error) {
      pending.reject(toError(`MCP error in ${this.name}`, message.error));
      return;
    }

    if ("result" in message) {
      pending.resolve(message.result);
      return;
    }

    pending.reject(new Error(`Invalid MCP response from ${this.name}`));
  }
}
