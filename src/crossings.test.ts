import test from "node:test";
import assert from "node:assert/strict";
import { CrossingTracker } from "./crossings.js";
const observation = (marketCapUsd: number) => ({ mint:"mint1",symbol:"TEST",marketCapUsd,observedAt:new Date(0).toISOString(),poolAddress:"pool1" });
test("distinguishes first seen above from observed crossing",()=>{
  const tracker=new CrossingTracker(300000);
  assert.equal(tracker.observe(observation(250000)),null);
  assert.equal(tracker.observe(observation(310000))?.type,"crossed_up");
  assert.equal(tracker.observe(observation(330000)),null);
  assert.equal(tracker.observe(observation(270000)),null);
  assert.equal(tracker.observe(observation(301000))?.type,"crossed_up");
});
test("first seen above is not called crossing",()=>{
  const tracker=new CrossingTracker();
  assert.equal(tracker.observe(observation(400000))?.type,"first_seen_above");
});
