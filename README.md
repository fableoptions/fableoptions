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

## Next gates

1. Verify the options venue's mainnet deployment, independent audits, SDK, token eligibility and funded counterparties.
2. Confirm legal distribution eligibility before enabling any real-money contract.
3. Implement persistent history, backfill, pool identity and verified Pump.fun provenance.
4. Add monitoring, retries, stale-feed alerts and a frontend consuming the events.

See [docs/architecture.md](docs/architecture.md).
