import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const markup = readFileSync("web/index.html", "utf8");
const css = readFileSync("web/orbit.css", "utf8");

test("Pipo backdrop spans the complete hero rather than the rectangular orbit stage", () => {
  const heroStart=markup.indexOf('<section class="section orbit-section"');
  const stageStart=markup.indexOf('<div class="orbit-stage"',heroStart);
  const heroEnd=markup.indexOf('</section>',heroStart);
  assert.ok(heroStart>=0 && stageStart>heroStart && heroEnd>stageStart);
  const hero=markup.slice(heroStart,heroEnd);
  const gradient=hero.indexOf('class="pipo-gradient"');
  assert.ok(gradient>=0 && gradient<hero.indexOf('class="orbit-intro"'));
  assert.ok(gradient<hero.indexOf('class="orbit-wireframe"'));
  assert.ok(!hero.slice(stageStart-heroStart).includes('class="pipo-gradient"'),
    "Gradient must not be trapped in the orbit-stage box");
  assert.match(hero,/aria-hidden="true"/);
});
test("full-width backdrop keeps supplied Pipo color recipe and fades at hero edge",()=>{
  assert.match(css,/68\.1% 46\.03%/);
  assert.match(css,/25\.17% 75\.99%/);
  assert.match(css,/53\.11% 12\.71%/);
  assert.match(css,/blur\(8cqmin\)/);
  assert.match(markup,/feTurbulence/);
  assert.match(css,/> \.pipo-gradient \{[\s\S]*?inset:0;[\s\S]*?width:100%;[\s\S]*?border-radius:0;/);
  assert.match(css,/mask-image:linear-gradient\(to bottom/);
  assert.match(css,/\.orbit-frame \{ display:none !important; \}/);
  assert.match(css,/> :not\(\.pipo-gradient\) \{/);
});
