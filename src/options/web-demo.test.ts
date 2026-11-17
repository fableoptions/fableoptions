import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

type FakeElement = {
  value: string; textContent: string; hidden: boolean; style:{width:string};
  classList:{toggle:(name:string,enabled?:boolean)=>void};
  addEventListener:(event:string,handler:()=>void)=>void;
  focus:()=>void;
};
function mountDemo() {
  const listeners = new Map<string,()=>void>();
  const elements = new Map<string,FakeElement>();
  const defaults:Record<string,string> = {
    move:"30",leverage:"5","demo-side":"call","demo-strike":"1",
    "demo-units":"100","demo-premium":"20","demo-cap":"100",
    "demo-expiry-price":"2"
  };
  const el=(id:string):FakeElement=>{
    if (!elements.has(id)) elements.set(id,{
      value:defaults[id]??"",textContent:"",hidden:id==="overlay"||id==="demo-error",
      style:{width:""},classList:{toggle:()=>{}},
      addEventListener:(type,cb)=>{listeners.set(id+":"+type,cb);},
      focus:()=>{}
    });
    return elements.get(id)!;
  };
  const context={
    document:{
      getElementById:el,activeElement:el("preview-ticket"),
      addEventListener:()=>{}
    }
  };
  runInNewContext(readFileSync("web/app.js","utf8"),context,{timeout:1000});
  const update=()=>{const listener=listeners.get("demo-form:input");assert.ok(listener);listener();};
  return {el,update};
}
test("browser fake-USDC sandbox shows capped call and put outcomes",()=>{
  const d=mountDemo();
  assert.equal(d.el("demo-payout").textContent,"100.00 fake USDC");
  assert.equal(d.el("demo-net").textContent,"+80.00 fake USDC");
  assert.equal(d.el("demo-writer").textContent,"20.00 fake USDC");
  d.el("demo-side").value="put";
  d.el("demo-expiry-price").value="0";
  d.update();
  assert.equal(d.el("demo-payout").textContent,"100.00 fake USDC");
  d.el("demo-expiry-price").value="3";
  d.update();
  assert.equal(d.el("demo-payout").textContent,"0.00 fake USDC");
  assert.equal(d.el("demo-net").textContent,"−20.00 fake USDC");
});
test("browser fake-USDC sandbox rejects invalid inputs instead of producing payouts",()=>{
  const d=mountDemo();
  for(const invalid of ["-1","Infinity","NaN","1000001"]){
    d.el("demo-expiry-price").value=invalid;
    d.update();
    assert.equal(d.el("demo-payout").textContent,"Unavailable");
    assert.equal(d.el("demo-error").hidden,false);
  }
});
