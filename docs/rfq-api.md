# Fable wallet-signed RFQ API

**Status:** The API is private and RFQ submissions are disabled unless `RFQ_API_ENABLED=true`. This is **indicative-only**. No collateral is locked, no executable options are created, and no deposits or settlement operations exist.

## Protocol

1. POST `/v1/rfq/challenge` with `{"wallet":"<base58 Solana pubkey>","action":"request"}` (or `"quote"`).
2. The wallet signs the exact UTF-8 message from `signingMessage(wallet, nonce, action, payload)` in `src/options/wallet-auth.ts`. It binds a SHA-256 of `JSON.stringify(payload)`. Signatures must use the exact object field ordering and values sent to the server. Use a compatible Ed25519 `signMessage` wallet.
3. POST `/v1/rfq/requests` or `/v1/rfq/quotes` with `{"payload":{...},"nonce":"...","signature":"<base58 Ed25519 signature>"}`.
4. Read `GET /v1/rfq/requests` and `GET /v1/rfq/quotes?rfqId=...`. Every response explicitly identifies the quotes as not funded or executable.

The request's `payload` uses fields in `src/options/rfq.ts`; the quote's payload is a `WriterQuote` and must carry `status:"indicative"`. User-provided `collateralUsd` is a **claim**, not a verified escrow balance.

**Security boundary:** Nonces are one-time, expire after two minutes, and are tied to a wallet and action. Signatures bind network, action, payload and nonce. RFQ ID collisions fail. Never interpret a submitted quote as an execution or as proof of available options liquidity.

**Before opening submissions publicly:** implement IP-level and wallet-level abuse controls, request-expiration cleanup, wallet chain checks, content moderation, sanctions/geographic restrictions and legal review. Authenticated RFQs are not trade authorization. Keep service private at initial rollout.

**Future settlement:** A separate audited provider must confirm escrow, reserves, exact strike/expiry, oracle choice, transaction finality and payout availability. None is wired yet.
