import test from "node:test";
import assert from "node:assert/strict";
import {assessMarketJump} from "./market-anomaly.js";
test("flags a 4x price jump in a fresh same-source interval",()=>{
 const x=assessMarketJump(100000,400000,60,true);
 assert.equal(x.anomalous,true);
 assert.equal(x.reason,"rapid_jump");
});
test("flags crashes as well as pumps",()=>{
 assert.equal(assessMarketJump(300000,60000,100,true).reason,"rapid_collapse");
});
test("never compares incompatible sources or widely spaced samples",()=>{
 assert.equal(assessMarketJump(100000,900000,60,false).anomalous,false);
 assert.equal(assessMarketJump(100000,900000,600,true).anomalous,false);
});
test("missing historical cap is not branded manipulation",()=>{
 assert.equal(assessMarketJump(null,400000,10,true).anomalous,false);
});
