import pg from "pg";

const { Pool } = pg;
export type LaunchRecord = { mint: string; signature: string; slot: number; name: string; symbol: string; uri: string; instruction: string };
export type MarketSample = { mint: string; marketCapUsd: number; poolLiquidityUsd: number | null; poolAddress: string; observedAt: Date; source?: string };
export type PriceEvent = "crossed_up" | "first_seen_above" | null;

export class FableStore {
  private pool: pg.Pool;
  constructor(databaseUrl: string) {
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    this.pool = new Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 8000 });
  }
  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS launches (
        mint TEXT PRIMARY KEY,
        signature TEXT NOT NULL,
        slot BIGINT NOT NULL,
        token_name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        metadata_uri TEXT NOT NULL,
        instruction TEXT NOT NULL,
        first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
        latest_market_cap_usd DOUBLE PRECISION,
        latest_liquidity_usd DOUBLE PRECISION,
        latest_pool TEXT,
        last_price_at TIMESTAMPTZ,
        next_poll_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE launches ADD COLUMN IF NOT EXISTS latest_price_source TEXT;
      CREATE INDEX IF NOT EXISTS launches_next_poll_idx ON launches (next_poll_at);
      CREATE TABLE IF NOT EXISTS crossing_events (
        id BIGSERIAL PRIMARY KEY,
        mint TEXT NOT NULL REFERENCES launches(mint),
        event_type TEXT NOT NULL CHECK (event_type IN ('crossed_up', 'first_seen_above')),
        previous_market_cap_usd DOUBLE PRECISION,
        market_cap_usd DOUBLE PRECISION NOT NULL,
        pool_liquidity_usd DOUBLE PRECISION,
        pool_address TEXT NOT NULL,
        observed_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE crossing_events ADD COLUMN IF NOT EXISTS price_source TEXT;
      CREATE INDEX IF NOT EXISTS crossing_events_created_idx ON crossing_events (created_at DESC);
    `);
  }
  async recordLaunch(launch: LaunchRecord): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO launches(mint,signature,slot,token_name,symbol,metadata_uri,instruction)
       VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(mint) DO NOTHING`,
      [launch.mint, launch.signature, launch.slot, launch.name, launch.symbol, launch.uri, launch.instruction]
    );
    return (result.rowCount ?? 0) > 0;
  }
  async dueTokens(limit = 10): Promise<Array<{ mint: string; symbol: string }>> {
    const result = await this.pool.query(
      `SELECT mint, symbol FROM launches
       WHERE next_poll_at <= now() AND first_seen >= now() - interval '2 days'
       ORDER BY
         CASE
           WHEN latest_market_cap_usd >= 100000 AND latest_market_cap_usd < 1000000 THEN 0
           WHEN first_seen >= now() - interval '30 minutes' THEN 1
           ELSE 2
         END ASC,
         CASE
           WHEN latest_market_cap_usd >= 100000 AND latest_market_cap_usd < 1000000
           THEN last_price_at
         END ASC NULLS LAST,
         first_seen DESC
       LIMIT $1`, [Math.min(Math.max(limit, 1), 100)]
    );
    return result.rows as Array<{ mint: string; symbol: string }>;
  }
  async deferToken(mint: string, seconds: number): Promise<void> {
    await this.pool.query(
      `UPDATE launches SET next_poll_at = now() + $2 * interval '1 second' WHERE mint=$1`,
      [mint, Math.max(20, Math.min(86400, Math.floor(seconds)))]
    );
  }
  async recordPrice(sample: MarketSample, thresholdUsd = 300000): Promise<PriceEvent> {
    if (!(sample.marketCapUsd > 0) || !Number.isFinite(sample.marketCapUsd) ||
        !Number.isFinite(thresholdUsd) || thresholdUsd <= 0) throw new Error("Invalid market cap");
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const previous = await c.query(
        "SELECT latest_market_cap_usd,last_price_at,latest_price_source FROM launches WHERE mint=$1 FOR UPDATE", [sample.mint]
      );
      if (!previous.rows.length) { await c.query("ROLLBACK"); return null; }
      const oldCap = previous.rows[0].latest_market_cap_usd as number | null;
      const oldSource: string | null = previous.rows[0].latest_price_source;
      const newSource = sample.source ?? "unspecified";
      const previousAt: Date | null = previous.rows[0].last_price_at;
      // Never replace a fresher observation with a delayed/replayed price sample.
      if (previousAt instanceof Date && sample.observedAt.getTime() < previousAt.getTime()) {
        await c.query("ROLLBACK"); return null;
      }
      // A large observation gap cannot prove when the threshold was crossed.
      const recentPrevious = previousAt instanceof Date &&
        sample.observedAt.getTime() >= previousAt.getTime() &&
        sample.observedAt.getTime() - previousAt.getTime() <= 15*60*1000 &&
        oldSource === newSource;
      const type: PriceEvent = sample.marketCapUsd >= thresholdUsd
        ? oldCap === null ? "first_seen_above"
          : oldCap < thresholdUsd ? (recentPrevious ? "crossed_up" : "first_seen_above") : null
        : null;
      await c.query(
        `UPDATE launches SET latest_market_cap_usd=$2, latest_liquidity_usd=$3,
         latest_pool=$4, last_price_at=$5::timestamptz, latest_price_source=$7,
         next_poll_at=$5::timestamptz + $6::double precision * interval '1 second' WHERE mint=$1`,
        [sample.mint, sample.marketCapUsd, sample.poolLiquidityUsd, sample.poolAddress,
         sample.observedAt, sample.marketCapUsd >= 100000 ? 90 : 300,newSource]
      );
      if (type) {
        await c.query(
          `INSERT INTO crossing_events(mint,event_type,previous_market_cap_usd,
           market_cap_usd,pool_liquidity_usd,pool_address,observed_at,price_source)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [sample.mint,type,oldCap,sample.marketCapUsd,sample.poolLiquidityUsd,
           sample.poolAddress,sample.observedAt,sample.source??"unspecified"]
        );
      }
      await c.query("COMMIT");
      return type;
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    } finally { c.release(); }
  }
  async recentCrossings(limit=50) {
    const result = await this.pool.query(
      `SELECT c.id,c.mint,l.symbol,l.token_name,c.event_type,c.previous_market_cap_usd,
         c.market_cap_usd,c.pool_liquidity_usd,c.pool_address,c.observed_at,c.price_source,
         l.first_seen,l.last_price_at,l.latest_market_cap_usd,l.latest_liquidity_usd,l.latest_price_source
         FROM crossing_events c JOIN launches l ON l.mint=c.mint
         ORDER BY c.id DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 100)]
    );
    return result.rows;
  }
  async tokenRiskRow(mint: string) {
    const result=await this.pool.query(
      `SELECT mint,symbol,token_name,first_seen,last_price_at,
        latest_market_cap_usd,latest_liquidity_usd,latest_price_source
       FROM launches WHERE mint=$1 LIMIT 1`,[mint]
    );
    return result.rows[0]??null;
  }
  async recentLaunches(limit=50) {
    const result = await this.pool.query(
      `SELECT mint,symbol,token_name,signature,slot,first_seen,latest_market_cap_usd,
         latest_liquidity_usd,last_price_at,latest_price_source FROM launches
       ORDER BY first_seen DESC LIMIT $1`,[Math.min(Math.max(limit,1),100)]
    );
    return result.rows;
  }

  /** Operational sampling health; failures and missing observations are visible, not hidden. */
  async scannerHealth() {
    const [launches, jobs, markets, crossings, reconciliation] = await Promise.all([
      this.pool.query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE first_seen > now() - interval '1 hour')::int AS last_hour,
        max(first_seen) AS latest_at FROM launches`),
      this.pool.query(`SELECT state,count(*)::int AS count FROM pump_ingest_jobs GROUP BY state`),
      this.pool.query(`SELECT
        count(*) FILTER (WHERE last_price_at IS NOT NULL)::int AS ever_priced,
        count(*) FILTER (WHERE last_price_at > now() - interval '3 minutes')::int AS fresh_priced,
        count(*) FILTER (WHERE last_price_at IS NULL)::int AS never_priced,
        count(*) FILTER (WHERE last_price_at <= now() - interval '3 minutes')::int AS stale_priced,
        count(*) FILTER (WHERE last_price_at > now() - interval '3 minutes'
          AND latest_market_cap_usd >= 300000)::int AS fresh_above_300k,
        count(*) FILTER (WHERE latest_price_source = 'pump_bonding_curve_solana')::int AS curve_priced,
        count(*) FILTER (WHERE latest_price_source = 'dexscreener')::int AS dex_priced,
        max(last_price_at) AS latest_sample_at FROM launches`),
      this.pool.query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE observed_at > now() - interval '1 day')::int AS last_day,
        max(observed_at) AS latest_at FROM crossing_events`),
      this.pool.query(`SELECT newest_signature,last_success_at,last_attempt_at,scanned_last,queued_last,
        gap_last,gap_count,last_error,coverage
        FROM pump_reconciliation WHERE singleton=TRUE`)
    ]);
    return {
      asOf: new Date().toISOString(),
      indexing: {
        decodedLaunchesTotal: launches.rows[0].total,
        decodedLaunchesLastHour: launches.rows[0].last_hour,
        latestDecodedLaunchAt: launches.rows[0].latest_at,
        signatureJobsByState: Object.fromEntries(jobs.rows.map(x => [x.state, x.count])),
        coverageComplete: false,
        latestVerifiedOnchainComparison: null,
        boundedRecovery: reconciliation.rows[0] ?? null
      },
      marketSampling: {
        ...markets.rows[0],
        marketDataProvider: "dexscreener",
        freshnessWindowSeconds: 180,
        priceFeedIsSettlementOracle: false
      },
      crossings: {
        total: crossings.rows[0].total,
        lastDay: crossings.rows[0].last_day,
        latestObservedAt: crossings.rows[0].latest_at,
        thresholdUsd: 300000,
        completenessGuaranteed: false,
        timing: "sampled observations; not exact onchain crossing times"
      },
      healthLimits: [
        "Stats reflect this database only, not complete Pump.fun coverage.",
        "A scanner process may have disconnected without changing these counters.",
        "DexScreener prices are sampled and may be missing or stale.",
        "Live decode accuracy and source reconciliation must be independently verified."
      ]
    };
  }
  async ping() { await this.pool.query("SELECT 1"); }
  async close() { await this.pool.end(); }
}
