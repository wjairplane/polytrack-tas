# PolyTrack TAS

Tool-assisted runs of all 17 official tracks of [PolyTrack](https://www.kodub.com/apps/polytrack) (game version 0.6.3):
Summer 1–7, Winter 1–5 and Desert 1–5, played in the real game by a userscript.

## How to use

You need a desktop browser (Chrome, Edge or Firefox) or Firefox for Android, and PolyTrack 0.6.3.

1. **Install a userscript manager:** [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/). In Chrome and Edge, also turn on
   **Allow user scripts** (or Developer mode) for the extension, or scripts won't run.
2. **Install the script:** open
   <https://raw.githubusercontent.com/wjairplane/polytrack-tas/main/all-tracks.user.js>.
   The manager shows an install page; click **Install**.
3. **Open the game** at <https://www.kodub.com/apps/polytrack> (reload it if it was already open:
   the script must load before the game does). The game runs in a frame from
   `app-polytrack.kodub.com`, which is where the script runs; opening that address directly works too.
4. **Pick a track:** a small dark menu appears at the top right. Choose the track in the list
   (each entry shows the TAS time).
5. Go to the **track list** (the official tracks screen) and click **Start** in the menu. The script
   opens the track, presses Play and starts the race; the TAS drives the whole run. Don't touch
   the keys while it plays.
6. To play normally again, pick **TAS off** in the menu (or turn the script off in the manager).
   The choice is remembered between visits.

Menu messages: *go to the track list first* (open the track list, then click Start again),
*press W to start* (the race didn't start by itself; press W once).

**One track only:** each track also has its own script, e.g. `desert1.user.js` or `summer1.user.js`.
It has no menu: install it, open that track yourself and press W once to start; the TAS drives the
rest. Install only one TAS script at a time (turn the others off), or they get in each other's way.

**Notes**

- The script applies the inputs on exact 1 ms physics frames by patching the game's physics worker
  (synthetic key presses can't be timed that precisely). That's why it can't be pasted into the
  console of an open page.
- If the game updates past 0.6.3, the script logs `patch anchor not found` in the console and does
  nothing, so the game plays normally.
- **Headless check:** `npm i playwright && node tools/run_headless.js [userscript] [screenshot] [track]`
  plays a run in headless Chromium and prints the final time and checkpoint count (leaderboard
  submission is blocked there). Example: `node tools/run_headless.js all-tracks.user.js out.png desert1`.
- Rebuild a single-track script from an input file:
  `python3 tools/build_userscript.py inputs/summer1_opt.json summer1.user.js`; rebuild the menu
  script with `node tools/build_menu_userscript.js`.

## All official tracks

`all-tracks.user.js` holds every track below. A small menu at the top right picks the track and
**Start** opens it, presses Play and starts the run. Each track also has its own `<track>.user.js`
(start the race with W). All TAS times below are verified in the real game (headless Chromium, every checkpoint).

"Best human run" is the fastest leaderboard run on 2026-11-06 whose inputs look human: no presses or gaps of
2 ms or less, and under about 15 key changes per second. Runs with hundreds of 1–2 ms presses were left out as
tool-assisted.

| Track | Best human run | TAS |
|---|---|---|
| Summer 1 | 22.123 (Monstrosity) | 21.996 |
| Summer 2 | 15.178 (SpeedySebas) | 15.152 |
| Summer 3 | 20.276 (SpeedySebas) | 20.150 |
| Summer 4 | 34.105 (youngfella) | 33.992 |
| Summer 5 | 49.815 (Wak3son) | 49.577 |
| Summer 6 | 36.992 (Monstrosity) | 36.920 |
| Summer 7 | 31.142 (SpeedySebas) | 31.029 |
| Winter 1 | 16.999 (Monstrosity) | 16.959 |
| Winter 2 | 26.830 (yf savestate) | 26.669 |
| Winter 3 | 34.389 (SpeedySebas) | 34.219 |
| Winter 4 | 19.311 (SpeedySebas) | 19.246 |
| Winter 5 | 18.323 (SpeedySebas) | 18.148 |
| Desert 1 | 25.161 (Monstrosity, no shortcut) | 20.622 (shortcut) |
| Desert 2 | 28.271 (cheesebob (81)) | 28.062 |
| Desert 3 | 20.302 (The Kroger) | 20.150 |
| Desert 4 | 21.750 (Monstrosity) | 21.640 |
| Desert 5 | 29.027 (Monstrosity) | 28.911 |

On most tracks the TAS inputs are faster leaderboard runs from 2026-11-06 (several have since been taken off the
leaderboard). Our own runs are kept as `inputs/tracks/<track>_ours.json` (Summer 1: `inputs/summer1_ours.json`): Summer 1 22.064,
Summer 2 15.176, Summer 3 20.263, Summer 4 34.102, Summer 5 49.789, Summer 6 37.035, Summer 7 31.141, Winter 2 26.829,
Winter 3 34.347, Winter 4 19.310, Winter 5 18.321, Desert 2 28.256, Desert 3 20.166, Desert 4 21.717, Desert 5 29.018. Each
started from a human replay of its time (`<track>_wr.json` or `<track>_human.json`). Summer 1 (21.996, see below), Winter 1 and
Desert 1 use our runs.

Inputs used by the scripts are in `inputs/tracks/<track>_opt.json` (Summer 1: `inputs/summer1_opt.json`).
Pipeline for a track: `node tools/capture_tracks.js` (track data + id, once), `python3 tools/fetch_replay.py 1
inputs/tracks/<track>_wr.json <trackId>`, then `TRACK=<track> SIDE=none node tools/finclimb.js ...` (finish
search on the last seconds) and, where that stalls, `TRACK=<track> tools/beam.js` with `BSTART`.
Rebuild the menu script with `node tools/build_menu_userscript.js` (it needs every track captured in `sim_assets/tracks/`).

## Desert 1 shortcut

`desert1_opt.json` (and `desert1.user.js`, the Desert 1 entry of `all-tracks.user.js`) is the **shortcut run**: after the
last checkpoint the car leaves the road, barrel-rolls through the gap between two pillars under the big red structure, is thrown
up onto it and finishes from the top. Verified in the real game (headless): **20.622 s, 3/3 checkpoints**.
It is a 20.626 s shortcut run (`inputs/tracks/desert1_base.json`) with the finish re-optimized by `tools/finclimb.js`. Same route as NeoRacer's video "How a TAS Completely Broke One of Polytrack's Most Famous Maps (Desert 1)".
Our own shortcut run (21.209 s) is kept as `desert1_opt_21209.json`, and the route without the shortcut (25.243 s) as
`desert1_opt_standard.json`. Details: `DESERT1_SHORTCUT.md`.

### Human-like Desert 1 shortcut (21.033)

`desert1-humanlike.user.js` (input `inputs/tracks/desert1_humanlike.json`) takes the same shortcut with inputs that look
like a person's: **21.033 s, 3/3 checkpoints** in the real game (headless), about 4.1 s faster than the best human run.
It is a separate script; turn off `all-tracks.user.js` while using it.

- Up to 15 s the inputs are the 25.161 human run's, unchanged (`inputs/tracks/desert1_human.json`).
- From 15 s on every key press and gap lasts at least 40 ms (shortest 43 ms), about 8 key changes per second (13 in the busiest second).
  The whole run has about 9 key changes per second; fast-tap TAS runs have 22–137 and hundreds of 1–2 ms taps.

How it was found: `tools/humantrack.js` fitted 40 ms-minimum inputs to our 21.209 run's line from 15 s
(`REF`, `BASE`, `START`, `MIN`, `WIN`), which held up to about 18.7 s; `tools/humanlike.js` then searched the rest
(`E0`, `MIN`, `R`, `FX`) for progress along the shortcut path, pace, closeness to the path past the pillar and to the
finish line, and once it finished, for finish time. Both take `TRACK=desert1` and use `tools/hlib.js`.

## Input format

`inputs/*.json` is a list of `[frame_ms, key, pressed]` with keys `KeyW`, `KeyA`, `KeyS`, `KeyD`.
The game's own recording format (zlib + base64url of five toggle-frame lists) is decoded by
`tools/fetch_replay.py` and encoded by `encodeRecording` in `tools/sim.js`.

## Offline simulator

`tools/sim.js` runs the game's own physics worker and wasm in Node, frame-exact with the
browser (about 70-90k frames/s per core, so a full run takes about 0.4 s). It keeps heap
snapshots so a changed run only re-simulates from just before the change.

Setup (downloads the worker and wasm and captures the track messages; needs playwright):

```sh
tools/fetch_sim_assets.sh      # -> sim_assets/ (not committed)
```

## Search tools

| Tool | What it does |
|---|---|
| `tools/evolve.js` | Evolutionary search (population, mutation, crossover) over input timings, scored by lead over the reference at the finish. Options: `WIN=a,b` (edit window), `THROTTLE=1` (W lifts), `SEED=file`, `NK=processes`. |
| `tools/beam.js` | Beam search that grows lines forward in 5-25 ms action blocks, scored by projection onto the reference line. Options: `CONFIGS`, `BSTART`/`BSEED` (start from a frame / another run), `BACTIONS` (action set, incl. brake+steer), `BDEAD` (allow wide lines after a frame), `NFIN` (several finishing lines). |
| `tools/finclimb.js` | Exact-finish search on the last seconds: maximizes how far the car is toward the finish on the frame before it finishes (sweeps plus simulated annealing, dense snapshots, optional `SHARE` dir for parallel runs). Found 22.066, 22.065 and 22.064. |
| `tools/longrun.sh` | Endless finclimb slots that restart from, and promote gains to, a shared best run. |
| `tools/leadsearch.js` | Windowed search for gains spread thinly over a run: anneals the inputs in one short window at a time (1 ms taps allowed) to be ahead of a reference line a little after the window, on the line and at its speed, then moves the later inputs earlier by the lead. Guards: `GCAP` (max lead gained per window), `OFFMAX`, `LONG`/`LOFF` (the car must stay on the line for `LONG` ms), and it undoes earlier windows when the car leaves the line. Options: `REF`, `BASE`, `START`, `END`, `WIN`, `STEP`, `HOR`, `WT`. Found Summer 1 21.996. |
| `tools/fetch_replay.py` | Downloads a leaderboard recording and converts it to an input file. |

## How our Summer 1 time came down (22.114 → 22.064)

| Time | How |
|---|---|
| 22.114 | Human #1 replay, reproduced frame-exact |
| 22.102 → 22.101 | Hill-climb on key timings |
| 22.084 | Evolutionary search |
| 22.081 | Evolutionary polish |
| 22.077 | Fine beam over the last 8 s (a new finish line) |
| 22.067 | Evolutionary polish of that line |
| 22.066 → 22.064 | `finclimb.js` exact-finish search |

All of the gain came after 10.7 s; the first 10.7 s are identical to the human run.

## Summer 1 below 22 s (22.010 → 21.996)

The 22.010 leaderboard run is on the same line as our 22.064 but gains a few ms per second between 5 and 14 s,
with much finer steering (hundreds of 1–2 ms taps). Our searches had kept the first 10.7 s fixed and scored at the
finish, where gains that small don't show. `tools/leadsearch.js` scores each short window by the lead a little
after it instead. Starting from 22.010 (`inputs/summer1_opt_22010.json`), in four passes:

| Part | Settings | Lead over 22.010 |
|---|---|---|
| 5–9.6 s | 500 ms windows, scored 0.7 s later | about 25 ms at 10.7 s |
| Climbing spiral, 9.5–14.5 s | 1.5–2 s windows | about 26 ms at 15 s |
| Big jump, 13.5–19 s | one 5.5 s window including S in the air, scored after the landing | about 9 ms at 19.7 s |
| 19 s to the finish | 500 ms windows | 14 ms: **21.996** |

The jump costs most of the lead: the earlier car lands worse, and scoring before the landing loses all of it. The
21.996 run holds S from 15.58 s to 18.31 s without the short release 22.010 has at 16.7 s. `finclimb.js` on the
last 2 s found no further frame. Verified in the real game (headless): **21.996 s, 3/3 checkpoints**.

## What we learned about Summer 1

- **Physics:** Bullet raycast vehicle in wasm, deterministic, 1 ms steps. The car is
  acceleration-limited everywhere (no top speed in reach). Steering is a rate-limited servo,
  so taps set an in-between angle; holding steer at speed makes the rear wheels slide and
  costs engine thrust.
- **In the air** only S does anything (nose-up pitch); W, A and D are ignored. Holding S
  through the big jump after checkpoint 3 is best; how the car lands decides most of what an earlier arrival gains.
- **Wall-ride at checkpoint 1:** only one timing works (A at 4.059 s). Softer kerb hits,
  other approach angles and the old jump-over-the-ramp line all crash or lose time.
- **Climbing spiral after checkpoint 2:** its brakes are required; beams with brake+steer
  actions found nothing faster.
- **Scoring traps:** checkpoint times and plane crossings reward lines that crash right
  after; short-horizon leads don't predict the finish. Score after a landing or at the finish.
- **Route:** no shortcuts off the track; the finish line is already clipped as early as possible.
- Sub-22.000 needed no new line: 21.996 is the same route with finer inputs between 5 and 19 s (see above).

## Other files

- `tas-exact.template.js`: the userscript template (worker patch + input player).
- `tas.js`: an older console player/recorder using synthetic key events. Not frame-exact;
  kept only as a recorder (`TAS.record()`).
