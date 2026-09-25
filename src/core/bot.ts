import { TILE } from './constants';
import { IN_ANCHOR, IN_BURST, IN_DOWN, IN_JUMP, IN_LEFT, IN_RIGHT } from './input';
import { Session } from './session';
import type { Ball } from './world';

// ---------------------------------------------------------------------------
// Bot scripts: a tiny closed-loop control language used to author reference
// solutions for every level. A script drives the live player for one take;
// its resulting inputs are recorded exactly like a human's, so solutions are
// verified by the same simulation the player uses.
//
// Commands (separated by ';' or newlines). Durations are ticks (60 per
// second) or seconds with an 's' suffix. X coordinates are in tiles.
//   w N        wait (no input)
//   r N / l N  hold right / left
//   k KEYS N   hold keys N ticks; KEYS from L R J D B A (e.g. "k RJ 20")
//   j [N]      hold jump N ticks (default 24 = full height)
//   jr N/jl N  hold jump + right/left N ticks
//   go X       steer until centred on tile column X (fractions allowed)
//   sq N       hold down (squash) N ticks
//   settle     wait until resting on the ground
//   land [X]   wait until touching ground (or an echo), steering toward X
//   until T    wait until absolute tick T
//   b DIRS     burst: DIRS from l r u d (e.g. "b ur")
//   a N        hold anchor N ticks
//   end        end the take here (the take is committed as an echo)
// A take also ends when the script runs out (committed), on death
// (committed) or on reaching the exit (solved).
// ---------------------------------------------------------------------------

type Cmd =
  | { op: 'hold'; mask: number; n: number }
  | { op: 'go'; x: number; mask: number }
  | { op: 'settle' }
  | { op: 'land'; x: number | null }
  | { op: 'until'; t: number }
  | { op: 'end' };

const KEY_BITS: Record<string, number> = { L: IN_LEFT, R: IN_RIGHT, J: IN_JUMP, D: IN_DOWN, B: IN_BURST, A: IN_ANCHOR };

function dur(s: string | undefined, dflt: number): number {
  if (s === undefined) return dflt;
  if (s.endsWith('s')) return Math.round(parseFloat(s) * 60);
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) throw new Error(`Bad duration "${s}"`);
  return n;
}

export function parseScript(src: string): Cmd[] {
  const out: Cmd[] = [];
  for (const raw of src.split(/[;\n]/)) {
    const parts = raw.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const [op, a, b] = parts;
    switch (op) {
      case 'w':
        out.push({ op: 'hold', mask: 0, n: dur(a, 1) });
        break;
      case 'r':
        out.push({ op: 'hold', mask: IN_RIGHT, n: dur(a, 1) });
        break;
      case 'l':
        out.push({ op: 'hold', mask: IN_LEFT, n: dur(a, 1) });
        break;
      case 'j':
        out.push({ op: 'hold', mask: IN_JUMP, n: dur(a, 24) });
        break;
      case 'jr':
        out.push({ op: 'hold', mask: IN_JUMP | IN_RIGHT, n: dur(a, 24) });
        break;
      case 'jl':
        out.push({ op: 'hold', mask: IN_JUMP | IN_LEFT, n: dur(a, 24) });
        break;
      case 'k': {
        let m = 0;
        for (const ch of (a ?? '').toUpperCase()) {
          if (!(ch in KEY_BITS)) throw new Error(`Unknown key "${ch}" in "${raw}"`);
          m |= KEY_BITS[ch];
        }
        out.push({ op: 'hold', mask: m, n: dur(b, 1) });
        break;
      }
      case 'sq':
        out.push({ op: 'hold', mask: IN_DOWN, n: dur(a, 1) });
        break;
      case 'go':
        out.push({ op: 'go', x: parseFloat(a), mask: 0 });
        break;
      case 'settle':
        out.push({ op: 'settle' });
        break;
      case 'land':
        out.push({ op: 'land', x: a === undefined ? null : parseFloat(a) });
        break;
      case 'until':
        out.push({ op: 'until', t: dur(a, 0) });
        break;
      case 'b': {
        let m = IN_BURST;
        for (const ch of a ?? '') m |= ch === 'l' ? IN_LEFT : ch === 'r' ? IN_RIGHT : ch === 'u' ? IN_JUMP : ch === 'd' ? IN_DOWN : 0;
        // Direction keys are held on the press tick; release afterwards.
        out.push({ op: 'hold', mask: m, n: 1 });
        break;
      }
      case 'a':
        out.push({ op: 'hold', mask: IN_ANCHOR, n: dur(a, 60) });
        break;
      case 'end':
        out.push({ op: 'end' });
        break;
      default:
        throw new Error(`Unknown bot command "${op}"`);
    }
  }
  return out;
}

/** Horizontal input that brings the ball to rest centred on tile column x. */
function steer(ball: Ball, x: number): number {
  const dx = x * TILE + TILE / 2 - ball.x;
  const decel = ball.air === 0 ? 1900 * 1.6 : 1150 * 1.25;
  const stopDist = (ball.vx * ball.vx) / (2 * decel);
  if (Math.abs(dx) < 3) return Math.abs(ball.vx) < 30 ? 0 : ball.vx > 0 ? IN_LEFT : IN_RIGHT;
  if (ball.vx * dx > 0 && stopDist >= Math.abs(dx) - 1) return dx > 0 ? IN_LEFT : IN_RIGHT;
  return dx > 0 ? IN_RIGHT : IN_LEFT;
}

/** Stateful controller that yields one input mask per tick. */
export class Bot {
  private cmds: Cmd[];
  private pc = 0;
  private counter = 0;
  private started = false;
  finished = false;

  constructor(src: string) {
    this.cmds = parseScript(src);
  }

  next(ball: Ball, tick: number): number {
    while (this.pc < this.cmds.length) {
      const c = this.cmds[this.pc];
      if (!this.started) {
        this.started = true;
        this.counter = 0;
      }
      const done = () => {
        this.pc++;
        this.started = false;
      };
      switch (c.op) {
        case 'hold':
          if (this.counter < c.n) {
            this.counter++;
            return c.mask;
          }
          done();
          continue;
        case 'go': {
          this.counter++;
          const dx = c.x * TILE + TILE / 2 - ball.x;
          if ((Math.abs(dx) < 3 && Math.abs(ball.vx) < 30) || this.counter > 600) {
            done();
            continue;
          }
          return steer(ball, c.x);
        }
        case 'settle':
          this.counter++;
          if ((ball.air === 0 && Math.abs(ball.vy) < 5 && Math.abs(ball.vx) < 5) || this.counter > 300) {
            done();
            continue;
          }
          return 0;
        case 'land':
          this.counter++;
          if ((ball.air === 0 && this.counter > 1) || this.counter > 400) {
            done();
            continue;
          }
          return c.x === null ? 0 : steer(ball, c.x);
        case 'until':
          if (tick < c.t) return 0;
          done();
          continue;
        case 'end':
          this.finished = true;
          return 0;
      }
    }
    this.finished = true;
    return 0;
  }
}

export interface SolveResult {
  solved: boolean;
  takes: { ticks: number; ended: string }[];
  session: Session;
  error?: string;
}

/**
 * Plays a level's solution scripts through a fresh session. Each script
 * except the last is committed as an echo; the last should reach the exit.
 * `onTick` lets tools trace the run.
 */
export function runSolution(session: Session, scripts: string[], onTick?: (s: Session, take: number) => void): SolveResult {
  const takes: SolveResult['takes'] = [];
  for (let ti = 0; ti < scripts.length; ti++) {
    const bot = new Bot(scripts[ti]);
    while (true) {
      const mask = bot.next(session.player, session.world.tick);
      if (bot.finished) {
        session.endTake();
        break;
      }
      session.tick(mask);
      onTick?.(session, ti);
      if (session.status !== 'running') break;
    }
    takes.push({ ticks: session.world.tick, ended: session.status === 'won' ? 'won' : (session.endReason ?? 'loop') });
    if (session.status === 'won') return { solved: ti === scripts.length - 1, takes, session };
    if (ti < scripts.length - 1) {
      if (!session.commit()) return { solved: false, takes, session, error: `could not commit take ${ti + 1}` };
    }
  }
  return { solved: false, takes, session };
}
