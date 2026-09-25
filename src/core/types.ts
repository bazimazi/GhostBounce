import type { Material, PhysicsTuning } from './constants';

// ---------------------------------------------------------------------------
// Level data format. All coordinates in level definitions are in TILES; the
// loader converts them to pixels. Levels are pure data so they can be
// validated, tested, mirrored and (later) shared or edited.
// ---------------------------------------------------------------------------

export type Dir = 'up' | 'down' | 'left' | 'right';

/** Which balls an object reacts to. */
export type Who = 'any' | 'ghost' | 'player';

export type AbilityId = 'burst' | 'anchor';

/** A boolean expression over signal ids, e.g. "a & (b | !c)". */
export type SignalExpr = string;

interface ObjBase {
  x: number;
  y: number;
}

export interface PlateDef extends ObjBase {
  type: 'plate';
  id: string;
  w?: number;
  who?: Who;
}

export interface SwitchDef extends ObjBase {
  type: 'switch';
  id: string;
  who?: Who;
  /** Seconds the switch stays on after being hit. Omit for a toggle. */
  timer?: number;
}

export interface DoorDef extends ObjBase {
  type: 'door';
  id?: string;
  w: number;
  h: number;
  open: SignalExpr;
}

export interface PlatformDef extends ObjBase {
  type: 'platform';
  id?: string;
  w: number;
  h?: number;
  /** Path points (tiles), the first point is the platform's home position = (x, y). */
  to: [number, number][];
  /** Tiles per second. */
  speed: number;
  /** When set, the platform travels forward while active and back home while inactive. */
  active?: SignalExpr;
  /** Kills balls that touch it. */
  hazard?: boolean;
  material?: Material;
}

export interface SpringDef extends ObjBase {
  type: 'spring';
  dir?: Dir;
  /** Launch speed in px/s. */
  power?: number;
}

export interface BreakableDef extends ObjBase {
  type: 'breakable';
  id?: string;
  w: number;
  h: number;
  /** Impact speed (px/s) required to break. */
  strength?: number;
}

export interface LaserDef extends ObjBase {
  type: 'laser';
  id?: string;
  dir: Dir;
  active?: SignalExpr;
}

export interface ReceiverDef extends ObjBase {
  type: 'receiver';
  id: string;
}

export interface FanDef extends ObjBase {
  type: 'fan';
  w: number;
  h: number;
  dir: Dir;
  /** Acceleration in px/s^2 (default 2000; gravity is 1500). */
  strength?: number;
  active?: SignalExpr;
}

export interface VeilDef extends ObjBase {
  type: 'veil';
  w: number;
  h: number;
  /** Which balls the veil is solid for. */
  blocks: 'ghost' | 'player';
}

export interface ExitDef extends ObjBase {
  type: 'exit';
  active?: SignalExpr;
}

export interface ShardDef extends ObjBase {
  type: 'shard';
}

export interface SignDef extends ObjBase {
  type: 'sign';
  text: string;
}

export type ObjDef =
  | PlateDef
  | SwitchDef
  | DoorDef
  | PlatformDef
  | SpringDef
  | BreakableDef
  | LaserDef
  | ReceiverDef
  | FanDef
  | VeilDef
  | ExitDef
  | ShardDef
  | SignDef;

export interface LevelDef {
  id: string;
  name: string;
  world: number;
  /**
   * Tile map rows. Legend:
   *   '#' stone  '=' rubber  '%' mud  '~' ice  'M' metal
   *   '^' spikes (hazard)  'P' start  '.' or ' ' empty
   */
  map: string[];
  /** Maximum length of one take, in seconds. */
  loopSeconds: number;
  /** Maximum number of echoes (recorded ghosts) that may exist at once. */
  maxEchoes: number;
  /** Mastery target: solve with at most this many echoes. */
  parEchoes: number;
  /** Mastery target: final take finishes within this many seconds. */
  parTime: number;
  abilities?: AbilityId[];
  tuning?: Partial<PhysicsTuning>;
  objects: ObjDef[];
  /** One-line objective shown on entry. */
  objective: string;
  /** Graduated hints, from subtle to explicit. */
  hints: string[];
  /** Reference solution: one bot script per take, final take must reach the exit. */
  solution: string[];
  /** Lore revealed by this level's shard, if it has one. */
  lore?: string;
  /** Exclude from the mirrored Daily Echo pool. */
  noMirror?: boolean;
}
