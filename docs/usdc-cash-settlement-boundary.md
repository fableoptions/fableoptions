# Fable — capped options with USDC payouts (November 17, 2026)

**Status: research and read-only simulations; NO real trade, NO escrow, NO payout transaction.**

## Agreed user experience

Fable aims for capped European calls and puts on qualifying Solana meme tokens. Buyers pay a premium denominated in native Solana USDC. At maturity, a valid option would pay its contractual intrinsic value, capped at a predetermined maximum, in USDC, with **no physical delivery of the underlying memecoin**.

The payout formula is:
- call: `min(cap, max(expiry USD price - strike USD price, 0) × number of tokens)`
- put: `min(cap, max(strike USD price - expiry USD price, 0) × number of tokens)`

Premium is a separate buyer cost. Sellers must fully lock at least their maximum USDC payout **before** a real option is issued. This locking is **not implemented or verified**.

## Implemented in the repository

- `src/options/usdc-settlement-model.ts` calculates illustrative payouts using **BigInt** smallest-unit amounts. Supports low-price tokens via pico-USD-per-token (10^12) and USDC micro-units (10^6). It rounds hypothetical payouts down to an integer micro-USDC and returns both capped payout and buyer net after premium.
- `GET /v1/options/usdc-payout-preview` provides a read-only sample for caller-supplied hypothetical terms and an untrusted expiry price. All results explicitly set `collateralOnchainVerified:false`, `expiryPriceOracleVerified:false`, `transactionAuthorized:false`, `settled:false`.
- `src/options/usdc-escrow-inspection.ts` reads one finalized SPL token account and checks: Circle native USDC mint, token program, decimals, reported token-account authority, no delegate or close authority, initialized state, and sufficient balance. It returns `fundsLockedForOption:false` **even when all these checks pass**, since balances can move and no audited PDA controls custody.
- `npm run verify:usdc:account` is an operator read-only diagnostic requiring an actual token account address, expected authority and USDC required amount in micro-units. It sends no transactions.
- Tests cover malicious numeric values, exact fractional arithmetic, call/put payouts, cap enforcement, native versus spoofed USDC mint, wrong authority, insufficient balance, and RPC rate limits.

## Verified references

Circle's native Solana USDC mint is:
`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

Official Circle reference:
https://help.circle.com/support/en/usdc-supported-blockchains-minting-redemption-faqs?id=kb_article_view&sysparm_article=KB0010590

Solana parsed SPL account schema:
https://solana.com/docs/rpc/json-structures

## What prevents real-money release

1. There is no Fable-verified, independently audited options program with an immutable or appropriately controlled code upgrade path and escrow PDA capable of issuing, exercising, expiring and refunding capped USDC-settled contracts.
2. A caller-provided price or DEX-sourced TWAP is **not** a permissionless, manipulation-resistant contractual settlement oracle. Fresh Pump.fun tokens lack reliable independent price references.
3. The seller's real collateral must be verified as exclusively committed to the contract, with precise mint and decimals, position-specific balance accounting, finality, no shared-collateral double-counting, expiry/liveness/dispute handling and replay protection.
4. No independently confirmed market makers or executable quotes/filled orderflow exist for arbitrary newly launched tokens.
5. Security audit and legal/jurisdictional review are incomplete.

Do not launch Fable as a functioning options exchange, invite deposits, accept mainnet token transfers, advertise USDC payouts as available, or equate a price-preview result with an actual settled position.

**No new paid infrastructure or token mint has been provisioned by this work.**
