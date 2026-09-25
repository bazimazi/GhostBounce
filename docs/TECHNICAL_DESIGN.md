# Ghost Bounce — Technical Design

## 1. Platform and engine choice

**Choice: TypeScript + HTML5 Canvas 2D + WebAudio, bundled with Vite, custom
physics.** Runs in any modern desktop or mobile browser; no install.

Evaluation:

| Criterion | Unity / Godot | Box2D / Matter.js in the browser | Custom fixed-step physics (chosen) |
| --- | --- | --- | --- |
| Deterministic replay | Physics engines are not guaranteed deterministic across frames/solvers; would need to wrap with fixed-step + custom movement anyway | Iterative solvers, warm starting and sleeping make input-replay fragile | Fully controlled: fixed tick, fixed substeps, fixed update order, only IEEE-exact operations (+ − × ÷ √) in the simulation |
| Ball-centric feel | Good | Generic rigid bodies need taming | Tailored: coyote time, buffering, material restitution, landing assists |
| Headless testing | Heavy | Possible | Trivial: the core has no DOM dependency; tests and tools run it in Node |
| Deployment | Builds per platform | Web | Web (static files), PWA-ready |
| Tooling cost | High | Medium | Low; the game's world is axis-aligned tiles + circles |

The game only needs circles vs axis-aligned rectangles and circles vs
circles, which makes a bespoke solver small (≈800 lines) and fully
predictable.

## 2. Architecture

```
src/core/        pure simulation (no DOM) — shared by game, tests and tools
  constants.ts   tick rate, tuning, materials
  types.ts       level data format
  level.ts       compiles level data to pixel geometry; validation
  signals.ts     boolean expression compiler for wiring
  world.ts       WorldState + step(): physics, mechanisms, sensors, hazards
  session.ts     echoes, takes, commit/retry/undo/mute, divergence, rewind
  preview.ts     ghost-only simulation for plan view
  bot.ts         bot-script language; reference solutions; runSolution()
  mirror.ts      level + solution mirroring (Daily Echo)
  input.ts       per-tick input bitmask
src/game/        browser client
  app.ts         screens, menus, flow, main loop        (UIManager)
  play.ts        one level: input → session → events   (PlayerController glue)
  renderer.ts    Canvas 2D drawing, static layer cache
  hud.ts         timeline lanes (recording interface)
  audio.ts       synthesised SFX + generative music      (AudioManager)
  fx.ts          particles, shake, flash (cosmetic only)
  input.ts       keyboard / gamepad / touch, rebinding
  save.ts        versioned A/B-slot persistence          (SaveManager)
  progression.ts marks, unlocks, cosmetics               (ProgressionManager)
  theme.ts       palettes, echo colours, skins, trails
src/levels/      level data (one file per world + challenges)
tests/           vitest: mechanics, replay, levels, save
tools/           solve.ts (level tracer/validator), measure.ts, shot.mjs
```

Mapping to the conceptual systems in the brief: PhysicsSimulation =
`world.ts`; GhostRecorder/GhostPlayback/GhostManager = `session.ts`;
InteractionSystem + PuzzleStateManager = sensors/mechanisms/signals in
`world.ts`; AbilitySystem = burst/anchor in `stepBall`; LevelManager =
`level.ts` + `levels/`; CheckpointSystem = snapshots + rewind (see §5);
Analytics/Debug = `tools/solve.ts`, `window.ghostBounce`.

## 3. Determinism and replay (research summary)

Approaches considered:

1. **Record state (positions) and play back kinematically.** Always
   faithful, but a ghost would phase through a door that is now closed, and
   echoes could not react to a changed world — confusing and physically
   dishonest.
2. **Record inputs and re-simulate.** Echoes are true physical actors. Risk:
   floating-point or ordering differences cause drift.
3. **Hybrid (chosen): record inputs and re-simulate, and also record positions
   as a reference.** Replays are physically real; any drift is *detected*
   rather than hidden.

Measures that make (2) exact on a given device:

- Fixed 60 Hz tick, 4 physics substeps per tick; rendering interpolates and
  never feeds back into the simulation.
- Input sampled once per tick into one byte; jump/burst/anchor edges are
  derived from the previous tick's byte inside the simulation.
- Fixed update order: mechanisms → balls in index order → sensors → lasers →
  signals. No iteration over hash maps with insertion-order hazards; no
  randomness; no wall-clock time.
- Only +, −, ×, ÷ and `Math.sqrt` (correctly rounded by IEEE 754) in the
  simulation; no trigonometry. Moving platforms follow polylines, not sines.
- Every take restarts the world from the same initial state at tick 0.
- The ordering rule (earlier balls ignore later ones) prevents feedback loops
  between echoes.

Cross-device: IEEE 754 double arithmetic with these operations is
bit-identical across conforming JS engines, so recordings could be shared;
this is an assumption to verify before shipping replay sharing (Roadmap).

**Divergence detection.** Each echo stores its recorded x/y per tick; on
replay the session compares simulated and recorded positions and flags the
first tick where they differ by more than 1.5 px. Causes are always
*legitimate world changes* (a later echo opened a door earlier, occupied a
spot, etc.); the UI explains this and the player can mute/re-record.

**Tests** (see `tests/replay.test.ts`, `tests/levels.test.ts`): identical
trajectories and event timings across 20 replays; every level's reference
solution solves, is deterministic across runs, and has zero divergence; plan
preview equals live simulation; mirrored levels solve.

## 4. Level pipeline

Levels are data (`LevelDef`): an ASCII tile map plus objects wired with signal
expressions. `compileLevel` merges tiles into rectangles, orients spikes,
converts to pixels and validates (unknown signals, duplicate ids, doors or
breakables overlapping solids, par vs max echoes). Each level carries a
reference solution in the bot-script language; `npm run solve -- <id>` traces
it and the test suite verifies it. The same scripts power "Watch the
solution" in game and the Daily Echo mirror checks.

## 5. Checkpoints, rewind and plan view

Classic checkpoints conflict with a time loop (the world must restart at tick
0 for echoes to be meaningful). Instead:

- **Rewind**: the session snapshots the world every 30 ticks
  (`structuredClone` of plain data) and rewinds by restoring the nearest
  snapshot and re-simulating forward — exact, and cheap (≤ 29 ticks).
- **Plan view**: a ghost-only simulation with snapshots every 10 ticks gives
  random access to any moment of the loop.

## 6. Persistence

`localStorage`, two slots written alternately, each `{gen, checksum, body}`
(FNV-1a). Load chooses the highest generation that verifies, so a torn or
corrupted write loses at most the latest save. Versioned with step-wise
migrations (`migrate`), defaults filled in for new fields. Export/import as a
base64 code. Works without storage (in-memory). Saves on level completion,
settings changes, tab hide and unload.

## 7. Performance budget

- Simulation: ≈5.5 µs/tick with 8 echoes and all object types (measured), i.e.
  < 0.1% of a 16.7 ms frame. Rewind of 29 ticks ≈ 0.2 ms.
- Rendering: static geometry and background pre-rendered once per level;
  per frame draws only dynamic objects, balls, paths and particles.
- Worst case: 8 echoes + 3× fast-forward = 36 ticks/frame ≈ 0.2 ms.
- Memory: an echo is ~9 bytes per tick (1 input + 2 float32); a 30 s echo is
  16 KB.

## 8. Extension points

- New object: add a `*Def` to `types.ts`, compile it in `level.ts`, give it
  state in `WorldState`, update in `step()`, draw in `renderer.ts`. Echo
  interaction comes for free because echoes are ordinary balls; `who`
  filters restrict interactions.
- New ability: add an input bit, handle it in `stepBall`, add to
  `AbilityId` and the level's `abilities`.
- Level editor / sharing: levels are JSON-serialisable already; a share code
  is `btoa(JSON.stringify(level))` with validation via `compileLevel` and a
  mandatory solution check before publishing.
