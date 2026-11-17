/** Read-only API. No deposits, execution endpoints or wallet custody. */
import { createServer } from "node:http";
import { FableStore } from "./storage.js";
import { analyzeOption, validatePayoffInput, type PayoffInput } from "./options/analytics.js";
import { theoreticalCappedOption, validateModelInput, type ModelInput } from "./options/pricing.js";
const store = new FableStore(process.env.DATABASE_URL ?? "");
await store.init();
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
    if (path === "/v1/discovery") {
      const data = await store.recentCrossings();
      response.writeHead(200);
      response.end(JSON.stringify({data,thresholdUsd:300000,source:"sampled",tradingEnabled:false})); return;
    }
    if (path === "/v1/launches") {
      const data = await store.recentLaunches();
      response.writeHead(200);
      response.end(JSON.stringify({data,tradingEnabled:false})); return;
    }
    response.writeHead(404); response.end(JSON.stringify({error:"not_found"}));
  } catch (error) {
    process.stderr.write("[fable] api failure " + String(error) + "\n");
    response.writeHead(503); response.end(JSON.stringify({error:"temporarily_unavailable"}));
  }
});
server.listen(port, host, () => process.stderr.write(`[fable] read-only discovery API listening on ${port}\n`));
process.once("SIGTERM", () => { server.close(); void store.close(); });
