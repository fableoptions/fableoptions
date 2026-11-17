# Options venue execution gates

The current Fable platform does not have live options trading. **No collateral can be deposited, no positions can be opened, and no payouts are possible.**

`src/options/venue-readiness.ts` exposes an explicit fail-closed state for APIs and frontend integration. Merely setting an environment variable or submitting a wallet-signed writer quote **cannot enable execution**.

Before a future audited integration is enabled, engineering and independent review must establish:

1. Exact supported Solana token/contract programs and mainnet program IDs (not just marketing claims).
2. Escrow ownership, correct collateral mint and decimals, collateral reserves at least equal to maximum gross payout, and no rehypothecation/withdrawal while contracts are open.
3. Verified position parameters, wallet/contract authorities, replay resistance and finality.
4. Expiry and exercise procedure, manipulation-resistant price oracle, low-liquidity token rules, clawbacks/reorg handling, and failure recovery.
5. Independently reviewed upgrade authority, audit findings, active risk mitigations and legal/jurisdictional restrictions.
6. Real independently funded writers and executable quote TTLs, fees, settlement transaction simulation and testnet/mainnet canary procedures.

There is currently **no qualified integrated settlement provider**. Do not describe indicative RFQ data as bids, offers, funded liquidity or completed trades. A writer's stated collateral is unverified.

The public `/v1/options/venue-readiness` diagnostic is safe to consume; it should never expose a "ready" state based on caller-provided boolean fields.
