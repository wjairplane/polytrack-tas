# Desert 1 shortcut

**Status: reproduced.** `inputs/tracks/desert1_opt.json` finishes in **21.926 s** (3/3 checkpoints) in the offline simulator
and in the real game (headless Chromium). The video (NeoRacer, "How a TAS Completely Broke One of Polytrack's Most Famous Maps
(Desert 1)") shows the idea; its run also has a start-of-race trick (about 0.4 s), so its finish (about 20.2 s) is not reachable
with only the shortcut applied to our line yet.

## The route

World coordinates (sim units). Last checkpoint at frame 17395, about (-58, 40, -42).

1. Hug the left side of the last straight, then hold **A** (steer left) while coasting so the car leaves the road to the east at
   about (-65, 40, -20) around 17.6-18.0 s, at about 190 km/h.
2. The car crosses the sand and, **upside down in a barrel roll**, passes the pillar at (-40, ., 20) on its east side at
   about (-37, 35, 18) around 19.1 s. It has to arrive within about a unit of the right spot: the pillar's horizontal brace
   catches the car from the side and kills its speed otherwise (163 -> ~100 km/h).
3. Past the pillars it is thrown up the slope under the red structure (x -30 -> 0, y 36 -> 51, z 20 -> 34) and lands on top of it
   at about (10, 51, 33), then drives to the finish line at (20, 50, 40).

## How it was found (what worked, what did not)

* Position, rotation and speed readouts in the video's debug panel (1080p copy) give the line; the on-screen D-pad gives the
  keys (+-30 ms). The video's inputs, shifted +0.27 s onto our baseline, follow its line to within ~1 unit up to the pillars:
  the simulator matches the game and the video (even the roll angle) very closely.
* Random action search, Go-Explore, hill-climbing on waypoint error and ghost-following beam search (`tools/ghostbeam.js`)
  all stalled at the pillar: the outcome there depends on sub-millisecond details (+-3 ms input jitter moves the crossing
  point by 13 units).
* What worked: **small-step hill climbing (1-3 ms mutations) on "speed kept after the pillar + closeness to the finish"**, then the
  same with the video's post-pillar waypoints added, which steered the exit up onto the structure.

## Still to gain

The car loses about a second on the roof (it arrives at ~80 km/h and wanders); the video reaches the finish about 0.2 s after
getting onto the roof.
