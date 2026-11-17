# Pump.fun direct activity stream (experimental)

Run `npm run pump:stream` with `SOLANA_WS_URL` and a **verified** `PUMP_PROGRAM_ID` in the environment. The collector uses Solana's `logsSubscribe` RPC method and emits transaction signatures mentioning the configured program.

**This is NOT a token launch indexer yet.** A transaction mentioning a program may represent a trade or another instruction; a mint must be derived from validated instruction/event decoding. Program IDs must be independently verified (including migration and newer program versions). The current stream has no historical backfill, durable cursor, or gap recovery, and may miss events on disconnect.

Production requirements:
1. Verify all official Pump.fun program IDs and IDLs from authoritative sources.
2. Decode and validate create instructions, token mint and creator; store signatures with slot and log index as deduplication keys.
3. Add HTTP RPC backfill via `getSignaturesForAddress` and `getTransaction`, using durable checkpointing and pagination.
4. Follow migration pools and price sources, and track market caps for each mint.
5. Monitor WebSocket lag, provider rate limits, gaps and fork/confirmation behavior.
6. Run a separate eligibility and options-availability pipeline; no real-money trading until audit, collateral, liquidity and legal checks pass.
