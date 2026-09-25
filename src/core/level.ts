import { DEFAULT_TUNING, TILE, type Material, type PhysicsTuning } from './constants';
import { compileExpr, type ExprInfo } from './signals';
import type { AbilityId, Dir, LevelDef, Who } from './types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SolidRect extends Rect {
  mat: Material;
}

export interface SpikeRect extends Rect {
  dir: Dir;
}

export interface CPlate extends Rect {
  id: string;
  who: Who;
  sensor: Rect;
}
export interface CSwitch extends Rect {
  id: string;
  who: Who;
  timerTicks: number;
}
export interface CDoor extends Rect {
  id?: string;
  open: ExprInfo;
  /** Door slides up when taller than wide, otherwise slides left. */
  vertical: boolean;
}
export interface CPlatform {
  id?: string;
  w: number;
  h: number;
  /** Path polyline in pixels (top-left positions). */
  path: { x: number; y: number }[];
  /** Cumulative path length at each point. */
  cum: number[];
  length: number;
  speed: number; // px per tick
  active: ExprInfo | null;
  hazard: boolean;
  mat: Material;
}
export interface CSpring extends Rect {
  dir: Dir;
  power: number;
}
export interface CBreakable extends Rect {
  id?: string;
  strength: number;
}
export interface CLaser extends Rect {
  id?: string;
  dir: Dir;
  ox: number;
  oy: number;
  active: ExprInfo | null;
}
export interface CReceiver extends Rect {
  id: string;
}
export interface CFan extends Rect {
  dir: Dir;
  strength: number;
  active: ExprInfo | null;
}
export interface CVeil extends Rect {
  blocks: 'ghost' | 'player';
}
export interface CExit {
  x: number;
  y: number;
  active: ExprInfo | null;
}
export interface CPoint {
  x: number;
  y: number;
}
export interface CSign extends CPoint {
  text: string;
}

export interface CompiledLevel {
  def: LevelDef;
  cols: number;
  rows: number;
  width: number;
  height: number;
  tuning: PhysicsTuning;
  abilities: Set<AbilityId>;
  loopTicks: number;
  start: CPoint;
  solids: SolidRect[];
  spikes: SpikeRect[];
  plates: CPlate[];
  switches: CSwitch[];
  doors: CDoor[];
  platforms: CPlatform[];
  springs: CSpring[];
  breakables: CBreakable[];
  lasers: CLaser[];
  receivers: CReceiver[];
  fans: CFan[];
  veils: CVeil[];
  exits: CExit[];
  shards: CPoint[];
  signs: CSign[];
  /** Every signal id produced by some object. */
  signalIds: string[];
}

const MAT_CHARS: Record<string, Material> = {
  '#': 'stone',
  '=': 'rubber',
  '%': 'mud',
  '~': 'ice',
  M: 'metal',
};

export class LevelError extends Error {}

export function compileLevel(def: LevelDef): CompiledLevel {
  const rows = def.map.length;
  const cols = Math.max(...def.map.map((r) => r.length));
  const grid: string[][] = def.map.map((r) => r.padEnd(cols, '.').split(''));
  const at = (cx: number, cy: number) => (cy < 0 || cy >= rows || cx < 0 || cx >= cols ? '#' : grid[cy][cx]);
  const isSolidChar = (c: string) => c in MAT_CHARS;

  let start: CPoint | null = null;
  const spikes: SpikeRect[] = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const c = grid[cy][cx];
      if (c === 'P') start = { x: cx * TILE + TILE / 2, y: (cy + 1) * TILE - 12 };
      if (c === '^') spikes.push(spikeRect(cx, cy, at));
    }
  }
  if (!start) throw new LevelError(`${def.id}: map has no start 'P'`);

  // Merge solid tiles of equal material into horizontal runs, then stack
  // identical runs vertically. Fewer rects = faster, smoother collisions.
  const runs: SolidRect[] = [];
  for (let cy = 0; cy < rows; cy++) {
    let cx = 0;
    while (cx < cols) {
      const c = grid[cy][cx];
      if (!isSolidChar(c)) {
        cx++;
        continue;
      }
      let end = cx + 1;
      while (end < cols && grid[cy][end] === c) end++;
      runs.push({ x: cx * TILE, y: cy * TILE, w: (end - cx) * TILE, h: TILE, mat: MAT_CHARS[c] });
      cx = end;
    }
  }
  const solids: SolidRect[] = [];
  for (const r of runs) {
    const above = solids.find((s) => s.x === r.x && s.w === r.w && s.mat === r.mat && s.y + s.h === r.y);
    if (above) above.h += r.h;
    else solids.push({ ...r });
  }

  const lvl: CompiledLevel = {
    def,
    cols,
    rows,
    width: cols * TILE,
    height: rows * TILE,
    tuning: { ...DEFAULT_TUNING, ...def.tuning },
    abilities: new Set(def.abilities ?? []),
    loopTicks: Math.round(def.loopSeconds * 60),
    start,
    solids,
    spikes,
    plates: [],
    switches: [],
    doors: [],
    platforms: [],
    springs: [],
    breakables: [],
    lasers: [],
    receivers: [],
    fans: [],
    veils: [],
    exits: [],
    shards: [],
    signs: [],
    signalIds: [],
  };

  const T = TILE;
  const expr = (e: string | undefined) => (e === undefined ? null : compileExpr(e));

  for (const o of def.objects) {
    switch (o.type) {
      case 'plate': {
        const w = (o.w ?? 1) * T;
        const x = o.x * T;
        // Plates are flush with the floor (not solid): a ball resting on the
        // floor inside the plate's span presses it.
        const floor = (o.y + 1) * T;
        lvl.plates.push({
          id: o.id,
          who: o.who ?? 'any',
          x: x + 2,
          y: floor - 4,
          w: w - 4,
          h: 4,
          sensor: { x: x + 4, y: floor - 8, w: w - 8, h: 8 },
        });
        lvl.signalIds.push(o.id);
        break;
      }
      case 'switch':
        lvl.switches.push({
          id: o.id,
          who: o.who ?? 'any',
          x: o.x * T + 7,
          y: o.y * T + 7,
          w: T - 14,
          h: T - 14,
          timerTicks: o.timer ? Math.round(o.timer * 60) : 0,
        });
        lvl.signalIds.push(o.id);
        break;
      case 'door':
        lvl.doors.push({
          id: o.id,
          x: o.x * T,
          y: o.y * T,
          w: o.w * T,
          h: o.h * T,
          open: compileExpr(o.open),
          vertical: o.h >= o.w,
        });
        break;
      case 'platform': {
        const h = (o.h ?? 0.5) * T;
        const pts = [[o.x, o.y] as [number, number], ...o.to].map(([px, py]) => ({ x: px * T, y: py * T }));
        const cum = [0];
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i].x - pts[i - 1].x;
          const dy = pts[i].y - pts[i - 1].y;
          cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
        }
        lvl.platforms.push({
          id: o.id,
          w: o.w * T,
          h,
          path: pts,
          cum,
          length: cum[cum.length - 1],
          speed: (o.speed * T) / 60,
          active: expr(o.active),
          hazard: o.hazard ?? false,
          mat: o.material ?? 'metal',
        });
        break;
      }
      case 'spring': {
        const dir = o.dir ?? 'up';
        const x = o.x * T;
        const y = o.y * T;
        const d = 9;
        const r =
          dir === 'up'
            ? { x: x + 3, y: y + T - d, w: T - 6, h: d }
            : dir === 'down'
              ? { x: x + 3, y, w: T - 6, h: d }
              : dir === 'left'
                ? { x: x + T - d, y: y + 3, w: d, h: T - 6 }
                : { x, y: y + 3, w: d, h: T - 6 };
        lvl.springs.push({ ...r, dir, power: o.power ?? 860 });
        break;
      }
      case 'breakable':
        lvl.breakables.push({ id: o.id, x: o.x * T, y: o.y * T, w: o.w * T, h: o.h * T, strength: o.strength ?? 520 });
        if (o.id) lvl.signalIds.push(o.id);
        break;
      case 'laser': {
        const x = o.x * T;
        const y = o.y * T;
        const ox = x + T / 2 + (o.dir === 'right' ? T / 2 : o.dir === 'left' ? -T / 2 : 0);
        const oy = y + T / 2 + (o.dir === 'down' ? T / 2 : o.dir === 'up' ? -T / 2 : 0);
        lvl.lasers.push({ id: o.id, x, y, w: T, h: T, dir: o.dir, ox, oy, active: expr(o.active) });
        break;
      }
      case 'receiver':
        lvl.receivers.push({ id: o.id, x: o.x * T, y: o.y * T, w: T, h: T });
        lvl.signalIds.push(o.id);
        break;
      case 'fan':
        lvl.fans.push({
          x: o.x * T,
          y: o.y * T,
          w: o.w * T,
          h: o.h * T,
          dir: o.dir,
          strength: o.strength ?? 2000,
          active: expr(o.active),
        });
        break;
      case 'veil':
        lvl.veils.push({ x: o.x * T, y: o.y * T, w: o.w * T, h: o.h * T, blocks: o.blocks });
        break;
      case 'exit':
        lvl.exits.push({ x: o.x * T + T / 2, y: o.y * T + T / 2, active: expr(o.active) });
        break;
      case 'shard':
        lvl.shards.push({ x: o.x * T + T / 2, y: o.y * T + T / 2 });
        break;
      case 'sign':
        lvl.signs.push({ x: o.x * T + T / 2, y: o.y * T + T / 2, text: o.text });
        break;
    }
  }

  validate(lvl);
  return lvl;
}

function spikeRect(cx: number, cy: number, at: (x: number, y: number) => string): SpikeRect {
  const solid = (c: string) => c in MAT_CHARS;
  const x = cx * TILE;
  const y = cy * TILE;
  const d = 14;
  if (solid(at(cx, cy + 1)) || !solid(at(cx, cy - 1)) && !solid(at(cx - 1, cy)) && !solid(at(cx + 1, cy)))
    return { x: x + 2, y: y + TILE - d, w: TILE - 4, h: d, dir: 'up' };
  if (solid(at(cx, cy - 1))) return { x: x + 2, y, w: TILE - 4, h: d, dir: 'down' };
  if (solid(at(cx - 1, cy))) return { x, y: y + 2, w: d, h: TILE - 4, dir: 'right' };
  return { x: x + TILE - d, y: y + 2, w: d, h: TILE - 4, dir: 'left' };
}

function validate(lvl: CompiledLevel) {
  const id = lvl.def.id;
  if (lvl.exits.length === 0) throw new LevelError(`${id}: no exit`);
  const known = new Set(lvl.signalIds);
  const check = (e: ExprInfo | null, what: string) => {
    for (const r of e?.refs ?? []) if (!known.has(r)) throw new LevelError(`${id}: ${what} references unknown signal "${r}"`);
  };
  lvl.doors.forEach((d) => check(d.open, 'door'));
  lvl.platforms.forEach((p) => check(p.active, 'platform'));
  lvl.lasers.forEach((l) => check(l.active, 'laser'));
  lvl.fans.forEach((f) => check(f.active, 'fan'));
  lvl.exits.forEach((e) => check(e.active, 'exit'));
  const overlapsSolid = (r: Rect) => lvl.solids.some((s) => r.x < s.x + s.w && r.x + r.w > s.x && r.y < s.y + s.h && r.y + r.h > s.y);
  lvl.doors.forEach((d, i) => {
    if (overlapsSolid(d)) throw new LevelError(`${id}: door ${i} overlaps a solid tile`);
  });
  lvl.breakables.forEach((b, i) => {
    if (overlapsSolid(b)) throw new LevelError(`${id}: breakable ${i} overlaps a solid tile`);
  });
  const dup = lvl.signalIds.find((s, i) => lvl.signalIds.indexOf(s) !== i);
  if (dup) throw new LevelError(`${id}: duplicate signal id "${dup}"`);
  if (lvl.def.maxEchoes < lvl.def.parEchoes) throw new LevelError(`${id}: parEchoes exceeds maxEchoes`);
}
