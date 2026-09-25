import { BALL_RADIUS, DOOR_SPEED, DT, MATERIALS, PLATE_HOLD_TICKS, SUBSTEPS, SUB_DT, type Material } from './constants';
import { IN_ANCHOR, IN_BURST, IN_DOWN, IN_JUMP, IN_LEFT, IN_RIGHT, has } from './input';
import type { CompiledLevel, Rect } from './level';
import type { Signals } from './signals';
import type { Dir, Who } from './types';

// ---------------------------------------------------------------------------
// World state. Everything here is plain data so it can be snapshotted with
// structuredClone (used for rewind and timeline scrubbing).
//
// Ball ordering matters: ball j collides with every ball i < j as an
// immovable obstacle, but ball i ignores ball j. Echoes are ordered by
// recording order and the active player is always last, which mirrors the
// situation at recording time: when echo k was recorded, echoes 0..k-1
// already existed and could not be pushed.
// ---------------------------------------------------------------------------

export type BallKind = 'ghost' | 'player';

export interface Ball {
  kind: BallKind;
  /** Index into the session's echo list, or -1 for the active player. */
  echo: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  /** false once petrified by a hazard: the ball becomes a static remnant. */
  alive: boolean;
  /** true once a ghost's recording has ended and it has faded out. */
  gone: boolean;
  /** Ticks since last ground contact (0 = touched ground this tick). */
  air: number;
  groundMat: Material;
  /** Platform index the ball stands on, -1 if none. */
  groundPlat: number;
  groundVx: number;
  jumpBuffer: number;
  jumpRise: boolean;
  lastMask: number;
  squash: boolean;
  facing: number;
  burstReady: boolean;
  burstTimer: number;
  anchorReady: boolean;
  anchorTimer: number;
  anchored: boolean;
  springCd: number;
  /** Indices of earlier balls this ball has separated from (spawn overlap guard). */
  sep: number[];
  /** Impact speed of the last hard landing, for squash-and-stretch rendering. */
  impact: number;
  impactTick: number;
}

export type GameEvent =
  | { t: 'bounce'; b: number; x: number; y: number; speed: number; mat: Material }
  | { t: 'jump'; b: number; x: number; y: number }
  | { t: 'burst'; b: number; x: number; y: number }
  | { t: 'anchor'; b: number; x: number; y: number }
  | { t: 'spring'; b: number; x: number; y: number }
  | { t: 'plate'; id: string; on: boolean; x: number; y: number }
  | { t: 'switch'; id: string; on: boolean; x: number; y: number; b: number }
  | { t: 'door'; i: number; open: boolean; x: number; y: number }
  | { t: 'break'; i: number; x: number; y: number }
  | { t: 'petrify'; b: number; x: number; y: number }
  | { t: 'shard'; i: number; x: number; y: number }
  | { t: 'receiver'; id: string; on: boolean; x: number; y: number }
  | { t: 'vanish'; b: number; x: number; y: number }
  | { t: 'exit'; x: number; y: number };

export interface WorldState {
  tick: number;
  balls: Ball[];
  plateHold: number[];
  plateOn: boolean[];
  switchOn: boolean[];
  switchTimer: number[];
  switchTouch: boolean[];
  doorOpen: number[];
  doorTarget: boolean[];
  platS: number[];
  platDir: number[];
  platX: number[];
  platY: number[];
  platDX: number[];
  platDY: number[];
  broken: boolean[];
  laserOn: boolean[];
  laserEnd: { x: number; y: number }[];
  receiverOn: boolean[];
  shardTaken: boolean[];
  won: boolean;
  signals: Signals;
  events: GameEvent[];
}

export function makeBall(kind: BallKind, echo: number, x: number, y: number): Ball {
  return {
    kind,
    echo,
    x,
    y,
    vx: 0,
    vy: 0,
    rot: 0,
    alive: true,
    gone: false,
    air: 0,
    groundMat: 'stone',
    groundPlat: -1,
    groundVx: 0,
    jumpBuffer: 0,
    jumpRise: false,
    lastMask: 0,
    squash: false,
    facing: 1,
    burstReady: true,
    burstTimer: 0,
    anchorReady: true,
    anchorTimer: 0,
    anchored: false,
    springCd: 0,
    sep: [],
    impact: 0,
    impactTick: -100,
  };
}

export function createWorld(level: CompiledLevel, kinds: BallKind[], echoIds: number[]): WorldState {
  const balls = kinds.map((k, i) => makeBall(k, echoIds[i], level.start.x, level.start.y));
  const w: WorldState = {
    tick: 0,
    balls,
    plateHold: level.plates.map(() => 0),
    plateOn: level.plates.map(() => false),
    switchOn: level.switches.map(() => false),
    switchTimer: level.switches.map(() => 0),
    switchTouch: level.switches.map(() => false),
    doorOpen: level.doors.map(() => 0),
    doorTarget: level.doors.map(() => false),
    platS: level.platforms.map(() => 0),
    platDir: level.platforms.map(() => 1),
    platX: level.platforms.map((p) => p.path[0].x),
    platY: level.platforms.map((p) => p.path[0].y),
    platDX: level.platforms.map(() => 0),
    platDY: level.platforms.map(() => 0),
    broken: level.breakables.map(() => false),
    laserOn: level.lasers.map(() => false),
    laserEnd: level.lasers.map((l) => ({ x: l.ox, y: l.oy })),
    receiverOn: level.receivers.map(() => false),
    shardTaken: level.shards.map(() => false),
    won: false,
    signals: {},
    events: [],
  };
  // Settle the initial state: doors depend on signals, receivers depend on
  // beams, beams depend on doors. Two passes reach a fixed point for any
  // sensible wiring, so mechanisms start in their resting positions.
  for (let pass = 0; pass < 2; pass++) {
    computeSignals(level, w);
    level.doors.forEach((d, i) => {
      const open = d.open.eval(w.signals);
      w.doorTarget[i] = open;
      w.doorOpen[i] = open ? 1 : 0;
    });
    level.lasers.forEach((l, i) => (w.laserOn[i] = l.active ? l.active.eval(w.signals) : true));
    computeLasers(level, w);
  }
  computeSignals(level, w);
  return w;
}

export const cloneWorld = (w: WorldState): WorldState => structuredClone(w);

const whoMatches = (who: Who, b: Ball) => who === 'any' || who === b.kind;

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

/** Advances the world by one tick. `inputs[i]` is the input mask for ball i. */
export function step(level: CompiledLevel, w: WorldState, inputs: ArrayLike<number>) {
  w.events = [];
  updateMechanisms(level, w);
  for (let i = 0; i < w.balls.length; i++) {
    const b = w.balls[i];
    if (b.gone || !b.alive) continue;
    stepBall(level, w, i, inputs[i] ?? 0);
  }
  updateSensors(level, w);
  computeLasers(level, w);
  computeSignals(level, w);
  w.tick++;
}

function updateMechanisms(level: CompiledLevel, w: WorldState) {
  const s = w.signals;
  level.doors.forEach((d, i) => {
    const target = d.open.eval(s);
    let open = w.doorOpen[i];
    if (target) open = Math.min(1, open + DOOR_SPEED * DT);
    else if (open > 0) {
      // A door never closes onto a ball: anything inside holds it open.
      const blocked = w.balls.some((b) => !b.gone && circleRect(b.x, b.y, BALL_RADIUS - 1, d));
      if (!blocked) open = Math.max(0, open - DOOR_SPEED * DT);
    }
    if (target !== w.doorTarget[i]) {
      w.doorTarget[i] = target;
      w.events.push({ t: 'door', i, open: target, x: d.x + d.w / 2, y: d.y + d.h / 2 });
    }
    w.doorOpen[i] = open;
  });

  level.platforms.forEach((p, i) => {
    let sPos = w.platS[i];
    if (p.active) {
      const fwd = p.active.eval(s);
      sPos = fwd ? Math.min(p.length, sPos + p.speed) : Math.max(0, sPos - p.speed);
    } else if (p.length > 0) {
      sPos += p.speed * w.platDir[i];
      if (sPos >= p.length) {
        sPos = p.length;
        w.platDir[i] = -1;
      } else if (sPos <= 0) {
        sPos = 0;
        w.platDir[i] = 1;
      }
    }
    w.platS[i] = sPos;
    const { x, y } = pointOnPath(p.path, p.cum, sPos);
    w.platDX[i] = x - w.platX[i];
    w.platDY[i] = y - w.platY[i];
    w.platX[i] = x;
    w.platY[i] = y;
  });

  level.lasers.forEach((l, i) => (w.laserOn[i] = l.active ? l.active.eval(s) : true));
}

function pointOnPath(path: { x: number; y: number }[], cum: number[], s: number) {
  for (let k = 1; k < path.length; k++) {
    if (s <= cum[k] || k === path.length - 1) {
      const seg = cum[k] - cum[k - 1];
      const t = seg > 0 ? Math.min(1, Math.max(0, (s - cum[k - 1]) / seg)) : 0;
      return { x: path[k - 1].x + (path[k].x - path[k - 1].x) * t, y: path[k - 1].y + (path[k].y - path[k - 1].y) * t };
    }
  }
  return { x: path[0].x, y: path[0].y };
}

function stepBall(level: CompiledLevel, w: WorldState, idx: number, mask: number) {
  const b = w.balls[idx];
  const T = level.tuning;
  const pressed = (bit: number) => has(mask, bit) && !has(b.lastMask, bit);

  // Ride the platform we stood on last tick.
  if (b.groundPlat >= 0 && b.air <= 1) {
    b.x += w.platDX[b.groundPlat];
    b.y += w.platDY[b.groundPlat];
  }

  const onGround = b.air === 0;
  const dirX = (has(mask, IN_RIGHT) ? 1 : 0) - (has(mask, IN_LEFT) ? 1 : 0);
  if (dirX !== 0) b.facing = dirX;
  b.squash = has(mask, IN_DOWN);

  // --- Anchor: hold to freeze in place, usable once per ground contact.
  if (level.abilities.has('anchor')) {
    if (pressed(IN_ANCHOR) && b.anchorReady && !b.anchored) {
      b.anchored = true;
      b.anchorReady = false;
      b.anchorTimer = T.anchorTicks;
      w.events.push({ t: 'anchor', b: idx, x: b.x, y: b.y });
    }
    if (b.anchored) {
      b.anchorTimer--;
      if (!has(mask, IN_ANCHOR) || b.anchorTimer <= 0) b.anchored = false;
    }
  }
  if (b.anchored) {
    b.vx = 0;
    b.vy = 0;
    b.lastMask = mask;
    b.air++;
    return;
  }

  // --- Horizontal control.
  const mat = MATERIALS[b.groundMat];
  if (dirX !== 0) {
    let accel = onGround ? T.groundAccel * Math.min(1, mat.friction) : T.airAccel;
    if (b.vx * dirX < 0) accel *= onGround ? 1.6 : 1.25; // snappier turnarounds
    if (b.vx * dirX < T.maxRunSpeed) b.vx = dirX > 0 ? Math.min(T.maxRunSpeed, b.vx + accel * DT) : Math.max(-T.maxRunSpeed, b.vx - accel * DT);
    else if (b.burstTimer === 0) {
      // Faster than a run (after a burst, spring or throw): holding the
      // direction does not sustain the extra speed; it bleeds off.
      const bleed = (onGround ? T.groundDecel * mat.friction : T.airDrag * 4) * DT;
      b.vx = dirX > 0 ? Math.max(T.maxRunSpeed, b.vx - bleed) : Math.min(-T.maxRunSpeed, b.vx + bleed);
    }
  } else {
    // Riding a platform is handled by carrying the ball with it, so the
    // ball's own velocity settles to zero relative to the platform.
    const target = 0;
    const decel = onGround ? T.groundDecel * mat.friction * (b.squash ? 2 : 1) : T.airDrag;
    const d = decel * DT;
    b.vx = b.vx > target ? Math.max(target, b.vx - d) : Math.min(target, b.vx + d);
  }

  // --- Jump with buffering, coyote time and variable height.
  if (pressed(IN_JUMP)) b.jumpBuffer = T.jumpBufferTicks;
  else if (b.jumpBuffer > 0) b.jumpBuffer--;
  if (b.jumpBuffer > 0 && b.air <= T.coyoteTicks && b.burstTimer === 0) {
    const boost = b.groundMat === 'rubber' ? 1.3 : 1;
    const platVy = b.groundPlat >= 0 ? Math.min(0, w.platDY[b.groundPlat] * 60) : 0;
    b.vy = Math.min(b.vy, -T.jumpSpeed * boost + platVy);
    // Jumping off a moving platform keeps its horizontal momentum.
    if (b.groundPlat >= 0 && b.air <= 1) b.vx += w.platDX[b.groundPlat] * 60;
    b.jumpBuffer = 0;
    b.jumpRise = true;
    b.air = T.coyoteTicks + 1;
    w.events.push({ t: 'jump', b: idx, x: b.x, y: b.y });
  }
  if (b.jumpRise) {
    if (b.vy >= 0) b.jumpRise = false;
    else if (!has(mask, IN_JUMP)) {
      b.vy = Math.max(b.vy, -T.jumpSpeed * T.jumpCutFactor);
      b.jumpRise = false;
    }
  }

  // --- Burst: one directional impulse per airtime.
  if (level.abilities.has('burst') && pressed(IN_BURST) && b.burstReady) {
    let bx = dirX;
    let by = (has(mask, IN_DOWN) ? 1 : 0) - (has(mask, IN_JUMP) ? 1 : 0);
    if (bx === 0 && by === 0) bx = b.facing;
    const len = Math.sqrt(bx * bx + by * by);
    b.vx = (bx / len) * T.burstSpeed;
    b.vy = (by / len) * T.burstSpeed;
    b.burstReady = false;
    b.burstTimer = T.burstTicks;
    b.jumpRise = false;
    b.jumpBuffer = 0;
    w.events.push({ t: 'burst', b: idx, x: b.x, y: b.y });
  }

  // --- Integrate with substeps.
  b.air++;
  b.groundPlat = -1;
  b.groundVx = 0;
  const gravityOn = b.burstTimer === 0;
  for (let s = 0; s < SUBSTEPS; s++) {
    let ax = 0;
    let ay = gravityOn ? (b.squash && b.vy > -50 ? T.fastFallGravity : T.gravity) : 0;
    for (let f = 0; f < level.fans.length; f++) {
      const fan = level.fans[f];
      if (fan.active && !fan.active.eval(w.signals)) continue;
      if (!circleRect(b.x, b.y, BALL_RADIUS * 0.5, fan)) continue;
      const v = dirVec(fan.dir);
      ax += v.x * fan.strength;
      ay += v.y * fan.strength;
    }
    b.vx += ax * SUB_DT;
    b.vy += ay * SUB_DT;
    const maxFall = b.squash ? T.maxFallSpeed * 1.25 : T.maxFallSpeed;
    if (b.vy > maxFall) b.vy = maxFall;
    const sp2 = b.vx * b.vx + b.vy * b.vy;
    if (sp2 > T.maxSpeed * T.maxSpeed) {
      const k = T.maxSpeed / Math.sqrt(sp2);
      b.vx *= k;
      b.vy *= k;
    }
    b.x += b.vx * SUB_DT;
    b.y += b.vy * SUB_DT;
    collideBall(level, w, idx);
    if (!b.alive) break;
  }
  if (b.burstTimer > 0) {
    b.burstTimer--;
    if (b.burstTimer === 0) {
      // Keep most of the burst momentum horizontally, damp the vertical part.
      if (b.vy < 0) b.vy *= 0.55;
    }
  }
  if (b.air === 0) {
    b.jumpRise = false;
    if (b.burstTimer === 0) b.burstReady = true;
    b.anchorReady = true;
  }
  if (b.springCd > 0) b.springCd--;
  b.rot += (b.vx * DT) / BALL_RADIUS;
  b.lastMask = mask;
}

function dirVec(d: Dir) {
  return d === 'up' ? { x: 0, y: -1 } : d === 'down' ? { x: 0, y: 1 } : d === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 };
}

/** Collects every solid shape the given ball collides with and resolves contacts. */
function collideBall(level: CompiledLevel, w: WorldState, idx: number) {
  const b = w.balls[idx];
  const r = BALL_RADIUS;
  const minX = b.x - r;
  const maxX = b.x + r;
  const minY = b.y - r;
  const maxY = b.y + r;
  const near = (q: Rect) => q.x < maxX && q.x + q.w > minX && q.y < maxY && q.y + q.h > minY;

  for (const s of level.solids) if (near(s)) contact(level, w, idx, s, s.mat, 0, 0, -1, -1);
  for (const l of level.lasers) if (near(l)) contact(level, w, idx, l, 'metal', 0, 0, -1, -1);
  for (const rc of level.receivers) if (near(rc)) contact(level, w, idx, rc, 'metal', 0, 0, -1, -1);
  for (let i = 0; i < level.doors.length; i++) {
    const d = doorRect(level, w, i);
    if (d && near(d)) contact(level, w, idx, d, 'metal', 0, 0, -1, -1);
  }
  for (let i = 0; i < level.platforms.length; i++) {
    const p = level.platforms[i];
    const rect = { x: w.platX[i], y: w.platY[i], w: p.w, h: p.h };
    if (near(rect)) contact(level, w, idx, rect, p.mat, w.platDX[i] * 60, w.platDY[i] * 60, i, -1);
  }
  for (let i = 0; i < level.breakables.length; i++) {
    const br = level.breakables[i];
    if (!w.broken[i] && near(br)) contact(level, w, idx, br, 'stone', 0, 0, -1, i);
  }
  for (const v of level.veils) if (v.blocks === b.kind && near(v)) contact(level, w, idx, v, 'stone', 0, 0, -1, -1);

  // Earlier balls are immovable obstacles.
  for (let j = 0; j < idx; j++) {
    const o = w.balls[j];
    if (o.gone) continue;
    const dx = b.x - o.x;
    const dy = b.y - o.y;
    const d2 = dx * dx + dy * dy;
    const rr = 2 * r;
    if (!b.sep.includes(j)) {
      if (d2 >= rr * rr) b.sep.push(j);
      continue;
    }
    if (d2 >= rr * rr || d2 === 0) continue;
    const d = Math.sqrt(d2);
    let nx = dx / d;
    let ny = dy / d;
    const pen = rr - d;
    b.x += nx * pen;
    b.y += ny * pen;
    // Landing assist: when coming down on top of another ball, bounce mostly
    // upward instead of being flung sideways by a slightly off-centre hit.
    if (ny < -0.7) {
      nx *= 0.3;
      const k = 1 / Math.sqrt(nx * nx + ny * ny);
      nx *= k;
      ny *= k;
    }
    const ovx = o.alive && !o.anchored ? o.vx : 0;
    const ovy = o.alive && !o.anchored ? o.vy : 0;
    // Echoes are springy (the heart of "ghost bounce"); remnants are stone.
    resolveVelocity(level, w, idx, nx, ny, ovx, ovy, o.alive ? 'rubber' : 'stone', -1);
  }
}

function doorRect(level: CompiledLevel, w: WorldState, i: number): Rect | null {
  const d = level.doors[i];
  const closed = 1 - w.doorOpen[i];
  if (closed <= 0.001) return null;
  return d.vertical ? { x: d.x, y: d.y, w: d.w, h: d.h * closed } : { x: d.x, y: d.y, w: d.w * closed, h: d.h };
}

/** Exposed for rendering. */
export function doorSolidRect(level: CompiledLevel, w: WorldState, i: number) {
  return doorRect(level, w, i);
}

function contact(
  level: CompiledLevel,
  w: WorldState,
  idx: number,
  q: Rect,
  mat: Material,
  qvx: number,
  qvy: number,
  plat: number,
  breakable: number,
) {
  const b = w.balls[idx];
  const r = BALL_RADIUS;
  const cx = Math.max(q.x, Math.min(b.x, q.x + q.w));
  const cy = Math.max(q.y, Math.min(b.y, q.y + q.h));
  let dx = b.x - cx;
  let dy = b.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;
  let nx: number;
  let ny: number;
  let pen: number;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    nx = dx / d;
    ny = dy / d;
    pen = r - d;
  } else {
    // Centre inside the rectangle: push out along the shallowest axis.
    const left = b.x - q.x;
    const right = q.x + q.w - b.x;
    const top = b.y - q.y;
    const bottom = q.y + q.h - b.y;
    const m = Math.min(left, right, top, bottom);
    if (m === top) {
      nx = 0;
      ny = -1;
      pen = top + r;
    } else if (m === bottom) {
      nx = 0;
      ny = 1;
      pen = bottom + r;
    } else if (m === left) {
      nx = -1;
      ny = 0;
      pen = left + r;
    } else {
      nx = 1;
      ny = 0;
      pen = right + r;
    }
  }

  // Hazard platforms petrify on any touch, before the contact can push the
  // ball clear (fast sentinels would otherwise shove instead of kill).
  if (plat >= 0 && level.platforms[plat].hazard) {
    petrify(w, idx);
    return;
  }

  if (breakable >= 0) {
    const vn = (b.vx - qvx) * nx + (b.vy - qvy) * ny;
    if (-vn >= level.breakables[breakable].strength) {
      w.broken[breakable] = true;
      const br = level.breakables[breakable];
      w.events.push({ t: 'break', i: breakable, x: br.x + br.w / 2, y: br.y + br.h / 2 });
      // Smash through, losing a little speed.
      b.vx *= 0.85;
      b.vy *= 0.85;
      return;
    }
  }

  b.x += nx * pen;
  b.y += ny * pen;
  resolveVelocity(level, w, idx, nx, ny, qvx, qvy, mat, plat);
}

function resolveVelocity(
  level: CompiledLevel,
  w: WorldState,
  idx: number,
  nx: number,
  ny: number,
  qvx: number,
  qvy: number,
  mat: Material,
  plat: number,
) {
  const b = w.balls[idx];
  const T = level.tuning;
  let rvx = b.vx - qvx;
  let rvy = b.vy - qvy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    const impact = -vn;
    const m = MATERIALS[mat];
    let e = b.squash ? 0 : m.restitution;
    if (impact < T.bounceThreshold && mat !== 'rubber') e = 0;
    let newVn = impact * e;
    if (m.minBounce > 0 && !b.squash && ny < -0.5 && impact > 60) newVn = Math.max(newVn, m.minBounce);
    if (m.minBounce > 0 && b.squash) newVn = 0;
    const dv = newVn - vn;
    rvx += dv * nx;
    rvy += dv * ny;
    if (impact > 90) {
      w.events.push({ t: 'bounce', b: idx, x: b.x - nx * BALL_RADIUS, y: b.y - ny * BALL_RADIUS, speed: impact, mat });
      if (impact > 250) {
        b.impact = impact;
        b.impactTick = w.tick;
      }
    }
    b.vx = rvx + qvx;
    b.vy = rvy + qvy;
  }
  // Generous ground test: wedges and steep echo tops still allow a jump.
  if (ny < -0.35) {
    b.air = 0;
    b.groundMat = mat;
    b.groundPlat = plat;
    b.groundVx = qvx;
  }
}

// ---------------------------------------------------------------------------
// Sensors, hazards, signals
// ---------------------------------------------------------------------------

export function circleRect(x: number, y: number, r: number, q: Rect) {
  const cx = Math.max(q.x, Math.min(x, q.x + q.w));
  const cy = Math.max(q.y, Math.min(y, q.y + q.h));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

function petrify(w: WorldState, idx: number) {
  const b = w.balls[idx];
  if (!b.alive) return;
  b.alive = false;
  b.anchored = false;
  b.vx = 0;
  b.vy = 0;
  w.events.push({ t: 'petrify', b: idx, x: b.x, y: b.y });
}

function updateSensors(level: CompiledLevel, w: WorldState) {
  const R = BALL_RADIUS;
  // Pressure plates: any present ball (including remnants) resting on it.
  level.plates.forEach((p, i) => {
    const pressed = w.balls.some((b) => !b.gone && whoMatches(p.who, b) && circleRect(b.x, b.y, R, p.sensor));
    if (pressed) w.plateHold[i] = PLATE_HOLD_TICKS;
    else if (w.plateHold[i] > 0) w.plateHold[i]--;
    const on = w.plateHold[i] > 0;
    if (on !== w.plateOn[i]) {
      w.plateOn[i] = on;
      w.events.push({ t: 'plate', id: p.id, on, x: p.x + p.w / 2, y: p.y });
    }
  });

  // Switches trigger when a living ball starts touching them.
  level.switches.forEach((sw, i) => {
    let touching = -1;
    for (let k = 0; k < w.balls.length; k++) {
      const b = w.balls[k];
      if (!b.gone && b.alive && whoMatches(sw.who, b) && circleRect(b.x, b.y, R, sw)) {
        touching = k;
        break;
      }
    }
    if (touching >= 0 && !w.switchTouch[i]) {
      if (sw.timerTicks > 0) {
        w.switchTimer[i] = sw.timerTicks;
        w.switchOn[i] = true;
      } else w.switchOn[i] = !w.switchOn[i];
      w.events.push({ t: 'switch', id: sw.id, on: w.switchOn[i], x: sw.x + sw.w / 2, y: sw.y + sw.h / 2, b: touching });
    } else if (sw.timerTicks > 0 && w.switchTimer[i] > 0) {
      w.switchTimer[i]--;
      if (w.switchTimer[i] === 0) {
        w.switchOn[i] = false;
        w.events.push({ t: 'switch', id: sw.id, on: false, x: sw.x + sw.w / 2, y: sw.y + sw.h / 2, b: -1 });
      }
    }
    w.switchTouch[i] = touching >= 0;
  });

  for (let k = 0; k < w.balls.length; k++) {
    const b = w.balls[k];
    if (b.gone || !b.alive) continue;

    // Springs.
    if (b.springCd === 0) {
      for (const sp of level.springs) {
        if (!circleRect(b.x, b.y, R, sp)) continue;
        if (sp.dir === 'up') b.vy = -sp.power;
        else if (sp.dir === 'down') b.vy = sp.power;
        else if (sp.dir === 'left') {
          b.vx = -sp.power;
          b.vy = Math.min(b.vy, -sp.power * 0.35);
        } else {
          b.vx = sp.power;
          b.vy = Math.min(b.vy, -sp.power * 0.35);
        }
        b.springCd = 10;
        b.jumpRise = false;
        b.air = 1;
        w.events.push({ t: 'spring', b: k, x: sp.x + sp.w / 2, y: sp.y + sp.h / 2 });
        break;
      }
    }

    // Hazards.
    if (level.spikes.some((s) => circleRect(b.x, b.y, R - 2, s)) || b.y > level.height + R) petrify(w, k);
    else
      for (let i = 0; i < level.platforms.length; i++) {
        const p = level.platforms[i];
        if (p.hazard && circleRect(b.x, b.y, R + 1, { x: w.platX[i], y: w.platY[i], w: p.w, h: p.h })) {
          petrify(w, k);
          break;
        }
      }
    if (!b.alive) continue;

    if (b.kind === 'player') {
      level.shards.forEach((s, i) => {
        if (!w.shardTaken[i] && (b.x - s.x) ** 2 + (b.y - s.y) ** 2 < (R + 9) ** 2) {
          w.shardTaken[i] = true;
          w.events.push({ t: 'shard', i, x: s.x, y: s.y });
        }
      });
      for (const e of level.exits) {
        if ((e.active ? e.active.eval(w.signals) : true) && (b.x - e.x) ** 2 + (b.y - e.y) ** 2 < (R + 8) ** 2) {
          if (!w.won) w.events.push({ t: 'exit', x: e.x, y: e.y });
          w.won = true;
        }
      }
    }
  }
}

/** Traces every laser beam, petrifying the first living ball each one touches. */
function computeLasers(level: CompiledLevel, w: WorldState) {
  const lit = level.receivers.map(() => false);
  level.lasers.forEach((l, li) => {
    if (!w.laserOn[li]) {
      w.laserEnd[li] = { x: l.ox, y: l.oy };
      return;
    }
    const d = dirVec(l.dir);
    const horizontal = d.x !== 0;
    const maxLen = horizontal ? level.width : level.height;
    let best = maxLen;
    let hitBall = -1;
    let hitReceiver = -1;
    const half = 2;
    const consider = (q: Rect, onHit?: () => void) => {
      // Beam is a thin line from (ox, oy) in direction d.
      let dist: number;
      if (horizontal) {
        if (l.oy + half <= q.y || l.oy - half >= q.y + q.h) return;
        dist = d.x > 0 ? q.x - l.ox : l.ox - (q.x + q.w);
      } else {
        if (l.ox + half <= q.x || l.ox - half >= q.x + q.w) return;
        dist = d.y > 0 ? q.y - l.oy : l.oy - (q.y + q.h);
      }
      if (dist < -0.5) return;
      if (dist < best) {
        best = Math.max(0, dist);
        hitBall = -1;
        hitReceiver = -1;
        onHit?.();
      }
    };
    for (const s of level.solids) consider(s);
    level.lasers.forEach((o, oi) => oi !== li && consider(o));
    level.receivers.forEach((rc, ri) => consider(rc, () => (hitReceiver = ri)));
    level.doors.forEach((_, di) => {
      const rect = doorRect(level, w, di);
      if (rect) consider(rect);
    });
    level.platforms.forEach((p, pi) => consider({ x: w.platX[pi], y: w.platY[pi], w: p.w, h: p.h }));
    level.breakables.forEach((br, bi) => !w.broken[bi] && consider(br));
    w.balls.forEach((b, bi) => {
      if (b.gone) return;
      const off = horizontal ? b.y - l.oy : b.x - l.ox;
      if (Math.abs(off) >= BALL_RADIUS) return;
      const along = horizontal ? (b.x - l.ox) * d.x : (b.y - l.oy) * d.y;
      const dist = along - Math.sqrt(BALL_RADIUS * BALL_RADIUS - off * off);
      if (along < -BALL_RADIUS) return;
      if (dist < best) {
        best = Math.max(0, dist);
        hitBall = bi;
        hitReceiver = -1;
      }
    });
    if (hitBall >= 0) petrify(w, hitBall);
    if (hitReceiver >= 0) lit[hitReceiver] = true;
    w.laserEnd[li] = { x: l.ox + d.x * best, y: l.oy + d.y * best };
  });
  level.receivers.forEach((rc, i) => {
    if (lit[i] !== w.receiverOn[i]) {
      w.receiverOn[i] = lit[i];
      w.events.push({ t: 'receiver', id: rc.id, on: lit[i], x: rc.x + rc.w / 2, y: rc.y + rc.h / 2 });
    }
  });
}

function computeSignals(level: CompiledLevel, w: WorldState) {
  const s: Signals = {};
  level.plates.forEach((p, i) => (s[p.id] = w.plateOn[i]));
  level.switches.forEach((sw, i) => (s[sw.id] = w.switchOn[i]));
  level.breakables.forEach((br, i) => br.id && (s[br.id] = w.broken[i]));
  level.receivers.forEach((rc, i) => (s[rc.id] = w.receiverOn[i]));
  w.signals = s;
}

/** Marks a ghost as faded out (its recording ended). Remnants stay. */
export function vanish(w: WorldState, idx: number) {
  const b = w.balls[idx];
  if (b.gone || !b.alive) return;
  b.gone = true;
  w.events.push({ t: 'vanish', b: idx, x: b.x, y: b.y });
}
