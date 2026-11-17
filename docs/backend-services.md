# Fable backend services — current deployment

Infrastructure-only milestone. No real-money trading is enabled. The web preview is deliberately out of scope for this backend phase.

## Production Railway services

- `Postgres`: private durable database for decoded launches and sampled market-cap crossings.
- `fable-pump-scanner`: `npm run pump:launches`, reads Pump.fun program activity over a Solana WebSocket and attempts to decode create instructions. Saves decoded launches to Postgres when `DATABASE_URL` is set. **Live launch decoder accuracy has not been independently validated against real transactions.**
- `fable-price-worker`: `npm run price:worker`, polls previously stored launches against GeckoTerminal pool data and records observed $300K market-cap crossings. **Sampled data, not complete coverage or a settlement oracle.**
- `fable-discovery-api`: `npm run api`, read-only endpoints `/health`, `/v1/launches`, `/v1/discovery`. It has no execution or deposit endpoints. The service is private until access control, rate limits and monitoring are established.

## Environment variables

- `fable-pump-scanner`: `HELIUS_API_KEY`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `fable-price-worker`: `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `fable-discovery-api`: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `PORT` assigned by Railway

Never commit credentials to the public repository.

## Limitations and blocking work

1. Validate create and create_v2 decoders against actual transactions and changes to official program layouts. Some launch formats may not match the existing parser.
2. Implement RPC historical backfill, restart catch-up, explicit provider rate limiting, durable checkpointing and reconnection gap detection.
3. Verify mint supply, pool identity, quote source, migration behavior, liquidity and age. Current market-cap observations are estimates.
4. Add authentication and public API rate limiting before exposing the API publicly.
5. Audit and secure multi-worker DB schema migration and lock discipline; Postgres is provisioned but no production load testing is complete.
6. Integrate a genuinely audited, deployed and legally available options venue with executable liquidity and appropriate settlement/oracle safeguards. **No such venue has been integrated.**

The Go/No-Go criteria for trades remain in [options-provider-gates.md](options-provider-gates.md).
