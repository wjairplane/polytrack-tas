// Prints the finish time (ms) of each input file in the offline simulator. Set TRACK=<slug> for tracks other than Summer 1.
// usage: node tools/finish.js a.json [b.json ...]
const H = require('./hlib.js');
(async () => {
  const s = await H.createSim();
  for (const f of process.argv.slice(2)) { const v = await s.run(H.encodeRecording(H.load(f)), H.N); console.log(v.frames < H.N ? v.frames : 'DNF', f); }
  process.exit(0);
})();
