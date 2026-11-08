// ==UserScript==
// @name         PolyTrack slow motion
// @match        https://app-polytrack.kodub.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
// Slows the game's physics clock so you can play in slow motion with your own keys. The physics worker runs one 1 ms
// frame per millisecond of its clock and stamps your key presses with frames from the same clock, so slowing that
// clock slows the race while every press still lands on the frame you pressed it on. The race timer counts physics
// frames, so it shows game time; a replay plays back at normal speed.
// A small panel on the left edge sets the speed (remembered between visits). Turn off the TAS scripts while using it.
(() => {
  const SPEEDS = [1, 0.5, 0.25, 0.1, 0.05], KEY = "slowmoSpeed";
  let speed = 1;
  try { const v = +localStorage.getItem(KEY); if (SPEEDS.includes(v)) speed = v; } catch (e) {}
  const workers = [];
  const send = () => workers.forEach(w => w.postMessage({ __slowmo: speed }));

  // runs inside the worker before the game's code: performance.now() advances at `speed` x real time
  const clock = `(()=>{const P=self.performance,real=P.now.bind(P);let k=${speed},base=real(),off=base;
    P.now=()=>off+(real()-base)*k;
    const set=n=>{off=P.now();base=real();k=n};
    self.addEventListener("message",e=>{if(e.data&&e.data.__slowmo!=null)set(e.data.__slowmo)});
    let h=null;Object.defineProperty(self,"onmessage",{configurable:true,get:()=>h,set(f){h=f;
      self.addEventListener("message",e=>{if(!(e.data&&e.data.__slowmo!=null))f.call(self,e)})}})})();`;

  const RealWorker = window.Worker;
  window.Worker = function (url, opts) {
    const u = new URL(url, location.href);
    if (!/simulation_worker\.bundle\.js$/.test(u.pathname)) return new RealWorker(url, opts);
    const xhr = new XMLHttpRequest();
    xhr.open("GET", u.href, false);
    xhr.send();
    // the worker runs from a blob: URL, so resolve its relative loads against the game's base
    const shim = `(()=>{const B=${JSON.stringify(u.href)},R=x=>typeof x==="string"?new URL(x,B).href:x;` +
      `const o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,x,...a){return o.call(this,m,R(x),...a)};` +
      `const f=self.fetch;self.fetch=(x,...a)=>f(R(x),...a);` +
      `const i=self.importScripts;self.importScripts=(...x)=>i(...x.map(R))})();`;
    const w = new RealWorker(URL.createObjectURL(new Blob([shim + clock + xhr.responseText], { type: "text/javascript" })), opts);
    workers.push(w);
    console.log("[slowmo] physics worker patched, speed " + speed);
    return w;
  };

  function panel() {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:8px;top:45%;z-index:2147483647;background:rgba(20,24,60,.88);color:#fff;" +
      "font:13px sans-serif;padding:6px 8px;border-radius:6px;display:flex;gap:4px;align-items:center";
    const label = document.createElement("span");
    label.textContent = "Speed";
    box.appendChild(label);
    const buttons = SPEEDS.map(v => {
      const b = document.createElement("button");
      b.textContent = v + "×";
      b.style.cssText = "font:bold 12px sans-serif;cursor:pointer;padding:2px 6px";
      b.onclick = () => { speed = v; try { localStorage.setItem(KEY, String(v)); } catch (e) {} send(); mark(); b.blur(); };
      box.appendChild(b);
      return [v, b];
    });
    const mark = () => buttons.forEach(([v, b]) => { b.style.background = v === speed ? "#ffd84a" : ""; });
    mark();
    // keep the game from treating clicks/keys in the panel as game input
    for (const ev of ["keydown", "keyup", "mousedown", "pointerdown", "touchstart"]) box.addEventListener(ev, e => e.stopPropagation());
    document.body.appendChild(box);
  }
  window.__slowmo = { set: v => { speed = v; send(); }, get: () => speed };
  if (document.body) panel(); else addEventListener("DOMContentLoaded", panel);
})();
