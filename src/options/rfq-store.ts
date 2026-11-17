import pg from "pg";
import type { RfqRequest, WriterQuote } from "./rfq.js";
import { isSolanaPublicKey,newNonce } from "./wallet-auth.js";

/** Database persistence for wallet-authenticated NON-EXECUTABLE RFQs. */
export class RfqStore {
  private pool:pg.Pool;
  constructor(databaseUrl:string){
    if(!databaseUrl)throw new Error("DATABASE_URL required");
    this.pool=new pg.Pool({connectionString:databaseUrl,max:3,connectionTimeoutMillis:8000});
  }
  async init():Promise<void>{
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rfq_challenges(
        nonce TEXT PRIMARY KEY, wallet TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('request','quote')),
        expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS rfq_challenges_wallet_idx ON rfq_challenges(wallet,created_at DESC);
      CREATE TABLE IF NOT EXISTS rfq_requests(
        id TEXT PRIMARY KEY, buyer_wallet TEXT NOT NULL, underlying_mint TEXT NOT NULL,
        side TEXT NOT NULL CHECK(side IN ('call','put')),strike_usd DOUBLE PRECISION NOT NULL CHECK(strike_usd>0),
        expires_at TIMESTAMPTZ NOT NULL, units DOUBLE PRECISION NOT NULL CHECK(units>0),
        max_premium_usd DOUBLE PRECISION NOT NULL CHECK(max_premium_usd>0),
        created_at TIMESTAMPTZ NOT NULL, request_expires_at TIMESTAMPTZ NOT NULL,
        verified_wallet_signature TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'indicative' CHECK(state='indicative')
      );
      CREATE INDEX IF NOT EXISTS rfq_request_expires_idx ON rfq_requests(request_expires_at DESC);
      CREATE TABLE IF NOT EXISTS rfq_quotes(
        id TEXT PRIMARY KEY,rfq_id TEXT NOT NULL REFERENCES rfq_requests(id),
        writer_wallet TEXT NOT NULL,premium_usd DOUBLE PRECISION NOT NULL CHECK(premium_usd>0),
        payout_cap_usd DOUBLE PRECISION NOT NULL CHECK(payout_cap_usd>0),
        stated_collateral_usd DOUBLE PRECISION NOT NULL CHECK(stated_collateral_usd>0),
        quoted_at TIMESTAMPTZ NOT NULL, valid_until TIMESTAMPTZ NOT NULL,
        verified_wallet_signature TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'indicative' CHECK(state='indicative')
      );
      CREATE INDEX IF NOT EXISTS rfq_quote_lookup_idx ON rfq_quotes(rfq_id,valid_until DESC);
    `);
  }
  async issueChallenge(wallet:string,action:"request"|"quote") {
    if(!isSolanaPublicKey(wallet))throw new Error("Invalid wallet");
    // Basic account-level throttle, with stronger network rate limits required before public exposure.
    const count=await this.pool.query(
      `SELECT count(*)::int AS count FROM rfq_challenges
       WHERE wallet=$1 AND created_at>now()-interval '1 minute'`,[wallet]);
    if(Number(count.rows[0]?.count??0)>=6)throw new Error("Challenge limit reached");
    const nonce=newNonce();
    await this.pool.query(`INSERT INTO rfq_challenges(nonce,wallet,action,expires_at)
      VALUES($1,$2,$3,now()+interval '2 minutes')`,[nonce,wallet,action]);
    return {nonce,expiresAt:new Date(Date.now()+120000).toISOString()};
  }
  async consumeChallenge(wallet:string,nonce:string,action:"request"|"quote"):Promise<boolean>{
    const result=await this.pool.query(`UPDATE rfq_challenges SET used_at=now()
      WHERE nonce=$1 AND wallet=$2 AND action=$3 AND used_at IS NULL
      AND expires_at>now() RETURNING nonce`,[nonce,wallet,action]);
    return Boolean(result.rowCount);
  }
  async insertRequest(req:RfqRequest,signature:string):Promise<void>{
    await this.pool.query(`INSERT INTO rfq_requests(
      id,buyer_wallet,underlying_mint,side,strike_usd,expires_at,units,max_premium_usd,
      created_at,request_expires_at,verified_wallet_signature)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[
      req.id,req.buyerWallet,req.underlyingMint,req.side,req.strikePriceUsd,
      req.expiresAt,req.notionalUnits,req.maximumPremiumUsd,req.createdAt,req.requestExpiresAt,signature
    ]);
  }
  async fetchRequest(id:string):Promise<RfqRequest|null>{
    const r=await this.pool.query(`SELECT id,buyer_wallet,underlying_mint,side,strike_usd,
      expires_at,units,max_premium_usd,created_at,request_expires_at
      FROM rfq_requests WHERE id=$1`,[id]);
    const x=r.rows[0];
    return x?{id:x.id,buyerWallet:x.buyer_wallet,underlyingMint:x.underlying_mint,
      side:x.side,strikePriceUsd:Number(x.strike_usd),expiresAt:new Date(x.expires_at).toISOString(),
      notionalUnits:Number(x.units),maximumPremiumUsd:Number(x.max_premium_usd),
      createdAt:new Date(x.created_at).toISOString(),requestExpiresAt:new Date(x.request_expires_at).toISOString()}:null;
  }
  async insertQuote(quote:WriterQuote,signature:string):Promise<void>{
    await this.pool.query(`INSERT INTO rfq_quotes(id,rfq_id,writer_wallet,premium_usd,payout_cap_usd,
      stated_collateral_usd,quoted_at,valid_until,verified_wallet_signature)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[
      quote.id,quote.rfqId,quote.writerWallet,quote.premiumUsd,quote.payoutCapUsd,
      quote.collateralUsd,quote.quotedAt,quote.validUntil,signature
    ]);
  }
  async listRequests(limit=40) {
    const r=await this.pool.query(`SELECT id,underlying_mint,side,strike_usd,expires_at,
      units,max_premium_usd,created_at,request_expires_at
      FROM rfq_requests WHERE request_expires_at>now() AND expires_at>now()
      ORDER BY created_at DESC LIMIT $1`,[Math.min(Math.max(limit,1),50)]);
    return r.rows;
  }
  async listQuotes(rfqId:string,limit=30) {
    const r=await this.pool.query(`SELECT id,rfq_id,premium_usd,payout_cap_usd,
      stated_collateral_usd,quoted_at,valid_until
      FROM rfq_quotes WHERE rfq_id=$1 AND valid_until>now()
      ORDER BY premium_usd ASC LIMIT $2`,[rfqId,Math.min(Math.max(limit,1),50)]);
    return r.rows;
  }
  async close(){await this.pool.end();}
}
