import test from "node:test";
import assert from "node:assert/strict";
import { authorizeOptionTrade } from "./eligibility.js";
import type { ClientEligibility, UnderlyingEligibility } from "./types.js";

const token: UnderlyingEligibility = {
  mint: "So11111111111111111111111111111111111111112",
  marketCapUsd: 310000, poolLiquidityUsd: 40000,
  verifiedPumpFunOrigin: true, optionsMarketVerified: true,
  priceObservedAt: "2026-11-17T12:00:00.000Z"
};
const client: ClientEligibility = {
  jurisdictionAllowed: true, sanctionsScreenClear: true,
  kycCompletedIfRequired: true, eligibilityCheckedAt: "2026-11-17T12:00:00.000Z"
};
const now = new Date("2026-11-17T12:00:01.000Z");
test("does not allow real-money trading without a verified options venue or quote", () => {
  const result = authorizeOptionTrade({ token, client, quote: null, venue: null, now });
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes("VENUE_NOT_VERIFIED"));
  assert.ok(result.reasons.includes("NO_EXECUTABLE_QUOTE"));
});
test("rejects unverified users and thin liquidity", () => {
  const result = authorizeOptionTrade({
    token: { ...token, poolLiquidityUsd: 1000 },
    client: { ...client, jurisdictionAllowed: false },
    quote: null, venue: null, now
  });
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes("INSUFFICIENT_POOL_LIQUIDITY"));
  assert.ok(result.reasons.includes("CLIENT_NOT_VERIFIED"));
});
