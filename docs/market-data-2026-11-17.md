# Fable market-data hardening — 2026-11-17

## Verified implementation
- Added PostgreSQL integration tests for market samples, source provenance, the $300K threshold, stale-price gaps, and out-of-order writes.
- Fixed PostgreSQL's ambiguous timestamp parameter in `recordPrice`; this previously caused the worker's production sampling requests to fail.
- Sampled DexScreener data remains supported for DEX pools. **FDV is never substituted for the market-cap field.**
- Added SOL-quoted **non-Mayhem, incomplete** Pump.fun bonding-curve estimates from mainnet via RPC `getMultipleAccounts`, using official Pump IDL account layout. A fresh CoinGecko SOL/USD reference is required. Invalid owners, quote mints, unparseable reserves and completed curves are skipped. A token with no qualified price remains **unpriced**.
- Prioritize near-threshold and recent launches within the limited polling budget. Exclude launches more than two days old from sampling.
- API scanner health now includes market-source counts and the number of recently sampled tokens above $300K.

## Concrete production evidence
The prior worker logged `inconsistent types deduced for parameter $5`, which was corrected in PostgreSQL integration tests.

The first onchain-enabled Railway run reported:
```json
{"queried":20,"dexMatched":1,"curveMatched":11,"priced":12,"unpriced":8,"observedCrossings":0,"curveFailure":null,"settlementOracle":false}
```
A subsequent prioritized run reported:
```json
{"queried":20,"dexMatched":0,"curveMatched":10,"priced":10,"unpriced":10,"observedCrossings":0,"curveFailure":null,"settlementOracle":false}
```
These are runtime observations, **not** proof of overall recall, fresh $300K event detection, or exchange trading capability.

## Official protocol sources
- https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json — current BondingCurve account discriminator/layout, quote mint and modes.
- https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md — native SOL quote mint is represented as the default public key in account state.
- https://solana.pump.fun/docs/bonding-curve — pricing during the bonding-curve phase and migration to PumpSwap.

## Important limits
- SOL/USD is a third-party reference; sampling values are not suitable for settling derivatives.
- Non-SOL quotes, mayhem-mode and completed curves are excluded from direct-reserve estimates. Completed coins can still be priced when DexScreener publishes a usable DEX pair.
- The Helius/RPC provider may rate-limit, as may CoinGecko and DexScreener.
- A batch sampling only 20 mints at a time **cannot guarantee coverage** of all new Pump.fun launches or fast $300K crosses. A dedicated replayable stream or paid indexer is needed for completeness; do not represent this as exhaustive real-time coverage.
- Eligibility, collateral, legal review and audited options settlement remain absent. Do not advertise live options execution.

## Decision that requires project-owner approval
Before investing in a higher-rate indexing subscription or a specialized PumpSwap/mayhem pricing provider, confirm the monthly spending limit. Do not turn on paid services on the assumption that future token creator fees will cover them.
