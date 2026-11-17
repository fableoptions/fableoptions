# Fable RFQ backend — simulation-only foundation

Fable can conceptually match buyers of capped call/put exposure with option writers, so Fable itself does not need to fund every payout. This implementation only validates requests, compares indicative terms, calculates capped expiration payoffs, and groups compatible requests for future auctions or quote solicitation.

## Risk and status

- An *indicative quote* is not an executable trade, proof of collateral, or firm obligation.
- Fully collateralized trading requires an independently verified audited Solana settlement venue or audited dedicated contracts. Until verified: no order submission, signature request, deposits, execution, or payout assertions.
- Short-dated microcap tokens can have extreme price manipulation and poor oracle quality. A $300K market cap alone is not a security/liquidity qualification.
- Buyers risk the entire option premium; writers can lose their posted collateral. A capped gross payout does not by itself establish acceptable risk.
- Fee allocation and creator revenue are uncertain future receipts, not collateral currently available.
- Legal eligibility must be independently verified for each served jurisdiction, not simply inferred from an exclusion list.

## Request lifecycle (planned)

1. Receive authenticated buyer RFQ tied to a verified underlying and expiration.
2. Solicit quotes from independently vetted writers.
3. Verify firm quote, funded collateral and a binding settlement route.
4. Present the quote and its maximum possible loss to the buyer.
5. Buyer authorizes a wallet transaction against an audited contract; do not treat client-side acceptance as settlement.
6. Verify onchain fill, expiration, settlement oracle and payout, and reconcile final state.

The present `src/options/rfq.ts` implements only **off-chain checks** and does not perform steps 1–6.
