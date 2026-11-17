# Launch ingestion recovery

The live collector now saves candidate transaction signatures in a PostgreSQL queue before fetching full transactions. It retries transient RPC failures, records a failure after repeated attempts and resumes pending work after a restart.

**Limits:** WebSocket notifications can be missed during network outages, queue writes can fail, and Pump.fun program activity is much greater than the number of new launches. The queue is a reliability improvement, not proof of comprehensive coverage.

Manual bounded recovery: run `npm run backfill:pump` with `DATABASE_URL` and `HELIUS_API_KEY`. `BACKFILL_SIGNATURE_LIMIT` defaults to 10, capped at 100. It queues a small recent sample of **all** program transactions, not just confirmed launches. It does not paginate full historical activity or guarantee closing gaps.

For comprehensive discovery, adopt a provider that can stream decoded creation events with durable cursor and historical replay, verify create/v2 transactions against authoritative SDK schemas, reconcile missed slots and migrated pools, and add a persistent consumer offset. Fund this separately only after confirming the provider's cost.

**Current trade status:** no funded options market, execution, deposits or onchain settlement exists. The settlement adapter intentionally throws when called.
