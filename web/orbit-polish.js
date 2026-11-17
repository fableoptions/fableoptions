/**
 * Fable Orbit visual layer.
 * Draws a high-quality, low-contrast 3D wireframe and loads the actual
 * coin icon from DEX Screener's public token-pairs metadata, by exact mint.
 * No wallet connection, signing, trading endpoint or price assumption.
 */
(() => {
  "use strict";
  const root = document.getElementById("fable-orbit");
  if (!root) return;
  const stage = root.querySelector(".orbit-stage");
  const canvas = root.querySelector(".orbit-wireframe");
  const cardImage = root.querySelector("#orbit-feature-image");
  const cardFallback = root.querySelector("#orbit-feature-fallback");
  const status = root.querySelector("#orbit-image-status");
  const tokenButtons = Array.from(root.querySelectorAll(".orbit-token"));
  const mintList = [
    "98kfF7rmsg1QDUEoCqNE7g7M1FdrTt92TEp2CLzypump",
    "DKYcjobF7HPtL9RyQBRdeRQ2iWvizpfbgWwPWNXdpump",
    "4CxjZyMNoF1p6eXHXHv1TWpS2X47CuUmLwtGe18spump",
    "C5xph2yL6gMdxmuLGxJBkGpmuDFfyi5fqkBNhvL6pump",
    "nxPqZ4F7ux8Vph5NFu25rEP6Kx9Gr1U6Fmj36Rjpump"
  ];
  const images = new Map();
  const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  function selectedIndex() {
    const i = tokenButtons.findIndex(button => button.getAttribute("aria-pressed") === "true");
    return i < 0 ? 0 : i;
  }
  function setStatus(value) {
    if (status) status.textContent = value;
  }
  function syncFeaturedImage() {
    const index = selectedIndex();
    const url = images.get(mintList[index]);
    const button = tokenButtons[index];
    if (!cardImage || !cardFallback) return;
    if (url) {
      cardImage.src = url;
      cardImage.alt = "Verified-address token metadata thumbnail";
      cardImage.hidden = false;
      cardFallback.hidden = true;
      setStatus("Coin artwork from token-pair metadata · identity not audited");
    } else {
      cardImage.removeAttribute("src");
      cardImage.hidden = true;
      cardFallback.hidden = false;
      setStatus("Artwork unavailable from metadata provider");
    }
    button?.setAttribute("aria-label", "Selected " + (root.querySelector("#orbit-coin-name")?.textContent || "coin"));
  }
  function setImage(button, url) {
    const holder = button.querySelector(".orbit-token-symbol");
    if (!holder) return;
    const icon = document.createElement("img");
    icon.className = "orbit-coin-art";
    icon.alt = "";
    icon.loading = "lazy";
    icon.referrerPolicy = "no-referrer";
    icon.decoding = "async";
    icon.addEventListener("load", () => {
      holder.classList.add("has-coin-art");
      holder.appendChild(icon);
      syncFeaturedImage();
    }, {once:true});
    icon.addEventListener("error", () => { icon.remove(); }, {once:true});
    icon.src = url;
  }
  const safeImage = input => {
    if (typeof input !== "string" || input.length > 1200) return null;
    try {
      const parsed = new URL(input);
      if (parsed.protocol !== "https:" || !parsed.hostname) return null;
      return parsed.href;
    } catch { return null; }
  };
  async function loadMetadata() {
    // All images are served by their source hosts, never invented URLs.
    // Don't consume scanner risk data or treat these images as market verification.
    if (typeof fetch !== "function") return;
    const url = "https://api.dexscreener.com/tokens/v1/solana/" + mintList.join(",");
    const controller = new AbortController();
    const stop = window.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url, {signal:controller.signal,credentials:"omit",cache:"no-store"});
      if (!response.ok) throw new Error("metadata_service_unavailable");
      const pairs = await response.json();
      if (!Array.isArray(pairs)) throw new Error("unexpected_metadata_shape");
      for (const mint of mintList) {
        const matches = pairs.filter(pair =>
          pair?.chainId === "solana" && pair?.baseToken?.address === mint &&
          Number.isFinite(pair?.liquidity?.usd));
        matches.sort((a,b) => Number(b.liquidity.usd) - Number(a.liquidity.usd));
        const image = matches.map(pair => safeImage(pair?.info?.imageUrl)).find(Boolean);
        if (image) images.set(mint, image);
      }
      tokenButtons.forEach((button,index) => {
        const image = images.get(mintList[index]);
        if (image) setImage(button,image);
      });
      syncFeaturedImage();
    } catch {
      setStatus("Live coin image lookup unavailable · illustrative icons shown");
    } finally { window.clearTimeout(stop); }
  }
  if (typeof MutationObserver === "function") {
    const nameNode = root.querySelector("#orbit-coin-name");
    if (nameNode) new MutationObserver(syncFeaturedImage)
      .observe(nameNode,{characterData:true,childList:true,subtree:true});
  }
  syncFeaturedImage();
  void loadMetadata();

  // The globe is decorative; explicit token buttons provide keyboard control.
  if (!canvas?.getContext) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  let rot = 0, last = 0, frame = 0, visible = true;
  const sizing = {width:1,height:1,dpr:1};
  function resize() {
    const width = Math.max(1,stage.clientWidth);
    const height = Math.max(1,stage.clientHeight);
    const dpr = Math.min(2,window.devicePixelRatio||1);
    sizing.width=width;sizing.height=height;sizing.dpr=dpr;
    canvas.width=Math.round(width*dpr);
    canvas.height=Math.round(height*dpr);
    canvas.style.width=width+"px";
    canvas.style.height=height+"px";
  }
  if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(stage);
  else window.addEventListener("resize",resize);
  resize();
  function project(lat,lon,radius,cx,cy) {
    const phi = lat * Math.PI/180;
    const theta = (lon+rot) * Math.PI/180;
    const x = radius*Math.cos(phi)*Math.sin(theta);
    const py = radius*Math.sin(phi);
    const z = radius*Math.cos(phi)*Math.cos(theta);
    const tilt=.39;
    const y = py*Math.cos(tilt)-z*Math.sin(tilt);
    const depth = py*Math.sin(tilt)+z*Math.cos(tilt);
    const scale = 2400/(2400-depth);
    return {x:cx+x*scale,y:cy-y*scale,z:depth/radius};
  }
  function drawLine(points,opacity) {
    if (points.length<2) return;
    ctx.strokeStyle="rgba(37,73,52,"+opacity+")";
    ctx.lineWidth=.85;
    ctx.beginPath();
    points.forEach((pt,i) => i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y));
    ctx.stroke();
  }
  function draw() {
    const {width:w,height:h,dpr} = sizing;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const radius=Math.min(w*.405,h*.70);
    const cx=w/2,cy=h*.84;
    ctx.save();
    ctx.beginPath();ctx.rect(w*.035,0,w*.93,h);ctx.clip();
    for(let lat=0;lat<=85;lat+=15) {
      // Segments are faded on the back of the sphere.
      let segment=[],lastSide=false;
      for(let lon=-180;lon<=180;lon+=3) {
        const pt=project(lat,lon,radius,cx,cy),front=pt.z>-.1;
        if(front!==lastSide&&segment.length){drawLine(segment,lastSide?.095:.025);segment=[];}
        segment.push(pt);lastSide=front;
      }
      drawLine(segment,lastSide?.095:.025);
    }
    for(let lon=0;lon<360;lon+=18){
      const segment=[];
      for(let lat=0;lat<=90;lat+=3)segment.push(project(lat,lon,radius,cx,cy));
      drawLine(segment,.065);
    }
    ctx.beginPath();
    ctx.arc(cx,cy,radius,Math.PI,2*Math.PI);
    ctx.lineWidth=1;
    ctx.strokeStyle="rgba(43,83,54,.15)";
    ctx.stroke();
    ctx.restore();
  }
  const tick = timestamp => {
    frame=requestAnimationFrame(tick);
    if(!visible || document.hidden) return;
    if(timestamp-last<33)return;
    const delta=last?Math.min(.05,(timestamp-last)/1000):0;
    last=timestamp;
    if (!reduced) rot=(rot+delta*2.4)%360;
    draw();
  };
  if (typeof IntersectionObserver==="function") {
    new IntersectionObserver(entries => { visible=entries[0]?.isIntersecting ?? true; })
      .observe(stage);
  }
  if(reduced) draw();
  else frame=requestAnimationFrame(tick);
  window.addEventListener("pagehide",() => cancelAnimationFrame(frame),{once:true});
})();
