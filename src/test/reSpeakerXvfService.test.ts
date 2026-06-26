import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../config";
import { ReSpeakerXvfService } from "../services/reSpeakerXvfService";

test("ReSpeakerXvfService applies configured output routing and reads a snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "svk-xvf-"));
  const logPath = join(root, "calls.log");
  const hostPath = join(root, "xvf_host");
  await writeFile(
    hostPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}
case "$1" in
  VERSION)
    printf 'VERSION 2 0 6\\n'
    ;;
  AUDIO_MGR_OP_L)
    if [ "$#" -gt 1 ]; then
      exit 0
    fi
    printf 'AUDIO_MGR_OP_L MUX_USER_CHOSEN_CHANNELS[8] 0\\n'
    ;;
  AUDIO_MGR_OP_R)
    if [ "$#" -gt 1 ]; then
      exit 0
    fi
    printf 'AUDIO_MGR_OP_R MUX_AEC_RESIDUALS[7] 3\\n'
    ;;
  AEC_SPENERGY_VALUES)
    printf 'AEC_SPENERGY_VALUES 0 10 20 20\\n'
    ;;
  AEC_AZIMUTH_VALUES)
    printf 'AEC_AZIMUTH_VALUES 0.0 1.0 2.0 2.0\\n'
    ;;
esac
`,
  );
  await chmod(hostPath, 0o755);

  process.env.RESPEAKER_XVF_ENABLED = "true";
  process.env.RESPEAKER_XVF_HOST_PATH = hostPath;
  const config = loadConfig();
  const service = new ReSpeakerXvfService(config);

  const checks = await service.runPreflightChecks();
  assert.equal(checks.length, 1);
  assert.equal(checks[0]?.ok, true);

  await service.applyVoiceProfile();
  const snapshot = await service.readSnapshot();
  assert.equal(snapshot?.version, "VERSION 2 0 6");
  assert.match(snapshot?.leftRoute ?? "", /AUDIO_MGR_OP_L/);
  assert.match(snapshot?.rightRoute ?? "", /AUDIO_MGR_OP_R/);
  assert.match(snapshot?.speechEnergy ?? "", /AEC_SPENERGY_VALUES/);
  assert.match(snapshot?.azimuths ?? "", /AEC_AZIMUTH_VALUES/);

  const calls = (await readFile(logPath, "utf8"))
    .trim()
    .split("\n")
    .filter((line) => line.length > 0);

  assert.deepEqual(calls.slice(0, 4), [
    "VERSION",
    "AUDIO_MGR_OP_L 8 0",
    "AUDIO_MGR_OP_R 7 3",
    "VERSION",
  ]);
  assert.deepEqual(
    calls.slice(4).sort(),
    [
      "AEC_AZIMUTH_VALUES",
      "AEC_SPENERGY_VALUES",
      "AUDIO_MGR_OP_L",
      "AUDIO_MGR_OP_R",
    ].sort(),
  );

  delete process.env.RESPEAKER_XVF_ENABLED;
  delete process.env.RESPEAKER_XVF_HOST_PATH;
});
