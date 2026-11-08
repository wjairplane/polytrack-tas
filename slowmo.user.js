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
// A small panel on the left edge sets the speed (remembered between visits). It can also show a leaderboard run's
// inputs: pick the track, Load, pick a run; W/A/S/D light up in the middle of the screen as that run held them at the
// race timer's time, with a strip of its next second of inputs and the next key change. With "Wait for me" on, the race
// pauses at each of that run's key changes until your keys match, and what you press while it waits lands on that frame,
// so following it reproduces the run exactly. Turn off the TAS scripts while using it.
(() => {
  const SPEEDS = [1, 0.5, 0.25, 0.1, 0.05], KEY = "slowmoSpeed";
  let speed = 1;
  try { const v = +localStorage.getItem(KEY); if (SPEEDS.includes(v)) speed = v; } catch (e) {}
  const workers = [];
  const send = () => workers.forEach(w => w.postMessage({ __slowmo: speed }));

  // runs inside the worker before the game's code: performance.now() advances at `speed` x real time
  // "Wait for me": before simulating a frame where the leaderboard run changes a key, the physics loop waits until the
  // player's keys match the run's; presses made while it waits are moved onto that frame
  const clock = `(()=>{const P=self.performance,real=P.now.bind(P);let k=${speed},base=real(),off=base;
    P.now=()=>off+(real()-base)*k;
    const set=n=>{off=P.now();base=real();k=n};
    let G=null;const held=(l,f)=>{let lo=0,hi=l.length;while(lo<hi){const m=lo+hi>>1;if(l[m]<=f)lo=m+1;else hi=m}return lo%2===1};
    const ghost=g=>{if(!g){G=null;return}const t=new Set();let end=0;for(const x in g)for(const f of g[x]){t.add(f);end=Math.max(end,f+1)}G={k:g,t,end}};
    self.__slowWaitAll=cars=>{if(!G)return false;const c=cars.find(c=>c.userControls&&c.hasStarted&&!c.isPaused&&c.frames<G.end);
      if(!c||!G.t.has(c.frames))return false;const f=c.frames,b=c.userControls.buffer;let s=c.userControls;for(const x of b)if(x.frame<=f)s=x;
      for(const x of ["up","right","down","left"])if(!!s[x]!==held(G.k[x],f)){for(const y of b)if(y.frame>f)y.frame=f;return true}return false};
    const ours=d=>d&&(d.__slowmo!=null||"__slowmoGhost" in d);
    self.addEventListener("message",e=>{if(!ours(e.data))return;if(e.data.__slowmo!=null)set(e.data.__slowmo);if("__slowmoGhost" in e.data)ghost(e.data.__slowmoGhost)});
    let h=null;Object.defineProperty(self,"onmessage",{configurable:true,get:()=>h,set(f){h=f;
      self.addEventListener("message",e=>{if(!ours(e.data))f.call(self,e)})}})})();`;
  const LOOP = "for(;o>.001;){o-=.001;for(const t of e){";
  let waitOn = false;
  try { waitOn = localStorage.getItem("slowmoWait") === "1"; } catch (e) {}
  const sendGhost = () => workers.forEach(w => w.postMessage({ __slowmoGhost: waitOn && ghost ? { up: ghost.keys.W, right: ghost.keys.D, down: ghost.keys.S, left: ghost.keys.A } : null }));

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
    let src = xhr.responseText;
    if (src.includes(LOOP)) src = src.replace(LOOP, "for(;o>.001;){if(self.__slowWaitAll(e)){o=0;break}o-=.001;for(const t of e){");
    else console.warn("[slowmo] game version changed; Wait for me won't work");
    const w = new RealWorker(URL.createObjectURL(new Blob([shim + clock + src], { type: "text/javascript" })), opts);
    workers.push(w);
    console.log("[slowmo] physics worker patched, speed " + speed);
    sendGhost();
    return w;
  };

  // ---- a leaderboard run's inputs, shown in the middle of the screen in time with the race timer ----
  const TRACKS = {"Summer 1":"5803f9e963625804e3de3246d043dc7dde847aa32e991f7f7326b0453f1fa038","Summer 2":"7eac4fee1111152cfba4d3737410264ca0f22c7f5a2211e79f0099589b8b48c0","Summer 3":"148826aa16ffaa23dbc453b32cff05e025ddbce1773fc7733cc13d218926515a","Summer 4":"93c7363dfea7fb09ca1d23b72cad5df43a30841d41c8ff25fb544c85bb03c7ae","Summer 5":"7603aaeffa1989a649dfaa8e1804bed4481b49df233e377687d0669899566e52","Summer 6":"c117823cf6788e3247b9ee63a0c091c07352bbe352c650a7790dc6718148c2fa","Summer 7":"e4bcaca3a583bb0eb62a700a69d14e89c852f0c5bf740fca76e0519ebdfc9ab1","Winter 1":"7239b17057127936907a805b0caa5d8c6f6c97eca9bdabf1a5312dce479629b7","Winter 2":"99864b635d1891d22e17eb9267527a07a92c49c0f02893729fa2ded90e3ca0f9","Winter 3":"a5341fe706097cff2a3812a3fc0d87399254557328351ae8e5c882700fc1a196","Winter 4":"7d134c939df80c676a258266201beedd3b93572d5603f3ff4339ff8679803715","Winter 5":"2fe4bd46b0075cc25fc770ce50adbb68447cf493c999635bb272d231811dd264","Desert 1":"c20b4ee3cd517ca6cae7e43f047548757287fbd08ba81b97892a3ef520159a34","Desert 2":"88647ea04145fbbbb19b55f1590e038fb0378acb2571110f02cb545cc46b0d57","Desert 3":"2806030c503abb41a1a26fa9a570888be14296172bb273798ef0ad87a108a2ec","Desert 4":"4697ea67b18c3f49b30a3d8884602115536650bc5435c88e3732e64d21a72d33","Desert 5":"e5d084e06db4ab71196fea44efeceb23c8561266a78669c324a38f92581fe2db"};
  const API = "https://vps.kodub.com/v6/", VERSION = (location.pathname.match(/\d+\.\d+\.\d+/) || ["0.6.3"])[0];
  const get = async path => { const r = await fetch(API + path); if (!r.ok) throw new Error(r.status + " " + r.statusText); return r.json(); };
  // recording: base64url of zlib data holding 5 lists (up, right, down, left, reset); each a 3-byte LE count, then
  // 3-byte LE deltas whose running sums are the frames where that key toggles (1 frame = 1 ms)
  async function decode(rec) {
    const b64 = rec.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - rec.length % 4) % 4);
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const buf = new Uint8Array(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
    const u24 = p => buf[p] | buf[p + 1] << 8 | buf[p + 2] << 16, lists = [];
    for (let k = 0, p = 0; k < 5; k++) { const n = u24(p), l = []; let acc = 0; for (let i = 0; i < n; i++) { const d = u24(p + 3 + 3 * i); acc = i ? acc + d : d; l.push(acc); } lists.push(l); p += 3 + 3 * n; }
    return { W: lists[0], D: lists[1], S: lists[2], A: lists[3] };
  }
  let ghost = null;                                  // { name, time, keys: {W,A,S,D: toggle frames} }
  const held = (l, f) => { let lo = 0, hi = l.length; while (lo < hi) { const m = lo + hi >> 1; if (l[m] <= f) lo = m + 1; else hi = m; } return lo % 2 === 1; };
  // the Current box shows the last checkpoint's split before the running time (and keeps it after a restart),
  // so the running time is the last one in it
  const raceMs = () => { const el = document.querySelector(".timer-ui > .center"); const all = el ? [...el.innerText.replace(/\s/g, "").matchAll(/(\d+):(\d\d)\.(\d{3})/g)] : [];
    const m = all[all.length - 1]; return m ? (+m[1] * 60 + +m[2]) * 1000 + +m[3] : 0; };

  function overlay() {
    const o = document.createElement("div");
    o.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483646;pointer-events:none;" +
      "display:none;flex-direction:column;align-items:center;gap:6px;font:bold 15px sans-serif;color:#fff";
    const title = document.createElement("div");
    title.style.cssText = "background:rgba(20,24,60,.7);padding:2px 8px;border-radius:5px;font-size:13px";
    const keys = document.createElement("div");
    keys.style.cssText = "display:grid;grid-template-columns:repeat(3,40px);grid-template-rows:repeat(2,40px);gap:4px";
    const cap = {};
    for (const [k, col, row] of [["W", 2, 1], ["A", 1, 2], ["S", 2, 2], ["D", 3, 2]]) {
      const c = document.createElement("div"); c.textContent = k;
      c.style.cssText = `grid-column:${col};grid-row:${row};display:flex;align-items:center;justify-content:center;border-radius:6px;border:2px solid rgba(255,255,255,.7)`;
      keys.appendChild(c); cap[k] = c;
    }
    // timeline: 250 ms back to 1000 ms ahead; a bar where the run holds the key; the white line is now
    const BACK = 250, AHEAD = 1000, cv = document.createElement("canvas"); cv.width = 400; cv.height = 76;
    cv.style.cssText = "background:rgba(20,24,60,.7);border-radius:5px";
    // the next key change: what to press or release, and how soon (in game time)
    const hint = document.createElement("div");
    hint.style.cssText = "background:rgba(20,24,60,.75);padding:3px 10px;border-radius:5px;font-size:15px";
    o.append(title, hint, keys, cv); document.body.appendChild(o);
    const NAMES = { W: "W", A: "A", S: "S", D: "D" };
    const nextChange = f => { let nf = Infinity; for (const k of rows) { const l = ghost.keys[k]; let lo = 0, hi = l.length; while (lo < hi) { const m = lo + hi >> 1; if (l[m] < f) lo = m + 1; else hi = m; } if (lo < l.length) nf = Math.min(nf, l[lo]); }
      if (nf === Infinity) return null; const ch = rows.filter(k => held(ghost.keys[k], nf) !== held(ghost.keys[k], nf - 1)).map(k => ({ k, down: held(ghost.keys[k], nf) })); return { nf, ch }; };
    const g = cv.getContext("2d"), rows = ["W", "A", "S", "D"], X = 22, PX = (cv.width - X - 4) / (BACK + AHEAD);
    const tick = () => {
      if (ghost) {
        o.style.display = "flex"; const f = raceMs();
        title.textContent = `${ghost.name}  ${ghost.time}`;
        const nx = nextChange(f), soon = nx && nx.nf - f <= 1;
        for (const k of rows) { const on = held(ghost.keys[k], f); cap[k].style.background = on ? "#ffd84a" : "rgba(20,24,60,.55)"; cap[k].style.color = on ? "#14183c" : "#fff";
          cap[k].style.borderColor = nx && nx.ch.some(c => c.k === k) ? "#ff6b57" : "rgba(255,255,255,.7)"; }
        if (!nx) { hint.textContent = "end of the run"; hint.style.background = "rgba(20,24,60,.75)"; }
        else { const what = nx.ch.map(c => (c.down ? "press " : "release ") + NAMES[c.k]).join(" + ");
          hint.textContent = soon && waitOn ? "Waiting: " + what : "Next: " + what + " in " + ((nx.nf - f) / 1000).toFixed(3) + " s";
          hint.style.background = soon ? "rgba(226,72,58,.9)" : "rgba(20,24,60,.75)"; }
        g.clearRect(0, 0, cv.width, cv.height); g.font = "bold 12px sans-serif";
        rows.forEach((k, r) => {
          const y = 4 + r * 18; g.fillStyle = "#fff"; g.fillText(k, 6, y + 12); g.fillStyle = "#ffd84a";
          for (let t = f - BACK; t < f + AHEAD; t++) if (held(ghost.keys[k], t)) { let e = t; while (e < f + AHEAD && held(ghost.keys[k], e)) e++; g.fillRect(X + (t - f + BACK) * PX, y, (e - t) * PX, 14); t = e; }
        });
        g.fillStyle = "#fff"; g.fillRect(X + BACK * PX - 1, 0, 2, cv.height);
      } else o.style.display = "none";
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function panel() {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:8px;top:45%;z-index:2147483647;background:rgba(20,24,60,.88);color:#fff;" +
      "font:13px sans-serif;padding:6px 8px;border-radius:6px;display:flex;flex-direction:column;gap:5px";
    const row = () => { const r = document.createElement("div"); r.style.cssText = "display:flex;gap:4px;align-items:center"; box.appendChild(r); return r; };
    const r1 = row(), label = document.createElement("span");
    label.textContent = "Speed";
    r1.appendChild(label);
    const buttons = SPEEDS.map(v => {
      const b = document.createElement("button");
      b.textContent = v + "×";
      b.style.cssText = "font:bold 12px sans-serif;cursor:pointer;padding:2px 6px";
      b.onclick = () => { speed = v; try { localStorage.setItem(KEY, String(v)); } catch (e) {} send(); mark(); b.blur(); };
      r1.appendChild(b);
      return [v, b];
    });
    const mark = () => buttons.forEach(([v, b]) => { b.style.background = v === speed ? "#ffd84a" : ""; });
    mark();
    // show a leaderboard run's inputs: pick the track, Load its top 50, pick a run
    const r2 = row(), track = document.createElement("select"), load = document.createElement("button");
    for (const n of Object.keys(TRACKS)) track.add(new Option(n, n));
    try { const t = localStorage.getItem("slowmoTrack"); if (TRACKS[t]) track.value = t; } catch (e) {}
    load.textContent = "Load"; load.style.cssText = "font:bold 12px sans-serif;cursor:pointer;padding:2px 6px";
    const runs = document.createElement("select"); runs.style.maxWidth = "190px"; runs.add(new Option("Inputs: off", ""));
    const msg = document.createElement("span"); msg.style.cssText = "opacity:.8;font-size:12px";
    r2.append(track, load); row().append(runs); row().append(msg);
    const pick = (el) => { el.blur(); };
    track.onchange = () => { try { localStorage.setItem("slowmoTrack", track.value); } catch (e) {} pick(track); };
    load.onclick = async () => {
      load.blur(); msg.textContent = "loading…";
      try {
        const lb = await get(`leaderboard?version=${VERSION}&trackId=${TRACKS[track.value]}&skip=0&amount=50&onlyVerified=true`);
        runs.length = 1;
        lb.entries.forEach((e, i) => { const o = new Option(`${i + 1}. ${e.nickname}  ${(e.frames / 1000).toFixed(3)}`, String(e.id)); o.dataset.name = e.nickname; o.dataset.time = (e.frames / 1000).toFixed(3); runs.add(o); });
        msg.textContent = `${track.value}: ${lb.entries.length} runs`;
      } catch (e) { msg.textContent = "couldn't load the leaderboard (" + e.message + ")"; }
    };
    runs.onchange = async () => {
      pick(runs); const o = runs.selectedOptions[0];
      if (!o || !o.value) { ghost = null; sendGhost(); msg.textContent = ""; return; }
      msg.textContent = "loading run…";
      try {
        const rec = (await get(`recordings?version=${VERSION}&ids=${o.value}`))[0].recording;
        ghost = { name: o.dataset.name, time: o.dataset.time, keys: await decode(rec) };
        msg.textContent = `showing ${o.dataset.name}`;
      } catch (e) { ghost = null; msg.textContent = "couldn't load that run (" + e.message + ")"; }
      sendGhost();
    };
    // Wait for me: the race pauses at each key change of the picked run until your keys match it
    const wl = document.createElement("label"), wc = document.createElement("input");
    wc.type = "checkbox"; wc.checked = waitOn; wl.style.cssText = "display:flex;gap:4px;align-items:center;cursor:pointer";
    wl.append(wc, "Wait for me (pause at each key change)");
    wc.onchange = () => { waitOn = wc.checked; try { localStorage.setItem("slowmoWait", waitOn ? "1" : "0"); } catch (e) {} sendGhost(); wc.blur(); };
    row().append(wl);
    // keep the game from treating clicks/keys in the panel as game input
    for (const ev of ["keydown", "keyup", "mousedown", "pointerdown", "touchstart"]) box.addEventListener(ev, e => e.stopPropagation());
    document.body.appendChild(box);
    overlay();
  }
  window.__slowmo = { set: v => { speed = v; send(); }, get: () => speed, raceMs: () => raceMs() };
  if (document.body) panel(); else addEventListener("DOMContentLoaded", panel);
})();
