# Fable Options

Open-source foundation for a Solana memecoin options discovery platform.

> **Status: infrastructure prototype only.** No live options, deposits, custody, or real-money execution is implemented. The token feed is **not** a representation of executable options liquidity. Never send funds to this repository or assume a listed token has options available.

## Experimental Solana devnet contract

A **new, unaudited Anchor test program** for USDC-style capped calls/puts lives in [devnet/README.md](devnet/README.md). Its Rust source compiles in GitHub CI and [the isolated Solana local-validator execution run](https://github.com/fableoptions/fableoptions/actions/runs/44140237157) **passed** with real test-token transfers through the onchain PDA vault. A separate offchain simulator tests premiums, capped payouts, cancellation, replay rejection and oracle-timeout refund.

**Not deployed on public devnet or mainnet; no real-money escrow, independently verified oracle, fills or payouts exist.** It is strictly separate from the existing read-only Railway scanner/API. Only six-decimal disposable SPL *test tokens* are permitted by design (Circle's real USDC mint is explicitly rejected).

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

## Options execution architecture (not live)

The `src/options/` module introduces a **fail-closed** trade-eligibility boundary. It separates a token's appearance in the $300K discovery feed from the existence of an independently verified, executable options contract. All trading remains **disabled** until a venue is independently verified, legally eligible clients are screened, and firm quotes are actually available. Read [options provider go/no-go gates](docs/options-provider-gates.md).

## Onchain test-token options prototype (verified locally)

The unaudited Anchor program in [devnet/](devnet/) now **compiles to a Solana SBF executable** and has passed a transaction-level lifecycle test against a disposable **local validator** (not public devnet, not mainnet). The test used fake six-decimal SPL tokens and exercised writer collateral escrow, buyer premium funding, mock expiry price, buyer payout, writer refund and rejection of duplicate settlement.

[Passing onchain validator test](https://github.com/fableoptions/fableoptions/actions/runs/44140237157). See [devnet/README.md](devnet/README.md) for tested scope and limitations.

**No real-money options exchange exists yet.** The contract is not publicly deployed or audited; the expiry price is a centrally controlled mock, unsuitable for mainnet USDC settlement. The current production services still refuse deposits and trades.

## Next gates

1. Verify the options venue's mainnet deployment, independent audits, SDK, token eligibility and funded counterparties.
2. Confirm legal distribution eligibility before enabling any real-money contract.
3. Implement persistent history, backfill, pool identity and verified Pump.fun provenance.
4. Add monitoring, retries, stale-feed alerts and a frontend consuming the events.

See [docs/architecture.md](docs/architecture.md).
