# Fable — Bundled launches, manipulated pricing and option eligibility

**Status:** Conservative risk-screen implementation; live options trading is disabled independently of this policy.

## Threat model

Pump.fun launches can include same-block buying, coordinated wallets, concentrated holders, sharp bonding-curve price movements, and markets where the displayed capitalization greatly exceeds the funds that could absorb a sale. A market-cap threshold by itself must never enable a derivatives market.

Fable must **not** label a launch "fraud" or "confirmed bundle" without transaction-level evidence. Same-block buying is a risk signal, not proof of common beneficial ownership. Token accounts are not automatically distinct users; AMM vaults and custodians must be classified before holder-concentration percentages are interpreted.

References:
- https://solana.pump.fun/docs/bonding-curve
- https://solana.com/docs/rpc/http/gettokenlargestaccounts
- https://bitquery.io/investigations/pump-fun-snipers-bundles (published 2026; independent third-party analysis, not an official Solana dataset)

## Implemented fail-closed screening

`src/options/token-risk.ts` requires, at minimum, a recently sampled >$300K cap, verified external liquidity of at least $30K, an independently established token age >= 60 minutes, properly classified owner concentrations below 15% largest holder and 50% top ten, assessed launch-bundle and volume-manipulation evidence, mint/freeze authorities reviewed, and an independent price check. These are **initial conservative engineering defaults, not validated guarantees of market safety**.

- Strongly concerning data is blocked.
- Missing evidence means manual review, **not eligibility**.
- A clean screen is only `passed_screen_not_tradable` and still cannot authorize a contract.
- Onchain bonding curves priced through `pump_bonding_curve_solana` currently have `liquidityUsd:null` because virtual reserves are NOT externally redeemable liquidity. They are not silently treated as satisfying the liquidity threshold.
- Missing launch-bundle, true ownership, or volume checks stay `unknown`; they cannot be automatically marked safe by the scanner.

`GET /v1/options/token-risk?mint=<tracked mint>` returns read-only current risk. Scanner `/v1/launches` and `/v1/discovery` include the same conservative risk field.

## Additional verified sources needed before opening an option market

1. Historical launch-slot transaction reconstruction and same-block buyers, where permitted by data provider.
2. First-wallet funding links and common-control inference with confidence scores; no one-wallet-one-user assumption.
3. Token supply and top-holder accounts, with pool escrow / ATA / custody classification before concentration.
4. Cross-source price checks and measured *sell-side* depth / slippage for realistic contract notionals.
5. Oracle manipulation resistance across expiration; objective disputable/fail-safe settlement rules.
6. Adequate independently funded writer collateral, audited escrow, operational monitoring and legal review.

Current free RPC and indexer limitations mean an absence of flags is **not** evidence a token is safe.

Apply risk gates uniformly, including tokens controlled or sponsored by the platform. No issuer exemptions.

## Operational considerations

The thresholds should be reviewed with realistic liquidity-depth tests and slippage under stress; they are not an offer to trade or a security certification. Do not display `passed_screen_not_tradable` as "safe to buy," "audited," or "approved options market."
