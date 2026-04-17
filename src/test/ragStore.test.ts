import test from "node:test";
import assert from "node:assert/strict";
import { getDocumentHints, hasTrustedSources, inferDocumentKey, rankChunks, splitIntoChunks, tokenize } from "../services/ragStore";
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
      docKey: "manual-a",
      source: "manual-a.pdf",
      text: "The bilge pump switch is near the helm.",
      tokens: tokenize("The bilge pump switch is near the helm."),
      pageStart: 4,
      pageEnd: 4,
      heading: "Bilge pump switch",
      sectionPath: ["manual-a", "General"],
    },
    {
      id: "b:0",
      docKey: "manual-b",
      source: "manual-b.pdf",
      text: "The engine start checklist covers battery and fuel isolation.",
      tokens: tokenize("The engine start checklist covers battery and fuel isolation."),
      pageStart: 12,
      pageEnd: 12,
      heading: "Engine start checklist",
      sectionPath: ["manual-b", "Fuel System"],
    },
  ];

  const results = rankChunks(chunks, "Where is the bilge pump switch?", 2);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.source, "manual-a.pdf");
  assert.match(results[0]?.text ?? "", /bilge pump switch/i);
  assert.equal(results[0]?.pageStart, 4);
});

test("rankChunks narrows excerpts around the most relevant sentence", () => {
  const longText = [
    "This instrument has several menu screens for configuration.",
    "To set the minimum depth alarm press SPEED and TRIP simultaneously.",
    "Use TRIP to decrement the setting and TOTAL to increment it.",
    "Press SPEED to store the new shallow alarm value.",
    "The backlight can be changed separately.",
  ].join(" ");

  const chunks: RagChunk[] = [
    {
      id: "c:0",
      docKey: "clipper",
      source: "clipper.pdf",
      text: longText,
      tokens: tokenize(longText),
      pageStart: 10,
      pageEnd: 10,
      heading: "Minimum depth alarm",
      sectionPath: ["clipper", "Depth Alarm"],
    },
  ];

  const [result] = rankChunks(chunks, "How do I set the minimum depth alarm?", 1);
  assert.ok(result);
  assert.match(result.text, /minimum depth alarm/i);
  assert.match(result.text, /Press SPEED and TRIP simultaneously/i);
  assert.doesNotMatch(result.text, /backlight/i);
});

test("document hint extraction recognizes named manuals", () => {
  assert.deepEqual(getDocumentHints("According to the BUKH DV20 manual"), ["bukh"]);
  assert.deepEqual(getDocumentHints("According to the Clipper Duet manual"), ["clipper"]);
  assert.equal(inferDocumentKey("Work Shop Manual - BUKH DV 20 ME.pdf"), "bukh");
});

test("hasTrustedSources rejects empty and weak retrieval sets", () => {
  assert.equal(hasTrustedSources([]), false);
  assert.equal(
    hasTrustedSources([
      {
        source: "a.pdf",
        text: "weak",
        score: 3,
        pageStart: 1,
        pageEnd: 1,
      },
    ]),
    false,
  );
  assert.equal(
    hasTrustedSources([
      {
        source: "a.pdf",
        text: "strong",
        score: 12,
        pageStart: 1,
        pageEnd: 1,
      },
    ]),
    true,
  );
});
