// ==UserScript==
// @name         PolyTrack car boost
// @match        https://app-polytrack.kodub.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
// Makes your car faster by a chosen rate (1.1x, 1.2x, ...): the physics worker steps your car once per 1 ms race frame,
// and this script steps it more often (at 1.2x, twice on every 5th frame), so everything about the car (speed,
// acceleration, steering, jumps) happens that much faster, while the race timer keeps counting real race frames.
// Ghost cars are not changed.
// The game's own replay of a boosted run plays at normal speed.
// A small panel at the left edge picks the rate (remembered between visits). Turn off the TAS scripts while using it.
(() => {
  const RATES = [1, 1.1, 1.2, 1.3, 1.5, 2], KEY = "boostRate";
  let rate = 1;
  try { const v = +localStorage.getItem(KEY); if (RATES.includes(v)) rate = v; } catch (e) {}
  const workers = [];
  const send = () => workers.forEach(w => w.postMessage({ __boost: rate }));

  // inside the worker: how many physics steps your car gets this frame (rate 1.2 -> 1,1,1,1,2,...)
  const steps = `(()=>{let k=${rate},acc=0;self.__boostSteps=()=>{acc+=k;const c=Math.floor(acc+1e-9);acc-=c;return c};
    const ours=d=>d&&d.__boost!=null;
    self.addEventListener("message",e=>{if(ours(e.data)){k=e.data.__boost;acc=0}});
    let h=null;Object.defineProperty(self,"onmessage",{configurable:true,get:()=>h,set(f){h=f;
      self.addEventListener("message",e=>{if(!ours(e.data))f.call(self,e)})}})})();`;
  // the worker's per-frame car step; only cars you drive (userControls) get the extra steps
  const STEP = 'function n(e,r){t.ccall("updateCarModel","void",["number","boolean","boolean","boolean","boolean","boolean","number"],[e.id,r.up,r.right,r.down,r.left,r.reset,i]);';
  // The car state counts its own physics steps (bytes 4-6, and the finish frame in bytes 12-14 once finished) and the
  // race timer shows that count, so after the extra steps both are set back to race frames: the timer stays at real
  // time while the car moves faster.
  // The worker counts a tick's frames first and steps the cars afterwards, so the race frame is counted per step call.
  const BOOSTED = 'function n(e,r){for(let k=e.userControls?self.__boostSteps():1;k>0;k--)t.ccall("updateCarModel","void",["number","boolean","boolean","boolean","boolean","boolean","number"],[e.id,r.up,r.right,r.down,r.left,r.reset,i]);' +
    'if(e.userControls){const H=t.HEAPU8,f=e.__rf=(e.__rf||0)+1;H[i+4]=f&255;H[i+5]=f>>8&255;H[i+6]=f>>16&255;' +
    'if(H[i+11]&2){const g=e.__fin||(e.__fin=f);H[i+12]=g&255;H[i+13]=g>>8&255;H[i+14]=g>>16&255}}';

  const RealWorker = window.Worker;
  window.Worker = function (url, opts) {
    const u = new URL(url, location.href);
    if (!/simulation_worker\.bundle\.js$/.test(u.pathname)) return new RealWorker(url, opts);
    const xhr = new XMLHttpRequest();
    xhr.open("GET", u.href, false);
    xhr.send();
    let src = xhr.responseText;
    if (!src.includes(STEP)) { console.warn("[boost] game version changed; car step not found, boost disabled"); return new RealWorker(url, opts); }
    src = src.replace(STEP, BOOSTED);
    // the worker runs from a blob: URL, so resolve its relative loads against the game's base
    const shim = `(()=>{const B=${JSON.stringify(u.href)},R=x=>typeof x==="string"?new URL(x,B).href:x;` +
      `const o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,x,...a){return o.call(this,m,R(x),...a)};` +
      `const f=self.fetch;self.fetch=(x,...a)=>f(R(x),...a);` +
      `const i=self.importScripts;self.importScripts=(...x)=>i(...x.map(R))})();`;
    const w = new RealWorker(URL.createObjectURL(new Blob([shim + steps + src], { type: "text/javascript" })), opts);
    workers.push(w);
    console.log("[boost] physics worker patched, rate " + rate);
    return w;
  };

  function panel() {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:8px;top:30%;z-index:2147483647;background:rgba(20,24,60,.88);color:#fff;" +
      "font:13px sans-serif;padding:6px 8px;border-radius:6px;display:flex;gap:4px;align-items:center";
    const label = document.createElement("span"); label.textContent = "Car";
    box.appendChild(label);
    const buttons = RATES.map(v => {
      const b = document.createElement("button");
      b.textContent = v + "×";
      b.style.cssText = "font:bold 12px sans-serif;cursor:pointer;padding:2px 6px";
      b.onclick = () => { rate = v; try { localStorage.setItem(KEY, String(v)); } catch (e) {} send(); mark(); b.blur(); };
      box.appendChild(b);
      return [v, b];
    });
    const mark = () => buttons.forEach(([v, b]) => { b.style.background = v === rate ? "#ffd84a" : ""; });
    mark();
    for (const ev of ["keydown", "keyup", "mousedown", "pointerdown", "touchstart"]) box.addEventListener(ev, e => e.stopPropagation());
    document.body.appendChild(box);
  }
  window.__boost = { set: v => { rate = v; send(); }, get: () => rate };
  if (document.body) panel(); else addEventListener("DOMContentLoaded", panel);
})();
