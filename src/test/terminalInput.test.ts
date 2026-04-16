import test from "node:test";
import assert from "node:assert/strict";
import { TerminalInput } from "../terminal/input";

test("TerminalInput maps keyboard chunks to control events", () => {
  const input = new TerminalInput();
  const events: string[] = [];

  input.on("push-to-talk", () => events.push("push"));
  input.on("text-mode", () => events.push("text"));
  input.on("reindex-rag", () => events.push("reindex"));
  input.on("help", () => events.push("help"));
  input.on("quit", () => events.push("quit"));

  input.handleChunk(" ");
  input.handleChunk("t");
  input.handleChunk("r");
  input.handleChunk("h");
  input.handleChunk("q");
  input.handleChunk("\u0003");

  assert.deepEqual(events, ["push", "text", "reindex", "help", "quit", "quit"]);
});
