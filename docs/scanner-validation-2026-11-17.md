# Pump.fun scanner validation — November 17, 2026

## Observed and independently reproduced mainnet launch decoding
A first random RPC sample found no launch instructions and exited nonzero. This was inconclusive, not successful verification.

The deployed scanner subsequently observed a real mainnet Pump.fun `create_v2`:
- Signature: `MupzqxZ856jzjH3EUYymPCwVyYGjHzQ5raxjR8fACwi5eogbvpFMr5thyQiHLfoy8ha17PoJyjZrm2rmTzPH8qi`
- Mint: `31qACV9dPCTbcRky4mv4WRnFFMKy2infA41KHDoTpump`
- Slot: `470580529`

The separate GitHub Actions smoke test retrieved this exact historical signature through Solana RPC and confirmed its mint matches a decoded `create_v2` instruction. A second sampled real `create_v2` was also decoded and account-matched (mint `DQMzpRWcaV7fAMCoVenPmxcLJDCWeHKBfy3XH1XApump`). **2 launch instructions decoded, 2 account-key matches, 0 exclusions** in the test. These are two real examples, not measured population recall.

Evidence:
- Live mainnet test: https://github.com/fableoptions/fableoptions/actions/runs/44112477645
- Backend tests: https://github.com/fableoptions/fableoptions/actions/runs/44112477635

## Automatic bounded recovery
Scanner replays up to 12 recent Pump program signatures every five minutes and records a Postgres checkpoint plus whether it found the previous checkpoint. Missing checkpoint on a full page sets `gap_unresolved`. Pump.fun activity is high-volume: this scan is **not** comprehensive and cannot repair all disconnect gaps. A replay-capable indexing provider or carefully paginated recovery is necessary to establish full coverage.

## Market-cap observations
The price worker now batches DexScreener token-pair requests, keeping the reported `marketCap` distinct from `fdv` and recording the source and pool address. The crossing detector labels discontinuous observations as `first_seen_above`, not a precise crossing, and suppresses repeated above-threshold events when already above.

**No production $300K crossing has been independently verified**, and external API figures are estimates, not a derivative settlement oracle.

## Unresolved release gates
- Independent launch-feed recall and latency benchmark, including long disconnects.
- Real production price samples and verified $300K event evidence.
- Production rate-limit/operational monitoring, manipulation-resistant prices and eligibility checks.
- Real options collateral, settlement and legal/security review; no executable options enabled.
