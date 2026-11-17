# Fable onchain bundle-risk screening (free-tier)

## Scope and status

This is a conservative **onchain risk screening pipeline**, not a fraud classifier or a guarantee of options safety. It does not identify beneficial owners, prove collusion, provide independent price settlement or unlock live options.

Fable uses the existing Solana RPC credentials and Railway price worker. No new paid service is provisioned. RPC rate limits can interrupt both analyses, in which case the token remains unverified.

## Token account concentration audit

`src/options/ownership-audit.ts` uses:
- `getTokenSupply(mint)`
- `getTokenLargestAccounts(mint)` — **up to 20 largest TOKEN ACCOUNTS, not 20 people**
- `getMultipleAccounts(..., encoding:jsonParsed)` — reads token-account `owner` fields and mint/freeze authority state

Fable calculates top-token-account and top-ten-token-account percentages from atomic supply amounts using `BigInt`. It rejects incompatible snapshots (impossible supply sums, excessive slot drift, missing or malformed data). It records repeated *reported token-account owners*, not clustered beneficial users.

AMM vaults, custodians and accounts controlled by programs are **not excluded** because classification hasn't been independently established. High concentration triggers a review flag, not a confirmed bundle allegation.

Snapshots are sampled in the existing price worker no more than once every ~6 price batches, and not more than once per token every 30 minutes. Only recently priced, observed >$300K mints are selected. Failed provider requests are persisted in PostgreSQL with a 30-minute-to-six-hour exponential cooldown, including across worker restarts.

## Launch-slot token acquisition audit

`src/options/launch-slot-analysis.ts` calls `getBlock` with explicit version support for the token's launch slot and reads token-balance changes in its returned transactions. It excludes the creation transaction and counts positive token-balance deltas and duplicate owner fields.

**Important:** An acquisition may be a buy, token transfer, gift, custody movement or mint. Multiple early acquisitions are not proof of bot bundles or common control. Only the launch slot is analyzed; it is not a full first-minute or first-hour trade graph.

The existing worker schedules **at most one historical slot audit every ~40 price batches**, persists results and retries unavailable historical blocks after a six-hour cooldown. RPC providers may reject historical blocks; failures remain labeled unavailable, not clean.

## Risk gating

`/v1/options/token-risk?mint=...` and `/v1/launches` include current observations and unclassified onchain risk signals. `/v1/scanner/health` counts completed ownership snapshots and slot audits.

Even if **none** of the heuristics trigger, token-option listings and execution remain disabled independently. A $300K market cap **never** bypasses collateral, liquidity, legal, settlement-oracle or security review.

## Known limitations

- Beneficial ownership and cross-wallet common funding are **not** identified.
- Concentration across the largest token accounts can be dominated by pool/program vaults.
- Same-slot positive token deltas are weak evidence of bundled buying.
- Historical getBlock can exceed free-tier limits.
- Free RPC cannot guarantee all launches or reconstruct all early trades.
- Neither analytics nor bonding-curve estimates are a derivative expiration oracle.
- Do not market this as a "bundle-proof" system, "anti-rug guarantee," audited token list, or executable options market.

Solana RPC references:
- https://solana.com/docs/rpc/http/gettokenlargestaccounts
- https://solana.com/docs/rpc/http/gettokensupply
- https://solana.com/docs/rpc/http/getmultipleaccounts
- https://solana.com/docs/rpc/http/getblock

## Evidence from November 17, 2026

- Main TypeScript checks, unit tests and isolated Postgres integration tests passed: https://github.com/fableoptions/fableoptions/actions/runs/44121622575
- Existing API and price worker both deployed successfully on Railway at commit `845e46c713b671e3366587425acee0728d1e7dd7`.
- A one-off ownership snapshot via the unauthenticated public Solana RPC was **rate limited (HTTP 429)**. It did **not** establish live holder data accuracy. Source: https://github.com/fableoptions/fableoptions/actions/runs/44121299166
- The deployed Helius-connected worker is scheduled to query ownership less frequently; no successful live ownership-audit or same-slot sample had been independently observed at the time of this report.
- No new paid services were provisioned. Existing Railway and Helius usage may still accrue normal metered charges.

## Bounded funding-history review — November 17, 2026

- `src/options/funding-links.ts` analyzes **confirmed, direct SOL transfers** to at most four provided wallets, reading at most three recent transactions per wallet. The auto-worker uses **at most two** wallets from a launch-slot review, so its maximum is eight RPC requests for this step (two signature-history calls and at most six transaction reads).
- Funding analysis runs only when the launch-slot sample raised a `needs_review` signal, a valid historical block timestamp is present, and at least two canonical public keys were observed. The slot analysis itself is sampled no more often than once every 40 price batches.
- Shared sender addresses are `partial_with_link_signal`, **not** confirmed common control. Major exchanges, market makers, relayers, bridges and custodians regularly send SOL to unrelated users.
- A missing common sender is `partial_no_link_detected`, not evidence of independent owners. RPC errors remain `unavailable`.
- The API and PostgreSQL store **summary counts** only; no inferred identity list, private wallet key, or trade authorization is produced.
- Ownership checks have been broadened to recently priced $100K+ tokens **solely to validate data acquisition on the free tier**; the intended $300K eligibility threshold has not been lowered.
- Unit tests and isolated PostgreSQL tests verify parsing, bounds, persistence and fail-closed behavior. Successful mainnet owner clustering/funding graph reconstruction is **not yet demonstrated**.
