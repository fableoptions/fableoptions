# Fable real-money options integration: go/no-go gates

**Current status:** No verified options venue, executable quote API, or mainnet execution adapter exists in this repository. No customer funds can be accepted.

## Candidate diligence (NOT endorsements)

- POC / Tender: investigate whether externally listed Pump.fun assets are supported, whether liquidity is available, security audits, operating terms, and jurisdiction policy.
- Epicentral OPX: verify deployed mainnet programs, independent audits, working SDK, quote sourcing, and integration permission.
- Opta: verify whether production mainnet is independently audited and has oracle coverage for new Pump.fun mints.
- Skew: verify audited production deployment and actual executable liquidity.

Never infer audit status from a project's own "audited" claims. Verify original reports, exact program IDs, commit hashes, unresolved findings and upgraded program authorities. Obtain legal counsel for market access; a jurisdiction allowlist alone is not enough.

## Integration contracts

- `UnderlylingEligibility` is separate from `OptionQuote`; token discovery must never display fictitious executable quotes.
- Trade requests are denied unless quote is firm, funded, current, correctly tied to an eligible underlying and verified provider.
- Verify asset mint, decimals, slippage, signature authority, expiry, collateral, oracle, settlement and cancellation before enabling execution.
- A real provider adapter must explicitly bind to the verified onchain program IDs, not arbitrary contract addresses supplied by a client.
- Implement KYC, sanctions, restricted jurisdictions, abuse prevention and any required licensing obligations with counsel and approved providers.

**Do not turn on real-money trading until every gate is independently confirmed.**
