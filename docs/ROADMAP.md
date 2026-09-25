# Ghost Bounce — Roadmap

Priorities follow the brief: P0 protects the core experience, P1 deepens it,
P2 expands it. Each item notes why it matters and what it depends on.

## P0 — before calling it 1.0

1. **Human playtesting round** (protocol in [QA.md](QA.md)). Five to eight
   players of mixed skill through Worlds 1–3, observed. Watch specifically:
   whether R (keep take) is discovered without the sign, whether the
   ordering rule (you can't push your past) surprises anyone, where hints
   are opened. Tune par times/echo targets from real data.
2. **Difficulty curve pass** once playtest data exists: reorder or split
   levels with spikes in hint usage; add a bridging level where a mechanic
   gets only one teaching level.
3. **Tutorial affordance for echo management**: an in-world prompt the first
   time the echo limit is hit (currently a toast).
4. **Mobile validation** on real phones: touch layout, 60 fps on mid-range
   devices, audio unlock on iOS.
5. **PWA packaging** (manifest + service worker) so the game installs and
   runs offline.

## P1 — depth and comfort

1. **Timeline scrubbing with the live take**: extend plan view to show your
   own current take's recorded path alongside echoes.
2. **Per-echo re-recording from a chosen tick** ("keep the first 3 s of echo 2,
   re-record the rest") — a natural extension of rewind + replace.
3. **Assist options**: longer coyote time / jump buffer and wider plate
   sensors as opt-in assists (applied per level at start so recordings stay
   consistent).
4. **Colour-vision presets** for the echo palette in addition to numbers and
   glyphs.
5. **More mastery trials** (one per world) and a **time-attack ladder** that
   sums best final-take times per world.
6. **Richer audio**: per-world ambient beds, a stinger when two or more echoes
   trigger mechanisms on the same tick ("synchronisation cue").
7. **Achievements** tied to play style (solve a level with a remnant, three
   ghost bounces in one take, par-echo every level of a world).

## P2 — expansion

1. **Level editor** (levels are already pure JSON data validated by
   `compileLevel`): tile painting, object wiring UI, and a mandatory
   "record a solution" step before a level can be shared.
2. **Share codes** for custom levels and for complete echo sets (replays are
   tiny: one byte per tick per echo). Verify cross-browser determinism first
   (see TECHNICAL_DESIGN §3).
3. **Community playlists / curated packs**, then optional online
   leaderboards for challenge rooms (fewest echoes, fastest final take) —
   only after the offline game is complete.
4. **New worlds and mechanics**, each passing the six-question feature test:
   - Echo-to-echo momentum transfer (later echoes pushing earlier ones under
     explicit rules) — the brief's "ghost-to-ghost momentum".
   - Gravity-flip zones.
   - Branching timelines: a take that forks at a switch into two recordings.
   - Portals that carry momentum.
   - Environmental transformation across loops (a plant that grows each take).
5. **Narrative epilogue** after World 7 using remixed rooms.

## Known limitations

- Crushing: a moving platform that pushes a ball into a wall resolves by
  penetration rather than a dedicated crush rule; levels avoid the situation.
- Plan view simulates echoes without the player, so it cannot show effects
  of the player's own actions on echoes.
- Cross-device replay equality is expected (IEEE 754 arithmetic only) but not
  yet verified; it matters only once replays are shared.
