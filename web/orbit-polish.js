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
  const images = new Map(); // Only stores successfully loaded image URLs.
  const sourceKind = new Map();
  const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const safeImage = value => {
    if(typeof value !== "string" || value.length>1200)return null;
    try {
      const u = new URL(value,window.location.href);
      if(u.protocol !== "https:" && u.origin !== window.location.origin)return null;
      return u.href;
    }catch{return null;}
  };
  const localImage = (mint,path) => {
    // The checked-in manifest can only reference local static image assets.
    if(typeof path !== "string" || !new RegExp("^/coin-art/"+mint+"\\.(png|jpg|webp|gif|avif)$").test(path))return null;
    return new URL(path,window.location.origin).href;
  };
  function selectedIndex(){
    const i=tokenButtons.findIndex(button=>button.getAttribute("aria-pressed")==="true");
    return i<0?0:i;
  }
  function syncFeaturedImage(){
    const index=selectedIndex(),mint=mintList[index];
    const url=images.get(mint);
    if(!cardImage || !cardFallback)return;
    if(url){
      if(cardImage.src!==url)cardImage.src=url;
      cardImage.alt="Artwork for selected Pump.fun token";
      cardImage.hidden=false;
      cardFallback.hidden=true;
    }else{
      cardImage.removeAttribute("src");
      cardImage.hidden=true;
      cardFallback.hidden=false;
    }
    if(status)status.textContent=url
      ?(sourceKind.get(mint)==="local"?"Coin artwork cached from Pump.fun metadata":"Coin artwork from public token metadata")
      :"Coin image not available; showing fallback";
  }
  // Append before assigning src so lazy image loading works reliably in
  // Safari, Chrome and mobile browsers. Show text only when image actually fails.
  function setImage(button,mint,url,kind){
    const holder=button?.querySelector(".orbit-token-symbol");
    if(!holder || images.has(mint) || holder.querySelector("img"))return;
    const icon=document.createElement("img");
    icon.className="orbit-coin-art";
    icon.alt="";
    icon.loading="eager"; // Five visible hero icons; don't defer until scroll.
    icon.decoding="async";
    icon.referrerPolicy="no-referrer";
    icon.addEventListener("load",()=>{
      holder.classList.add("has-coin-art");
      images.set(mint,url);
      sourceKind.set(mint,kind);
      syncFeaturedImage();
    },{once:true});
    icon.addEventListener("error",()=>{
      icon.remove();
      holder.classList.remove("has-coin-art");
      images.delete(mint);
      syncFeaturedImage();
    },{once:true});
    holder.appendChild(icon);
    icon.src=url;
  }
  async function loadCachedArtwork(){
    try{
      const response=await fetch("/coin-art/manifest.json",{credentials:"omit",cache:"no-cache"});
      if(!response.ok)throw Error("manifest_unavailable");
      const manifest=await response.json();
      if(manifest?.schemaVersion!==1||typeof manifest.images!=="object")throw Error("invalid_manifest");
      mintList.forEach((mint,index)=>{
        const url=localImage(mint,manifest.images[mint]);
        if(url)setImage(tokenButtons[index],mint,url,"local");
      });
    }catch{/* Fall back to remote metadata when cache is unavailable. */}
  }
  async function loadRemoteArtwork(){
    const url="https://api.dexscreener.com/tokens/v1/solana/"+mintList.join(",");
    const controller=new AbortController();
    const stop=window.setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(url,{signal:controller.signal,credentials:"omit",cache:"default"});
      if(!response.ok)throw Error("market_metadata_unavailable");
      const pairs=await response.json();
      if(!Array.isArray(pairs))throw Error("invalid_metadata");
      mintList.forEach((mint,index)=>{
        const button=tokenButtons[index];
        if(images.has(mint)||button?.querySelector("img"))return;
        const matches=pairs.filter(p=>p?.chainId==="solana"&&p?.baseToken?.address===mint);
        matches.sort((a,b)=>Number(b?.liquidity?.usd||0)-Number(a?.liquidity?.usd||0));
        const image=matches.map(p=>safeImage(p?.info?.imageUrl)).find(Boolean);
        if(image)setImage(button,mint,image,"remote");
      });
    }catch{/* Never invent a coin image if a provider fails. */}
    finally{window.clearTimeout(stop);syncFeaturedImage();}
  }
  if(typeof MutationObserver==="function"){
    const nameNode=root.querySelector("#orbit-coin-name");
    if(nameNode)new MutationObserver(syncFeaturedImage)
      .observe(nameNode,{childList:true,characterData:true,subtree:true});
  }
  syncFeaturedImage();
  // Own-origin cached artwork is primary; remote metadata only fills gaps.
  void loadCachedArtwork().then(loadRemoteArtwork);

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
    ctx.strokeStyle="rgba(116,95,150,"+opacity+")";
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
    ctx.strokeStyle="rgba(116,95,150,.15)";
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
