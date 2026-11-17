import test from "node:test";
import assert from "node:assert/strict";
import { compareLongCallWithLongPerp } from "./comparison.js";

test("long call loss cannot exceed paid premium at expiry", () => {
  const r = compareLongCallWithLongPerp({
    entryPrice: 1, exitPrice: 0.5, strikePrice: 1, underlyingUnits: 100,
    optionPremiumUsd: 25, marginUsd: 25, leverage: 5
  });
  assert.equal(r.callNetPnlUsd, -25);
  assert.equal(r.callMaxLossUsd, 25);
  assert.equal(r.perpNetPnlUsd, -62.5);
});
test("call has break-even above strike at expiry", () => {
  const r = compareLongCallWithLongPerp({
    entryPrice: 1, exitPrice: 1.5, strikePrice: 1.1, underlyingUnits: 100,
    optionPremiumUsd: 20, marginUsd: 20, leverage: 3
  });
  assert.ok(Math.abs(r.callBreakevenPrice - 1.3) < 1e-9);
  assert.ok(Math.abs(r.callNetPnlUsd - 20) < 1e-9);
});
test("rejects invalid parameters", () => assert.throws(() => compareLongCallWithLongPerp({
  entryPrice: 0, exitPrice: 1, strikePrice: 1, underlyingUnits: 1, optionPremiumUsd: 1,
  marginUsd: 1, leverage: 5
})));
