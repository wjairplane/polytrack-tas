# Desert 1 shortcut (from NeoRacer's video "How a TAS Completely Broke One of Polytrack's Most Famous Maps (Desert 1)")

Status: **not reproduced yet.** Notes from reading the video's debug panel (blurry, so positions are approximate, +-3 units).

World coordinates (sim units; track pieces are on a grid 1/5 of these). Last checkpoint is at frame 17395, (-58, 40, -42).

Video line (game time = video time - ~0.29 s):

| game time | pos (x, y, z) | note |
|---|---|---|
| 16.7 s | (-63, 40.3, -67) | ~0.2 s ahead of our TAS, hugging the left edge |
| 17.7 s | (-65, 40.2, -20) | leaves the road to the LEFT (+x), instead of following the curve to -x |
| 18.2-18.8 s | (-49, 38, 0) -> (-32, 35, 18) | crosses the sand diagonally |
| 19.0-19.4 s | (-31, 31, 20) -> (-20, 43, 29) | launched up between the pillars under the deck |
| 19.6-20.0 s | (-6, 48, 33) -> (2, 50, 36) | gets onto the y=50 deck (clips through it) |
| 20.2 s | finish (24, 50, 42) | 25.245 - 5.030 = 20.215 s |

Search so far (`tools/goexplore.js`, Go-Explore over action programs): reaches (-32, 32, 19) but at 21.4 s (2.6 s too slow, random braking);
nothing gets onto the deck. Throttle-only variants did worse. Needs a frame-accurate, time-aware approach.
