/**
 * Private, gated RFQ service for indicative requests only.
 * No collateral is locked, no liquidity is represented as executable and
 * this API never accepts deposits or executes contracts.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { RfqStore } from "./rfq-store.js";
import { evaluateIndicativeQuote, validateRfq, type RfqRequest, type WriterQuote } from "./rfq.js";
import { isSolanaPublicKey, signingMessage, verifySignedPayload } from "./wallet-auth.js";

const enabled = process.env.RFQ_API_ENABLED === "true";
const store = new RfqStore(process.env.DATABASE_URL ?? "");
await store.init();
const port = Number(process.env.PORT ?? 3000);
const host = "0.0.0.0";
const JSON_LIMIT = 8192;
const MAX_OPEN_MS = 30 * 60 * 1000;
function send(response: ServerResponse, status: number, data: object) {
  response.writeHead(status, {"content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "x-content-type-options": "nosniff"});
  response.end(JSON.stringify(data));
}
async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += part.length;
    if (length > JSON_LIMIT) throw new Error("Body too large");
    chunks.push(part);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Expected JSON object");
  return value as Record<string, unknown>;
}
function keysExact(value: Record<string,unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every(k => keys.includes(k));
}
const requestFields = ["id","buyerWallet","underlyingMint","side","strikePriceUsd","expiresAt","notionalUnits",
  "maximumPremiumUsd","createdAt","requestExpiresAt"];
const quoteFields = ["id","rfqId","writerWallet","premiumUsd","payoutCapUsd","collateralUsd",
  "quotedAt","validUntil","status"];

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (request.method === "GET" && path === "/health") {
      send(response,200,{status:"ok",rfqSubmissionEnabled:enabled,executionsEnabled:false});return;
    }
    if (request.method === "GET" && path === "/v1/rfq/requests") {
      send(response,200,{data:await store.listRequests(),quotesExecutable:false,collateralVerified:false});return;
    }
    if (request.method === "GET" && path === "/v1/rfq/quotes") {
      const id = url.searchParams.get("rfqId") ?? "";
      if (!id || id.length > 80) {send(response,400,{error:"invalid_rfq_id"});return;}
      send(response,200,{data:await store.listQuotes(id),quotesExecutable:false,collateralVerified:false});return;
    }
    if (request.method !== "POST" || !["/v1/rfq/challenge","/v1/rfq/requests","/v1/rfq/quotes"].includes(path)) {
      send(response,404,{error:"not_found"});return;
    }
    if (!enabled) {send(response,403,{error:"rfq_submissions_disabled"});return;}
    const body = await readJson(request);
    if (path === "/v1/rfq/challenge") {
      if (!keysExact(body,["wallet","action"]) ||
          !isSolanaPublicKey(body.wallet) || (body.action !== "request" && body.action !== "quote")) {
        send(response,400,{error:"invalid_challenge"});return;
      }
      const challenge = await store.issueChallenge(body.wallet,body.action);
      send(response,200,{...challenge,action:body.action,network:"solana-mainnet",
        signingFormat:"Fable Options RFQ v1",executionEnabled:false});return;
    }
    if (!keysExact(body,["payload","nonce","signature"]) ||
        typeof body.payload !== "object" || body.payload === null || Array.isArray(body.payload) ||
        typeof body.nonce !== "string" || typeof body.signature !== "string") {
      send(response,400,{error:"invalid_envelope"});return;
    }
    const payload = body.payload as Record<string,unknown>;
    const isRequest = path === "/v1/rfq/requests";
    if (!keysExact(payload,isRequest ? requestFields : quoteFields)) {
      send(response,400,{error:"unexpected_or_missing_fields"});return;
    }
    const action = isRequest ? "request" : "quote";
    const wallet = payload[isRequest ? "buyerWallet" : "writerWallet"];
    if (!isSolanaPublicKey(wallet)) {send(response,400,{error:"invalid_wallet"});return;}
    if (!verifySignedPayload(wallet,body.nonce,action,payload,body.signature)) {
      send(response,401,{error:"wallet_signature_invalid"});return;
    }
    const now = new Date();
    if (isRequest) {
      const rfq = payload as unknown as RfqRequest;
      const errors = validateRfq(rfq,now);
      const start = Date.parse(rfq.createdAt);
      const until = Date.parse(rfq.requestExpiresAt);
      if (!Number.isFinite(start) || now.getTime()-start > 30_000 ||
          !Number.isFinite(until) || until-now.getTime()>MAX_OPEN_MS) errors.push("REQUEST_TIME_INVALID");
      if (errors.length) {send(response,400,{error:"invalid_request",details:errors});return;}
      if (!await store.consumeChallenge(wallet,body.nonce,action)) {
        send(response,409,{error:"challenge_expired_or_used"});return;
      }
      await store.insertRequest(rfq,body.signature);
      send(response,201,{id:rfq.id,state:"indicative",fundingVerified:false,executionAvailable:false});return;
    }
    const quote = payload as unknown as WriterQuote;
    const rfq = await store.fetchRequest(quote.rfqId);
    if (!rfq) {send(response,404,{error:"request_not_found"});return;}
    const evaluation = evaluateIndicativeQuote(rfq,quote,now);
    const quoted = Date.parse(quote.quotedAt);
    if (!Number.isFinite(quoted) || now.getTime()-quoted>30_000)
      evaluation.reasons.push("QUOTE_TIME_INVALID");
    if (evaluation.reasons.length) {
      send(response,400,{error:"invalid_quote",details:evaluation.reasons});return;
    }
    if (!await store.consumeChallenge(wallet,body.nonce,action)) {
      send(response,409,{error:"challenge_expired_or_used"});return;
    }
    await store.insertQuote(quote,body.signature);
    send(response,201,{id:quote.id,state:"indicative",fundingVerified:false,executionAvailable:false});
  } catch (error) {
    const message=String(error);
    if (error instanceof SyntaxError || message.includes("Body too large") || message.includes("Expected JSON object")) {
      send(response,400,{error:"invalid_json"});return;
    }
    if (message.includes("Challenge limit reached")) {send(response,429,{error:"challenge_rate_limit"});return;}
    // Do not expose SQL errors or any private credentials in responses.
    process.stderr.write("[fable] RFQ API error: " + (error instanceof Error ? error.name : "unknown") + "\n");
    send(response,503,{error:"temporarily_unavailable"});
  }
});
server.listen(port,host,()=>process.stderr.write("[fable] gated RFQ service listening on port "+port+"\n"));
process.once("SIGTERM",()=>{server.close();void store.close();});
