# Fable Options

Open-source foundation for a Solana memecoin options discovery platform.

> **Status: infrastructure prototype only.** No live options, deposits, custody, or real-money execution is implemented. The token feed is **not** a representation of executable options liquidity. Never send funds to this repository or assume a listed token has options available.

## First milestone: $300K crossing scanner

A small TypeScript service polls GeckoTerminal's Solana new-pools feed, checks token metadata and USD market cap, and emits an event **only when an observed token moves from below $300,000 to at or above $300,000**.

Important limitations:
- New-pool feeds are sampled, paginated, rate-limited and **not exhaustive**. Tokens first observed above the threshold are marked `first_seen_above`, **not** falsely described as having just crossed.
- Market cap is a provider estimate, may be null or unreliable, and is not a settlement oracle.
- Pump.fun origin detection needs independently verified launchpad provenance. The initial scanner flags **Solana new pools**, not verified Pump.fun launches.
- Scanner restarts lose history unless a persistent store is added.
- No option quote is shown without a verified, executable options provider.

## Quick start

```bash
npm install
npm run check
npm run scanner
```

Environment variables: `POLL_INTERVAL_MS` (default 30000), `THRESHOLD_USD` (default 300000), `GECKO_PAGES` (default 2). Public GeckoTerminal API availability and rate limits may change.

## Persistent monitoring (experimental)

Run `npm run monitor` to discover new Solana pools and keep a JSON snapshot at `data/tokens.json` across restarts. The monitor rotates through up to 20 previously discovered mints per cycle (configurable with `MAX_TRACKED_PER_CYCLE`) and refreshes their pool data. This is **not complete Pump.fun coverage**, not an onchain launch stream, and not production-safe storage. With enough tracked tokens and API rate limits, updates may be delayed significantly.

The persistent monitor is a separate experimental entry point from `npm run scanner`. Set `STATE_FILE` to change its snapshot path. Do not run multiple writers on the same file. No verified Pump.fun provenance or options trading is implemented.

## Direct program activity (experimental)

`npm run pump:stream` listens for transactions mentioning a configured Solana program. You must supply `SOLANA_WS_URL` and an independently verified `PUMP_PROGRAM_ID`. This is **not yet a decoded Pump.fun launch indexer**. See [docs/pump-indexer.md](docs/pump-indexer.md).

## Next gates

1. Verify the options venue's mainnet deployment, independent audits, SDK, token eligibility and funded counterparties.
2. Confirm legal distribution eligibility before enabling any real-money contract.
3. Implement persistent history, backfill, pool identity and verified Pump.fun provenance.
4. Add monitoring, retries, stale-feed alerts and a frontend consuming the events.

See [docs/architecture.md](docs/architecture.md).
