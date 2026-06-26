import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WakeWordStore } from "../services/wakeWordStore";

test("WakeWordStore persists enabled state and phrase", async () => {
  const root = await mkdtemp(join(tmpdir(), "svk-wakeword-"));
  try {
    const filePath = join(root, "wake-word.json");
    const store = new WakeWordStore(filePath, "Okay Krishna", false);

    const defaults = await store.get();
    assert.equal(defaults.enabled, false);
    assert.equal(defaults.phrase, "Okay Krishna");

    const saved = await store.save(true, "Okay Krishna");
    assert.equal(saved.enabled, true);
    assert.equal(saved.phrase, "Okay Krishna");
    assert.ok(saved.updatedAt);

    const reloaded = await store.get();
    assert.equal(reloaded.enabled, true);
    assert.equal(reloaded.phrase, "Okay Krishna");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
