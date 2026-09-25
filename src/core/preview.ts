import type { CompiledLevel } from './level';
import type { Echo } from './session';
import { cloneWorld, createWorld, step, vanish, type WorldState } from './world';

/**
 * Ghost-only simulation of the loop, used by the Plan view to scrub through
 * time and see where every echo will be (assuming the player stays out of
 * their way). Snapshots every few ticks keep random access cheap.
 */
export class PlanPreview {
  private snaps: WorldState[] = [];
  private readonly every = 10;
  private readonly echoes: Echo[];
  private readonly level: CompiledLevel;

  constructor(level: CompiledLevel, echoes: Echo[]) {
    this.level = level;
    this.echoes = echoes.filter((e) => !e.muted);
    this.snaps.push(
      createWorld(
        level,
        this.echoes.map(() => 'ghost'),
        this.echoes.map((e) => e.id),
      ),
    );
  }

  private advance(w: WorldState) {
    const t = w.tick;
    const inputs = this.echoes.map((e, i) => {
      if (t < e.inputs.length) return e.inputs[t];
      vanish(w, i);
      return 0;
    });
    step(this.level, w, inputs);
  }

  worldAt(tick: number): WorldState {
    tick = Math.max(0, Math.min(this.level.loopTicks, Math.round(tick)));
    const idx = Math.floor(tick / this.every);
    while (this.snaps.length <= idx) {
      const w = cloneWorld(this.snaps[this.snaps.length - 1]);
      for (let k = 0; k < this.every; k++) this.advance(w);
      this.snaps.push(w);
    }
    const w = cloneWorld(this.snaps[idx]);
    while (w.tick < tick) this.advance(w);
    return w;
  }
}
