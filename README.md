# PolyTrack TAS

Tool-assisted runs of the official tracks of [PolyTrack](https://www.kodub.com/apps/polytrack) (game version 0.6.3): Summer 1–6, Winter 1–5 and Desert 1–5. Summer 1 first:

| Run | Time | Files |
|---|---|---|
| Optimized TAS | **22.064 s** | `summer1.user.js`, `inputs/summer1_opt.json` |
| Previous best | 22.067 s | `inputs/summer1_opt_22067.json` |
| Human #1 replay (leaderboard entry 59995962) | 22.114 s | `summer1-replay.user.js`, `inputs/summer1.json` |

All three are verified in the real game (headless Chromium, 3/3 checkpoints).

## How to use

You need a desktop browser (Chrome, Edge or Firefox) or Firefox for Android, and PolyTrack 0.6.3.

1. **Install a userscript manager:** [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/). In Chrome and Edge, also turn on
   **Allow user scripts** (or Developer mode) for the extension, or scripts won't run.
2. **Install the script:** open
   <https://raw.githubusercontent.com/wjairplane/polytrack-tas/main/all-tracks.user.js>.
   The manager shows an install page; click **Install**.
3. **Open the game** at <https://app-polytrack.kodub.com/> (reload it if it was already open:
   the script must load before the game does).
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
- It does not block leaderboard submission: a finished run is submitted as usual when you're online.
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
(start the race with W). All times below are verified in the real game.

| Track | #1 replay | TAS | Gain |
|---|---|---|---|
| Summer 1 | 22.114 | 22.064 | 50 ms |
| Summer 2 | 15.178 | 15.176 | 2 ms |
| Summer 3 | 20.276 | 20.263 | 13 ms |
| Summer 4 | 34.105 | 34.102 | 4 ms |
| Summer 5 | 49.815 | 49.789 | 26 ms |
| Summer 6 | 37.036 | 37.035 | 1 ms |
| Winter 1 | 16.959 | 16.959 | tie (different line, so not a duplicate) |
| Winter 2 | 26.830 | 26.829 | 1 ms |
| Winter 3 | 34.485 | 34.476 | 9 ms |
| Winter 4 | 19.311 | 19.310 | 1 ms |
| Winter 5 | 18.425 | 18.424 | 1 ms |
| Desert 1 | 20.626 (TzTech, shortcut) | **20.622** (shortcut, see below) | 4 ms |
| Desert 2 | 28.271 | 28.256 | 15 ms |
| Desert 3 | 20.172 | 20.166 | 6 ms |
| Desert 4 | 21.750 | 21.717 | 33 ms |
| Desert 5 | 29.027 | 29.018 | 9 ms |

Inputs are in `inputs/tracks/<track>_wr.json` (#1 replay) and `<track>_opt.json` (TAS).
Pipeline for a track: `node tools/capture_tracks.js` (track data + id, once), `python3 tools/fetch_replay.py 1
inputs/tracks/<track>_wr.json <trackId>`, then `TRACK=<track> SIDE=none node tools/finclimb.js ...` (finish
search on the last seconds) and, where that stalls, `TRACK=<track> tools/beam.js` with `BSTART`.
Rebuild the menu script with `node tools/build_menu_userscript.js`.

## Desert 1 shortcut

`desert1_opt.json` (and `desert1.user.js`, the Desert 1 entry of `all-tracks.user.js`) is the **shortcut run**: after the
last checkpoint the car leaves the road, barrel-rolls through the gap between two pillars under the big red structure, is thrown
up onto it and finishes from the top. Verified in the real game (headless): **20.622 s, 3/3 checkpoints**.
It is TzTech's leaderboard #1 run (20.626 s, 2026-11-05, `inputs/tracks/desert1_tztech.json`) with the finish re-optimized by
`tools/finclimb.js`. Same route as NeoRacer's video "How a TAS Completely Broke One of Polytrack's Most Famous Maps (Desert 1)".
Our own shortcut run (21.209 s) is kept as `desert1_opt_21209.json`, and the route without the shortcut (25.243 s) as
`desert1_opt_standard.json`. Details: `DESERT1_SHORTCUT.md`.

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
| `tools/fetch_replay.py` | Downloads a leaderboard recording and converts it to an input file. |

## How the time came down

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

## What we learned about the track

- **Physics:** Bullet raycast vehicle in wasm, deterministic, 1 ms steps. The car is
  acceleration-limited everywhere (no top speed in reach). Steering is a rate-limited servo,
  so taps set an in-between angle; holding steer at speed makes the rear wheels slide and
  costs engine thrust.
- **In the air** only S does anything (nose-up pitch); W, A and D are ignored. Holding S
  through the big jump after checkpoint 3 is optimal.
- **Wall-ride at checkpoint 1:** only one timing works (A at 4.059 s). Softer kerb hits,
  other approach angles and the old jump-over-the-ramp line all crash or lose time.
- **Climbing spiral after checkpoint 2:** its brakes are required; beams with brake+steer
  actions found nothing faster.
- **Scoring traps:** checkpoint times and plane crossings reward lines that crash right
  after; short-horizon leads don't predict the finish. Score after a landing or at the finish.
- **Route:** no shortcuts off the track; the finish line is already clipped as early as possible.
- Sub-22.000 would need a different line in the first 10 s; none was found.

## Other files

- `tas-exact.template.js`: the userscript template (worker patch + input player).
- `tas.js`: an older console player/recorder using synthetic key events. Not frame-exact;
  kept only as a recorder (`TAS.record()`).
