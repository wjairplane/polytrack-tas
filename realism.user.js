// ==UserScript==
// @name         PolyTrack realistic car physics
// @match        https://app-polytrack.kodub.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
// Makes your car drive like a real car of the chosen class. After every 1 ms physics step the script adjusts the
// car's velocity in the physics engine's memory:
//  - air drag (force grows with speed squared), so the car has a real top speed;
//  - a traction limit and an engine power limit (power = force x speed), so acceleration fades at speed instead of
//    staying at the game's 15-20 m/s^2;
//  - real gravity in the air (the game adds an extra pull of about 0.8 m/s^2 while airborne), and no velocity damping
//    (the engine slows all motion by 10% per second; real cars only have air drag).
// Grip, braking and steering stay the game's. Ghost cars are not changed. Runs made with it don't match the game's
// physics, so they won't verify on the leaderboard, and the game's own replay of them plays the normal physics.
// A small panel at the left edge picks the car class (remembered between visits). Turn off the TAS and boost scripts
// while using it.
(() => {
  // power to weight (W/kg), traction limit (most acceleration the tyres give, m/s^2) and drag (1/m: deceleration =
  // k x speed^2, set so power and drag balance at the class's top speed)
  const CARS = {
    off: null,
    road: { name: "Road car", pw: 110, amax: 5, k: 0.00055, label: "Road" },         // hot hatch: 0-100 in ~6 s, ~210 km/h
    gt: { name: "GT race car", pw: 330, amax: 8, k: 0.0007, label: "GT" },           // GT3: 0-100 in ~3 s, ~280 km/h
    formula: { name: "Formula car", pw: 900, amax: 11, k: 0.00107, label: "Formula" }, // F1-like: 0-100 in ~2.5 s, ~340 km/h
  };
  const KEY = "realismCar";
  let car = "gt";
  try { const v = localStorage.getItem(KEY); if (v in CARS) car = v; } catch (e) {}
  const workers = [];
  const send = () => workers.forEach(w => w.postMessage({ __realism: CARS[car] }));

  // runs inside the worker: setting + the per-step velocity adjustment
  const shim = `(()=>{let C=${JSON.stringify(CARS[car])};
    const ours=d=>d&&d.__realism!==undefined;
    self.addEventListener("message",e=>{if(ours(e.data))C=e.data.__realism});
    let h=null;Object.defineProperty(self,"onmessage",{configurable:true,get:()=>h,set(f){h=f;
      self.addEventListener("message",e=>{if(!ours(e.data))f.call(self,e)})}});
    // the car's rigid body: found by its position (exact floats) and its weight force (mass x -9.82) 135 floats later;
    // its velocity is 121 floats after the position. The search runs after the car's own step, when the state
    // buffer holds this car, and at most every 100 frames while nothing is found.
    const DT=0.001,G=9.82;let O=-1,miss=0,prev=-1,V=null;
    const find=(H8,i)=>{const F=new Float32Array(H8.buffer),dv=new DataView(H8.buffer),o=i+((H8[i+11]&2)?17:14),
      x=Math.fround(dv.getFloat32(o,true)),y=Math.fround(dv.getFloat32(o+4,true)),z=Math.fround(dv.getFloat32(o+8,true));
      if(O>0&&F[O]===x&&F[O+1]===y&&F[O+2]===z)return O;
      if(miss-->0)return -1;miss=100;
      for(let k=0;k+140<F.length;k++)if(F[k]===x&&F[k+1]===y&&F[k+2]===z&&F[k+135]<-1000){miss=0;return O=k}
      return O=-1};
    self.__realism={after(H8,e,i,r){if(!C||!e.userControls)return;const at=find(H8,i);
      const F=new Float32Array(H8.buffer);if(at<0){V=null;return}
      let vx=F[at+121],vy=F[at+122],vz=F[at+123];
      // a new body or a jump in speed (restart, reset) starts over
      if(at!==prev||!V||Math.hypot(vx-V[0],vy-V[1],vz-V[2])>30){prev=at;V=[vx,vy,vz];return}
      const ax=(vx-V[0])/DT,ay=(vy-V[1])/DT,az=(vz-V[2])/DT,sp=Math.hypot(vx,vy,vz);
      // the engine damps all motion by 0.1 per second, which real cars don't have (air drag is added below): undo it
      const und=1/(1-0.1*DT);vx*=und;vy*=und;vz*=und;
      // airborne: no wheel or wall force acts, only gravity, the game's extra pull and that damping; keep just gravity
      const air=ay<-G-0.5&&Math.hypot(ax+0.1*V[0],az+0.1*V[2])<0.6;
      if(air)vy=V[1]-G*DT;
      // engine power limit: cap forward acceleration at power / (mass x speed) while W is held
      if(r.up&&!air&&sp>1){const ux=vx/sp,uy=vy/sp,uz=vz/sp,af=ax*ux+ay*uy+az*uz,cap=Math.min(C.amax,C.pw/sp);
        if(af>cap){const cut=(af-cap)*DT;vx-=ux*cut;vy-=uy*cut;vz-=uz*cut}}
      // air drag
      const d=C.k*sp*DT;vx-=vx*d;vy-=vy*d;vz-=vz*d;
      F[at+121]=vx;F[at+122]=vy;F[at+123]=vz;V=[vx,vy,vz]}};
  })();`;
  // the worker's per-frame car step, wrapped with the adjustment
  const STEP = 'function n(e,r){t.ccall("updateCarModel","void",["number","boolean","boolean","boolean","boolean","boolean","number"],[e.id,r.up,r.right,r.down,r.left,r.reset,i]);';
  const WRAPPED = 'function n(e,r){t.ccall("updateCarModel","void",["number","boolean","boolean","boolean","boolean","boolean","number"],[e.id,r.up,r.right,r.down,r.left,r.reset,i]);self.__realism.after(t.HEAPU8,e,i,r);';

  const RealWorker = window.Worker;
  window.Worker = function (url, opts) {
    const u = new URL(url, location.href);
    if (!/simulation_worker\.bundle\.js$/.test(u.pathname)) return new RealWorker(url, opts);
    const xhr = new XMLHttpRequest();
    xhr.open("GET", u.href, false);
    xhr.send();
    let src = xhr.responseText;
    if (!src.includes(STEP)) { console.warn("[realism] game version changed; car step not found, realism disabled"); return new RealWorker(url, opts); }
    src = src.replace(STEP, WRAPPED);
    // the worker runs from a blob: URL, so resolve its relative loads against the game's base
    const base = `(()=>{const B=${JSON.stringify(u.href)},R=x=>typeof x==="string"?new URL(x,B).href:x;` +
      `const o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,x,...a){return o.call(this,m,R(x),...a)};` +
      `const f=self.fetch;self.fetch=(x,...a)=>f(R(x),...a);` +
      `const i=self.importScripts;self.importScripts=(...x)=>i(...x.map(R))})();`;
    const w = new RealWorker(URL.createObjectURL(new Blob([base + shim + src], { type: "text/javascript" })), opts);
    workers.push(w);
    console.log("[realism] physics worker patched: " + (CARS[car] ? CARS[car].name : "off"));
    return w;
  };

  function panel() {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:8px;top:38%;z-index:2147483647;background:rgba(20,24,60,.88);color:#fff;" +
      "font:13px sans-serif;padding:6px 8px;border-radius:6px;display:flex;gap:4px;align-items:center";
    const label = document.createElement("span"); label.textContent = "Physics";
    box.appendChild(label);
    const buttons = Object.keys(CARS).map(k => {
      const b = document.createElement("button");
      b.textContent = CARS[k] ? CARS[k].label : "Game";
      b.title = CARS[k] ? CARS[k].name : "The game's own physics";
      b.style.cssText = "font:bold 12px sans-serif;cursor:pointer;padding:2px 6px";
      b.onclick = () => { car = k; try { localStorage.setItem(KEY, k); } catch (e) {} send(); mark(); b.blur(); };
      box.appendChild(b);
      return [k, b];
    });
    const mark = () => buttons.forEach(([k, b]) => { b.style.background = k === car ? "#ffd84a" : ""; });
    mark();
    for (const ev of ["keydown", "keyup", "mousedown", "pointerdown", "touchstart"]) box.addEventListener(ev, e => e.stopPropagation());
    document.body.appendChild(box);
  }
  window.__realismCar = { set: k => { car = k; send(); }, get: () => car };
  if (document.body) panel(); else addEventListener("DOMContentLoaded", panel);
})();
