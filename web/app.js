(() => {
  "use strict";
  const move = document.getElementById("move");
  const leverage = document.getElementById("leverage");
  const moveOutput = document.getElementById("move-out");
  const leverageOutput = document.getElementById("lev-out");
  const callResult = document.getElementById("call-result");
  const perpResult = document.getElementById("perp-result");
  const callBar = document.getElementById("call-bar");
  const perpBar = document.getElementById("perp-bar");
  const liquidationNote = document.getElementById("liquidation-note");
  const money = amount => (amount >= 0 ? "+" : "−") + "$" + Math.abs(amount).toFixed(2);
  function update() {
    const pct = Number(move.value);
    const lev = Number(leverage.value);
    const closing = 1 + pct / 100;
    const call = Math.max(0, closing - 1) * 500 - 100;
    const perp = 100 * lev * pct / 100;
    moveOutput.textContent = (pct > 0 ? "+" : "") + pct + "%";
    leverageOutput.textContent = lev + "×";
    for (const [node, value] of [[callResult, call], [perpResult, perp]]) {
      node.textContent = money(value);
      node.classList.toggle("negative", value < 0);
      node.classList.toggle("positive", value >= 0);
    }
    callBar.style.width = Math.min(100, Math.max(4, (call + 100) / 300 * 100)) + "%";
    perpBar.style.width = Math.min(100, Math.max(4, (perp + 100 * lev) / (250 * lev) * 100)) + "%";
    const threshold = 100 / lev;
    liquidationNote.textContent = "Approx. margin exhaustion at −" + threshold.toFixed(1) + "% move";
  }
  move.addEventListener("input", update);
  leverage.addEventListener("input", update);
  update();
  const overlay = document.getElementById("overlay");
  const trigger = document.getElementById("preview-ticket");
  const close = document.getElementById("close-ticket");
  const veil = document.getElementById("veil");
  let restoreFocus;
  const hide = () => { overlay.hidden = true; restoreFocus?.focus(); };
  trigger.addEventListener("click", () => { restoreFocus = document.activeElement; overlay.hidden = false; close.focus(); });
  close.addEventListener("click", hide);
  veil.addEventListener("click", hide);
  document.addEventListener("keydown", event => {
    if (overlay.hidden) return;
    if (event.key === "Escape") hide();
    if (event.key === "Tab") { event.preventDefault(); close.focus(); }
  });
})();