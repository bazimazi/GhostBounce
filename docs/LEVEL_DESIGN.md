# Ghost Bounce — Level Design Guide

This is the working reference for building puzzles. Every number here is
measured from the real simulation (`npx tsx tools/measure.ts`).

## 1. How a level works

- The player controls a ball. A **take** is one run through the level's
  time loop, starting at tick 0 from the start tile `P`.
- Pressing **R** ends the take and keeps it as an **echo** (a ghost). The world
  restarts at tick 0 and every echo replays its recorded inputs exactly,
  alongside the new live take.
- An echo **fades out** when its recording ends. Its recording ends where the
  player pressed R (or at the loop time limit).
- A ball touching a hazard (spikes, laser, hazard platform, falling out of the
  level) is **petrified**: it becomes a static stone **remnant** that stays for
  the rest of the loop. Remnants are solid, block lasers and press plates.
  A take that ends in petrification can still be kept as an echo; the echo
  petrifies at the same moment and leaves the same remnant.
- The level is solved the moment the **live** ball touches an open exit.

### Ball-to-ball rules (important for puzzle logic)

- Balls are ordered: echo 1, echo 2, …, then the live player.
- A ball collides with every **earlier** ball as an immovable obstacle, and
  ignores later balls. So the player can stand on, bounce off, and be pushed
  by echoes, but can never push an echo. Echo 2 can stand on echo 1, but echo
  1 passes through echo 2.
- Live echoes are **springy** (rubber): landing on one bounces you; pressing
  jump as you land on one launches you very high ("ghost bounce").
- Balls spawned on top of each other do not collide until they have separated
  once, so everyone can share the start tile.

### Divergence

An echo is re-simulated from its inputs, so if the world differs from when it
was recorded (a door that was open is now closed, a later echo occupies a spot
it needed, a platform moved differently), it drifts off its recorded path. The
game marks that echo with "!" and tells the player. Reference solutions must
not diverge (tests enforce this).

## 2. Measured movement (tiles; 1 tile = 32 px; ball diameter 22 px)

| Move | Result |
| --- | --- |
| Run speed | 7.8 tiles/s |
| Full held jump | ball bottom rises **3.4 tiles** (clears a 3-tile wall, not 4) |
| Tap jump | 1.8 tiles |
| Running jump length | about 6 tiles gap |
| Bounce on an echo resting on the floor, no jump | ball bottom reaches 3.5 tiles above the floor |
| **Ghost bounce** (jump as you land on an echo resting on the floor) | ball bottom reaches **6.6 tiles** above the floor — clears a 6-tile wall next to the echo, not 7 |
| Rubber floor `=` | ball keeps bouncing ~2.8 tiles until you squash (Down); jumping on rubber = 5.8 tiles |
| Spring (default power 860) | launches **7.6 tiles** up; side springs throw ~sideways and slightly up |
| Burst (Shift/J, needs `abilities: ['burst']`) | 640 px/s dash for 0.15 s (~3 tiles); afterwards any speed above run speed bleeds off (~1300 px/s² on the ground, 480 px/s² in the air) even while holding the direction; once per airtime, recharges on landing; 8 directions |
| Burst up from a jump apex | ~4.3 more tiles |
| Breakable wall (strength 520 px/s) | broken by a burst into it, or by landing on it after falling ~3 tiles (squash speeds falls up). Walking into it does nothing |
| Fan (default 2000 px/s², gravity 1500) | up-fans lift and then overshoot the top of the column by ~30% of its height. The region must contain the ball centre to act |
| Anchor (C/K hold, needs `abilities: ['anchor']`) | freezes the ball in place up to 2.5 s; once per ground contact. Anchored echoes are springy perches |
| Plate | pressed while any ball's body overlaps it; stays on 0.1 s after release. Bouncing balls flicker, so squash (hold Down) to rest |
| Door | slides open/closed in 0.25 s. Never closes on a ball |
| Corridors | 1 tile tall/wide is enough for the ball |
| Platforms | riders are carried exactly with the platform; jumping off a moving platform keeps its momentum. Home positions should sit flush with the floor (a 16 px lip blocks a rolling ball) |
| Hazard platforms | petrify on any touch |

## 3. File format (`src/levels/worldN.ts`)

Levels are 30 columns × 17 rows. Rows 0 and 16 and columns 0 and 29 should be
walls. The floor is usually row 15/16. Coordinates of objects are in tiles
(integers or halves), `x` = column, `y` = row.

Map legend: `#` stone, `=` rubber, `%` mud (no bounce, high friction), `~` ice
(slippery), `M` metal, `^` spikes (orient automatically toward the solid tile
they sit on), `P` start, `.` empty.

Objects (see `src/core/types.ts` for the full types):

```ts
{ type: 'plate', id: 'a', x, y, w?: 1, who?: 'any' | 'ghost' | 'player' }   // sits at the bottom of tile (x,y): y is the empty tile above the floor
{ type: 'switch', id: 's', x, y, who?, timer?: seconds }                      // toggle, or on for `timer` seconds after each touch
{ type: 'door', x, y, w, h, open: 'a & (b | !s)' }                           // must NOT overlap map solids; seal the gap above/below with walls
{ type: 'platform', x, y, w, h?: 0.5, to: [[x2, y2], ...], speed: tilesPerSec, active?: 'a', hazard?: true, material? }
    // with `active`: moves toward the end while active, back home while inactive (an elevator).
    // without: ping-pongs forever. Balls standing on it ride along.
{ type: 'spring', x, y, dir?: 'up'|'left'|'right'|'down', power?: 860 }
{ type: 'breakable', id?: 'w', x, y, w, h, strength?: 520 }                  // signal `id` becomes true once broken
{ type: 'laser', x, y, dir, active?: 'expr' }                                 // emitter occupies tile (x,y); beam stops at solids, doors, platforms, balls, receivers
{ type: 'receiver', id: 'r', x, y }                                           // signal true while a beam hits it
{ type: 'fan', x, y, w, h, dir, strength?: 2000, active? }
{ type: 'veil', x, y, w, h, blocks: 'ghost' | 'player' }                      // solid only for that kind of ball
{ type: 'exit', x, y, active?: 'expr' }
{ type: 'shard', x, y }                                                       // optional collectible, pair with `lore`
{ type: 'sign', x, y, text }                                                  // short tutorial text, only when teaching
```

Level fields: `id` (`w3-2`), `name`, `world`, `objective` (one line),
`loopSeconds`, `maxEchoes`, `parEchoes` (mastery: solvable with this few —
must be proven by the reference solution or an alternative you verified),
`parTime` (mastery: final take seconds; set ~15–30% above the reference
solution's final take), `abilities`, `hints` (exactly 4: environmental,
conceptual, strategic, explicit), `solution` (bot scripts, one per take), `lore`
(if the level has a shard).

## 4. Reference solutions (bot scripts)

Every level ships a solution: one script per take; every take but the last is
kept as an echo, the last must reach the exit. Commands (`;`-separated,
durations in ticks at 60/s or `1.5s`):

```
w N          wait                     go X        steer to column X and stop (X may be fractional)
r N / l N    hold right / left        land [X]    wait until touching ground/echo, steering toward X
j [N]        hold jump (default 24)   settle      wait until resting
jr N / jl N  jump + right/left        until T     wait until absolute tick T
k KEYS N     hold keys (L R J D B A)  sq N        hold down (squash)
b DIRS       burst (l r u d, e.g. ur) a N         hold anchor N ticks
end          end the take here (it becomes an echo)
```

Typical ghost bounce: `go 13.5; j 20; land 15; jr 30` (jump up, drift onto
the echo at column 15, jump again on contact). Always give bursts an explicit
direction.

Tools:

```
npm run solve -- w3-2            # trace the reference solution (positions every 20 ticks + events)
npm run solve -- w3-2 --every 5  # finer trace
npm run solve -- w3-2 --map      # print the map with column/row rulers
npm run solve -- all             # check every level
npx vitest run tests/levels.test.ts -t "w3-"   # the enforced checks for your levels
```

The trace prints `x`/`y` in tile units of the ball centre (`x=12.00` means centred
on column 12; resting on a floor whose top is row 15 prints `y=14.16`).

## 5. Design rules

1. One new idea per level; teach it alone, then combine it. Put a one-line
   `sign` only when a mechanic is introduced.
2. Make each echo's job obvious from the layout: the player should be able to
   say "this ghost holds that plate, that one is my stepping stone".
3. The minimum-echo solution must require every echo (otherwise lower
   `parEchoes`). If a cleverer route solves it with fewer, make that the
   `parEchoes` mastery target and prove it.
4. Avoid pixel-perfect execution. Timing windows should be ≥ 0.5 s. Prefer
   plates (held) over tiny timing windows in early worlds.
5. Keep the solution short: final takes ideally under ~10 s, whole level
   under ~2 minutes for a player who knows the answer.
6. Seal every door: the ball must not be able to jump over or around it
   (remember ghost bounces reach 6.6 tiles above the echo's floor, springs 7.6 tiles, burst adds ~4 tiles).
7. Loop length (`loopSeconds`) should be generous (15–30 s) unless time pressure
   is the point of the puzzle.
8. Shards should reward curiosity or mastery (a harder route, a clever bounce),
   never block progress.
9. Vary structure: not every level is "plates open doors". Use trampolines,
   perches, sacrifices, sequencing, relays, timing windows, momentum.

## 6. Story (for `lore` lines on shards)

The player is a spark of motion that wakes inside **the Horologe**, a vast
clock-observatory that records every moment it has ever measured. Its keeper,
**the Archivist**, is gone. Echoes are the Horologe replaying the spark's own
past moments.

- W1 First Echo — waking; nothing is ever lost here.
- W2 Shared Weight — the builders who raised the Horologe carried loads
  together; one alone could lift nothing.
- W3 Momentum Lab — the Archivist's experiments with momentum and
  rebounding; notes on "a bounce that remembers".
- W4 Temporal Machinery — the gears that keep the loop turning; the Horologe
  is winding down.
- W5 The Living Maze — overgrown halls full of stone remnants: failed
  attempts, kept with care. Failure is a record, not a loss.
- W6 Fractured Timelines — the Archivist tried to split into many selves to
  hold the Horologe together; the veils are scars of that.
- W7 The Infinite Archive — the spark realises it *is* the Archivist's last
  echo; by cooperating with its own past it restarts the Horologe.

Lore lines are one or two sentences, first person, quiet and warm.
