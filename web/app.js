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
  // Browser-only fake-USDC calculator. Does not connect to backend, wallet or RPC.
  const demoForm = document.getElementById("demo-form");
  if (demoForm) {
    const field = id => document.getElementById(id);
    const moneyDemo = n => n.toFixed(2) + " fake USDC";
    const updateDemo = () => {
      const side = field("demo-side").value;
      const strike = Number(field("demo-strike").value);
      const units = Number(field("demo-units").value);
      const premium = Number(field("demo-premium").value);
      const cap = Number(field("demo-cap").value);
      const expiry = Number(field("demo-expiry-price").value);
      const fields = [strike, units, premium, cap, expiry];
      const valid = fields.every(Number.isFinite) && fields.slice(0, 4).every(v => v > 0) &&
        expiry >= 0 && strike <= 1000000 && units <= 1000000000 &&
        premium <= 1000000 && cap <= 1000000 && expiry <= 1000000;
      const error = field("demo-error");
      error.hidden = valid;
      error.textContent = valid ? "" : "Enter finite positive terms and a nonnegative expiry price within the listed limits.";
      if (!valid) {
        for (const id of ["demo-payout", "demo-net", "demo-writer"]) field(id).textContent = "Unavailable";
        return;
      }
      const intrinsic = side === "call" ? Math.max(0, expiry - strike) : Math.max(0, strike - expiry);
      const payout = Math.min(cap, intrinsic * units);
      field("demo-payout").textContent = moneyDemo(payout);
      const net = payout - premium;
      field("demo-net").textContent = (net >= 0 ? "+" : "−") + moneyDemo(Math.abs(net));
      field("demo-net").classList.toggle("positive", net >= 0);
      field("demo-net").classList.toggle("negative", net < 0);
      field("demo-writer").textContent = moneyDemo(cap + premium - payout);
    };
    demoForm.addEventListener("input", updateDemo);
    updateDemo();
  }
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