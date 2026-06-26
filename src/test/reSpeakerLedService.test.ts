import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../config";
import { ReSpeakerLedService } from "../services/reSpeakerLedService";

test("ReSpeakerLedService performs preflight and applies updated state profiles once per state", async () => {
  const root = await mkdtemp(join(tmpdir(), "svk-led-"));
  const logPath = join(root, "calls.log");
  const hostPath = join(root, "xvf_host");
  await writeFile(
    hostPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}
`,
  );
  await chmod(hostPath, 0o755);

  process.env.RESPEAKER_LED_ENABLED = "true";
  process.env.RESPEAKER_LED_HOST_PATH = hostPath;
  const config = loadConfig();
  const service = new ReSpeakerLedService(config);

  const checks = await service.runPreflightChecks();
  assert.equal(checks.length, 1);
  assert.equal(checks[0]?.ok, true);

  await service.applyState("listening");
  await service.applyState("transcribing");
  await service.applyState("thinking");
  await service.applyState("speaking");
  await service.applyState("idle");
  await service.applyState("speaking");

  const calls = (await readFile(logPath, "utf8"))
    .trim()
    .split("\n")
    .filter((line) => line.length > 0);

  assert.deepEqual(calls, [
    "VERSION",
    "GPO_WRITE_VALUE 33 1",
    "LED_EFFECT 3",
    "LED_COLOR 0xff40",
    "LED_BRIGHTNESS 144",
    "GPO_WRITE_VALUE 33 1",
    "LED_EFFECT 3",
    "LED_COLOR 0xff8c00",
    "LED_BRIGHTNESS 144",
    "GPO_WRITE_VALUE 33 1",
    "LED_EFFECT 2",
    "LED_SPEED 2",
    "LED_BRIGHTNESS 120",
    "GPO_WRITE_VALUE 33 1",
    "LED_EFFECT 1",
    "LED_COLOR 0xff40",
    "LED_SPEED 3",
    "LED_BRIGHTNESS 160",
    "GPO_WRITE_VALUE 33 1",
    "LED_EFFECT 4",
    "LED_DOA_COLOR 0x1030 0xffff",
    "GPO_WRITE_VALUE 33 1",
    "LED_EFFECT 1",
    "LED_COLOR 0xff40",
    "LED_SPEED 3",
    "LED_BRIGHTNESS 160",
  ]);

  delete process.env.RESPEAKER_LED_ENABLED;
  delete process.env.RESPEAKER_LED_HOST_PATH;
});
