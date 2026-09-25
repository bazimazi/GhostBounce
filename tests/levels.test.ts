import { describe, expect, it } from 'vitest';
import { runSolution } from '../src/core/bot';
import { compileLevel } from '../src/core/level';
import { Session } from '../src/core/session';
import { ALL_LEVELS } from '../src/levels';

describe.each(ALL_LEVELS.map((l) => [l.id, l] as const))('level %s', (_id, def) => {
  it('is well-formed', () => {
    const widths = new Set(def.map.map((r) => r.length));
    expect(widths.size).toBe(1);
    expect(def.hints.length).toBeGreaterThanOrEqual(4);
    expect(def.solution.length - 1).toBeLessThanOrEqual(def.maxEchoes);
    expect(() => compileLevel(def)).not.toThrow();
  });

  it('reference solution reaches the exit', () => {
    const res = runSolution(new Session(compileLevel(def)), def.solution);
    expect(res.error).toBeUndefined();
    expect(res.takes.map((t) => t.ended).at(-1)).toBe('won');
    expect(res.solved).toBe(true);
  });

  it('reference solution replays without echo divergence', () => {
    const res = runSolution(new Session(compileLevel(def)), def.solution);
    const diverged = [...res.session.echoStatus.entries()].filter(([, st]) => st.divergedAt >= 0);
    expect(diverged).toEqual([]);
  });

  it('solution is deterministic across runs', () => {
    const a = runSolution(new Session(compileLevel(def)), def.solution);
    const b = runSolution(new Session(compileLevel(def)), def.solution);
    expect(a.takes).toEqual(b.takes);
    expect(a.session.player.x).toBe(b.session.player.x);
    expect(a.session.player.y).toBe(b.session.player.y);
  });

  it('solution meets its own mastery targets', () => {
    const res = runSolution(new Session(compileLevel(def)), def.solution);
    // The reference uses exactly the echoes it records; par may be lower if a cleverer route exists.
    expect(res.session.liveEchoCount).toBeLessThanOrEqual(def.maxEchoes);
    expect(res.takes.at(-1)!.ticks / 60).toBeLessThanOrEqual(def.parTime + 0.001);
  });
});
