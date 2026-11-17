import pg from "pg";

/**
 * Durable Solana program activity queue; does not guarantee full Pump.fun
 * coverage. Gaps during RPC outages still need bounded historical backfill.
 */
export class SignatureQueue {
  constructor(private readonly pool: pg.Pool) {}
  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS pump_ingest_jobs (
        signature TEXT PRIMARY KEY,
        slot BIGINT,
        state TEXT NOT NULL DEFAULT 'pending'
          CHECK (state IN ('pending','processing','done','failed')),
        tries INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS pump_ingest_pending_idx
        ON pump_ingest_jobs (next_attempt_at, received_at)
        WHERE state IN ('pending','processing');
    `);
    // Repair work claimed by a process that died before acknowledgement.
    await this.pool.query(`UPDATE pump_ingest_jobs SET state='pending'
      WHERE state='processing' AND updated_at < now() - interval '3 minutes'`);
  }
  async enqueue(signature: string, slot: number | null = null): Promise<boolean> {
    if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature)) return false;
    if (slot !== null && (!Number.isSafeInteger(slot) || slot < 0)) return false;
    const result = await this.pool.query(
      `INSERT INTO pump_ingest_jobs(signature,slot)
       VALUES($1,$2) ON CONFLICT(signature) DO NOTHING`,[signature,slot]);
    return Boolean(result.rowCount);
  }
  async claim():Promise<{signature:string;tries:number}|null> {
    const result=await this.pool.query(`
      WITH next AS (
        SELECT signature FROM pump_ingest_jobs
        WHERE state='pending' AND next_attempt_at<=now()
        ORDER BY next_attempt_at, received_at LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE pump_ingest_jobs j SET state='processing', tries=j.tries+1,updated_at=now()
      FROM next WHERE j.signature=next.signature
      RETURNING j.signature,j.tries
    `);
    return result.rows[0]??null;
  }
  async complete(signature:string) {
    await this.pool.query(`UPDATE pump_ingest_jobs SET state='done',updated_at=now(),
      last_error=NULL WHERE signature=$1`,[signature]);
  }
  async retry(signature:string,tries:number,message:string,seconds:number) {
    await this.pool.query(`UPDATE pump_ingest_jobs SET state=$2,
       next_attempt_at=now()+$3*interval '1 second',
       last_error=$4,updated_at=now() WHERE signature=$1`,
      [signature,tries>=12?'failed':'pending',Math.min(3600,Math.max(10,seconds)),message.slice(0,200)]);
  }
  async stats() {
    const result=await this.pool.query(`SELECT state,count(*)::int AS count
      FROM pump_ingest_jobs GROUP BY state`);
    return result.rows as Array<{state:string;count:number}>;
  }
}
