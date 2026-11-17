import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const markup = readFileSync("web/index.html", "utf8");
const css = readFileSync("web/orbit.css", "utf8");
test("Pipo backdrop is inside the orbit world and below its content", () => {
  const start = markup.indexOf('<div class="orbit-stage"');
  const end = markup.indexOf('</article></div>',start);
  assert.ok(start >= 0 && end > start,"missing orbit stage");
  const stage = markup.slice(start,end);
  assert.ok(stage.indexOf('class="pipo-gradient"') > 0,"missing Pipo backdrop");
  assert.ok(stage.indexOf('class="pipo-gradient"') < stage.indexOf('class="orbit-wireframe"'),"background must precede globe");
  assert.ok(stage.indexOf('class="orbit-wireframe"') < stage.indexOf('class="orbit-dots"'),"globe must be behind token buttons");
  assert.ok(stage.indexOf('class="orbit-dots"') < stage.indexOf('class="orbit-card"'),"card must be on top");
  assert.match(stage,/aria-hidden="true"/);
});
test("Pipo keeps user supplied gradients and grain behind the interactive globe", () => {
  assert.match(css,/68\.1% 46\.03%/);
  assert.match(css,/25\.17% 75\.99%/);
  assert.match(css,/53\.11% 12\.71%/);
  assert.match(css,/blur\(8cqmin\)/);
  assert.match(markup,/feTurbulence/); // The inline SVG supplies the grain pass.
  assert.match(css,/\.pipo-gradient\{[^}]*pointer-events:none/s);
  assert.match(css,/\.orbit-wireframe\{z-index:1\}/);
  assert.match(css,/\.orbit-dots\{z-index:2\}/);
  assert.match(css,/\.orbit-card\{z-index:8\}/);
});
