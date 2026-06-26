import test from "node:test";
import assert from "node:assert/strict";
import { parseSignalKOrientation, renderPage, sanitizeUploadFileName } from "../web/webServer";
import { loadConfig } from "../config";

test("sanitizeUploadFileName strips paths and unsafe characters", () => {
  assert.equal(
    sanitizeUploadFileName("../Boat Manual 2026?.pdf"),
    "Boat-Manual-2026-.pdf",
  );
  assert.equal(
    sanitizeUploadFileName("nested/path/checklist"),
    "checklist.pdf",
  );
});

test("parseSignalKOrientation uses attitude radians when present", () => {
  const result = parseSignalKOrientation({
    navigation: {
      attitude: {
        value: {
          yaw: Math.PI / 2,
          pitch: Math.PI / 6,
          roll: -Math.PI / 12,
        },
      },
      headingMagnetic: { value: Math.PI / 4 },
    },
  });
  assert.equal(result.source, "attitude");
  assert.ok(Math.abs(result.yawDeg - 90) < 0.001);
  assert.ok(Math.abs(result.headingMagneticDeg - 45) < 0.001);
  assert.ok(Math.abs(result.pitchDeg - 30) < 0.001);
  assert.ok(Math.abs(result.rollDeg + 15) < 0.001);
});

test("parseSignalKOrientation falls back to heading radians", () => {
  const result = parseSignalKOrientation({
    navigation: {
      headingTrue: { value: Math.PI },
    },
  });
  assert.equal(result.source, "derived");
  assert.ok(Math.abs(result.yawDeg - 180) < 0.001);
  assert.ok(Math.abs(result.headingMagneticDeg - 180) < 0.001);
  assert.equal(result.pitchDeg, 0);
  assert.equal(result.rollDeg, 0);
});

test("renderPage includes wake word toggle and Rasa command route", () => {
  const config = loadConfig();
  config.wakeWordPhrase = "Hey Krishna";
  const html = renderPage(config);
  assert.match(html, /id="wakeWordToggle"/);
  assert.match(html, /Enable "Hey Krishna"/);
  assert.match(html, /\/api\/wake-word/);
  assert.match(html, /\/api\/command/);
  assert.match(html, /Whisper -> Rasa/i);
});
