/** Read-only API. No deposits, execution endpoints or wallet custody. */
import { createServer } from "node:http";
import { FableStore } from "./storage.js";
import { decorateMarketRow } from "./market-freshness.js";
import { analyzeOption, validatePayoffInput, type PayoffInput } from "./options/analytics.js";
import { theoreticalCappedOption, validateModelInput, type ModelInput } from "./options/pricing.js";
import { RfqStore } from "./options/rfq-store.js";
import { venueReadiness } from "./options/venue-readiness.js";
import { venueCandidateReport } from "./options/venue-candidates.js";
import { evaluateFableVenue, UNVERIFIED_VENUE_FACTS } from "./options/venue-compatibility.js";
import { assessTrackedToken } from "./options/token-risk-view.js";
import { assessExpiryCapWindow, assessExpiryTokenPriceWindow } from "./options/expiry-reference.js";
import { previewUsdcPayout,validateUsdcTerms,type UsdcOptionTerms } from "./options/usdc-settlement-model.js";
const store = new FableStore(process.env.DATABASE_URL ?? "");
await store.init();
const rfqStore = new RfqStore(process.env.DATABASE_URL ?? "");
await rfqStore.init();
const port = Number(process.env.PORT ?? 3000);
const host = "0.0.0.0";
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  try {
    if (request.method !== "GET") {
      response.writeHead(405); response.end(JSON.stringify({error:"method_not_allowed"})); return;
    }
    if (path === "/health") {
      await store.ping();
      response.writeHead(200); response.end(JSON.stringify({status:"ok",tradingEnabled:false})); return;
    }
    if (path === "/v1/options/analyze") {
      const q = url.searchParams;
      const input: PayoffInput = {
        side: q.get("side") as PayoffInput["side"],
        spotPriceUsd: Number(q.get("spotPriceUsd")),
        strikePriceUsd: Number(q.get("strikePriceUsd")),
        premiumUsd: Number(q.get("premiumUsd")),
        units: Number(q.get("units")),
        payoutCapUsd: Number(q.get("payoutCapUsd"))
      };
      const required = ["side","spotPriceUsd","strikePriceUsd","premiumUsd","units","payoutCapUsd"];
      const errors = required.filter(k => !q.has(k) || q.get(k) === "").map(k => "missing_" + k).concat(validatePayoffInput(input));
      if (errors.length) {
        response.writeHead(400); response.end(JSON.stringify({error:"invalid_input",details:errors})); return;
      }
      response.writeHead(200);
      response.end(JSON.stringify(analyzeOption(input)));
      return;
    }
    if (path === "/v1/options/model") {
      const q=url.searchParams;
      const required=["side","spotPriceUsd","strikePriceUsd","units","grossPayoutCapUsd","expirationSeconds","assumedAnnualVolatility"];
      const input:ModelInput={
        side:q.get("side") as ModelInput["side"],
        spotPriceUsd:Number(q.get("spotPriceUsd")),
        strikePriceUsd:Number(q.get("strikePriceUsd")),
        units:Number(q.get("units")),
        grossPayoutCapUsd:Number(q.get("grossPayoutCapUsd")),
        expirationSeconds:Number(q.get("expirationSeconds")),
        assumedAnnualVolatility:Number(q.get("assumedAnnualVolatility")),
        assumedAnnualRiskFreeRate:q.has("assumedAnnualRiskFreeRate")?Number(q.get("assumedAnnualRiskFreeRate")):0
      };
      const errors=required.filter(k=>!q.has(k)||q.get(k)==="").map(k=>"missing_"+k).concat(validateModelInput(input));
      if(errors.length) {
        response.writeHead(400);response.end(JSON.stringify({error:"invalid_input",details:errors}));return;
      }
      response.writeHead(200);response.end(JSON.stringify(theoreticalCappedOption(input)));return;
    }
    if (path === "/v1/options/usdc-payout-preview") {
      const q=url.searchParams;
      const required=["side","underlyingMint","underlyingDecimals","sizeAtomic",
        "strikePricePicoUsd","premiumMicroUsdc","capMicroUsdc",
        "expiryUnixSeconds","expiryPricePicoUsd"];
      if(required.some(k=>!q.has(k)||q.get(k)==="")){
        response.writeHead(400);response.end(JSON.stringify({error:"missing_usdc_preview_parameters"}));return;
      }
      const terms:UsdcOptionTerms={
        side:q.get("side") as UsdcOptionTerms["side"],
        underlyingMint:q.get("underlyingMint")??"",
        underlyingDecimals:Number(q.get("underlyingDecimals")),
        sizeAtomic:q.get("sizeAtomic")??"",
        strikePricePicoUsd:q.get("strikePricePicoUsd")??"",
        premiumMicroUsdc:q.get("premiumMicroUsdc")??"",
        capMicroUsdc:q.get("capMicroUsdc")??"",
        expiryUnixSeconds:Number(q.get("expiryUnixSeconds"))
      };
      try {
        validateUsdcTerms(terms);
        const result=previewUsdcPayout(terms,q.get("expiryPricePicoUsd")??"");
        response.writeHead(200);response.end(JSON.stringify(result));return;
      } catch {
        response.writeHead(400);response.end(JSON.stringify({error:"invalid_usdc_preview_terms"}));return;
      }
    }
    if (path === "/v1/options/integration-gates") {
      response.writeHead(200);
      response.end(JSON.stringify({
        contract:"capped_european_cash_settled_sol_token_options",
        purpose:"mainnet_venue_integration_research",
        ...evaluateFableVenue(UNVERIFIED_VENUE_FACTS),
        acceptingDeposits:false,
        optionsTradingEnabled:false,
        evidenceSource:"No venue certified for Fable; this is not a wallet or deposit endpoint"
      }));
      return;
    }
    if (path === "/v1/options/venue-candidates") {
      response.writeHead(200);
      response.end(JSON.stringify(venueCandidateReport()));
      return;
    }
    if (path === "/v1/options/venue-readiness") {
      response.writeHead(200);
      response.end(JSON.stringify(venueReadiness()));
      return;
    }
    if (path === "/v1/rfq/requests") {
      const data = await rfqStore.listRequests();
      response.writeHead(200);
      response.end(JSON.stringify({data,rfqSubmissionEnabled:false,quotesExecutable:false,collateralVerified:false}));
      return;
    }
    if (path === "/v1/rfq/quotes") {
      const id=url.searchParams.get("rfqId") ?? "";
      if(!id || id.length>80) {
        response.writeHead(400);response.end(JSON.stringify({error:"invalid_rfq_id"}));return;
      }
      const data=await rfqStore.listQuotes(id);
      response.writeHead(200);
      response.end(JSON.stringify({data,rfqSubmissionEnabled:false,quotesExecutable:false,collateralVerified:false}));
      return;
    }
    if (path === "/v1/scanner/health") {
      const data = await store.scannerHealth();
      response.writeHead(200);
      response.end(JSON.stringify(data)); return;
    }
    if (path === "/v1/options/expiry-reference") {
      const mint=url.searchParams.get("mint")??"";
      const endString=url.searchParams.get("endAt")??"";
      const minutes=Number(url.searchParams.get("windowMinutes")??"30");
      const metric=url.searchParams.get("metric")??"token_price";
      const endAt=new Date(endString);
      if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)||
         !endString||!Number.isFinite(endAt.getTime())||
         !Number.isInteger(minutes)||minutes<10||minutes>60||
         !["token_price","market_cap"].includes(metric)||
         endAt.getTime()>Date.now()+30000){
        response.writeHead(400);response.end(JSON.stringify({error:"invalid_reference_parameters"}));return;
      }
      const startAt=new Date(endAt.getTime()-minutes*60000);
      const observations=await store.marketCapObservations(mint,startAt,endAt);
      const reference=metric==="token_price"
        ?assessExpiryTokenPriceWindow(mint,observations,startAt,endAt)
        :assessExpiryCapWindow(mint,observations,startAt,endAt);
      response.writeHead(200);response.end(JSON.stringify(reference));return;
    }
    if (path === "/v1/options/token-risk") {
      const mint=url.searchParams.get("mint")??"";
      if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
        response.writeHead(400);response.end(JSON.stringify({error:"invalid_mint"}));return;
      }
      const token=await store.tokenRiskRow(mint);
      if(!token){response.writeHead(404);response.end(JSON.stringify({error:"mint_not_indexed"}));return;}
      const risk=assessTrackedToken(token);
      response.writeHead(200);response.end(JSON.stringify({mint,tokenSymbol:token.symbol,risk}));
      return;
    }
    if (path === "/v1/discovery") {
      const data = await store.recentCrossings();
      response.writeHead(200);
      response.end(JSON.stringify({
        data:data.map(row=>({...row,risk:assessTrackedToken(row)})),
        thresholdUsd:300000,source:"sampled",
        riskGateEnabled:true,marketCapAloneMakesTradable:false,
        tradingEnabled:false
      })); return;
    }
    if (path === "/v1/launches") {
      const data = await store.recentLaunches();
      response.writeHead(200);
      response.end(JSON.stringify({data:data.map(row => ({...decorateMarketRow(row),risk:assessTrackedToken(row)})),tradingEnabled:false,marketDataCompletenessGuaranteed:false})); return;
    }
    response.writeHead(404); response.end(JSON.stringify({error:"not_found"}));
  } catch (error) {
    process.stderr.write("[fable] api failure " + String(error) + "\n");
    response.writeHead(503); response.end(JSON.stringify({error:"temporarily_unavailable"}));
  }
});
server.listen(port, host, () => process.stderr.write(`[fable] read-only discovery API listening on ${port}\n`));
process.once("SIGTERM", () => { server.close(); void store.close(); void rfqStore.close(); });
