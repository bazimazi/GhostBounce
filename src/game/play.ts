import { Bot } from '../core/bot';
import { DT } from '../core/constants';
import { compileLevel, type CompiledLevel } from '../core/level';
import { PlanPreview } from '../core/preview';
import { Session } from '../core/session';
import type { LevelDef } from '../core/types';
import type { GameEvent } from '../core/world';
import type { Audio } from './audio';
import { Fx } from './fx';
import { drawTimeline } from './hud';
import type { Input } from './input';
import type { Renderer } from './renderer';
import type { SaveData } from './save';
import { SKINS, echoColor, worldTheme } from './theme';

export interface PlayHooks {
  onWin(p: PlayScreen): void;
  onPause(p: PlayScreen): void;
  toast(msg: string, kind?: 'info' | 'warn' | 'good'): void;
  planUnlocked(): boolean;
  longForesight(): boolean;
}

interface Demo {
  scripts: string[];
  take: number;
  bot: Bot;
  saved: Session;
}

/** Runs one level: input, fixed-step simulation, rendering and feedback. */
export class PlayScreen {
  readonly def: LevelDef;
  readonly level: CompiledLevel;
  session: Session;
  fx = new Fx();
  paused = false;
  finished = false;
  private acc = 0;
  private time = 0;
  private prev: { x: number; y: number }[] = [];
  private trail: { x: number; y: number }[] = [];
  private plan: { preview: PlanPreview; tick: number } | null = null;
  private demo: Demo | null = null;
  private hintIndex = 0;
  private reportedDivergence = new Set<number>();
  private bannerUntil = 2.8;
  private rewindSoundAcc = 0;
  /** Takes committed as echoes during this level (stats). */
  echoesRecorded = 0;
  deaths = 0;
  bounces = 0;

  constructor(
    def: LevelDef,
    private renderer: Renderer,
    private input: Input,
    private audio: Audio,
    private save: SaveData,
    private hooks: PlayHooks,
  ) {
    this.def = def;
    this.level = compileLevel(def);
    this.session = new Session(this.level);
    renderer.setLevel(this.level, worldTheme(def.world));
    this.fx.shakeEnabled = save.settings.shake;
    this.snapPrev();
  }

  get demoRunning() {
    return this.demo !== null;
  }
  get planning() {
    return this.plan !== null;
  }

  private snapPrev() {
    this.prev = this.session.world.balls.map((b) => ({ x: b.x, y: b.y }));
  }

  nextHint(): string | null {
    if (this.hintIndex >= this.def.hints.length) return null;
    return this.def.hints[this.hintIndex++];
  }
  get hintsShown() {
    return this.def.hints.slice(0, this.hintIndex);
  }

  restartLevel() {
    this.stopDemo();
    this.session = new Session(this.level);
    this.plan = null;
    this.finished = false;
    this.afterReset();
  }

  private afterReset() {
    this.trail = [];
    this.acc = 0;
    this.reportedDivergence.clear();
    this.snapPrev();
  }

  // --- Recording controls ----------------------------------------------------

  loopTake() {
    const s = this.session;
    if (s.status === 'ready') {
      this.hooks.toast('Move to start recording a take first.');
      return;
    }
    if (s.status === 'won') return;
    if (!s.canCommit) {
      this.audio.ui('deny');
      this.hooks.toast(
        this.def.maxEchoes === 0
          ? 'No echoes in this room — just reach the exit. (T to retry)'
          : `All ${this.def.maxEchoes} echo slots used. Press a number to mute an echo and re-record it, U to undo the last one, or T to retry.`,
        'warn',
      );
      return;
    }
    s.endTake();
    const replacing = s.echoes.length >= this.def.maxEchoes;
    if (s.commit()) {
      this.echoesRecorded++;
      this.audio.loop();
      this.fx.doFlash('#9f7aea', 0.35);
      const e = s.echoes[s.echoes.length - 1];
      this.hooks.toast(`${replacing ? 'Replaced muted echo — ' : ''}Echo ${s.echoes.length} recorded. It will repeat your take.`, 'good');
      void e;
      this.afterReset();
    }
  }

  retryTake() {
    if (this.session.status === 'won') return;
    this.session.retry();
    this.audio.ui('back');
    this.afterReset();
  }

  undoEcho() {
    if (this.session.undoEcho()) {
      this.audio.ui('back');
      this.hooks.toast('Removed the last echo.');
      this.afterReset();
    }
  }

  toggleMute(slot: number) {
    const e = this.session.echoes[slot];
    if (!e) return;
    this.session.toggleMute(slot);
    this.audio.ui('move');
    this.hooks.toast(e.muted ? `Echo ${slot + 1} muted — the next take you keep will replace it.` : `Echo ${slot + 1} restored.`);
    this.afterReset();
  }

  togglePlan() {
    if (this.demo) return;
    if (this.plan) {
      this.plan = null;
      return;
    }
    if (!this.hooks.planUnlocked()) {
      this.hooks.toast('Plan view unlocks after completing World 1.');
      return;
    }
    this.plan = { preview: new PlanPreview(this.level, this.session.echoes), tick: this.session.world.tick };
    this.audio.ui('ok');
  }

  // --- Demo (full walkthrough) ------------------------------------------------

  startDemo() {
    if (this.demo) return;
    const saved = this.session;
    this.session = new Session(this.level);
    this.demo = { scripts: this.def.solution, take: 0, bot: new Bot(this.def.solution[0]), saved };
    this.plan = null;
    this.afterReset();
    this.hooks.toast('Watching the solution. Esc to stop.');
  }

  stopDemo() {
    if (!this.demo) return;
    this.session = this.demo.saved;
    this.demo = null;
    this.afterReset();
  }

  private demoMask(): number | null {
    const d = this.demo!;
    const s = this.session;
    const mask = d.bot.next(s.player, s.world.tick);
    if (d.bot.finished || s.status === 'ended') {
      if (d.take < d.scripts.length - 1) {
        s.endTake();
        s.commit();
        this.audio.loop();
        d.take++;
        d.bot = new Bot(d.scripts[d.take]);
        this.afterReset();
      }
      return null;
    }
    return mask;
  }

  // --- Update -------------------------------------------------------------------

  update(dt: number) {
    this.time += dt;
    this.fx.update(dt);
    if (this.bannerUntil > 0) this.bannerUntil -= dt;
    if (this.paused || this.finished) return;

    const s = this.session;

    if (this.plan) {
      const dir = (this.input.held('right') ? 1 : 0) - (this.input.held('left') ? 1 : 0);
      const speed = this.input.held('fast') ? 240 : 90;
      this.plan.tick = Math.max(0, Math.min(this.level.loopTicks, this.plan.tick + dir * speed * dt));
      return;
    }

    if (!this.demo && this.input.held('rewind') && s.world.tick > 0 && s.status !== 'won') {
      s.rewind(2);
      this.trail = this.trail.slice(0, -2);
      this.snapPrev();
      this.rewindSoundAcc += dt;
      if (this.rewindSoundAcc > 0.07) {
        this.rewindSoundAcc = 0;
        this.audio.rewindTick();
      }
      return;
    }

    const fast = this.input.held('fast') ? 3 : 1;
    this.acc += dt * this.save.settings.gameSpeed * fast * (this.demo ? 1.5 : 1);
    let steps = 0;
    while (this.acc >= DT && steps < 12) {
      steps++;
      this.acc -= DT;
      let mask: number;
      if (this.demo) {
        const m = this.demoMask();
        if (m === null) break;
        mask = m;
      } else {
        mask = this.input.mask();
        if (s.status === 'ready' && mask === 0) {
          this.acc = 0;
          break;
        }
        if (s.status !== 'ready' && s.status !== 'running') {
          this.acc = 0;
          break;
        }
      }
      const cur = this.session;
      this.snapPrev();
      cur.tick(mask);
      const p = cur.player;
      this.trail.push({ x: p.x, y: p.y });
      if (this.trail.length > 24) this.trail.shift();
      this.handleEvents(cur.lastEvents);
      this.checkDivergence();
      if (cur.status === 'won') {
        this.onWin();
        break;
      }
      if (cur.status === 'ended') {
        if (cur.endReason === 'death') {
          this.deaths++;
          this.audio.death();
          if (!this.demo) this.hooks.toast('Petrified! R keeps this take as an echo (its remnant stays), T retries.', 'warn');
        } else if (cur.endReason === 'timeout' && !this.demo) {
          this.hooks.toast('Loop time is up. R keeps this take as an echo, T retries.', 'warn');
        }
        break;
      }
    }
  }

  private onWin() {
    if (this.demo) {
      this.hooks.toast('That is one way to solve it. Esc to return to your own attempt.', 'good');
      return;
    }
    this.finished = true;
    this.hooks.onWin(this);
  }

  private checkDivergence() {
    for (const [id, st] of this.session.echoStatus) {
      if (st.divergedAt >= 0 && !this.reportedDivergence.has(id)) {
        this.reportedDivergence.add(id);
        const slot = this.session.echoes.findIndex((e) => e.id === id) + 1;
        if (!this.demo) this.hooks.toast(`Echo ${slot} was knocked off its recorded path — the world changed around it.`, 'warn');
        this.audio.ui('deny');
      }
    }
  }

  private handleEvents(events: GameEvent[]) {
    const s = this.session;
    const W = this.level.width;
    const isGhost = (b: number) => s.world.balls[b]?.kind === 'ghost';
    const colorOf = (b: number) => (isGhost(b) ? echoColor(s.world.balls[b].echo) : SKINS.find((k) => k.id === this.save.skin)?.rim ?? '#fff');
    for (const e of events) {
      const pan = 'x' in e ? (e.x / W) * 2 - 1 : 0;
      switch (e.t) {
        case 'bounce':
          if (!isGhost(e.b)) this.bounces++;
          this.audio.bounce(e.speed, e.mat, { ghost: isGhost(e.b), pan });
          if (e.speed > 220) this.fx.dust(e.x, e.y, e.mat === 'rubber' ? '#fbb6ce' : 'rgba(226,232,240,0.8)', e.speed);
          if (!isGhost(e.b) && e.speed > 650) this.fx.addShake(e.speed / 250);
          break;
        case 'jump':
          if (!isGhost(e.b)) this.audio.jump({ pan });
          break;
        case 'burst':
          this.audio.burst({ ghost: isGhost(e.b), pan });
          this.fx.ring(e.x, e.y, colorOf(e.b), 30);
          break;
        case 'anchor':
          this.audio.anchor({ ghost: isGhost(e.b), pan });
          this.fx.ring(e.x, e.y, colorOf(e.b), 24);
          break;
        case 'spring':
          this.audio.spring({ ghost: isGhost(e.b), pan });
          this.fx.burst(e.x, e.y, '#fbd38d', 8, 160);
          break;
        case 'plate':
          this.audio.plate(e.on, { pan });
          break;
        case 'switch':
          this.audio.switchFlip(e.on, { pan, ghost: e.b >= 0 && isGhost(e.b) });
          this.fx.ring(e.x, e.y, this.renderer.sigColor(e.id), 26);
          break;
        case 'door':
          this.audio.door(e.open, { pan });
          break;
        case 'break':
          this.audio.breakWall({ pan });
          this.fx.burst(e.x, e.y, '#d69e2e', 22, 320, { kind: 'shard', size: 3 });
          this.fx.addShake(5);
          break;
        case 'petrify':
          this.audio.petrify({ ghost: isGhost(e.b), pan });
          this.fx.burst(e.x, e.y, '#cbd5e0', 14, 200, { kind: 'shard', size: 2 });
          if (!isGhost(e.b)) this.fx.addShake(4);
          break;
        case 'shard':
          this.audio.shard();
          this.fx.burst(e.x, e.y, '#e9d8fd', 24, 220, { gravity: 0 });
          this.fx.ring(e.x, e.y, '#e9d8fd', 40, 0.7);
          break;
        case 'receiver':
          this.audio.receiver(e.on, { pan });
          break;
        case 'vanish':
          this.audio.vanish({ ghost: true, pan });
          this.fx.ring(e.x, e.y, colorOf(e.b), 20);
          break;
        case 'exit':
          this.audio.win();
          this.fx.burst(e.x, e.y, '#fffbea', 40, 300, { gravity: 0 });
          this.fx.doFlash('#fffbea', 0.6);
          break;
      }
    }
  }

  // --- Render -------------------------------------------------------------------

  render() {
    const r = this.renderer;
    r.resize();
    r.begin();
    const s = this.session;
    const skin = SKINS.find((k) => k.id === this.save.skin) ?? SKINS[0];
    const opts = {
      session: s,
      time: this.time,
      showPaths: this.save.settings.ghostPaths,
      highContrast: this.save.settings.highContrast,
      skin,
      trail: this.save.trail,
      playerTrail: this.trail,
      pathTicks: this.hooks.longForesight() ? 180 : 90,
    };
    if (this.plan) {
      const w = this.plan.preview.worldAt(this.plan.tick);
      r.drawWorld({ ...opts, world: w, prev: [], alpha: 1, ghostOnly: true, playerTrail: [] }, null);
    } else {
      const alpha = s.status === 'running' ? Math.min(1, this.acc / DT) : 1;
      r.drawWorld({ ...opts, world: s.world, prev: this.prev, alpha, ghostOnly: false }, this.fx);
    }
    drawTimeline(r, s, this.time, { plan: !!this.plan, planTick: this.plan?.tick ?? 0, demo: !!this.demo });
    this.drawOverlayText();
  }

  private drawOverlayText() {
    const r = this.renderer;
    const ctx = r.ctx;
    const s = this.session;
    const W = this.level.width;
    r.withLevel(null, () => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const center = (text: string, y: number, size: number, color: string) => {
        ctx.font = `600 ${size}px system-ui, sans-serif`;
        const m = ctx.measureText(text);
        ctx.fillStyle = 'rgba(5,6,12,0.6)';
        ctx.fillRect(W / 2 - m.width / 2 - 12, y - size * 0.8, m.width + 24, size * 1.6);
        ctx.fillStyle = color;
        ctx.fillText(text, W / 2, y);
      };
      if (this.bannerUntil > 0) {
        ctx.globalAlpha = Math.min(1, this.bannerUntil);
        center(this.def.name, 64, 26, '#fffbea');
        center(this.def.objective, 100, 15, '#cbd5e0');
        ctx.globalAlpha = 1;
      }
      if (this.plan) {
        center('PLAN VIEW — ← → scrub time · F faster · P to return', 24, 13, '#f6e05e');
      } else if (this.demo) {
        center(`SOLUTION DEMO — take ${this.demo.take + 1} of ${this.demo.scripts.length} · Esc to stop`, 24, 13, '#90cdf4');
      } else if (s.status === 'ready' && this.bannerUntil <= 0) {
        const n = s.echoes.length;
        center(n === 0 ? 'Move to begin' : `Move to begin take ${s.takesStarted} — ${s.liveEchoCount} echo${s.liveEchoCount === 1 ? '' : 'es'} will replay`, 24, 13, '#e2e8f0');
      } else if (s.status === 'ended') {
        center(s.endReason === 'death' ? 'Petrified — R: keep as echo · T: retry · Z: rewind' : 'Time up — R: keep as echo · T: retry · Z: rewind', 24, 14, '#fbd38d');
      }
    });
  }
}
