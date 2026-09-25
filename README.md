# Ghost Bounce

*Every failed attempt becomes a ghost teammate.*

A physics puzzle-platformer for the browser. You are a bouncing ball in the
Horologe, a clock-observatory that records every moment. Keep an attempt and
it becomes an **echo** — a ghost that replays exactly what you did while you
try again. Echoes hold plates, act as springy stepping stones, petrify into
stone bridges over spikes, block lasers, and hit switches on cue. Solve each
room by choreographing a team of your past selves.

## Play

```bash
npm install
npm run dev        # open the printed URL
npm run build      # static build in dist/ (deploy anywhere)
```

### Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Roll | ← → / A D | stick / d-pad |
| Jump (hold for height) | Space / ↑ / W | A |
| Squash / fast fall (rest on plates) | ↓ / S | d-pad down |
| **Loop: keep this take as an echo** | **R** | B |
| Retry the take | T | Select |
| Rewind (hold) | Z | RT |
| Undo last echo | U / Backspace | LT |
| Mute / replace echo *n* | 1–9, or click its timeline lane | |
| Fast-forward (hold) | F | |
| Plan view (after World 1) | P / Tab | |
| Burst (World 3+) | Shift / J | X / RB |
| Anchor (World 6+) | C / K | Y / LB |
| Hint | H | |
| Pause | Esc | Start |

All keys can be rebound in Settings. Touch controls appear on touch devices.

## What's in the game

- 7 worlds of hand-built puzzles plus challenge rooms, trials and a mirrored
  Daily Echo — every puzzle ships with a verified reference solution you can
  watch from the pause menu after the hints run out.
- Mastery marks (fewer echoes, faster final take, hidden memory shards),
  echo-tool upgrades, two abilities, ball skins and trails, a story told
  through shards.
- Deterministic replays with divergence detection, hold-to-rewind, plan view.
- Synthesised audio and generative music, no external assets.
- Versioned, corruption-resistant saves with export/import.

## Development

```bash
npm test                     # all automated tests (mechanics, replay, every level, saves)
npm run typecheck
npm run solve -- all         # verify every level's reference solution
npm run solve -- w3-2        # trace one level's solution tick by tick
npx tsx tools/measure.ts     # movement numbers used by level designers
```

Documentation:

- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — design document
- [docs/TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md) — architecture, determinism, persistence
- [docs/LEVEL_DESIGN.md](docs/LEVEL_DESIGN.md) — level format, bot-script language, measured physics
- [docs/QA.md](docs/QA.md) — test results and playtesting protocol
- [docs/ROADMAP.md](docs/ROADMAP.md) — prioritised future work

## License

MIT
