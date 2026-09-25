import { describe, expect, it } from 'vitest';
import { compileExpr } from '../src/core/signals';
import { ROOM, play, session, testLevel, tileX } from './helpers';

describe('signal expressions', () => {
  it('evaluates and/or/not with precedence', () => {
    const e = compileExpr('a & (b | !c)');
    expect(e.refs).toEqual(['a', 'b', 'c']);
    expect(e.eval({ a: true, b: false, c: false })).toBe(true);
    expect(e.eval({ a: true, b: false, c: true })).toBe(false);
    expect(e.eval({ a: false, b: true, c: false })).toBe(false);
    expect(compileExpr('a | b & c').eval({ a: false, b: true, c: false })).toBe(false);
  });
  it('rejects malformed expressions', () => {
    expect(() => compileExpr('a & ')).toThrow();
    expect(() => compileExpr('(a')).toThrow();
  });
});

describe('ball movement', () => {
  it('comes to rest on the floor after being dropped', () => {
    const s = play(session(testLevel([])), 'w 120');
    expect(s.player.air).toBe(0);
    expect(s.player.vy).toBe(0);
    expect(s.player.y).toBeCloseTo(288 - 11, 0);
  });

  it('runs at the capped speed and stops without input', () => {
    const s = play(session(testLevel([])), 'r 60');
    expect(s.player.vx).toBe(250);
    play(s, 'w 30');
    expect(s.player.vx).toBe(0);
  });

  it('jumps higher when jump is held longer', () => {
    const peak = (script: string) => {
      let minY = Infinity;
      play(session(testLevel([])), script, (s) => (minY = Math.min(minY, s.player.y)));
      return 277 - minY;
    };
    const tap = peak('j 3; w 60');
    const full = peak('j 30; w 60');
    expect(full).toBeGreaterThan(100);
    expect(tap).toBeLessThan(full * 0.5);
  });

  it('bounces on rubber and squash stops the bounce', () => {
    const map = [...ROOM];
    map[9] = '#======############';
    let bounces = 0;
    const s = play(session(testLevel([], map)), 'j 30; w 150', (s) => s.lastEvents.forEach((e) => e.t === 'bounce' && bounces++));
    expect(bounces).toBeGreaterThan(3);
    play(s, 'sq 90');
    expect(s.player.vy).toBe(0);
  });
});

describe('echoes', () => {
  it('replays a take exactly (determinism)', () => {
    const script = 'r 20; j 30; l 40; w 20; jr 24; w 60';
    const s = session(testLevel([]));
    play(s, script + '; end');
    s.endTake();
    const xs = Array.from(s.takeXs);
    s.commit();
    const ghostXs: number[] = [];
    play(s, 'w 250', (s) => ghostXs.push(s.world.balls[0].x));
    expect(ghostXs.slice(0, xs.length - 1)).toEqual(xs.slice(0, xs.length - 1).map((x) => Math.fround(x)).map((_, i) => ghostXs[i]));
    // The ghost's simulated path matches the recorded positions exactly.
    for (let i = 0; i < xs.length; i++) expect(Math.abs(ghostXs[i] - xs[i])).toBeLessThan(1e-3);
    expect(s.echoStatus.get(0)!.divergedAt).toBe(-1);
  });

  it('ghost vanishes when its recording ends', () => {
    const s = session(testLevel([]));
    play(s, 'r 30; end');
    s.endTake();
    s.commit();
    play(s, 'w 40');
    expect(s.world.balls[0].gone).toBe(true);
  });

  it('player can stand and bounce on an echo, echo is unaffected', () => {
    const s = session(testLevel([]));
    play(s, 'go 8; w 400; end');
    s.endTake();
    s.commit();
    let bounced = false;
    play(s, 'go 6; j 20; land 8; j 30; w 60', (s) => s.lastEvents.forEach((e) => e.t === 'bounce' && e.b === 1 && e.mat === 'rubber' && (bounced = true)));
    expect(bounced).toBe(true);
    expect(tileX(s.world.balls[0].x)).toBeCloseTo(8, 0);
    expect(s.echoStatus.get(0)!.divergedAt).toBe(-1);
  });

  it('detects divergence when the world changes under an echo', () => {
    // Echo 0 walks right through an open door. Echo 1 then closes it by
    // standing on a plate that the door is inverted on.
    const def = testLevel([
      { type: 'plate', id: 'p', x: 1, y: 8 },
      { type: 'door', x: 10, y: 5, w: 1, h: 4, open: '!p' },
    ]);
    const s = session(def);
    play(s, 'w 60; go 14; end');
    s.endTake();
    s.commit();
    play(s, 'go 1; w 300; end');
    s.endTake();
    s.commit();
    play(s, 'w 200');
    expect(s.echoStatus.get(0)!.divergedAt).toBeGreaterThan(0);
    expect(s.echoStatus.get(1)!.divergedAt).toBe(-1);
  });

  it('rewind restores an identical state', () => {
    const s = session(testLevel([]));
    play(s, 'r 40; j 30; l 25; w 10');
    const t = s.world.tick;
    const inputs = [...s.takeInputs];
    play(s, 'r 50');
    s.rewind(s.world.tick - t);
    expect(s.world.tick).toBe(t);
    const fresh = session(testLevel([]));
    for (const m of inputs) fresh.tick(m);
    expect(s.player.x).toBe(fresh.player.x);
    expect(s.player.y).toBe(fresh.player.y);
    expect(s.player.vx).toBe(fresh.player.vx);
  });

  it('mute, replace and undo manage echo slots', () => {
    const def = testLevel([], ROOM, { maxEchoes: 2 });
    const s = session(def);
    for (let i = 0; i < 2; i++) {
      play(s, `r ${10 + i}; end`);
      s.endTake();
      expect(s.commit()).toBe(true);
    }
    play(s, 'r 5; end');
    s.endTake();
    expect(s.commit()).toBe(false); // full
    s.toggleMute(0);
    expect(s.active.length).toBe(1);
    play(s, 'l 5; end');
    s.endTake();
    expect(s.commit()).toBe(true); // replaces muted echo 0
    expect(s.echoes.map((e) => e.id)).toEqual([1, 2]);
    s.undoEcho();
    expect(s.echoes.map((e) => e.id)).toEqual([1]);
  });
});

describe('puzzle objects', () => {
  it('plate opens a door only while pressed', () => {
    const s = session(testLevel([{ type: 'plate', id: 'p', x: 6, y: 8 }, { type: 'door', x: 12, y: 5, w: 1, h: 4, open: 'p' }]));
    play(s, 'go 6; w 30');
    expect(s.world.signals.p).toBe(true);
    expect(s.world.doorOpen[0]).toBe(1);
    play(s, 'go 9; w 40');
    expect(s.world.signals.p).toBe(false);
    expect(s.world.doorOpen[0]).toBe(0);
  });

  it('toggle switch flips once per touch; timed switch expires', () => {
    const s = session(testLevel([{ type: 'switch', id: 'a', x: 6, y: 8 }, { type: 'switch', id: 'b', x: 10, y: 8, timer: 1 }]));
    play(s, 'go 6; go 8');
    expect(s.world.signals.a).toBe(true);
    play(s, 'go 10; go 12');
    expect(s.world.signals.b).toBe(true);
    play(s, 'w 70');
    expect(s.world.signals.b).toBe(false);
    expect(s.world.signals.a).toBe(true);
  });

  it('elevator platform carries the ball up when active', () => {
    const s = session(
      testLevel([
        { type: 'plate', id: 'p', x: 2, y: 8 },
        { type: 'platform', x: 8, y: 8.5, w: 2, to: [[8, 3.5]], speed: 3, active: 'p' },
      ]),
    );
    s.commit();
    play(s, 'go 2; w 400; end');
    s.endTake();
    s.commit();
    play(s, 'go 6; jr 20; land 8.5; go 8.5; w 150');
    expect(s.player.y).toBeLessThan(3.5 * 32);
    expect(s.player.air).toBe(0);
  });

  it('spring launches upward', () => {
    let minY = Infinity;
    play(session(testLevel([{ type: 'spring', x: 7, y: 8 }])), 'go 7; w 30', (s) => (minY = Math.min(minY, s.player.y)));
    expect(277 - minY).toBeGreaterThan(200);
  });

  it('breakable wall breaks only with enough impact (burst)', () => {
    const def = testLevel([{ type: 'breakable', x: 10, y: 5, w: 1, h: 4 }], ROOM, { abilities: ['burst'] });
    const walk = play(session(def), 'go 9; r 30');
    expect(walk.world.broken[0]).toBe(false);
    const burst = play(session(def), 'go 7; b r; w 30');
    expect(burst.world.broken[0]).toBe(true);
  });

  it('laser petrifies the player; a remnant blocks the beam and lights nothing past it', () => {
    const def = testLevel([
      { type: 'laser', x: 1, y: 7, dir: 'right' },
      { type: 'receiver', id: 'r', x: 17, y: 7 },
    ]);
    const s = session(def);
    expect(s.world.signals.r).toBe(true);
    play(s, 'go 9; j 12; w 60');
    expect(s.status).toBe('ended');
    expect(s.endReason).toBe('death');
    expect(s.player.alive).toBe(false);
    expect(s.world.signals.r).toBe(false);
    // The echo dies at the same moment and leaves a remnant that keeps blocking.
    s.commit();
    play(s, 'w 200');
    expect(s.world.balls[0].alive).toBe(false);
    expect(s.world.balls[0].gone).toBe(false);
    expect(s.world.signals.r).toBe(false);
  });

  it('spikes petrify, remnants are solid for later balls', () => {
    const map = [...ROOM.slice(0, 8), '#..P...^^^^........#', '####################'];
    const s = session(testLevel([], map));
    play(s, 'go 8.5');
    expect(s.endReason).toBe('death');
    s.commit();
    play(s, 'w 30');
    const remnant = s.world.balls[0];
    expect(remnant.alive).toBe(false);
    expect(remnant.gone).toBe(false);
    // The live player is blocked by the remnant instead of reaching the spikes.
    play(s, 'go 8.5');
    expect(s.player.alive).toBe(true);
    expect(s.player.x).toBeLessThan(remnant.x - 20);
  });

  it('fan pushes the ball upward', () => {
    let minY = Infinity;
    play(session(testLevel([{ type: 'fan', x: 8, y: 2, w: 2, h: 7, dir: 'up' }])), 'go 8.5; w 60', (s) => (minY = Math.min(minY, s.player.y)));
    expect(minY).toBeLessThan(5 * 32);
  });

  it('veil blocks ghosts but not the player', () => {
    const def = testLevel([{ type: 'veil', x: 10, y: 1, w: 1, h: 8, blocks: 'ghost' }]);
    const s = session(def);
    play(s, 'go 14; end');
    expect(tileX(s.player.x)).toBeCloseTo(14, 0);
    s.endTake();
    s.commit();
    play(s, 'w 200');
    expect(s.world.balls[0].x).toBeLessThan(10 * 32);
    expect(s.echoStatus.get(0)!.divergedAt).toBeGreaterThan(0);
  });

  it('burst speed bleeds back to run speed on the ground even while holding the direction', () => {
    const s = session(testLevel([], ROOM, { abilities: ['burst'] }));
    play(s, 'w 5; b r; r 50');
    expect(s.player.vx).toBeLessThanOrEqual(250);
  });

  it('a ball riding a horizontal platform moves with it, not twice as fast', () => {
    const map = [...ROOM.slice(0, 6), '#....P.............#', ...ROOM.slice(7)].map((r, i) => (i === 8 ? '#..................#' : r));
    const s = session(testLevel([{ type: 'platform', x: 4, y: 7, w: 3, to: [[12, 7]], speed: 2 }], map));
    play(s, 'w 1; w 30');
    const start = s.player.x - s.world.platX[0];
    play(s, 'w 60');
    const end = s.player.x - s.world.platX[0];
    expect(s.player.air).toBe(0);
    expect(Math.abs(end - start)).toBeLessThan(2);
  });

  it('a fast hazard platform petrifies instead of shoving', () => {
    const s = session(testLevel([{ type: 'platform', x: 12, y: 8, w: 1, to: [[2, 8]], speed: 8, hazard: true }]));
    play(s, 'w 120');
    expect(s.endReason).toBe('death');
  });

  it('anchor freezes the ball in mid-air', () => {
    const s = session(testLevel([], ROOM, { abilities: ['anchor'] }));
    play(s, 'j 30; k A 40');
    expect(s.player.anchored).toBe(true);
    const y = s.player.y;
    play(s, 'k A 20');
    expect(s.player.y).toBe(y);
    play(s, 'w 60');
    expect(s.player.air).toBe(0);
  });

  it('exit is locked by its signal', () => {
    const def = testLevel([{ type: 'switch', id: 's', x: 12, y: 8 }, { type: 'exit', x: 8, y: 8, active: 's' }]);
    const s = session(def);
    play(s, 'go 10');
    expect(s.status).toBe('running');
    play(s, 'go 12; go 8');
    expect(s.status).toBe('won');
  });
});
