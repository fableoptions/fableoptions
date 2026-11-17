/* Fable Orbit — adapted to the existing lightweight static preview.
 * Source component inspiration: user-supplied Quote Orbit, Louis Studios.
 * Curated Pump.fun observations are snapshots, NOT current prices or tradable markets.
 * No wallet, order signing, or network actions.
 */
(() => {
  "use strict";
  const tokens = Object.freeze([
    {name:"PAID",ticker:"PAID",symbol:"P",color:"#e98055",mint:"98kfF7rmsg1QDUEoCqNE7g7M1FdrTt92TEp2CLzypump",marketCap:"$1.42M",price:0.001425},
    {name:"DacityCoin",ticker:"DacityCoin",symbol:"D",color:"#9376d9",mint:"DKYcjobF7HPtL9RyQBRdeRQ2iWvizpfbgWwPWNXdpump",marketCap:"$7.55M",price:0.00755},
    {name:"mihao",ticker:"mihao",symbol:"咪",color:"#62b6a1",mint:"4CxjZyMNoF1p6eXHXHv1TWpS2X47CuUmLwtGe18spump",marketCap:"$10.6M",price:0.01063},
    {name:"BTC",ticker:"BTC",symbol:"₿",color:"#daa864",mint:"C5xph2yL6gMdxmuLGxJBkGpmuDFfyi5fqkBNhvL6pump",marketCap:"$1.53M",price:0.001531},
    {name:"Dacity",ticker:"Dacity",symbol:"d",color:"#6c96c8",mint:"nxPqZ4F7ux8Vph5NFu25rEP6Kx9Gr1U6Fmj36Rjpump",marketCap:"$1.28M",price:0.001284}
  ]);
  const root = document.getElementById("fable-orbit");
  if (!root) return;
  const stage = root.querySelector(".orbit-stage");
  const dots = root.querySelector(".orbit-dots");
  const name = root.querySelector("#orbit-coin-name");
  const cap = root.querySelector("#orbit-coin-cap");
  const price = root.querySelector("#orbit-coin-price");
  const address = root.querySelector("#orbit-coin-address");
  const link = root.querySelector("#orbit-coin-link");
  const counter = root.querySelector("#orbit-counter");
  const card = root.querySelector(".orbit-card");
  const form = document.getElementById("demo-form");
  const buttons = tokens.map((token,index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "orbit-token";
    button.style.setProperty("--token-color",token.color);
    button.setAttribute("aria-label","Select " + token.name + " example");
    const symbol = document.createElement("span");
    symbol.className = "orbit-token-symbol";
    symbol.textContent = token.symbol;
    const label = document.createElement("span");
    label.className = "orbit-token-name";
    label.textContent = token.name;
    button.append(symbol,label);
    button.addEventListener("click",() => choose(index));
    button.addEventListener("focus",() => {paused = true;});
    button.addEventListener("blur",() => {paused = false;});
    dots.append(button);
    return button;
  });
  let current = 0;
  let paused = false;
  let timeout = 0;
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function renderPositions() {
    buttons.forEach((button,index) => {
      const angle = (index-current)*2*Math.PI/tokens.length - Math.PI/2;
      const x = 50 + 39*Math.cos(angle);
      const y = 50 + 37*Math.sin(angle);
      button.style.left = x.toFixed(3) + "%";
      button.style.top = y.toFixed(3) + "%";
      const active = index === current;
      button.classList.toggle("selected",active);
      button.setAttribute("aria-pressed",String(active));
      button.style.zIndex = String(10 + Math.round(y));
    });
  }
  function choose(index) {
    current = (index + tokens.length)%tokens.length;
    const token = tokens[current];
    renderPositions();
    card.classList.remove("orbit-card-switch");
    void card.offsetWidth;
    card.classList.add("orbit-card-switch");
    name.textContent = token.name;
    cap.textContent = token.marketCap + " observed";
    price.textContent = "$" + token.price.toFixed(6);
    address.textContent = token.mint.slice(0,7) + "…" + token.mint.slice(-6);
    address.title = token.mint;
    link.href = "https://pump.fun/coin/" + token.mint;
    link.setAttribute("aria-label","Open " + token.name + " on Pump.fun");
    counter.textContent = (current+1) + " / " + tokens.length;
  }
  function preview(side) {
    const token = tokens[current];
    const assign = (id,value) => {
      const field = document.getElementById(id);
      if (field) field.value = String(value);
    };
    assign("demo-side",side);
    assign("demo-strike",token.price);
    assign("demo-units",100000);
    assign("demo-premium",20);
    assign("demo-cap",100);
    assign("demo-expiry-price",Number((token.price * (side === "call" ? 1.5 : 0.5)).toPrecision(8)));
    const subtitle = document.getElementById("demo-selected-token");
    if (subtitle) subtitle.textContent = token.name + " (" + token.mint.slice(0,6) + "…" + token.mint.slice(-4) + ") · historical snapshot · hypothetical " + side;
    const warning = document.getElementById("demo-orbit-warning");
    if(warning) warning.textContent = "Market cap " + token.marketCap + " was an observation, not live verification. Token identity, bundled supply, market manipulation, liquidity and oracle safety are NOT independently verified. No option is available for purchase.";
    if(form) form.dispatchEvent(new Event("input",{bubbles:true}));
    document.getElementById("playground")?.scrollIntoView({behavior:reduced?"auto":"smooth",block:"start"});
  }
  root.querySelector("#orbit-prev")?.addEventListener("click",() => choose(current-1));
  root.querySelector("#orbit-next")?.addEventListener("click",() => choose(current+1));
  root.querySelector("#orbit-call")?.addEventListener("click",() => preview("call"));
  root.querySelector("#orbit-put")?.addEventListener("click",() => preview("put"));
  stage.addEventListener("mouseenter",() => {paused=true;});
  stage.addEventListener("mouseleave",() => {paused=false;});
  stage.addEventListener("focusin",() => {paused=true;});
  stage.addEventListener("focusout",(event) => {
    if(!stage.contains(event.relatedTarget)) paused=false;
  });
  root.addEventListener("keydown",(event) => {
    if(event.target?.classList?.contains("orbit-token") && (event.key==="ArrowRight" || event.key==="ArrowLeft")) {
      event.preventDefault();
      choose(current+(event.key==="ArrowRight"?1:-1));
      buttons[current].focus();
    }
  });
  if(!reduced) timeout = window.setInterval(() => {
    if(!paused && !document.hidden) choose(current+1);
  },7000);
  root.addEventListener("pagehide",() => window.clearInterval(timeout));
  choose(0);
})();
