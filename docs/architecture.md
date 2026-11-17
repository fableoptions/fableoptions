# Architecture and launch gates

## Scanner
GeckoTerminal Solana new-pools discovery -> normalize candidate pool -> identify base token -> compare observed market-cap series -> publish event. Only `crossed_up` is a proven **observed** crossing; `first_seen_above` is a discovery event. Data is incomplete and provider-dependent. Never confuse token market cap with pool liquidity.

## Next steps
- Add a database (Postgres) for deduplicated token observations, pool changes, replay and restarts.
- Integrate historical launchpad provenance and validate token mint, decimals, supply and migration status.
- Use an authenticated streaming market-data source with coverage monitoring for production; add liquidity, volume and token age filters.
- Implement a read-only frontend, with an explicit `options_unavailable` state unless there is a verifiable, executable quote.
- Choose an options protocol **only after** mainnet/audit/legal/oracle/liquidity due diligence. There is currently no selected or integrated real-money options provider.

## Security
No wallet seed phrases, private keys, trading signing keys, API secrets or user deposits belong in this repo. Do not create derivative contracts from unverified prices. Contracts must have audited collateral accounting, reliable settlement and risk limits. A $300K market cap is a discovery filter, not a safety guarantee.
