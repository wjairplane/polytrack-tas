// Windowed lead search: walks through the run in overlapping windows and anneals the inputs inside each window
// (move toggles, add/remove/flip short taps, 1 ms taps allowed) to be as far ahead of REF's line as possible
// HOR ms after the window, while staying on the line with REF's heading and at least REF's speed.
// Gains are small and spread out (a few ms per second), which a finish-time search can't see.
// env: TRACK, REF (line to measure lead against), BASE (start inputs, default REF), OUT, START, END,
//      WIN (window ms), STEP, HOR, WT (seconds per window), SEED, DW, QW, VW, KV (score weights)
const H = require('./hlib.js'); const fs = H.fs;
const E = process.env, keys = ['up', 'right', 'down', 'left'];
const WIN = +(E.WIN || 500), STEP = +(E.STEP || 250), HOR = +(E.HOR || 700), WT = +(E.WT || 45);
const DW = +(E.DW || 20), QW = +(E.QW || 0.05), VW = +(E.VW || 0.2), KV = +(E.KV || 10);
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
  let st = H.toState(H.load(E.BASE || E.REF)), lead = 0;
  for (let A0 = START; A0 < END; A0 += STEP) {
    const A1 = A0 + WIN, T = Math.min(A1 + HOR, FIN - 150);
    await s.setBase(H.toL(st), T + 20, 50, A0 - 100);
    const score = async c => {
      const e = await s.evalFrom(H.toL(c), A0 - 1, T + 1, 1); if (e.err) return { s: -1e9 };
      const at = f => { for (let j = 0; j < e.S.length; j += 4) if (e.S[j] === f) return j; return -1; };
      const j = at(T), j0 = at(T - 10); if (j < 0 || j0 < 0) return { s: -1e9 };
      const p = [e.S[j + 1], e.S[j + 2], e.S[j + 3]], v = sub(p, [e.S[j0 + 1], e.S[j0 + 2], e.S[j0 + 3]]);
      const L = locate(p, Math.round(T + lead)); if (!L) return { s: -1e9 };
      const rv = sub(rp(L.i + 1), rp(L.i - 9)), q = e.SQ.slice(j, j + 4), rq = RQ.slice(4 * L.i, 4 * L.i + 4);
      const qa = 2 * Math.acos(Math.min(1, Math.abs(q[0] * rq[0] + q[1] * rq[1] + q[2] * rq[2] + q[3] * rq[3]))) * 57.3;
      const ld = L.f - T, sp = (nrm(v) - nrm(rv)) * 100;
      return { s: ld - DW * L.off ** 2 - QW * qa ** 2 - VW * ang(v, rv) ** 2 + KV * sp, ld, off: L.off, sp };
    };
    let cur = st, cs = await score(st), best = st, bs = cs; const s0 = cs, t0 = Date.now(); let it = 0;
    while (Date.now() - t0 < WT * 1000) {
      it++; const c = Object.assign({}, cur), n = 1 + (rnd() < 0.3);
      for (let m = 0; m < n; m++) {
        const k = keys[ri(4)], a = (c[k] = c[k].slice()), r = rnd(), runs = H.runs(a).filter(([x, y]) => y > A0 && x < A1 && x > 0);
        if (r < 0.45 && runs.length) {                       // move one edge of a segment
          const [x, y, v] = runs[ri(runs.length)], d = (rnd() < 0.5 ? -1 : 1) * (1 + ri(rnd() < 0.7 ? 4 : 20)), e = rnd() < 0.5 ? x : y;
          const ne = Math.max(A0, Math.min(A1, e + d)); if (e === x) { if (ne < e) a.fill(v, ne, e); else a.fill(1 - v, e, ne); } else { if (ne > e) a.fill(v, e, ne); else a.fill(1 - v, ne, e); }
        } else if (r < 0.75) { const f = A0 + ri(WIN), l = 1 + ri(rnd() < 0.6 ? 3 : 25); a.fill(1 - a[f], f, Math.min(A1, f + l)); } // short tap / gap
        else if (r < 0.9 && runs.length) { const sh = runs.filter(([x, y]) => y - x <= 30 && x >= A0 && y <= A1); if (sh.length) { const [x, y, v] = sh[ri(sh.length)]; a.fill(1 - v, x, y); } } // remove a short segment
        else { const f = A0 + ri(WIN), l = 10 + ri(80); a.fill(rnd() < 0.5 ? 1 : 0, f, Math.min(A1, f + l)); } // longer hold / release
        if (k === 'up') a[0] = 1;
      }
      const cs2 = await score(c), Tm = Math.max(0.02, 0.5 * (1 - (Date.now() - t0) / (WT * 1000)));
      if (cs2.s >= cs.s || rnd() < Math.exp((cs2.s - cs.s) / Tm)) { cur = c; cs = cs2; if (cs.s > bs.s) { bs = cs; best = c; } }
    }
    if (bs.s > s0.s) { st = best; lead = bs.ld; }
    console.log(`win ${A0}-${A1} @${T}: lead ${s0.ld?.toFixed(2)} -> ${bs.ld?.toFixed(2)} ms, off ${bs.off?.toFixed(2)}, speed ${bs.sp?.toFixed(2)}, score ${s0.s.toFixed(2)} -> ${bs.s.toFixed(2)} (${it} tries)`);
    fs.writeFileSync(E.OUT, JSON.stringify(H.toEvents(H.toL(st))));
  }
  const v = await s.run(H.encodeRecording(H.toL(st)), 30000);
  console.log('done, full run finishes at', v.frames, '(ref', FIN + ')');
  process.exit(0);
})();
