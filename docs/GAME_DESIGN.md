# Ghost Bounce — Game Design Document

## 1. Pitch

A physics puzzle-platformer about cooperating with your past selves. You are
a luminous bouncing ball inside the Horologe, a clock-observatory that
records every moment. Each attempt at a puzzle can be kept as an **echo**: a
ghost that replays exactly what you did while you try again. Echoes hold
plates, act as springy stepping stones, block lasers with their petrified
remains, and hit switches on cue. You solve each room by choreographing a
small team of yourselves.

**Core principle: failure is not wasted effort — it is progress toward a
solution.** This is literal in the design: a take that ends badly can still be
kept, and a take that ends in a hazard leaves a stone remnant that later
takes can use.

## 2. Pillars and how the game serves them

| Pillar | How it shows up |
| --- | --- |
| Satisfying ball physics | Custom 240 Hz substepped physics, variable jump, coyote time and jump buffering, material-dependent bounces (stone, rubber, mud, ice, metal), squash-and-stretch, bounce sounds pitched by impact. |
| Meaningful ghost cooperation | Echoes are functional: they press plates, ride elevators, act as trampolines (live echoes are springy — "ghost bounce"), become remnants that bridge spikes or shield lasers, anchor in mid-air as perches. Every level's reference solution uses each echo for a distinct job. |
| Discovery and mastery | Each world teaches one family of mechanics in isolation, then combines it. Mastery marks for fewer echoes and faster final takes reward rethinking a solved puzzle. |
| Long-term progression | Seven worlds, two abilities, two echo-tool upgrades, memory shards with lore, skins and trails, challenge rooms and trials, a Daily Echo. |
| Fairness and clarity | Deterministic replays; echo path previews; divergence detection with "!" markers and a message; wires and glyph lamps show what controls what; plan view shows the whole loop; graduated hints ending in a watchable solution. |
| Cohesive world | "Horologe" motif (clock rings, tick marks) behind every room, one palette per world, a quiet first-person story told through shards. |

## 3. Core loop

1. **Explore** a single-screen room (30×17 tiles): every relevant object is
   visible at once.
2. **Experiment**: the world is frozen until you move; your take starts on
   your first input.
3. **Record**: press **R** to end the take and keep it as an echo. The loop
   restarts at tick 0.
4. **Replay**: every echo repeats its take exactly, alongside you.
5. **Coordinate**: use echoes to do what one ball cannot.
6. **Solve**: touch the open exit with the live ball.
7. **Celebrate**: burst of light, chord, completion card with marks and
   unlocks.
8. **Advance**: next room, new mechanic, new world.

Recovery tools keep the loop fast: **T** retries the take, **Z** (hold)
rewinds the current take, **U** removes the last echo, **1–9** mutes an echo
(the next kept take replaces it), **F** fast-forwards, **P/Tab** plan view.

## 4. Mechanics

### 4.1 Ball
- Run 250 px/s, strong turnaround, low air drag, air control 60% of ground.
- Jump 575 px/s, cut to 45% on early release (variable height), 6-tick coyote
  time and 7-tick buffer.
- Squash (Down): no bounce on landing, faster fall, extra braking. Used to rest
  steadily on plates and stop rubber bounces.
- Materials: stone (e=0.42), metal (0.5), rubber (0.92, minimum rebound 520
  px/s: a trampoline), mud (0, sticky), ice (low friction).

### 4.2 Echoes
- An echo is a recording of per-tick input bytes, replayed through the same
  deterministic simulation.
- Ordering rule: a ball collides with earlier balls as immovable obstacles
  and ignores later balls. This mirrors reality at recording time (when echo
  3 was recorded, echoes 1–2 were already there and couldn't be pushed), keeps
  earlier echoes stable, and gives a clean mental model: *your past can
  support you, you can't push your past*.
- Live echoes are springy: landing on one bounces you; jumping as you land
  launches you ~6.6 tiles (the eponymous "ghost bounce").
- An echo fades out when its recording ends (where you pressed R).
- **Divergence**: if the world changes under an echo, its physics drifts from
  its recording. The game detects this (1.5 px tolerance), marks the echo with
  "!" on the ball and timeline, and tells the player what happened. The echo
  keeps acting physically in the new situation — failures are informative,
  not random.

### 4.3 Petrification and remnants
Spikes, lasers, hazard platforms and falling out of the room petrify a ball
into a stone remnant that remains for the rest of the loop. Remnants are
solid, block lasers and press plates. A petrified take can be kept as an echo
("R: keep as echo — its remnant stays"). This turns failure into a building
material: bridges over spikes, shields in beams, weights on plates.

### 4.4 Puzzle objects
Pressure plates (any / ghost-only / player-only), toggle and timed switches,
doors (driven by boolean expressions over signals: `a & (b | !s)`), elevator
and ping-pong platforms, springs (4 directions), breakable walls (burst or
hard landing), lasers and receivers, fans, veils (solid to ghosts only or the
player only), locked exits, memory shards, signs. Every object shows its
state (lamps, glyphs, wires) and who it reacts to (dashed ring = ghosts,
solid dot = player).

### 4.5 Abilities
- **Burst** (World 3): 640 px/s dash in 8 directions, once per airtime,
  smashes breakable walls. Recorded and replayed by echoes like any input.
- **Anchor** (World 6): hold to freeze in mid-air for up to 2.5 s, once per
  ground contact. An anchored echo is a springy perch in the sky.

Abilities are only enabled in levels that have taught them.

## 5. Campaign structure

| World | Theme | New ideas |
| --- | --- | --- |
| 1 First Echo | waking | movement, record/replay, plates, doors, ghost bounce, toggle switch, one echo doing two jobs |
| 2 Shared Weight | builders | AND plates, elevators, riding, squash on plates, relays |
| 3 Momentum Lab | experiments | rubber, springs, Burst, breakables, momentum from echoes |
| 4 Temporal Machinery | gears | timed switches, inverted logic, moving platforms, sequencing, short loops |
| 5 The Living Maze | remnants | spikes, lasers, receivers, sentinels, fans, sacrifice |
| 6 Fractured Timelines | many selves | veils, ghost/player-only objects, Anchor, ordering rule as a tool |
| 7 The Infinite Archive | ending | combinations and set pieces |

Worlds unlock sequentially; levels unlock sequentially within a world.

## 6. Progression

- **Mastery marks** per level: Solved, Echo target (≤ par echoes), Time
  target (final take ≤ par seconds), Memory shard (where present).
- **Echo mastery** (tool upgrades earned by finishing worlds): Echo Sight
  (plan view, World 1), Long Foresight (3 s path previews, World 3).
- **Abilities**: Burst (World 3), Anchor (World 6).
- **Memory shards** reveal the story in the Collection.
- **Cosmetics**: ball skins and trails unlocked by shards and marks — pure
  expression, never power.
- **Challenges**: 5 rooms and 3 trials unlocked by marks.
- **Daily Echo** (after World 2): a mirrored campaign puzzle chosen by date,
  verified solvable by the test suite. Optional; nothing depends on it.
- **Statistics**: takes, echoes recorded, petrifications, bounces, time.

Rejected: currency, stat upgrades, random rewards, ghost-count upgrades for
their own sake, mandatory daily play.

## 7. Help without spoilers

Four graduated text hints per level (environmental → conceptual → strategic →
explicit), revealed one at a time (H or pause menu), then a fifth tier: **Watch
the solution** plays the verified reference solution take by take, and returns
the player to their own attempt afterwards.

## 8. Accessibility and comfort

Remappable keys, gamepad, touch controls; game speed 50/75/100%; hold-to-rewind;
fast-forward; screen-shake toggle; high-contrast echoes; echoes always carry
numbers (colour is never the only cue); signal glyphs (● ▲ ■ ◆ …) paired with
colours; path preview toggle; separate master/music/SFX volumes; pause on
focus loss; a pause menu reachable at any time.

## 9. Audio and visual direction

Visuals: ink-blue night with faint clock rings; each world shifts the
palette (teal, sandstone, coral, brass, moss, violet, silver). The live ball is
a warm cream light; echoes are translucent coloured balls with numbers,
dotted future paths and a dashed "fade-out point" ring; remnants are cracked
stone rimmed with the echo's colour.

Audio is synthesised: bounce pitch and timbre depend on material and impact;
echo sounds are low-passed and quieter so a crowd stays legible; switches
chime in their signal's register; the loop commit is a reverse whoosh; each
world has its own scale for a generative pad-and-pluck score.

## 10. Verified vs assumed

Verified (by automated tests): determinism of replays, solvability of every
level's reference solution, absence of echo divergence in reference
solutions, save corruption recovery and migration, mirrored-level
solvability, simulation cost (≈5 µs per tick with 8 echoes).

Assumed / needs human playtesting: difficulty curve, clarity of the ordering
rule, whether par targets feel fair, hint quality, touch-control ergonomics,
music fatigue over long sessions.
