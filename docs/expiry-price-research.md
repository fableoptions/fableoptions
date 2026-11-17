# Fable — Historical price sampling and indicative cap TWAP

**Status (November 17, 2026):** Read-only historic unit-price and market-cap research tool. Not a Solana options oracle or settlement system.

## Built

- `token_market_samples` in existing PostgreSQL stores each **successful** market-cap estimate with observed timestamp, sample source, pool address and externally reported USD liquidity. An optional distinct `token_price_usd` is persisted **only when DexScreener reports a valid USD unit price**; token price is never inferred from market cap or fully diluted valuation. It is written in the same transaction as existing launch/crossing state.
- Delayed out-of-order estimates are already rejected upstream. A bounded indexed query retrieves at most 500 observations over a 10–60-minute interval.
- `GET /v1/options/expiry-reference?mint=<indexed-mint>&endAt=<ISO-8601>&windowMinutes=30` calculates a time-weighted historical **market-cap estimate**. The caller must provide an end timestamp; no fabricated historic data is supplied.
- The reference requires at least 6 observations, gaps no greater than 120 seconds, a single DexScreener source and pool, reported liquidity at least $30k on *every* sample, no invalid caps and no price doubling/halving in any adjacent interval.
- Inadequate coverage returns `insufficient_data`; source, pool, liquidity, or extreme-jump anomalies return `quarantined`. Both contain **null** result, never a fallback price.
- The most permissive result is `sampled_reference_only`. All responses have `executable:false`, `validSettlementOracle:false`, `underlyingTokenPriceUsd:null`.
- Each ~200 price batches, the existing worker attempts deletion of up to 2,000 samples older than seven days to avoid unbounded database growth.

## What this does NOT solve

Market capitalization is NOT token unit price. Pump bonding-curve cap estimates are excluded from both TWAP calculations since there is no verified independent liquidity, and the DEX source itself is not an independent onchain settlement oracle. A single external source or pool can still be manipulated for 10–60 minutes. A TWAP therefore **does not prove manipulation resistance**.

The unit-price average is only a source-dependent indicative price, NOT a verified settlement mark. No option strike/exercise payoff based on this reference, premium, execution, collateral, escrow, oracle authority, independent market-price verification, dispute mechanism or settlement has been enabled. This endpoint must never be referenced as a contractual settlement source. Production use would require verified token unit prices with mint decimals, price-supply consistency, independent liquidity depth, oracle governance, audited settlement, and legal review.

## Operational validation

Use `npm run check && npm test && npm run test:rfq-integration` against an isolated PostgreSQL test instance. The new tests exercise dense / sparse intervals, flash pumps, source switches, pool changes, zero/missing liquidity and database history integration.

No reliance on extra paid indexers or public API upgrades.
