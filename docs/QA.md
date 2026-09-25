# Ghost Bounce — QA and Playtesting

## 1. Automated test suite

Run with `npm test`. Suites:

| Suite | What it proves |
| --- | --- |
| `tests/mechanics.test.ts` | Movement (resting, run cap, variable jump, rubber + squash), echo replay exactness, echo fade-out, standing/bouncing on echoes without disturbing them, divergence detection, rewind equals re-simulation, mute/replace/undo slot management, every puzzle object (plates, toggle/timed switches, elevators, springs, breakables, lasers + receivers + remnants, spikes, fans, veils, anchor, locked exits), signal expression parsing |
| `tests/replay.test.ts` | 20 consecutive replays produce identical trajectories and identical interaction-event timings; plan preview equals the live simulation; every Daily-Echo-eligible level is solvable when mirrored; daily selection is stable; performance with 8 echoes |
| `tests/levels.test.ts` | For **every** level and challenge: well-formed data, reference solution reaches the exit, no echo divergence in the solution, determinism across runs, final take within the level's own time target |
| `tests/save.test.ts` | Round trip, A/B slot alternation, recovery from a torn write, checksum rejection, v1→v2 migration, default filling, export/import, storage-less operation |

Latest results are recorded in §4.

## 2. Manual checklist per build

- Title → Start → World 1-1 plays, banner shows, "Move to begin" appears.
- R keeps a take; timeline shows a lane per echo; path preview dots visible.
- T retries, Z rewinds smoothly (and after petrification), U removes an echo,
  digit keys mute and the next kept take replaces the muted echo.
- Clicking an echo lane mutes/restores it.
- Divergence: make an echo collide with a changed world → "!" on ball and lane,
  toast explains.
- Pause (Esc, and on tab switch): hints reveal one by one; "Watch the
  solution" plays and Esc returns to the player's own attempt with echoes
  intact.
- Completion card: marks, lore on first shard, unlock list, Next works with
  Space/Enter.
- Settings: volume sliders act live; rebinding works and persists; game speed
  50% slows play; shake toggle; touch controls toggle.
- Reload the page: progress, settings and cosmetics persist.
- Gamepad: move, jump, loop, retry, menu navigation.

## 3. Human playtesting protocol

Participants: at least 5, mixed (non-gamers, casual, puzzle fans). No
instructions beyond "play as long as you like".

Observe and log per level: time to solve, takes, hints opened, demo watched,
verbal confusion ("why did it…"), rage-quits.

Key questions:

1. Do players discover R without reading the sign? How long until the first
   echo?
2. Do players understand *why* each echo matters (ask them to explain their
   plan before the final take)?
3. Do divergence messages feel fair or like bugs?
4. Which levels have the highest hint usage relative to their position?
5. After finishing a level, do players pick "Next" or quit?
6. Which marks do players chase unprompted?

Iteration loop per milestone (max 10 rounds): gather evidence → rank issues
by impact → targeted fix → re-run the automated suite → re-test the affected
levels.

## 4. Results log

### 2026-09-25 — release candidate build

- `npm test`: **284 passed, 0 failed** (4 files: mechanics 26, replay incl. 30 mirrored levels, levels 43 × 5 checks, save 9).
- `npm run solve -- all`: **43/43** reference solutions solve (35 campaign levels, 8 challenges).
- Replay reliability: an echo replayed 20 times produced bit-identical trajectories and identical plate/spring event ticks.
- Performance: 8 echoes, 1800 ticks (a full 30 s loop) simulate in ~10 ms (≈5.5 µs per tick).
- `tsc --noEmit` clean; production build 155 KB JS (46 KB gzipped), 7 KB CSS.
- Browser smoke tests (headless Chrome via `tools/shot.mjs`): title, world select, keyboard menu navigation, W1 levels played with real key input, pause menu, solution demos of w5-5 and w7-5 rendered without console errors.

Engine issues found by the level designers and fixed in this round (each now has a regression test):

1. Burst/throw speed was sustained indefinitely while holding the direction → speed above run speed now bleeds off.
2. Balls on horizontally moving platforms moved at twice the platform speed → riders are carried exactly.
3. Fast hazard platforms shoved balls instead of petrifying them → any contact petrifies.
4. Doors wired to `!receiver` started open for one tick → initial state is settled before tick 0.

Four levels (w3-3, w3-4, w3-5, w5-4) were re-tuned for the fixed physics and re-verified.

Known and accepted behaviours (documented for designers): veils and `who` filters act on a ball's kind at playback, so an echo recorded through a ghost-veil diverges (taught in w6-1); echoes that start together and never separate pass through each other; remnants stay exactly where they petrified, including mid-air.

Not yet done: human playtesting (protocol above), real-device mobile testing.
