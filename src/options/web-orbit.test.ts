import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

type Handler = (event?: any) => void;
class NodeMock {
  textContent = "";
  value = "";
  href = "";
  title = "";
  hidden = false;
  children: NodeMock[] = [];
  events = new Map<string, Handler>();
  attributes = new Map<string,string>();
  classValues = new Set<string>();
  className = "";
  style = {
    left:"", top:"", zIndex:"",
    setProperty: (_key:string,_value:string) => {}
  };
  classList = {
    add:(v:string)=>this.classValues.add(v),
    remove:(v:string)=>this.classValues.delete(v),
    toggle:(v:string,flag:boolean)=>{if(flag)this.classValues.add(v);else this.classValues.delete(v);},
    contains:(v:string)=>this.classValues.has(v)
  };
  addEventListener(name:string,listener:Handler){this.events.set(name,listener);}
  dispatchEvent(event:{type:string}){this.events.get(event.type)?.(event);}
  append(...nodes:NodeMock[]){this.children.push(...nodes);}
  setAttribute(name:string,value:string){this.attributes.set(name,value);}
  getAttribute(name:string){return this.attributes.get(name);}
  contains(other:NodeMock){return other===this || this.children.includes(other);}
  scrollIntoView(){}
  focus(){}
  get offsetWidth(){return 100;}
  querySelector(_sel:string):NodeMock {throw new Error("override");}
}
function setup(){
  const selectors=new Map<string,NodeMock>();
  const ids=new Map<string,NodeMock>();
  const root=new NodeMock();
  const stage=new NodeMock();
  const dots=new NodeMock();
  for(const selector of [".orbit-card","#orbit-coin-name","#orbit-coin-cap",
    "#orbit-coin-price","#orbit-coin-address","#orbit-coin-link",
    "#orbit-counter","#orbit-prev","#orbit-next","#orbit-call","#orbit-put"]){
    selectors.set(selector,new NodeMock());
  }
  selectors.set(".orbit-stage",stage);
  selectors.set(".orbit-dots",dots);
  root.querySelector=(sel:string)=> {
    const node=selectors.get(sel);if(!node)throw new Error("missing "+sel);return node;
  };
  ids.set("fable-orbit",root);
  const form=new NodeMock();
  ids.set("demo-form",form);
  ids.set("playground",new NodeMock());
  ids.set("demo-selected-token",new NodeMock());
  ids.set("demo-orbit-warning",new NodeMock());
  for(const id of ["demo-side","demo-strike","demo-units","demo-premium","demo-cap","demo-expiry-price"])
    ids.set(id,new NodeMock());
  let calculations=0;
  form.addEventListener("input",()=>{calculations++;});
  const document={
    hidden:false,
    getElementById:(id:string)=>ids.get(id)||null,
    createElement:()=>new NodeMock()
  };
  runInNewContext(readFileSync("web/orbit.js","utf8"),{
    document,window:{matchMedia:()=>({matches:true}),clearInterval:()=>{}},
    Event:class{constructor(public type:string){}}
  },{timeout:1000});
  const press=(selector:string)=>selectors.get(selector)!.events.get("click")!();
  return {selectors,ids,dots,press,get calculations(){return calculations;}};
}
test("token orbit selects real, distinct Pump.fun addresses and updates center card",()=>{
  const app=setup();
  assert.equal(app.dots.children.length,5);
  assert.equal(app.selectors.get("#orbit-coin-name")!.textContent,"PAID");
  app.dots.children[1].events.get("click")!();
  assert.equal(app.selectors.get("#orbit-coin-name")!.textContent,"DacityCoin");
  assert.equal(app.selectors.get("#orbit-coin-price")!.textContent,"$0.007550");
  app.press("#orbit-next");
  assert.equal(app.selectors.get("#orbit-coin-name")!.textContent,"mihao");
  assert.equal(app.dots.children[2].getAttribute("aria-pressed"),"true");
  assert.equal(app.dots.children[0].getAttribute("aria-pressed"),"false");
});
test("call and put buttons only populate the local fake-USDC calculator",()=>{
  const app=setup();
  app.press("#orbit-call");
  assert.equal(app.ids.get("demo-side")!.value,"call");
  assert.equal(app.ids.get("demo-strike")!.value,"0.001425");
  assert.equal(app.ids.get("demo-units")!.value,"100000");
  assert.equal(app.ids.get("demo-expiry-price")!.value,"0.0021375");
  app.press("#orbit-put");
  assert.equal(app.ids.get("demo-side")!.value,"put");
  assert.equal(app.ids.get("demo-expiry-price")!.value,"0.0007125");
  assert.equal(app.calculations,2);
  assert.match(app.ids.get("demo-orbit-warning")!.textContent,/NOT independently verified/);
  assert.match(app.ids.get("demo-selected-token")!.textContent,/hypothetical put/);
});
