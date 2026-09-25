import { DIVERGENCE_EPSILON } from './constants';
import type { CompiledLevel } from './level';
import { cloneWorld, createWorld, step, vanish, type BallKind, type GameEvent, type WorldState } from './world';

// ---------------------------------------------------------------------------
// A Session is one attempt at a level: a list of committed echoes plus the
// take currently being recorded. Every take restarts the world at tick 0 and
// replays all (non-muted) echoes from their recorded inputs alongside the
// live player.
// ---------------------------------------------------------------------------

export type TakeEnd = 'loop' | 'death' | 'timeout';

export interface Echo {
  /** Stable id, used for colours and labels. Never reused within a session. */
  id: number;
  inputs: Uint8Array;
  /** Recorded positions after each tick, used to detect divergence. */
  xs: Float32Array;
  ys: Float32Array;
  endedBy: TakeEnd;
  muted: boolean;
}

export type TakeStatus = 'ready' | 'running' | 'ended' | 'won';

export interface EchoStatus {
  /** Tick at which this echo drifted from its recording, or -1. */
  divergedAt: number;
}

const SNAPSHOT_EVERY = 30;

export class Session {
  readonly level: CompiledLevel;
  echoes: Echo[] = [];
  world!: WorldState;
  status: TakeStatus = 'ready';
  endReason: TakeEnd | null = null;
  /** Inputs of the take in progress. */
  takeInputs: number[] = [];
  takeXs: number[] = [];
  takeYs: number[] = [];
  /** Ball index -> echo for the current take (player is last). */
  active: Echo[] = [];
  echoStatus = new Map<number, EchoStatus>();
  /** Shards collected in any take of this session. */
  shardsCollected: boolean[];
  takesStarted = 0;
  private nextEchoId = 0;
  private snapshots: WorldState[] = [];
  /** Events produced by the last step, for audio and effects. */
  lastEvents: GameEvent[] = [];

  constructor(level: CompiledLevel) {
    this.level = level;
    this.shardsCollected = level.shards.map(() => false);
    this.startTake();
  }

  get playerIndex() {
    return this.world.balls.length - 1;
  }
  get player() {
    return this.world.balls[this.playerIndex];
  }
  get liveEchoCount() {
    return this.echoes.filter((e) => !e.muted).length;
  }
  get canCommit() {
    return this.echoes.length < this.level.def.maxEchoes || this.echoes.some((e) => e.muted);
  }

  startTake() {
    this.active = this.echoes.filter((e) => !e.muted);
    const kinds: BallKind[] = [...this.active.map(() => 'ghost' as const), 'player'];
    this.world = createWorld(this.level, kinds, [...this.active.map((e) => e.id), -1]);
    this.takeInputs = [];
    this.takeXs = [];
    this.takeYs = [];
    this.status = 'ready';
    this.endReason = null;
    this.snapshots = [cloneWorld(this.world)];
    this.echoStatus = new Map(this.active.map((e) => [e.id, { divergedAt: -1 }]));
    this.lastEvents = [];
    this.takesStarted++;
  }

  /** Advances one tick with the given player input. */
  tick(mask: number) {
    if (this.status === 'ended' || this.status === 'won') return;
    this.status = 'running';
    this.advance(mask);
    this.takeInputs.push(mask);
    this.takeXs.push(this.player.x);
    this.takeYs.push(this.player.y);
    if (this.world.tick % SNAPSHOT_EVERY === 0) this.snapshots[this.world.tick / SNAPSHOT_EVERY] = cloneWorld(this.world);

    const p = this.player;
    this.world.shardTaken.forEach((t, i) => t && (this.shardsCollected[i] = true));
    if (this.world.won) {
      this.status = 'won';
    } else if (!p.alive) {
      this.end('death');
    } else if (this.world.tick >= this.level.loopTicks) {
      this.end('timeout');
    }
  }

  private advance(playerMask: number) {
    const w = this.world;
    const t = w.tick;
    const inputs = new Array<number>(w.balls.length);
    for (let i = 0; i < this.active.length; i++) {
      const e = this.active[i];
      if (t < e.inputs.length) inputs[i] = e.inputs[t];
      else {
        inputs[i] = 0;
        vanish(w, i);
      }
    }
    inputs[w.balls.length - 1] = playerMask;
    step(this.level, w, inputs);
    for (let i = 0; i < this.active.length; i++) {
      const e = this.active[i];
      const b = w.balls[i];
      const st = this.echoStatus.get(e.id)!;
      if (st.divergedAt >= 0 || t >= e.xs.length || b.gone) continue;
      if (Math.abs(b.x - e.xs[t]) > DIVERGENCE_EPSILON || Math.abs(b.y - e.ys[t]) > DIVERGENCE_EPSILON) st.divergedAt = t;
    }
    this.lastEvents = w.events;
  }

  private end(reason: TakeEnd) {
    this.status = 'ended';
    this.endReason = reason;
  }

  /** Ends the current take early (player chose to loop). */
  endTake() {
    if (this.status === 'running') this.end('loop');
  }

  /**
   * Commits the current take as a new echo and starts a fresh take.
   * If the echo limit is reached, the first muted echo is replaced.
   * Returns false if there is nothing to commit or no free slot.
   */
  commit(): boolean {
    if (this.takeInputs.length === 0 || this.status === 'won') return false;
    if (!this.canCommit) return false;
    if (this.echoes.length >= this.level.def.maxEchoes) {
      const idx = this.echoes.findIndex((e) => e.muted);
      this.echoes.splice(idx, 1);
    }
    this.echoes.push({
      id: this.nextEchoId++,
      inputs: Uint8Array.from(this.takeInputs),
      xs: Float32Array.from(this.takeXs),
      ys: Float32Array.from(this.takeYs),
      endedBy: this.endReason ?? 'loop',
      muted: false,
    });
    this.startTake();
    return true;
  }

  retry() {
    this.startTake();
  }

  /** Removes the most recent echo. */
  undoEcho() {
    if (this.echoes.length === 0) return false;
    this.echoes.pop();
    this.startTake();
    return true;
  }

  toggleMute(slot: number) {
    const e = this.echoes[slot];
    if (!e) return false;
    e.muted = !e.muted;
    this.startTake();
    return true;
  }

  deleteEcho(slot: number) {
    if (!this.echoes[slot]) return false;
    this.echoes.splice(slot, 1);
    this.startTake();
    return true;
  }

  clearEchoes() {
    this.echoes = [];
    this.startTake();
  }

  /** Rewinds the current take by `ticks`, re-simulating from the nearest snapshot. */
  rewind(ticks: number) {
    if (this.status === 'won') return;
    const target = Math.max(0, this.world.tick - ticks);
    const snapIdx = Math.min(Math.floor(target / SNAPSHOT_EVERY), this.snapshots.length - 1);
    this.world = cloneWorld(this.snapshots[snapIdx]);
    this.snapshots.length = snapIdx + 1;
    for (const st of this.echoStatus.values()) if (st.divergedAt >= snapIdx * SNAPSHOT_EVERY) st.divergedAt = -1;
    while (this.world.tick < target) {
      const t = this.world.tick;
      this.advance(this.takeInputs[t]);
      if (this.world.tick % SNAPSHOT_EVERY === 0) this.snapshots[this.world.tick / SNAPSHOT_EVERY] = cloneWorld(this.world);
    }
    this.takeInputs.length = target;
    this.takeXs.length = target;
    this.takeYs.length = target;
    this.status = target === 0 ? 'ready' : 'running';
    this.endReason = null;
    this.lastEvents = [];
  }
}
