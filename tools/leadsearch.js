// Windowed lead search: walks through the run in overlapping windows and anneals the inputs inside each window
// (move toggles, add/remove/flip short taps, 1 ms taps allowed) to be as far ahead of REF's line as possible
// HOR ms after the window, while staying on the line with REF's heading and at least REF's speed.
// Gains are small and spread out (a few ms per second), which a finish-time search can't see.
// env: TRACK, REF (line to measure lead against), BASE (start inputs, default REF), OUT, START, END,
//      WIN (window ms), STEP, HOR, WT (seconds per window), SEED, DW, QW, VW, KV (score weights), GCAP, OFFMAX, LONG, LOFF,
//      MIN, RATE (human-like limits)
const H = require('./hlib.js'); const fs = H.fs;
const E = process.env, keys = ['up', 'right', 'down', 'left'];
const WIN = +(E.WIN || 500), STEP = +(E.STEP || 250), HOR = +(E.HOR || 700), WT = +(E.WT || 45);
const DW = +(E.DW || 20), QW = +(E.QW || 0.05), VW = +(E.VW || 0.2), KV = +(E.KV || 10);
// guards against short-horizon traps: max lead gained per window (ms), max distance off the line at the scoring
// point, and a longer check that the car stays on the line (LOFF) for LONG ms after the window without losing lead
const GCAP = +(E.GCAP || 3), OFFMAX = +(E.OFFMAX || 0.5), LONG = +(E.LONG || 2500), LOFF = +(E.LOFF || 1);
// human-like limits: every press/gap the search makes lasts at least MIN ms; at most RATE key changes per second in a window
const MIN = +(E.MIN || 0), RATE = +(E.RATE || 0);
let rs = +(E.SEED || 1); const rnd = () => (rs = (rs * 1103515245 + 12345) % 2147483648) / 2147483648, ri = n => Math.floor(rnd() * n);
(async () => {
  const s = await H.createSim(); await s.initFast(); await s.raw({ op: 'wantQ', on: true });
  const Lr = H.load(E.REF); await s.setBase(Lr, 30000, 500, 0); const ref = await s.evalFrom(Lr, 0, 30000, 1);
  const FIN = ref.frames, START = +(E.START || 3000), END = +(E.END || FIN - 300);
  const RP = new Float64Array(3 * FIN), RQ = new Float64Array(4 * FIN);
  for (let j = 0, f; j < ref.S.length; j += 4) { f = ref.S[j]; if (f >= FIN) break; for (let i = 0; i < 3; i++) RP[3 * f + i] = ref.S[j + 1 + i]; for (let i = 0; i < 4; i++) RQ[4 * f + i] = ref.SQ[j + i]; }
  const rp = f => [RP[3 * f], RP[3 * f + 1], RP[3 * f + 2]], sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], nrm = a => Math.sqrt(dot(a, a));
  const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (nrm(a) * nrm(b) || 1)))) * 57.3;
  console.log('ref finishes', FIN, 'windows', START, '..', END);
  // where on REF's line a position is: fractional REF frame and distance off the line
  const locate = (p, guess) => {
    let bf = -1, bd = 1e9; for (let f = Math.max(10, guess - 400); f < Math.min(FIN - 2, guess + 400); f++) { const d = nrm(sub(p, rp(f))); if (d < bd) { bd = d; bf = f; } }
    if (bf < 0) return null; const seg = sub(rp(bf + 1), rp(bf)), l = nrm(seg) || 1e-9, t = Math.max(-1, Math.min(1, dot(sub(p, rp(bf)), seg) / (l * l)));
    return { f: bf + t, i: bf, off: Math.sqrt(Math.max(0, bd * bd - (t * l) ** 2)) };
  };
  const refSt = H.toState(Lr);
  let st = H.toState(H.load(E.BASE || E.REF)), lead = 0; const hist = [];
  // the inputs after a window follow REF's, moved earlier by the current lead so they still fit the car's timing
  const shifted = (c, from, ld) => { const d = Math.round(ld), o = {}; for (const k of keys) { const a = c[k].slice();
    if (E.BASE) { if (d > 0) a.copyWithin(from, from + d); else if (d < 0) a.copyWithin(from - d, from); } else for (let f = from; f < a.length; f++) a[f] = refSt[k][Math.min(a.length - 1, Math.max(0, f + d))];
    o[k] = a; } return o; };
  for (let A0 = START; A0 < END; A0 += STEP) {
    const A1 = A0 + WIN, T = Math.min(A1 + HOR, FIN - 150);
    const TL = Math.min(A1 + LONG, FIN - 150);
    await s.setBase(H.toL(st), Math.max(T, TL) + 20, 50, A0 - 100);
    const score = async c => {
      const e = await s.evalFrom(H.toL(c), A0 - 1, T + 1, 1); if (e.err) return { s: -1e9 };
      const at = f => { for (let j = 0; j < e.S.length; j += 4) if (e.S[j] === f) return j; return -1; };
      const j = at(T), j0 = at(T - 10); if (j < 0 || j0 < 0) return { s: -1e9 };
      const p = [e.S[j + 1], e.S[j + 2], e.S[j + 3]], v = sub(p, [e.S[j0 + 1], e.S[j0 + 2], e.S[j0 + 3]]);
      const L = locate(p, Math.round(T + lead)); if (!L) return { s: -1e9 };
      const rv = sub(rp(L.i + 1), rp(L.i - 9)), q = e.SQ.slice(j, j + 4), rq = RQ.slice(4 * L.i, 4 * L.i + 4);
      const qa = 2 * Math.acos(Math.min(1, Math.abs(q[0] * rq[0] + q[1] * rq[1] + q[2] * rq[2] + q[3] * rq[3]))) * 57.3;
      const ld = L.f - T, sp = (nrm(v) - nrm(rv)) * 100;
      if (s0 && ld - s0.ld > GCAP) return { s: -1e6 };          // too good to be true: a line that fails later
      return { s: ld - DW * L.off ** 2 - QW * qa ** 2 - VW * ang(v, rv) ** 2 - KV * Math.max(0, -sp) - (L.off > OFFMAX ? 1e3 : 0), ld, off: L.off, sp };
    };
    const commit = (c, ld) => Math.round(ld) !== Math.round(lead) ? shifted(c, A1, ld - (E.BASE ? lead : 0)) : c;
    const holds = async c => {                                   // stays on the line until TL and keeps its lead
      const e = await s.evalFrom(H.toL(c), A0 - 1, TL + 1, 10); if (e.err) return false; let g = Math.round(A1 + s0.ld), last = null;
      for (let j = 0; j < e.S.length; j += 4) { const f = e.S[j]; if (f < A1 || (f - A1) % 250) continue;
        const L = locate([e.S[j + 1], e.S[j + 2], e.S[j + 3]], g); if (!L || L.off > LOFF) return false; g = Math.round(L.f) + 250; last = L.f - f; }
      return last !== null && last >= s0.ld - 1;
    };
    const togs = c => { let n = 0; for (const k of keys) { const a = c[k]; for (let f = Math.max(1, A0); f < A1; f++) if (a[f] !== a[f - 1]) n++; } return n; };
    const shortOk = new Set(); if (MIN) for (const k of keys) for (const [x, y] of H.runs(st[k])) if (y > A0 - MIN && x < A1 + MIN && y - x < MIN) shortOk.add(k + x + ',' + y);
    const maxTog = RATE ? Math.max(togs(st), Math.floor(RATE * WIN / 1000)) : 1e9;
    const valid = c => { if (MIN) for (const k of keys) for (const [x, y] of H.runs(c[k])) { if (y <= A0 - MIN) continue; if (x >= A1 + MIN) break;
      if (x > 0 && y < FIN - 5 && y - x < MIN && !shortOk.has(k + x + ',' + y)) return false; } return togs(c) <= maxTog; };
    let s0 = null; s0 = await score(st);
    if (A0 === START) lead = s0.ld;                             // a BASE run may already be ahead of REF
    while (hist.length && (s0.s < -100 || s0.off > OFFMAX)) {  // earlier changes don't hold up here: undo them one by one
      console.log(`win ${A0}: off the line (${s0.off?.toFixed(2)}), undoing a window`); ({ st, lead } = hist.pop());
      await s.setBase(H.toL(st), Math.max(T, TL) + 20, 50, A0 - 100); s0 = null; s0 = await score(st); } let cur = st, cs = s0, best = st, bs = s0; const t0 = Date.now(); let it = 0, rej = 0;
    while (Date.now() - t0 < WT * 1000) {
      it++; const c = Object.assign({}, cur), n = 1 + (rnd() < 0.3);
      for (let m = 0; m < n; m++) {
        const k = keys[ri(4)], a = (c[k] = c[k].slice()), r = rnd(), runs = H.runs(a).filter(([x, y]) => y > A0 && x < A1 && x > 0);
        if (r < 0.45 && runs.length) {                       // move one edge of a segment
          const [x, y, v] = runs[ri(runs.length)], d = (rnd() < 0.5 ? -1 : 1) * (1 + ri(rnd() < 0.7 ? 4 : 20)), e = rnd() < 0.5 ? x : y;
          const ne = Math.max(A0, Math.min(A1, e + d)); if (e === x) { if (ne < e) a.fill(v, ne, e); else a.fill(1 - v, e, ne); } else { if (ne > e) a.fill(v, e, ne); else a.fill(1 - v, ne, e); }
        } else if (r < 0.75) { const f = A0 + ri(WIN), l = MIN ? MIN + ri(100) : 1 + ri(rnd() < 0.6 ? 3 : 25); a.fill(1 - a[f], f, Math.min(A1, f + l)); } // short tap / gap
        else if (r < 0.9 && runs.length) { const sh = runs.filter(([x, y]) => y - x <= 30 && x >= A0 && y <= A1); if (sh.length) { const [x, y, v] = sh[ri(sh.length)]; a.fill(1 - v, x, y); } } // remove a short segment
        else { const f = A0 + ri(WIN), l = 10 + ri(80); a.fill(rnd() < 0.5 ? 1 : 0, f, Math.min(A1, f + l)); } // longer hold / release
        if (k === 'up') a[0] = 1;
      }
      if ((MIN || RATE) && !valid(c)) continue;
      const cs2 = await score(c), Tm = Math.max(0.02, 0.5 * (1 - (Date.now() - t0) / (WT * 1000)));
      if (cs2.s >= cs.s || rnd() < Math.exp((cs2.s - cs.s) / Tm)) { cur = c; cs = cs2; if (cs.s > bs.s + 0.01) { const cc = commit(c, cs.ld); if ((!(MIN || RATE) || valid(cc)) && await holds(cc)) { bs = cs; best = cc; } else rej++; } }
    }
    if (bs.s > s0.s) { hist.push({ st, lead }); if (hist.length > 8) hist.shift(); st = best; lead = bs.ld; }
    console.log(`win ${A0}-${A1} @${T}: lead ${s0.ld?.toFixed(2)} -> ${bs.ld?.toFixed(2)} ms, off ${bs.off?.toFixed(2)}, speed ${bs.sp?.toFixed(2)}, score ${s0.s.toFixed(2)} -> ${bs.s.toFixed(2)} (${it} tries, ${rej} failed the long check)`);
    fs.writeFileSync(E.OUT, JSON.stringify(H.toEvents(H.toL(st))));
  }
  const v = await s.run(H.encodeRecording(H.toL(st)), 30000);
  console.log('done, full run finishes at', v.frames, '(ref', FIN + ')');
  process.exit(0);
})();
