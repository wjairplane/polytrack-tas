// Watches the race timer and tells the app (window.PolyRec) when to start, save or throw away a recording:
// arm when a race is on the grid (timer at 0), save 1.5 s after a finished run, cancel on restart or leaving the race.
(() => {
  if (window.__polyRec || !window.PolyRec) return;
  window.__polyRec = true;
  const B = window.PolyRec;
  // the Current box shows the last checkpoint's split before the running time, so the running time is the last one
  const timer = () => {
    const el = document.querySelector(".timer-ui > .center");
    if (!el || !el.offsetParent) return null;
    const all = [...el.innerText.replace(/\s/g, "").matchAll(/(\d+):(\d\d)\.(\d{3})/g)];
    const m = all[all.length - 1];
    return m ? (+m[1] * 60 + +m[2]) * 1000 + +m[3] : 0;
  };
  const finished = () => /try again|personal best/i.test(document.body.innerText);
  let state = "idle", last = -1, changedAt = 0, doneAt = 0;
  setInterval(() => {
    if (!document.body) return;
    const t = timer(), now = performance.now();
    if (t !== last) changedAt = now;
    switch (state) {
      case "idle":
        if (t === 0) { state = "armed"; B.arm(); }
        break;
      case "armed":
        if (t === null) { state = "idle"; B.cancel(); }
        else if (t > 0) state = "racing";
        break;
      case "racing":
        if (t === null || t < last) { state = "idle"; B.cancel(); }
        else if (t === last && now - changedAt > 500 && finished()) { state = "done"; doneAt = now; }
        break;
      case "done":
        if (now - doneAt > 1500) { state = "after"; B.save(t); }
        break;
      case "after":
        if (t === null || t < last) state = "idle";
        break;
    }
    last = t;
  }, 100);
})();
