import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const manifest = JSON.parse(readFileSync("web/coin-art/manifest.json","utf8")) as {
  schemaVersion:number;images:Record<string,string>
};
const orbitSource=readFileSync("web/orbit.js","utf8");
test("each curated Pump.fun token has a cached genuine MIME image",()=>{
  assert.equal(manifest.schemaVersion,1);
  const addresses=[...orbitSource.matchAll(/mint:"([1-9A-HJ-NP-Za-km-z]{32,44})"/g)].map(x=>x[1]);
  assert.equal(addresses.length,5);
  assert.equal(new Set(addresses).size,addresses.length);
  for(const address of addresses){
    const image=manifest.images[address];
    assert.ok(image,"No cached coin artwork for "+address);
    assert.match(image,new RegExp("^/coin-art/"+address+"\\.(avif|png|jpg|webp|gif)$"));
    const binary=readFileSync(resolve("web",image.slice(1)));
    assert.ok(binary.length>100,"Empty or very small token image");
    assert.ok(binary.length<2_000_000,"Token image exceeds size limit");
    const recognized=
      (binary[0]===255&&binary[1]===216&&binary[2]===255)||
      binary.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||
      binary.subarray(0,4).toString()==="RIFF"||
      binary.subarray(4,12).toString().includes("avif")||
      binary.subarray(0,3).toString()==="GIF";
    assert.equal(recognized,true,"Invalid image signature: "+address);
  }
});
test("homepage loads image controller after orbit token buttons are built",()=>{
  const html=readFileSync("web/index.html","utf8");
  assert.ok(html.indexOf('src="./orbit.js"')>=0);
  assert.ok(html.indexOf('src="./orbit-polish.js"')>html.indexOf('src="./orbit.js"'));
  assert.match(readFileSync("web/orbit-polish.js","utf8"),/\/coin-art\/manifest\.json/);
});
