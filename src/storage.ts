import pg from "pg";
import { assessMarketJump } from "./market-anomaly.js";
import type { OwnershipAudit } from "./options/ownership-audit.js";
import type { SlotAcquisitionSignal } from "./options/launch-slot-analysis.js";

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
    const client=await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(428719002)");
      await client.query(`
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
      ALTER TABLE launches ADD COLUMN IF NOT EXISTS latest_anomaly_at TIMESTAMPTZ;
      ALTER TABLE launches ADD COLUMN IF NOT EXISTS latest_anomaly_ratio DOUBLE PRECISION;
      ALTER TABLE launches ADD COLUMN IF NOT EXISTS latest_anomaly_kind TEXT;
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
      CREATE TABLE IF NOT EXISTS token_ownership_audits (
        mint TEXT PRIMARY KEY REFERENCES launches(mint),
        observed_at TIMESTAMPTZ NOT NULL,
        context_slot BIGINT NOT NULL,
        top_account_pct DOUBLE PRECISION,
        top_ten_account_pct DOUBLE PRECISION,
        distinct_visible_owners INTEGER,
        repeated_owner_accounts INTEGER,
        mint_authority_revoked BOOLEAN,
        freeze_authority_revoked BOOLEAN,
        risk_signals JSONB NOT NULL,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        verified_beneficial_owners BOOLEAN NOT NULL DEFAULT FALSE
          CHECK(verified_beneficial_owners=FALSE)
      );
      CREATE INDEX IF NOT EXISTS token_ownership_audits_checked_idx
        ON token_ownership_audits (checked_at);
      CREATE TABLE IF NOT EXISTS token_ownership_audit_failures(
        mint TEXT PRIMARY KEY REFERENCES launches(mint),
        attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_error TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS token_launch_slot_audits (
        mint TEXT PRIMARY KEY REFERENCES launches(mint),
        slot BIGINT NOT NULL,
        observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        analysis_status TEXT NOT NULL CHECK(analysis_status IN ('partial','unavailable')),
        transactions_examined INTEGER,
        positive_delta_transactions INTEGER,
        distinct_reported_owners INTEGER,
        repeated_owner_accounts INTEGER,
        possible_coordination TEXT,
        error_message TEXT,
        bundle_proven BOOLEAN NOT NULL DEFAULT FALSE CHECK(bundle_proven=FALSE)
      );
    `);
    } finally {
      try { await client.query("SELECT pg_advisory_unlock(428719002)"); }
      finally { client.release(); }
    }
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
      const elapsedSeconds=previousAt instanceof Date ?
        (sample.observedAt.getTime()-previousAt.getTime())/1000 : null;
      const jump=assessMarketJump(oldCap,sample.marketCapUsd,elapsedSeconds,oldSource===newSource);
      const type: PriceEvent = sample.marketCapUsd >= thresholdUsd
        ? oldCap === null ? "first_seen_above"
          : oldCap < thresholdUsd ? (recentPrevious && !jump.anomalous ? "crossed_up" : "first_seen_above") : null
        : null;
      await c.query(
        `UPDATE launches SET latest_market_cap_usd=$2, latest_liquidity_usd=$3,
         latest_pool=$4, last_price_at=$5::timestamptz, latest_price_source=$7,
         latest_anomaly_at=CASE WHEN $8::boolean THEN $5::timestamptz ELSE latest_anomaly_at END,
         latest_anomaly_ratio=CASE WHEN $8::boolean THEN $9::double precision ELSE latest_anomaly_ratio END,
         latest_anomaly_kind=CASE WHEN $8::boolean THEN $10::text ELSE latest_anomaly_kind END,
         next_poll_at=$5::timestamptz + $6::double precision * interval '1 second' WHERE mint=$1`,
        [sample.mint, sample.marketCapUsd, sample.poolLiquidityUsd, sample.poolAddress,
         sample.observedAt, sample.marketCapUsd >= 100000 ? 90 : 300,newSource,
         jump.anomalous,jump.ratio,jump.reason]
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
         l.first_seen,l.last_price_at,l.latest_market_cap_usd,l.latest_liquidity_usd,l.latest_price_source,
         l.latest_anomaly_at,l.latest_anomaly_ratio,l.latest_anomaly_kind
         FROM crossing_events c JOIN launches l ON l.mint=c.mint
         ORDER BY c.id DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 100)]
    );
    return result.rows;
  }
  async dueOwnershipAudit():Promise<{mint:string;symbol:string}|null>{
    const result=await this.pool.query(`
      SELECT l.mint,l.symbol FROM launches l
      LEFT JOIN token_ownership_audits a ON a.mint=l.mint
      LEFT JOIN token_ownership_audit_failures f ON f.mint=l.mint
      WHERE l.first_seen>=now()-interval '2 days'
        AND l.latest_market_cap_usd>=300000
        AND l.last_price_at>now()-interval '10 minutes'
        AND (a.checked_at IS NULL OR a.checked_at<now()-interval '30 minutes')
        AND (f.next_attempt_at IS NULL OR f.next_attempt_at<=now())
      ORDER BY a.checked_at ASC NULLS FIRST,l.last_price_at DESC
      LIMIT 1`);
    return result.rows[0]??null;
  }
  async recordOwnershipAudit(audit:OwnershipAudit):Promise<void>{
    if(audit.holderAccountsClassified!==false||audit.walletClustersVerified!==false||
       audit.bundleEvidence!=="unknown"||!Number.isSafeInteger(audit.contextSlot)||
       audit.contextSlot<=0)throw new Error("unverified_ownership_claim");
    await this.pool.query(`
      INSERT INTO token_ownership_audits(
        mint,observed_at,context_slot,top_account_pct,top_ten_account_pct,
        distinct_visible_owners,repeated_owner_accounts,mint_authority_revoked,
        freeze_authority_revoked,risk_signals,checked_at,verified_beneficial_owners
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),FALSE)
      ON CONFLICT(mint) DO UPDATE SET
        observed_at=excluded.observed_at,context_slot=excluded.context_slot,
        top_account_pct=excluded.top_account_pct,
        top_ten_account_pct=excluded.top_ten_account_pct,
        distinct_visible_owners=excluded.distinct_visible_owners,
        repeated_owner_accounts=excluded.repeated_owner_accounts,
        mint_authority_revoked=excluded.mint_authority_revoked,
        freeze_authority_revoked=excluded.freeze_authority_revoked,
        risk_signals=excluded.risk_signals,checked_at=now(),
        verified_beneficial_owners=FALSE
      WHERE excluded.context_slot>=token_ownership_audits.context_slot`,[
        audit.mint,audit.observedAt,audit.contextSlot,audit.topTokenAccountPct,
        audit.topTenTokenAccountsPct,audit.distinctVisibleOwners,
        audit.repeatedOwnerAccountCount,audit.mintAuthorityRevoked,
        audit.freezeAuthorityRevoked,JSON.stringify(audit.riskSignals)
      ]);
    await this.pool.query("DELETE FROM token_ownership_audit_failures WHERE mint=$1",[audit.mint]);
  }
  async recordOwnershipFailure(mint:string,reason:string):Promise<void>{
    // Persist cooldown across restarts. A failed audit is NOT a safe audit.
    await this.pool.query(`
      INSERT INTO token_ownership_audit_failures(mint,attempts,last_error,next_attempt_at)
      VALUES($1,1,$2,now()+interval '30 minutes')
      ON CONFLICT(mint) DO UPDATE SET
        attempted_at=now(),
        attempts=LEAST(token_ownership_audit_failures.attempts+1,10),
        last_error=excluded.last_error,
        next_attempt_at=now() + LEAST(360,30*POWER(2,
          LEAST(token_ownership_audit_failures.attempts,4))) * interval '1 minute'`,
      [mint,reason.slice(0,100)]);
  }
  async dueLaunchSlotAudit():Promise<{mint:string;signature:string;slot:number}|null>{
    const r=await this.pool.query(`
      SELECT l.mint,l.signature,l.slot FROM launches l
      LEFT JOIN token_launch_slot_audits a ON a.mint=l.mint
      WHERE l.first_seen>=now()-interval '2 days'
        AND l.latest_market_cap_usd>=300000
        AND l.last_price_at>now()-interval '15 minutes'
        AND (a.observed_at IS NULL OR (
          a.analysis_status='unavailable' AND a.observed_at<now()-interval '6 hours'
        ))
      ORDER BY l.latest_market_cap_usd DESC LIMIT 1`);
    const x=r.rows[0];
    if(!x)return null;
    const slot=Number(x.slot);
    return Number.isSafeInteger(slot)&&slot>0?{mint:x.mint,signature:x.signature,slot}:null;
  }
  async recordLaunchSlotAudit(audit:SlotAcquisitionSignal):Promise<void>{
    if(audit.bundlesProven!==false||audit.fraudProven!==false||
       !Number.isSafeInteger(audit.slot)||audit.slot<=0)throw new Error("unverified_bundle_claim");
    await this.pool.query(`
      INSERT INTO token_launch_slot_audits(
        mint,slot,analysis_status,transactions_examined,
        positive_delta_transactions,distinct_reported_owners,
        repeated_owner_accounts,possible_coordination,bundle_proven
      ) VALUES($1,$2,'partial',$3,$4,$5,$6,$7,FALSE)
      ON CONFLICT(mint) DO UPDATE SET
        slot=excluded.slot,observed_at=now(),analysis_status='partial',
        transactions_examined=excluded.transactions_examined,
        positive_delta_transactions=excluded.positive_delta_transactions,
        distinct_reported_owners=excluded.distinct_reported_owners,
        repeated_owner_accounts=excluded.repeated_owner_accounts,
        possible_coordination=excluded.possible_coordination,
        error_message=NULL,bundle_proven=FALSE
      WHERE token_launch_slot_audits.analysis_status='unavailable'`,[
      audit.mint,audit.slot,audit.transactionsExamined,
      audit.transactionCountWithPositiveBalanceDelta,audit.distinctReportedOwners,
      audit.ownersWithMultiplePositiveDeltaTransactions,audit.possibleCoordination
    ]);
  }
  async recordLaunchSlotFailure(mint:string,slot:number,message:string):Promise<void>{
    await this.pool.query(`
      INSERT INTO token_launch_slot_audits(mint,slot,analysis_status,error_message)
      VALUES($1,$2,'unavailable',$3)
      ON CONFLICT(mint) DO UPDATE SET
        observed_at=now(),analysis_status='unavailable',
        error_message=excluded.error_message,bundle_proven=FALSE
      WHERE token_launch_slot_audits.analysis_status='unavailable'`,[
        mint,slot,message.slice(0,120)
      ]);
  }
  async tokenRiskRow(mint: string) {
    const result=await this.pool.query(
      `SELECT l.mint,l.symbol,l.token_name,l.first_seen,l.last_price_at,
        l.latest_market_cap_usd,l.latest_liquidity_usd,l.latest_price_source,
        l.latest_anomaly_at,l.latest_anomaly_ratio,l.latest_anomaly_kind,
        a.observed_at AS ownership_observed_at,a.top_account_pct,a.top_ten_account_pct,
        a.distinct_visible_owners,a.repeated_owner_accounts,
        a.mint_authority_revoked,a.freeze_authority_revoked,
        a.risk_signals AS ownership_risk_signals,
        x.analysis_status AS slot_analysis_status,
        x.positive_delta_transactions,x.distinct_reported_owners,
        x.repeated_owner_accounts AS slot_repeated_owner_accounts,
        x.possible_coordination AS slot_possible_coordination
       FROM launches l LEFT JOIN token_ownership_audits a ON a.mint=l.mint
       LEFT JOIN token_launch_slot_audits x ON x.mint=l.mint
       WHERE l.mint=$1 LIMIT 1`,[mint]
    );
    return result.rows[0]??null;
  }
  async recentLaunches(limit=50) {
    const result = await this.pool.query(
      `SELECT l.mint,l.symbol,l.token_name,l.signature,l.slot,l.first_seen,
         l.latest_market_cap_usd,l.latest_liquidity_usd,l.last_price_at,l.latest_price_source,
         l.latest_anomaly_at,l.latest_anomaly_ratio,l.latest_anomaly_kind,
         a.observed_at AS ownership_observed_at,a.top_account_pct,a.top_ten_account_pct,
         a.distinct_visible_owners,a.repeated_owner_accounts,
         a.mint_authority_revoked,a.freeze_authority_revoked,
         a.risk_signals AS ownership_risk_signals,
        x.analysis_status AS slot_analysis_status,
        x.positive_delta_transactions,x.distinct_reported_owners,
        x.repeated_owner_accounts AS slot_repeated_owner_accounts,
        x.possible_coordination AS slot_possible_coordination
       FROM launches l LEFT JOIN token_ownership_audits a ON a.mint=l.mint
       LEFT JOIN token_launch_slot_audits x ON x.mint=l.mint
       ORDER BY l.first_seen DESC LIMIT $1`,[Math.min(Math.max(limit,1),100)]
    );
    return result.rows;
  }

  /** Operational sampling health; failures and missing observations are visible, not hidden. */
  async scannerHealth() {
    const [launches, jobs, markets, crossings, reconciliation, audits, slots] = await Promise.all([
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
        count(*) FILTER (WHERE latest_anomaly_at > now() - interval '1 hour')::int AS recent_anomalies,
        max(last_price_at) AS latest_sample_at FROM launches`),
      this.pool.query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE observed_at > now() - interval '1 day')::int AS last_day,
        max(observed_at) AS latest_at FROM crossing_events`),
      this.pool.query(`SELECT newest_signature,last_success_at,last_attempt_at,scanned_last,queued_last,
        gap_last,gap_count,last_error,coverage
        FROM pump_reconciliation WHERE singleton=TRUE`),
      this.pool.query(`SELECT count(*)::int AS count,
        count(*) FILTER (WHERE observed_at>now()-interval '1 hour')::int AS recent,
        max(observed_at) AS last_at FROM token_ownership_audits`),
      this.pool.query(`SELECT count(*) FILTER (WHERE analysis_status='partial')::int AS reviewed,
        count(*) FILTER (WHERE analysis_status='unavailable')::int AS unavailable
        FROM token_launch_slot_audits`)
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
      ownershipAudit: { ...audits.rows[0], beneficialOwnersVerified:false,
        note:"Top token-account concentrations are not classified beneficial ownership or evidence of a bundle." },
      slotAudits: { ...slots.rows[0], completenessGuaranteed:false, bundlesProven:false },
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
