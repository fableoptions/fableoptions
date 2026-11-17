# Pump.fun scanner validation — 2026-11-17

## Completed
- Read-only live RPC smoke job ran in GitHub Actions and successfully queried a bounded recent program-signature sample.
- The job retrieved 12 program transactions, 2 successfully executed and fetched; **zero** matching create instructions were observed. Its verification status was **FAIL / NOT VALIDATED**, not "verified".
- The unit suite and PostgreSQL RFQ integration suite passed separately.
- Added a 12-signature bounded recovery poll every five minutes to the existing scanner, with Postgres checkpoints and explicit `gap_unresolved` status if the checkpoint is absent from a full page.
- Added scanner health visibility for reconciliation gaps.
- Updated sampled $300K crossing logic to label discontinuous observations `first_seen_above`, not an exact crossing, and to avoid duplicates when the last price already exceeded the threshold.

## What remains unproven
- Decoding authentic create/create_v2 examples against known historical mainnet signatures, including account-key loading on v0 transactions.
- Accuracy/recall against an independent list of Pump.fun launches.
- Full recovery during disconnections: Pump.fun is a high-volume address. Polling 12 signatures every 5 minutes will **usually be insufficient**. Uncovered gaps are explicitly marked unresolved; no false completeness claim.
- Accurate market-cap detection from GeckoTerminal under rate limits and missing market-cap fields. No settlement-grade oracle exists.

## Safeguards
- No deposits, live options, executable quotes or settlement are enabled.
- No Helius secret is committed to GitHub.
- Mainnet script `npm run verify:pump:mainnet` is read-only and defaults to a small sample.
- Never market this as a complete real-time scanner until coverage is demonstrated or a replay-capable indexing service is integrated.

## Evidence
- Live smoke GitHub Actions: https://github.com/fableoptions/fableoptions/actions/runs/44111235272
- Main backend validation (after test correction): https://github.com/fableoptions/fableoptions/actions/runs/44111368500
