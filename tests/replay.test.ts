import { describe, expect, it } from 'vitest';
import { runSolution } from '../src/core/bot';
import { compileLevel } from '../src/core/level';
import { mirrorLevel } from '../src/core/mirror';
import { PlanPreview } from '../src/core/preview';
import { Session } from '../src/core/session';
import { CAMPAIGN_LEVELS, DAILY_POOL, dailyLevel } from '../src/levels';
import { play, session, testLevel } from './helpers';

describe('replay reliability', () => {
  it('an echo replays identically across 20 consecutive takes', () => {
    const def = testLevel([
      { type: 'plate', id: 'p', x: 12, y: 8 },
      { type: 'door', x: 15, y: 5, w: 1, h: 4, open: 'p' },
      { type: 'spring', x: 8, y: 8 },
    ]);
    const s = session(def);
    play(s, 'r 20; jr 30; go 12; sq 90; l 30; j 24; w 40; end');
    s.endTake();
    s.commit();
    const recordedEvents: string[] = [];
    let first: number[] | null = null;
    for (let take = 0; take < 20; take++) {
      const xs: number[] = [];
      const evs: string[] = [];
      play(s, 'w 400', (ss) => {
        xs.push(ss.world.balls[0].x);
        for (const e of ss.lastEvents) if (e.t === 'plate' || e.t === 'spring') evs.push(`${ss.world.tick}:${e.t}`);
      });
      if (!first) {
        first = xs;
        recordedEvents.push(...evs);
      } else {
        expect(xs).toEqual(first);
        expect(evs).toEqual(recordedEvents);
      }
      expect(s.echoStatus.get(s.echoes[0].id)!.divergedAt).toBe(-1);
      s.retry();
    }
    expect(recordedEvents.length).toBeGreaterThan(0);
  });

  it('plan preview matches the live world when the player stays still', () => {
    const def = CAMPAIGN_LEVELS.find((l) => l.solution.length >= 3) ?? CAMPAIGN_LEVELS[0];
    const lvl = compileLevel(def);
    const s = new Session(lvl);
    // Record every take but the last as echoes.
    runSolution(s, def.solution.slice(0, -1).concat(['w 1']));
    s.retry();
    const preview = new PlanPreview(lvl, s.echoes);
    for (let t = 0; t < 300; t++) s.tick(0);
    const pw = preview.worldAt(300);
    s.echoes.forEach((_, i) => {
      expect(pw.balls[i].x).toBe(s.world.balls[i].x);
      expect(pw.balls[i].y).toBe(s.world.balls[i].y);
    });
  });
});

describe('mirrored levels (Daily Echo pool)', () => {
  it.each(DAILY_POOL.map((l) => [l.id, l] as const))('%s mirrored is solvable', (_id, def) => {
    const m = mirrorLevel(def);
    const res = runSolution(new Session(compileLevel(m)), m.solution);
    expect(res.solved).toBe(true);
  });

  it('daily level is stable for a date', () => {
    const a = dailyLevel('2026-09-25');
    const b = dailyLevel('2026-09-25');
    expect(a?.id).toBe(b?.id);
    if (a) expect(a.map).toEqual(b!.map);
  });
});

describe('performance', () => {
  it('simulates 8 echoes for a full 30 s loop well under real time', () => {
    const def = testLevel(
      [
        { type: 'plate', id: 'a', x: 5, y: 8 },
        { type: 'door', x: 12, y: 5, w: 1, h: 4, open: 'a' },
        { type: 'platform', x: 14, y: 6, w: 2, to: [[16, 3]], speed: 2 },
        { type: 'laser', x: 1, y: 3, dir: 'right' },
      ],
      undefined,
      { maxEchoes: 8 },
    );
    const s = session(def);
    const scripts = ['r 30; jl 20; w 200', 'l 10; jr 30; w 300', 'go 5; sq 400', 'go 9; j 24; w 200', 'r 100; l 100; r 100', 'jr 30; jl 30; jr 30; w 200', 'go 14; j 30; w 300', 'go 2; w 500'];
    for (const sc of scripts) {
      play(s, `${sc}; end`);
      s.endTake();
      s.commit();
    }
    const t0 = performance.now();
    for (let t = 0; t < 1800; t++) s.tick(t % 90 < 45 ? 2 : 1);
    const ms = performance.now() - t0;
    // 30 s of game time must simulate in a small fraction of a frame budget per tick.
    expect(ms).toBeLessThan(1500);
    console.log(`8 echoes, 1800 ticks: ${ms.toFixed(1)} ms (${((ms / 1800) * 1000).toFixed(1)} µs/tick)`);
  });
});
