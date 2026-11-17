import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersistentTracker } from "./persistent-tracker.js";
const item = (marketCapUsd: number) => ({ mint: "mint1", symbol: "TEST", marketCapUsd, observedAt: new Date().toISOString(), poolAddress: "pool1" });
test("crossing state survives restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fable-"));
  try {
    const file = join(dir, "tracker.json");
    const first = new PersistentTracker(file);
    await first.load();
    assert.equal(first.observe(item(210000)), null);
    await first.save();
    const second = new PersistentTracker(file);
    await second.load();
    assert.equal(second.observe(item(320000))?.type, "crossed_up");
    assert.equal(second.observe(item(340000)), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
