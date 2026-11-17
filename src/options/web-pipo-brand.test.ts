import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync("web/index.html","utf8");
const styles=readFileSync("web/style.css","utf8");
const orbitStyles=readFileSync("web/orbit.css","utf8");
const canvas=readFileSync("web/orbit-polish.js","utf8");

test("gradient F serves as the Fable wordmark without a separate icon",()=>{
  assert.ok(!html.includes('class="brand-icon"'));
  assert.equal((html.match(/class="brand-letter-f"/g)||[]).length,3);
  assert.equal((html.match(/class="brand-name">able<\/span>/g)||[]).length,3);
  for(const id of ["fable-f-header","fable-f-footer","fable-f-ticket"]){
    assert.ok(html.includes('linearGradient id="'+id+'"'));
    assert.ok(html.includes('stroke="url(#'+id+')"'));
  }
  assert.match(html,/stop-color="#a3ceff"/);
  assert.match(html,/stop-color="#e6b093"/);
  assert.match(html,/aria-label="Fable home"/);
  assert.match(styles,/\.brand-letter-f\s*\{/);
  assert.match(styles,/\.brand \.brand-name\s*\{/);
});
test("Fable's global UI and globe have non-green Pipo overrides",()=>{
  assert.match(styles,/--brand-gradient:linear-gradient\(/);
  assert.match(styles,/\.primary,[\s\S]*?background:linear-gradient\(107deg/);
  assert.match(styles,/\.compare\{background:linear-gradient\(/);
  assert.match(styles,/\.playground\{background:linear-gradient\(/);
  assert.match(orbitStyles,/\.orbit-card\{[\s\S]*?background:rgba\(255,252,255,.96\)/);
  assert.match(orbitStyles,/\.orbit-actions button:last-child\{[^}]*color:#786395/s);
  assert.ok(!canvas.includes("rgba(37,73,52,"));
  assert.ok(!canvas.includes("rgba(43,83,54,"));
});
test("full-width Pipo hero gradient and interactive token images remain intact",()=>{
  assert.match(html,/class="pipo-gradient"/);
  assert.match(html,/class="orbit-wireframe"/);
  assert.match(html,/src="\.\/orbit-polish\.js"/);
  assert.match(html,/id="orbit-call"/);
  assert.match(html,/id="orbit-put"/);
});
