# Fable Options Intelligence API

The API offers mathematical expiration-payoff analysis for **hypothetical, capped** long call and put contracts. It never returns a market-maker price or tradable option. Premiums, strikes, contract sizes and caps are provided by the caller.

## Endpoint

`GET /v1/options/analyze?side=call&spotPriceUsd=1&strikePriceUsd=1&premiumUsd=10&units=100&payoutCapUsd=50`

The response contains scenario outcomes, maximum buyer loss, maximum net profit and a potential expiration breakeven. All results are marked `isOptionQuote:false` and `isExecutable:false`.

No transaction or buy order may be submitted. Do not relabel these scenarios as executable quotes or derive implied probability, live option price, or theoretical fair value from this endpoint.

## Discovery

`GET /v1/launches` and `GET /v1/discovery` are read-only database results based on the deployed collector and sampled GeckoTerminal pool data. Market-cap crossings are not exhaustive and should not be marketed as complete, real-time coverage until verified against a production-grade indexer.

## Production prerequisites

- Independently validate launch decoding against known Pump.fun creation transactions.
- Add historical backfill, provider reconciliation, database monitoring, data freshness flags, and API rate limits.
- Keep private endpoints private until access controls and traffic restrictions are set.
- External options venue, funded executable liquidity, independent audits, manipulation-resistant settlement and legally compliant access are all required before real-money trades.
