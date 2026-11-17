/**
 * Cache Pump.fun coin artwork for the public demo at build time, not browser runtime.
 * Only five fixed demo mints. No keys, no execution, no price/risk authorization.
 * Images come from Pump's exact-mint metadata endpoint and are constrained by
 * file size, response MIME, and a public content-host allowlist.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const MINTS = [
  "98kfF7rmsg1QDUEoCqNE7g7M1FdrTt92TEp2CLzypump",
  "DKYcjobF7HPtL9RyQBRdeRQ2iWvizpfbgWwPWNXdpump",
  "4CxjZyMNoF1p6eXHXHv1TWpS2X47CuUmLwtGe18spump",
  "C5xph2yL6gMdxmuLGxJBkGpmuDFfyi5fqkBNhvL6pump",
  "nxPqZ4F7ux8Vph5NFu25rEP6Kx9Gr1U6Fmj36Rjpump"
];
const TARGET = resolve("web/coin-art");
const allowed = (hostname) => [
  "ipfs.io", "gateway.pinata.cloud", "pump.mypinata.cloud",
  "cf-ipfs.com", "arweave.net", "gateway.irys.xyz",
  "image.pump.fun", "pump.fun", "ipfs.filebase.io",
  "metadata.pumparc.fun", "cf-ipfs.com", "nftstorage.link"
].includes(hostname.toLowerCase());
const http = async (url, accept, maxBytes) => {
  const u = new URL(url);
  if (u.protocol !== "https:" || (!allowed(u.hostname) && !u.hostname.endsWith(".ipfs.dweb.link")))
    throw new Error("unapproved_source_host:" + u.hostname);
  const response = await fetch(url, {
    headers:{accept,"user-agent":"FableOptionsDevnetDemoArtwork/1.0"},
    signal:AbortSignal.timeout(14000),redirect:"follow"
  });
  if (!response.ok) throw new Error("download_status_" + response.status);
  const destination = new URL(response.url);
  if (destination.protocol !== "https:" || (!allowed(destination.hostname) && !destination.hostname.endsWith(".ipfs.dweb.link")))
    throw new Error("unapproved_redirect_host");
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("image_too_large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("no_body");
  const chunks=[];let bytes=0;
  try {
    while (true) {
      const next=await reader.read();
      if (next.done) break;
      bytes += next.value.length;
      if (bytes>maxBytes) throw new Error("image_too_large");
      chunks.push(next.value);
    }
  } finally {reader.releaseLock();}
  return {buf:Buffer.concat(chunks),type:(response.headers.get("content-type")||"").split(";")[0]};
};
const source = async (mint) => {
  const u="https://frontend-api-v3.pump.fun/coins-v2/"+mint;
  const response = await fetch(u,{headers:{accept:"application/json"},signal:AbortSignal.timeout(13000)});
  if (!response.ok) throw new Error("pump_metadata_http_"+response.status);
  const data=await response.json();
  if (data?.mint !== mint) throw new Error("mint_mismatch");
  const raw = data.image_uri ?? data.imageUrl;
  if (!raw) throw new Error("missing_image_uri");
  return raw;
};
await mkdir(TARGET,{recursive:true});
const manifest={schemaVersion:1,source:"pump-fun-exact-mint-metadata",images:{}};
let count=0;
for(const mint of MINTS){
  try{
    const origin=await source(mint);
    const {buf,type}=await http(origin,"image/avif,image/webp,image/png,image/jpeg,image/gif",2_000_000);
    const exts={"image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/gif":"gif","image/avif":"avif"};
    const ext=exts[type];
    if(!ext)throw new Error("unsupported_content_type_"+type);
    // Reject HTML masquerading as an image and SVG active content.
    const signatures={
      png:buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
      jpg:buf[0]===255&&buf[1]===216&&buf[2]===255,
      webp:buf.subarray(0,4).toString()==="RIFF"&&buf.subarray(8,12).toString()==="WEBP",
      gif:buf.subarray(0,3).toString()==="GIF",
      avif:buf.subarray(4,12).toString().includes("avif")
    };
    if(!signatures[ext])throw new Error("invalid_image_signature");
    const filename=mint+"."+ext;
    await writeFile(resolve(TARGET,filename),buf);
    manifest.images[mint]="/coin-art/"+filename;
    count++;
    console.log(mint+": cached "+type+" ("+buf.length+" bytes)");
  }catch(error){console.warn(mint+": "+String(error).slice(0,200));}
}
if(!count)throw new Error("No exact-mint Pump.fun artwork could be cached; refusing to commit empty manifest.");
await writeFile(resolve(TARGET,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log("Cached "+count+" / "+MINTS.length+" token images.");
