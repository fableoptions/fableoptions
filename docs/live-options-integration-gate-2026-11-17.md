# Fable mainnet options settlement integration: verification status (2026-11-17)

**Result: NOT READY. No executable contract venue is certified, and no deposits or trades are enabled.**

## Work done in this review

- Examined the publicly advertised Solana option venues for their suitability for fresh Pump.fun mints and Fable's **capped, European-style, cash-settled** contracts.
- Implemented `src/options/program-attestation.ts`: a read-only verification of the BPF upgradeable-loader program account, linked program-data account, upgrade slot and upgrade authority, querying Solana with `finalized` commitment and checking reasonable slot consistency.
- Implemented `npm run verify:venue:program`, a non-signing operator utility that inspects a *supplied concrete program address*. Missing/unverified program accounts cause exit status 2. It does not accept wallet deposits.
- Implemented `src/options/venue-compatibility.ts`, a contract-specific no-go checklist: verified mainnet program, independent audit matched to deployed binary, permissionless new Pump mint support, capped European cash payoff, reliable token-unit oracle, actual funded escrow and counterparty liquidity, and jurisdictional clearance. A compatibility score never itself enables execution.
- The existing discovery API exposes a read-only `GET /v1/options/integration-gates`, showing all requirements unverified and deposits/trades disabled.

## Concrete mainnet evidence

A GitHub Actions job queried finalized Solana mainnet slot **470609519** for the program ID published by Opta:

`CtzJ4MJYX6BFvF4g67i5C24tQuwRn6ddKkaE5L84z9Cq`

The RPC response contained **no program account at that address**. The job log records `PROGRAM_ACCOUNT_NOT_FOUND`. This is evidence **only about that claimed address at that slot**, not proof that Opta lacks all other programs or deployments. The initial job returned success because it completed its inspection; the command was subsequently changed to fail CI for missing/unverified program accounts.

Evidence: https://github.com/fableoptions/fableoptions/actions/runs/44131947959

## Venue suitability

- **Epicentral** advertises American-style options for most Solana tokens. Public beta/test-fund status, executable collateral, a current auditable mainnet IDL/program and settlement compatibility with Fable's capped European cash contract remain unverified. American physical-settlement semantics are not automatically interchangeable with Fable cash settlement.
- **Opta** advertises Pyth-based options for supported assets; an arbitrary newly launched Pump.fun mint cannot be assumed to have a robust Pyth token price feed. The published program ID was not found on mainnet in our check; there may be another deployment.
- **Skew** documents a devnet options RFQ program for predefined launch assets; it does not establish live arbitrary-Pump-mint mainnet markets.
- **Traction** explicitly describes its open-source implementation as unaudited, so it is not eligible for immediate mainnet user deposits.

Sources:
- https://beta.epicentral.markets/
- https://github.com/nankolib/opta
- https://github.com/skew-labs/skewarchive
- https://github.com/TractionDAO/traction

## Missing for actual options

No verified counterparty, executable liquidity, funded collateral vault, independently audited onchain settlement path, manipulation-resistant expiry oracle for arbitrary new Pump.fun tokens, or legal authorization.

**Next dependency:** Obtain from a candidate venue its current mainnet program ID, IDL/SDK, exact collateral/settlement mechanics and independent audit tied to that deployed binary, including an explicit statement of support for capped European cash-settled Pump.fun token contracts. Alternatively, change the product contract and re-evaluate legal/safety risks. Neither a speculative mainnet program nor a financial contract should be launched with unreviewed code.

Do not claim Fable trades are live or sell token buyers access to a functioning exchange based on this research.
