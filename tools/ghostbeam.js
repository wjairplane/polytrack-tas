// Ghost-following beam search: grows the run forward from frame S0 in short action blocks and keeps the states
// that stay closest to a timed trajectory (position + optional orientation) read from a video of the run.
//  - waypoints: JSON list of [t_video_s, x, y, z, qx?, qy?, qz?, qw?]; game frame = (t + OFF) * 1000
//  - start state: play the inputs of a reference run (events JSON) up to S0
//  - heap snapshots of the pages physics changes (as tools/beam.js), so a beam of a few hundred states is cheap
// usage: TRACK=desert1 REF=run.json WP=waypoints.json OFF=11.515 S0=18300 BLOCK=10 K=300 END=21800 node tools/ghostbeam.js out.json
const fs = require('fs');
const { createSim, encodeRecording } = require('./sim.js');
const KEY = { KeyW: 'up', KeyD: 'right', KeyS: 'down', KeyA: 'left', Reset: 'reset' };
const NAME = Object.fromEntries(Object.entries(KEY).map(([a, b]) => [b, a]));
const BIT = { up: 1, right: 2, down: 4, left: 8 };
const REF = process.env.REF, WPF = process.env.WP, OFF = +(process.env.OFF || 11.515);
const S0 = +(process.env.S0 || 18300), BLOCK = +(process.env.BLOCK || 10), K = +(process.env.K || 300), END = +(process.env.END || 21800);
const YW = +(process.env.YW || 0.7), QW = +(process.env.QW || 8), TQ = +(process.env.TQ || 7.75);   // y weight, orientation weight, last video time with usable orientation
const ACTIONS = (process.env.ACTIONS || '0,1,3,9,4,5,13,2,8,12,6,7,10,14').split(',').map(Number);
const OUT = process.argv[2] || 'ghostbeam_out.json';
const load = f => { const L = { up: [], right: [], down: [], left: [], reset: [] }; for (const [fr, k] of JSON.parse(fs.readFileSync(f))) L[KEY[k]].push(fr); for (const k in L) L[k].sort((a, b) => a - b); return L; };
const toEvents = L => { const ev = []; for (const k of ['up', 'right', 'down', 'left']) L[k].forEach((f, i) => ev.push([f, NAME[k], i % 2 === 0])); return ev.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])); };
const bitsToLists = bits => { const L = { up: [], right: [], down: [], left: [], reset: [] }; for (const k in BIT) { let on = false; for (let f = 0; f < bits.length; f++) { const b = !!(bits[f] & BIT[k]); if (b !== on) { L[k].push(f); on = b; } } } return L; };

(async () => {
  const sim = await createSim(); await sim.initFast();
  const ref = load(REF), WP = JSON.parse(fs.readFileSync(WPF));
  const N = END + 2000, refBits = new Uint8Array(N);
  for (const k in BIT) { let on = false, i = 0; const a = ref[k]; for (let f = 0; f < N; f++) { while (i < a.length && a[i] <= f) { on = !on; i++; } if (on) refBits[f] |= BIT[k]; } }
  const pages = new Set((await sim.probe(ref, 30000, 50)).pages); for (let i = 0; i < 40; i++) pages.add(i);
  await sim.raw({ op: 'bSetup', D: [...pages].sort((a, b) => a - b) });
  const segsOf = (bits, t, len) => { const s = []; for (let f = t; f < t + len; f++) { const b = bits[Math.min(f, N - 1)]; if (s.length && s[s.length - 1][0] === b) s[s.length - 1][1]++; else s.push([b, 1]); } return s; };
  // target trajectory at game frame f
  const tgt = f => {
    const t = f / 1000 - OFF;
    if (t < WP[0][0] || t > WP[WP.length - 1][0]) return null;
    let i = 0; while (i + 1 < WP.length - 1 && WP[i + 1][0] <= t) i++;
    const a = WP[i], b = WP[i + 1], u = (t - a[0]) / (b[0] - a[0]);
    const pos = [1, 2, 3].map(j => a[j] + (b[j] - a[j]) * u);
    let q = null;
    if (a.length > 4 && b.length > 4 && t <= TQ) { const sg = (a[4] * b[4] + a[5] * b[5] + a[6] * b[6] + a[7] * b[7]) < 0 ? -1 : 1; q = [4, 5, 6, 7].map(j => a[j] + (sg * b[j] - a[j]) * u); const n = Math.hypot(...q); q = q.map(v => v / n); }
    return { pos, q };
  };
  const FINP = [24, 50.3, 42.7];
  // MODE=path: score = progress along the video's path - lateral error beyond a tolerance (faster is better, no exact timing)
  const PATH = WP.map(w => [w[1], w[2], w[3]]), PSEG = []; let acc = 0;
  for (let i = 0; i + 1 < PATH.length; i++) { const a = PATH[i], b = PATH[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); PSEG.push([a, b, l, acc]); acc += l; }
  const LAT = +(process.env.LAT || 1.5), LW = +(process.env.LW || 2);
  const proj = p => { let bs = 0, bl = 1e9; for (const [a, b, l, ac] of PSEG) { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; let t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / (l * l); t = Math.max(0, Math.min(1, t)); const q = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t]; const dist = Math.hypot(p[0] - q[0], YW * (p[1] - q[1]), p[2] - q[2]); if (dist < bl) { bl = dist; bs = ac + t * l; } } return [bs, bl]; };
  const scoreOf = (nd) => {
    if (process.env.MODE === 'path') {
      const [sp, lat] = proj(nd.pos); nd.prog = sp; nd.lat = lat;
      let sc = sp - LW * Math.max(0, lat - LAT);
      const T = tgt(nd.t); if (T && T.q && nd.quat) { const n = Math.hypot(...nd.quat) || 1; const dot = Math.min(1, Math.abs((nd.quat[0] * T.q[0] + nd.quat[1] * T.q[1] + nd.quat[2] * T.q[2] + nd.quat[3] * T.q[3]) / n)); sc -= QW * 2 * Math.acos(dot) * 5; }
      if (sp > acc - 0.5) { const d = Math.hypot(nd.pos[0] - FINP[0], nd.pos[1] - FINP[1], nd.pos[2] - FINP[2]); sc -= d; }
      return sc;
    }
    const T = tgt(nd.t);
    if (!T) { const d = Math.hypot(nd.pos[0] - FINP[0], nd.pos[1] - FINP[1], nd.pos[2] - FINP[2]); return -d; }
    let d = Math.hypot(nd.pos[0] - T.pos[0], YW * (nd.pos[1] - T.pos[1]), nd.pos[2] - T.pos[2]);
    if (T.q && nd.quat) { const n = Math.hypot(...nd.quat) || 1; const dot = Math.min(1, Math.abs((nd.quat[0] * T.q[0] + nd.quat[1] * T.q[1] + nd.quat[2] * T.q[2] + nd.quat[3] * T.q[3]) / n)); d += QW * 2 * Math.acos(dot) * 5; }
    return -d;
  };
  const startSegs = segsOf(refBits, 0, S0);
  const first = (await sim.raw({ op: 'bExpand', jobs: [{ pid: 0, cid: 1, segs: startSegs }] })).res[0];
  let beam = [{ id: 1, t: first.frames, pos: first.pos, quat: first.quat, speed: first.speed, parent: null, segs: startSegs }];
  beam[0].score = scoreOf(beam[0]);
  console.log(`start frame ${first.frames} pos ${first.pos.map(v => v.toFixed(1))} target ${JSON.stringify(tgt(first.frames))} score ${beam[0].score.toFixed(2)}`);
  await sim.raw({ op: 'bKeep', ids: [1] });
  let nextId = 2, step = 0; const finishers = [];
  const t0 = Date.now();
  while (beam.length && beam[0].t < END) {
    step++;
    const jobs = [], meta = [];
    for (const nd of beam) for (const a of ACTIONS.concat(['ref'])) {
      const segs = a === 'ref' ? segsOf(refBits, nd.t, BLOCK) : [[a, BLOCK]];
      const cid = nextId++; jobs.push({ pid: nd.id, cid, segs }); meta.push({ parent: nd, segs });
    }
    let res;
    for (;;) {
      ({ res } = await sim.raw({ op: 'bExpand', jobs }));
      const lk = await sim.raw({ op: 'bLeak' });
      if (!lk.leak.length) break;
    }
    const kids = []; if (process.env.DBG && step < 4) console.log('DBG step', step, 'jobs', jobs.length, 'res', res.length, 'errs', res.filter(r => r.err).length, res.find(r => r.err) || '');
    res.forEach((r, i) => {
      if (r.err) return;
      const nd = { id: r.cid, t: r.frames, pos: r.pos, quat: r.quat, speed: r.speed, parent: meta[i].parent, segs: meta[i].segs, fin: r.fin };
      if (r.fin) { finishers.push(nd); return; }
      nd.score = scoreOf(nd) ; kids.push(nd);
    });
    // drop near-duplicates (same position, speed and orientation), then keep the best K
    const seen = new Map();
    for (const nd of kids) {
      const key = nd.pos.map(v => Math.round(v / 0.002)).join(',') + '|' + Math.round(nd.speed / 0.1) + '|' + nd.quat.map(v => Math.round(v / 0.0005)).join(',');
      const c = seen.get(key); if (!c || nd.score > c.score) seen.set(key, nd);
    }
    const sortedK = [...seen.values()].sort((a, b) => b.score - a.score);
    if (process.env.DIVERSE !== '0') {
      const picked = new Set(), seenC = new Set();
      for (const nd of sortedK) { if (picked.size >= Math.floor(K / 2)) break; const c = nd.pos.map(v => Math.round(v / 1.2)).join(',') + '|' + Math.round(nd.speed / 25); if (!seenC.has(c)) { seenC.add(c); picked.add(nd); } }
      for (const nd of sortedK) { if (picked.size >= K) break; picked.add(nd); }
      beam = [...picked].sort((a, b) => b.score - a.score);
    } else beam = sortedK.slice(0, K);
    await sim.raw({ op: 'bKeep', ids: beam.map(n => n.id) });
    if (finishers.length) { finishers.sort((a, b) => a.t - b.t); console.log(`FINISH at frame ${finishers[0].t}`); break; }
    if (step % 5 === 0 || step < 3) { const T = tgt(beam[0].t); console.log(`step ${step} frame ${beam[0].t} beam ${beam.length} best score ${beam[0].score.toFixed(2)} speed ${beam[0].speed.toFixed(0)} pos ${beam[0].pos.map(v => v.toFixed(1))} target ${T ? T.pos.map(v => v.toFixed(1)) : '-'} (${((Date.now() - t0) / 1000).toFixed(0)}s)`); }
  }
  const best = finishers.length ? finishers[0] : beam[0];
  const chain = []; for (let n = best; n; n = n.parent) chain.push(n.segs);
  const bits = []; for (const sg of chain.reverse()) for (const [b, len] of sg) for (let k = 0; k < len; k++) bits.push(b);
  const events = toEvents(bitsToLists(bits));
  fs.writeFileSync(OUT, JSON.stringify(events));
  const L = {}; for (const k of ['up', 'right', 'down', 'left', 'reset']) L[k] = []; for (const [f, k] of events) L[KEY[k]].push(f);
  const v = await sim.run(encodeRecording(L), 30000);
  console.log(`result frame ${best.t} fin=${!!best.fin}; clean re-simulation: finishes at ${v.frames} frames; saved ${OUT}`);
  process.exit(0);
})();
