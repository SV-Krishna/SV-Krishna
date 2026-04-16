import test from "node:test";
import assert from "node:assert/strict";
import { rankChunks, splitIntoChunks, tokenize } from "../services/ragStore";
import type { RagChunk } from "../types";

test("tokenize normalizes lowercase search terms", () => {
  assert.deepEqual(tokenize("Boat speed, NAV mode, ETA."), ["boat", "speed", "nav", "mode", "eta"]);
});

test("splitIntoChunks creates overlapping word windows", () => {
  const chunks = splitIntoChunks(
    "one two three four five six seven eight nine ten eleven twelve",
    5,
    2,
  );

  assert.deepEqual(chunks, [
    "one two three four five",
    "four five six seven eight",
    "seven eight nine ten eleven",
    "ten eleven twelve",
  ]);
});

test("rankChunks prefers chunks with more query overlap", () => {
  const chunks: RagChunk[] = [
    {
      id: "a:0",
      source: "manual-a.pdf",
      text: "The bilge pump switch is near the helm.",
      tokens: tokenize("The bilge pump switch is near the helm."),
    },
    {
      id: "b:0",
      source: "manual-b.pdf",
      text: "The engine start checklist covers battery and fuel isolation.",
      tokens: tokenize("The engine start checklist covers battery and fuel isolation."),
    },
  ];

  const results = rankChunks(chunks, "Where is the bilge pump switch?", 2);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.source, "manual-a.pdf");
  assert.match(results[0]?.text ?? "", /bilge pump switch/i);
});
