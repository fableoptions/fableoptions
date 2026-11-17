/** Read-only API. No deposits, execution endpoints or wallet custody. */
import { createServer } from "node:http";
import { FableStore } from "./storage.js";
const store = new FableStore(process.env.DATABASE_URL ?? "");
await store.init();
const port = Number(process.env.PORT ?? 3000);
const host = "0.0.0.0";
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
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
