import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync("web/index.html","utf8");
const styles=readFileSync("web/style.css","utf8");
const orbitStyles=readFileSync("web/orbit.css","utf8");
const canvas=readFileSync("web/orbit-polish.js","utf8");

test("Fable uses an ordinary gradient wordmark with no separate icon",()=>{
  assert.ok(!html.includes('class="brand-icon"'));
  assert.ok(!html.includes('class="brand-letter-f"'));
  assert.equal((html.match(/class="brand-name">Fable<\/span>/g)||[]).length,3);
  assert.match(html,/aria-label="Fable home"/);
  assert.match(styles,/\.brand-name\s*\{[^}]*background:linear-gradient/s);
  assert.match(styles,/\.brand-name\s*\{[^}]*-webkit-background-clip:text/s);
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
