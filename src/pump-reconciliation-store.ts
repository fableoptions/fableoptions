import pg from "pg";
import {assessReconciliation, type SignatureInfo} from "./pump-reconciliation.js";

/** Persistent checkpoint and latest bounded reconciliation status.
 * A missing checkpoint must never be interpreted as complete replay.
 */
export class PumpReconciliationStore {
  constructor(private readonly pool:pg.Pool){}
  async init(){
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS pump_reconciliation (
        singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
        newest_signature TEXT,
        last_attempt_at TIMESTAMPTZ,
        last_success_at TIMESTAMPTZ,
        scanned_last INTEGER NOT NULL DEFAULT 0,
        queued_last INTEGER NOT NULL DEFAULT 0,
        gap_last BOOLEAN NOT NULL DEFAULT TRUE,
        gap_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        coverage TEXT NOT NULL DEFAULT 'unverified'
      );
      INSERT INTO pump_reconciliation(singleton) VALUES(TRUE) ON CONFLICT DO NOTHING;
    `);
  }
  async getCheckpoint():Promise<string|null>{
    const r=await this.pool.query("SELECT newest_signature FROM pump_reconciliation WHERE singleton=TRUE");
    return r.rows[0]?.newest_signature??null;
  }
  async recordPage(page:SignatureInfo[],prior:string|null,limit:number,queued:number){
    const report=assessReconciliation(page,prior,limit);
    if(!page.length) {
      await this.recordFailure("empty_rpc_history");
      return report;
    }
    await this.pool.query(`
      UPDATE pump_reconciliation SET
      newest_signature=$1,last_attempt_at=now(),last_success_at=now(),
      scanned_last=$2,queued_last=$3,gap_last=$4,
      gap_count=gap_count+CASE WHEN $4 THEN 1 ELSE 0 END,
      last_error=NULL,coverage=$5
      WHERE singleton=TRUE
    `,[report.newestSignature,report.scanned,queued,report.gapDetected,report.coverage]);
    return report;
  }
  async recordFailure(reason:string){
    await this.pool.query(`UPDATE pump_reconciliation SET
      last_attempt_at=now(),last_error=$1,gap_last=TRUE,
      coverage='unverified' WHERE singleton=TRUE`,[reason.slice(0,150)]);
  }
  async status(){
    const r=await this.pool.query(`SELECT newest_signature,last_attempt_at,
      last_success_at,scanned_last,queued_last,gap_last,gap_count,last_error,
      coverage FROM pump_reconciliation WHERE singleton=TRUE`);
    return r.rows[0]??null;
  }
}
