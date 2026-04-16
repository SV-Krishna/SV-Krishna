import { EventEmitter } from "node:events";
import readline from "node:readline";

type InputEventMap = {
  "push-to-talk": [];
  "text-mode": [];
  "reindex-rag": [];
  help: [];
  quit: [];
};

export class TerminalInput extends EventEmitter<InputEventMap> {
  private active = false;
  private pushToTalkKey = "space";
  private readonly onData = (chunk: string): void => {
    this.handleChunk(chunk);
  };

  start(pushToTalkKey: string): void {
    if (this.active) {
      return;
    }

    this.pushToTalkKey = pushToTalkKey;
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", this.onData);

    this.active = true;
  }

  handleChunk(chunk: string): void {
    if (chunk === "\u0003" || chunk === "q") {
      this.emit("quit");
      return;
    }

    if (chunk === "h") {
      this.emit("help");
      return;
    }

    if (chunk === "t") {
      this.emit("text-mode");
      return;
    }

    if (chunk === "r") {
      this.emit("reindex-rag");
      return;
    }

    if ((this.pushToTalkKey === "space" && chunk === " ") || chunk === this.pushToTalkKey) {
      this.emit("push-to-talk");
    }
  }

  async promptText(prompt: string): Promise<string> {
    const stdin = process.stdin;
    stdin.removeListener("data", this.onData);
    stdin.setRawMode?.(false);

    const rl = readline.createInterface({
      input: stdin,
      output: process.stdout,
    });

    try {
      const answer = await new Promise<string>((resolve) => {
        rl.question(prompt, resolve);
      });
      return answer.trim();
    } finally {
      rl.close();
      stdin.setRawMode?.(true);
      stdin.resume();
      stdin.setEncoding("utf8");
      stdin.on("data", this.onData);
    }
  }

  stop(): void {
    if (!this.active) {
      return;
    }

    process.stdin.setRawMode?.(false);
    process.stdin.pause();
    process.stdin.removeListener("data", this.onData);
    this.active = false;
  }
}
