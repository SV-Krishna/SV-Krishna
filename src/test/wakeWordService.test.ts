import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../config";
import { WakeWordService, type WakeWordEvent } from "../services/wakeWordService";

test("WakeWordService forwards immediate and captured wake events", async () => {
  const config = loadConfig();
  const received: WakeWordEvent[] = [];
  const service = new WakeWordService(config, async (event) => {
    received.push(event);
  });

  await (service as any).handleDetectorLine(
    JSON.stringify({
      event: "wake-detected",
      phrase: "Krishna",
      score: 0.71,
      detectedAt: "2026-06-05T13:55:53Z",
    }),
  );

  await (service as any).handleDetectorLine(
    JSON.stringify({
      event: "wake-captured",
      phrase: "Krishna",
      score: 0.71,
      detectedAt: "2026-06-05T13:55:53Z",
      filePath: "/tmp/wake-buffer.wav",
    }),
  );

  assert.deepEqual(received, [
    {
      event: "wake-detected",
      phrase: "Krishna",
      score: 0.71,
      detectedAt: "2026-06-05T13:55:53Z",
      filePath: undefined,
    },
    {
      event: "wake-captured",
      phrase: "Krishna",
      score: 0.71,
      detectedAt: "2026-06-05T13:55:53Z",
      filePath: "/tmp/wake-buffer.wav",
    },
  ]);
});
