import type { LevelDef } from '../core/types';
import { CAMPAIGN_LEVELS, CHALLENGES, WORLDS, dailyLevel, findLevel, todayString } from '../levels';
import { Audio } from './audio';
import { ACTION_LABELS, DEFAULT_BINDINGS, Input, keyLabel, type Action } from './input';
import { PlayScreen } from './play';
import {
  ABILITIES,
  MASTERY,
  abilityLearned,
  challengeUnlocked,
  continueLevel,
  dailyUnlocked,
  hasMastery,
  levelUnlocked,
  markCount,
  markMax,
  marksFor,
  nextLevel,
  skinUnlocked,
  totals,
  trailUnlocked,
  unlockSet,
  worldComplete,
  worldUnlocked,
} from './progression';
import { Renderer } from './renderer';
import { SaveManager } from './save';
import { SKINS, TRAILS, worldTheme } from './theme';

const h = (tag: string, attrs: Record<string, string> = {}, ...kids: (Node | string | null | false)[]) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const k of kids) if (k !== null && k !== false) el.append(k);
  return el;
};

function button(label: string, onClick: () => void, cls = '') {
  const b = h('button', { class: `btn ${cls}` }, label) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

type Screen = 'title' | 'worlds' | 'levels' | 'play' | 'collection' | 'settings' | 'credits' | 'challenges';

/** Top-level application: menus, screen flow, persistence and the main loop. */
export class App {
  readonly canvas: HTMLCanvasElement;
  readonly ui: HTMLElement;
  readonly renderer: Renderer;
  readonly input: Input;
  readonly audio = new Audio();
  readonly saves: SaveManager;
  screen: Screen = 'title';
  play: PlayScreen | null = null;
  private currentWorld = 1;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private lastFrame = performance.now();
  private overlay: HTMLElement | null = null;
  private titleBalls = Array.from({ length: 7 }, (_, i) => ({ x: 100 + i * 110, y: 100 + (i % 3) * 60, vx: 60 + i * 13, vy: 0 }));
  private playSecondsAcc = 0;

  constructor(root: HTMLElement) {
    let store: Storage | null = null;
    try {
      store = window.localStorage;
      store.getItem('probe');
    } catch {
      store = null;
    }
    this.saves = new SaveManager(store);
    this.canvas = h('canvas', { id: 'game' }) as HTMLCanvasElement;
    this.ui = h('div', { id: 'ui' });
    this.toastEl = h('div', { id: 'toast' });
    root.append(this.canvas, this.ui, this.toastEl);
    this.renderer = new Renderer(this.canvas);
    this.input = new Input(this.saves.data.settings.bindings);
    this.applySettings();
    this.buildTouch(root);

    window.addEventListener('keydown', (e) => {
      if (this.input.gameFocus || this.input.onAnyKey) return;
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement) return;
      if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
        e.preventDefault();
        this.moveFocus(1);
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
        e.preventDefault();
        this.moveFocus(-1);
      }
    });
    this.canvas.addEventListener('pointerdown', (e) => this.onCanvasPointer(e));
    const unlockAudio = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('beforeunload', () => this.saves.save());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.saves.save();
        if (this.play && !this.play.paused && !this.play.finished) this.pause();
      }
    });

    this.showTitle();
    if (this.saves.recovered) this.toast('A damaged save slot was found and skipped — your latest good progress was restored.', 'warn');
    requestAnimationFrame((t) => this.frame(t));
  }

  get save() {
    return this.saves.data;
  }

  applySettings() {
    const s = this.save.settings;
    this.audio.volumes = { master: s.master, music: s.music, sfx: s.sfx };
    this.audio.applyVolumes();
    this.input.bindings = s.bindings;
    document.body.classList.toggle('touch-on', s.touch === 'on' || (s.touch === 'auto' && matchMedia('(pointer: coarse)').matches));
    if (this.play) this.play.fx.shakeEnabled = s.shake;
  }

  // --- Main loop ---------------------------------------------------------------

  private frame(t: number) {
    const dt = Math.min(0.1, (t - this.lastFrame) / 1000);
    this.lastFrame = t;
    this.input.pollGamepad();
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
    this.updateFocusMode();
    if (this.screen === 'play' && this.play) {
      this.handlePlayInput();
      this.play.update(dt);
      this.play.render();
      if (!this.play.paused) {
        this.playSecondsAcc += dt;
        if (this.playSecondsAcc > 5) {
          this.save.stats.playSeconds += this.playSecondsAcc;
          this.playSecondsAcc = 0;
        }
      }
    } else {
      this.handleMenuInput();
      this.drawTitleBackground(dt);
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  private handlePlayInput() {
    const p = this.play!;
    const presses = this.input.takePresses();
    const digits = this.input.takeDigits();
    if (p.finished) {
      this.menuNav(presses.filter((a) => a !== 'pause'));
      return;
    }
    if (p.paused) {
      if (presses.includes('pause')) this.resume();
      else this.menuNav(presses);
      return;
    }
    if (p.demoRunning) {
      for (const a of presses) if (a === 'pause') p.stopDemo();
      return;
    }
    for (const a of presses) {
      switch (a) {
        case 'pause':
          if (p.planning) p.togglePlan();
          else this.pause();
          break;
        case 'loop':
          if (!p.planning) p.loopTake();
          break;
        case 'retry':
          if (!p.planning) p.retryTake();
          break;
        case 'undo':
          if (!p.planning) p.undoEcho();
          break;
        case 'plan':
          p.togglePlan();
          break;
        case 'hint': {
          const hint = p.nextHint();
          this.toast(hint ? `Hint ${p.hintsShown.length}/${p.def.hints.length}: ${hint}` : 'No more hints — open the pause menu to watch the full solution.', 'info', 7);
          break;
        }
      }
    }
    for (const d of digits) if (!p.planning) p.toggleMute(d - 1);
  }

  private handleMenuInput() {
    const presses = this.input.takePresses();
    this.input.takeDigits();
    for (const a of presses) {
      if (a === 'pause' || a === 'loop') {
        if (this.screen === 'levels') this.showWorlds();
        else if (this.screen !== 'title') this.showTitle();
      }
    }
    this.menuNav(presses);
  }

  /** Gamepad navigation of whatever buttons are on screen. */
  private menuNav(presses: Action[]) {
    for (const a of presses) {
      if (a === 'down' || a === 'right') this.moveFocus(1);
      else if (a === 'left') this.moveFocus(-1);
      else if (a === 'jump') (document.activeElement as HTMLElement | null)?.click();
    }
  }

  private focusables() {
    return [...this.ui.querySelectorAll<HTMLElement>('button:not([disabled]), input, select')].filter((el) => el.offsetParent !== null);
  }

  private moveFocus(dir: number) {
    const els = this.focusables();
    if (els.length === 0) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    const next = els[(i + dir + els.length) % els.length];
    next.focus();
    this.audio.ui('move');
  }

  private updateFocusMode() {
    const p = this.play;
    this.input.gameFocus = this.screen === 'play' && !!p && !p.paused && !p.finished && !this.overlay;
  }

  private drawTitleBackground(dt: number) {
    // A few luminous balls bouncing behind the menus.
    const c = this.canvas;
    const ctx = c.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    const hgt = c.clientHeight;
    if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
    if (c.height !== Math.round(hgt * dpr)) c.height = Math.round(hgt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const th = worldTheme(this.screen === 'levels' ? this.currentWorld : 1);
    const g = ctx.createLinearGradient(0, 0, 0, hgt);
    g.addColorStop(0, th.bgTop);
    g.addColorStop(1, th.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hgt);
    ctx.strokeStyle = th.ring;
    ctx.lineWidth = 2;
    for (let r = 80; r < Math.max(w, hgt); r += 90) {
      ctx.beginPath();
      ctx.arc(w * 0.7, hgt * 0.4, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    const colors = ['#fff6df', '#4fd1c5', '#b794f4', '#f6ad55', '#f687b3', '#68d391', '#63b3ed'];
    this.titleBalls.forEach((b, i) => {
      b.vy += 900 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > hgt - 40) {
        b.y = hgt - 40;
        b.vy = -Math.max(420, Math.abs(b.vy) * 0.92);
      }
      if (b.x < 20 || b.x > w - 20) b.vx *= -1;
      b.x = Math.max(20, Math.min(w - 20, b.x));
      ctx.globalAlpha = i === 0 ? 0.9 : 0.35;
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.arc(b.x, b.y, 14, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  /** Clicking an echo's lane in the timeline mutes / restores it. */
  private onCanvasPointer(e: PointerEvent) {
    const p = this.play;
    if (!p || p.paused || p.finished || p.demoRunning) return;
    const pt = this.renderer.toLevel(e.clientX, e.clientY);
    const lanesTop = p.level.height + 9;
    const lanes = p.session.echoes.length + 1;
    const laneH = Math.min(12, (this.renderer.hudHeight - 18) / lanes);
    const lane = Math.floor((pt.y - lanesTop) / laneH);
    if (pt.y >= lanesTop && lane >= 0 && lane < p.session.echoes.length) p.toggleMute(lane);
  }

  // --- Toasts ------------------------------------------------------------------

  toast(msg: string, kind: 'info' | 'warn' | 'good' = 'info', secs = 4) {
    this.toastEl.textContent = msg;
    this.toastEl.className = `show ${kind}`;
    this.toastTimer = secs;
  }

  // --- Screens -----------------------------------------------------------------

  private setScreen(s: Screen, content: HTMLElement) {
    this.screen = s;
    this.ui.replaceChildren(content);
    this.ui.classList.toggle('in-play', s === 'play');
    document.body.classList.toggle('playing', s === 'play');
    const first = content.querySelector('button:not([disabled])') as HTMLButtonElement | null;
    first?.focus({ preventScroll: true });
  }

  showTitle() {
    this.play = null;
    this.audio.startMusic(1);
    const t = totals(this.save);
    const has = this.saves.hasProgress;
    const menu = h(
      'div',
      { class: 'menu title-menu' },
      h('h1', { class: 'logo' }, 'Ghost', h('span', {}, ' Bounce')),
      h('p', { class: 'tagline' }, 'Every attempt becomes a teammate.'),
      has ? button('Continue', () => this.startLevel(continueLevel(this.save)), 'primary') : null,
      button(has ? 'New Game' : 'Start', () => this.newGame(), has ? '' : 'primary'),
      button('Worlds', () => this.showWorlds()),
      button('Challenges', () => this.showChallenges()),
      button('Collection', () => this.showCollection()),
      button('Settings', () => this.showSettings()),
      button('Credits', () => this.showCredits()),
      has ? h('p', { class: 'small' }, `${t.solved} puzzles solved · ${t.marks}/${t.possible} marks · ${t.shards} shards`) : null,
    );
    this.setScreen('title', menu);
  }

  private newGame() {
    const go = () => {
      this.saves.reset();
      this.startLevel(CAMPAIGN_LEVELS[0]);
    };
    if (!this.saves.hasProgress) return go();
    this.confirm('Start a new game? All campaign progress will be erased (settings are kept).', go);
  }

  private confirm(text: string, yes: () => void) {
    const box = h(
      'div',
      { class: 'menu panel' },
      h('p', {}, text),
      h('div', { class: 'row' }, button('Yes', yes, 'danger'), button('Cancel', () => this.showTitle())),
    );
    this.setScreen('title', box);
  }

  showWorlds() {
    this.play = null;
    this.audio.startMusic(1);
    const grid = h('div', { class: 'world-grid' });
    for (const w of WORLDS) {
      const unlocked = worldUnlocked(this.save, w.n);
      const done = w.levels.filter((l) => this.save.levels[l.id]?.done).length;
      const marks = w.levels.reduce((a, l) => a + markCount(marksFor(l, this.save.levels[l.id])), 0);
      const max = w.levels.reduce((a, l) => a + markMax(marksFor(l, this.save.levels[l.id])), 0);
      const th = worldTheme(w.n);
      const card = h(
        'button',
        { class: `world-card ${unlocked ? '' : 'locked'}`, style: `--accent:${th.accent}; --bg:${th.solid}` },
        h('div', { class: 'world-num' }, `World ${w.n}`),
        h('div', { class: 'world-name' }, unlocked ? w.name : '???'),
        h('div', { class: 'world-tag' }, unlocked ? w.tagline : `Complete World ${w.n - 1} to unlock`),
        h('div', { class: 'world-prog' }, unlocked ? `${done}/${w.levels.length} solved · ${marks}/${max} marks` : '🔒'),
      ) as HTMLButtonElement;
      if (unlocked) card.addEventListener('click', () => this.showLevels(w.n));
      else card.disabled = true;
      grid.append(card);
    }
    this.setScreen('worlds', h('div', { class: 'menu wide' }, h('h2', {}, 'Worlds'), grid, button('Back', () => this.showTitle())));
  }

  showLevels(n: number) {
    this.play = null;
    this.currentWorld = n;
    this.audio.startMusic(n);
    const w = WORLDS.find((x) => x.n === n)!;
    const grid = h('div', { class: 'level-grid' });
    w.levels.forEach((l, i) => {
      const unlocked = levelUnlocked(this.save, l);
      const m = marksFor(l, this.save.levels[l.id]);
      const pips = h(
        'div',
        { class: 'marks' },
        h('span', { class: m.solved ? 'on' : '', title: 'Solved' }, '◉'),
        h('span', { class: m.echoes ? 'on' : '', title: `Solved with ≤ ${l.parEchoes} echoes` }, '◎'),
        h('span', { class: m.time ? 'on' : '', title: `Final take ≤ ${l.parTime}s` }, '◷'),
        m.hasShard ? h('span', { class: m.shard ? 'on shard' : 'shard', title: 'Memory shard' }, '◆') : null,
      );
      const card = h(
        'button',
        { class: `level-card ${unlocked ? '' : 'locked'} ${m.solved ? 'solved' : ''}` },
        h('div', { class: 'level-num' }, `${n}-${i + 1}`),
        h('div', { class: 'level-name' }, unlocked ? l.name : 'Locked'),
        unlocked ? pips : null,
      ) as HTMLButtonElement;
      if (unlocked) card.addEventListener('click', () => this.startLevel(l));
      else card.disabled = true;
      grid.append(card);
    });
    const th = worldTheme(n);
    this.setScreen(
      'levels',
      h(
        'div',
        { class: 'menu wide', style: `--accent:${th.accent}` },
        h('h2', {}, `World ${n} — ${w.name}`),
        h('p', { class: 'tagline' }, w.tagline),
        grid,
        h('p', { class: 'small legend' }, '◉ solved   ◎ echo target   ◷ time target   ◆ memory shard'),
        button('Back', () => this.showWorlds()),
      ),
    );
  }

  startLevel(def: LevelDef) {
    this.closeOverlay();
    this.input.reset();
    if (CAMPAIGN_LEVELS.includes(def)) this.save.lastLevel = def.id;
    this.play = new PlayScreen(def, this.renderer, this.input, this.audio, this.save, {
      onWin: (p) => this.onWin(p),
      onPause: () => this.pause(),
      toast: (m, k) => this.toast(m, k),
      planUnlocked: () => hasMastery(this.save, 'sight'),
      longForesight: () => hasMastery(this.save, 'foresight'),
    });
    this.audio.startMusic(def.world || 7);
    const hud = h(
      'div',
      { class: 'play-bar' },
      h('span', { class: 'lvl' }, def.name),
      h('span', { class: 'keys' }, this.keyHelp(def)),
      button('❚❚', () => this.pause(), 'icon'),
    );
    hud.querySelector('button')!.setAttribute('tabindex', '-1');
    this.setScreen('play', hud);
    (document.activeElement as HTMLElement | null)?.blur();
  }

  private keyHelp(def: LevelDef) {
    const b = this.save.settings.bindings;
    const k = (a: Action) => keyLabel(b[a][0]);
    const parts = [`${k('loop')} loop`, `${k('retry')} retry`, `${k('rewind')} rewind`, `${k('undo')} undo`];
    if (def.maxEchoes > 1) parts.push('1-9 mute');
    if (hasMastery(this.save, 'sight')) parts.push(`${k('plan')} plan`);
    if (def.abilities?.includes('burst')) parts.push(`${k('burst')} burst`);
    if (def.abilities?.includes('anchor')) parts.push(`${k('anchor')} anchor`);
    parts.push(`${k('hint')} hint`);
    return parts.join(' · ');
  }

  private closeOverlay() {
    this.overlay?.remove();
    this.overlay = null;
  }

  private showOverlay(el: HTMLElement) {
    this.closeOverlay();
    this.overlay = h('div', { class: 'overlay' }, el);
    this.ui.append(this.overlay);
    (el.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  pause() {
    const p = this.play;
    if (!p || p.finished) return;
    p.paused = true;
    this.audio.ui('back');
    const hintList = h('div', { class: 'hints' }, ...p.hintsShown.map((t, i) => h('p', {}, `${i + 1}. ${t}`)));
    const hintBtn = button(p.hintsShown.length < p.def.hints.length ? `Reveal hint ${p.hintsShown.length + 1}/${p.def.hints.length}` : 'All hints shown', () => {
      const t = p.nextHint();
      if (t) this.pause();
    });
    if (p.hintsShown.length >= p.def.hints.length) hintBtn.disabled = true;
    const panel = h(
      'div',
      { class: 'menu panel' },
      h('h2', {}, 'Paused'),
      h('p', { class: 'objective' }, p.def.objective),
      button('Resume', () => this.resume(), 'primary'),
      button('Restart level (clear echoes)', () => {
        p.restartLevel();
        this.resume();
      }),
      hintBtn,
      hintList,
      button('Watch the solution', () => {
        this.resume();
        p.startDemo();
      }),
      button('Settings', () => this.showSettings(true)),
      button(p.def.world ? 'Level select' : 'Challenges', () => (p.def.world ? this.showLevels(p.def.world) : this.showChallenges())),
      button('Main menu', () => this.showTitle()),
      h('p', { class: 'small' }, this.controlsSummary()),
    );
    this.showOverlay(panel);
  }

  private controlsSummary() {
    const b = this.save.settings.bindings;
    return (['left', 'right', 'jump', 'down', 'loop', 'retry', 'rewind', 'undo', 'fast'] as Action[])
      .map((a) => `${ACTION_LABELS[a]}: ${b[a].map(keyLabel).join('/')}`)
      .join(' · ');
  }

  resume() {
    if (!this.play) return;
    this.play.paused = false;
    this.closeOverlay();
    this.input.reset();
  }

  private onWin(p: PlayScreen) {
    const s = p.session;
    const id = p.def.id;
    const isDaily = id.startsWith('daily-');
    const before = unlockSet(this.save);
    const rec = this.saves.level(id);
    const hadShard = rec.shard;
    const time = s.world.tick / 60;
    const echoes = s.liveEchoCount;
    const firstClear = !rec.done;
    rec.done = true;
    rec.attempts += s.takesStarted;
    rec.bestEchoes = rec.bestEchoes === null ? echoes : Math.min(rec.bestEchoes, echoes);
    rec.bestTime = rec.bestTime === null ? time : Math.min(rec.bestTime, time);
    if (s.shardsCollected.some(Boolean)) rec.shard = true;
    if (isDaily) this.save.daily[id.slice(6)] = true;
    const st = this.save.stats;
    st.takes += s.takesStarted;
    st.echoes += p.echoesRecorded;
    st.deaths += p.deaths;
    st.bounces += p.bounces;
    const after = unlockSet(this.save);
    const fresh = [...after].filter((x) => !before.has(x)).map((x) => x.split('|')[1]);
    this.saves.save();

    const m = marksFor(p.def, rec);
    const next = CAMPAIGN_LEVELS.includes(p.def) ? nextLevel(p.def) : null;
    const nextOk = next && levelUnlocked(this.save, next);
    const lore = p.def.lore && rec.shard && !hadShard ? h('blockquote', { class: 'lore' }, p.def.lore) : null;
    const row = (ok: boolean, text: string) => h('li', { class: ok ? 'on' : '' }, `${ok ? '✓' : '·'} ${text}`);
    const panel = h(
      'div',
      { class: 'menu panel complete' },
      h('h2', {}, firstClear ? 'Solved!' : 'Solved again'),
      h('p', { class: 'stats' }, `Final take ${time.toFixed(2)}s · ${echoes} echo${echoes === 1 ? '' : 'es'} · ${s.takesStarted} take${s.takesStarted === 1 ? '' : 's'}`),
      h(
        'ul',
        { class: 'marklist' },
        row(m.solved, 'Solved'),
        row(m.echoes, `Echo target: ${p.def.parEchoes} or fewer (best ${rec.bestEchoes})`),
        row(m.time, `Time target: final take ≤ ${p.def.parTime}s (best ${rec.bestTime!.toFixed(2)}s)`),
        m.hasShard ? row(m.shard, 'Memory shard found') : null,
      ),
      lore,
      fresh.length ? h('div', { class: 'unlocks' }, h('h3', {}, 'Unlocked'), ...fresh.map((f) => h('p', {}, `★ ${f}`))) : null,
      h(
        'div',
        { class: 'row' },
        nextOk ? button('Next puzzle', () => this.startLevel(next!), 'primary') : null,
        button('Replay', () => this.startLevel(p.def), nextOk ? '' : 'primary'),
        button(p.def.world ? 'Level select' : 'Challenges', () => (p.def.world ? this.showLevels(p.def.world) : this.showChallenges())),
      ),
    );
    setTimeout(() => {
      if (this.play === p) this.showOverlay(panel);
    }, 700);
  }

  showChallenges() {
    this.play = null;
    this.audio.startMusic(7);
    const t = totals(this.save);
    const list = h('div', { class: 'level-grid' });
    for (const c of CHALLENGES) {
      const ok = challengeUnlocked(this.save, c);
      const m = marksFor(c.def, this.save.levels[c.def.id]);
      const card = h(
        'button',
        { class: `level-card challenge ${ok ? '' : 'locked'} ${m.solved ? 'solved' : ''}` },
        h('div', { class: 'level-num' }, c.kind === 'trial' ? 'Trial' : 'Room'),
        h('div', { class: 'level-name' }, ok ? c.def.name : `${c.unlockMarks} marks`),
        h('div', { class: 'small' }, ok ? c.rule : 'Locked'),
      ) as HTMLButtonElement;
      if (ok) card.addEventListener('click', () => this.startLevel(c.def));
      else card.disabled = true;
      list.append(card);
    }
    const today = todayString();
    const daily = dailyLevel(today);
    const dailyOk = dailyUnlocked(this.save) && daily;
    const dailyCard = h(
      'div',
      { class: 'daily' },
      h('h3', {}, 'Daily Echo'),
      h('p', { class: 'small' }, dailyOk ? `${today}: a familiar puzzle, mirrored. ${this.save.daily[today] ? '✓ Solved today' : ''}` : 'Complete World 2 to unlock daily mirrored puzzles.'),
      dailyOk ? button('Play today’s puzzle', () => this.startLevel(daily!), 'primary') : null,
    );
    this.setScreen(
      'challenges',
      h(
        'div',
        { class: 'menu wide' },
        h('h2', {}, 'Challenges'),
        h('p', { class: 'tagline' }, `Earn mastery marks in the campaign to open these rooms. You have ${t.marks}.`),
        dailyCard,
        list,
        button('Back', () => this.showTitle()),
      ),
    );
  }

  showCollection() {
    this.play = null;
    const t = totals(this.save);
    const st = this.save.stats;
    const lore = CAMPAIGN_LEVELS.filter((l) => l.lore && l.objects.some((o) => o.type === 'shard'));
    const skinRow = h('div', { class: 'swatches' });
    for (const s of SKINS) {
      const ok = skinUnlocked(this.save, s);
      const b = h(
        'button',
        { class: `swatch ${this.save.skin === s.id ? 'sel' : ''}`, title: ok ? s.name : `Needs ${s.shards ? s.shards + ' shards' : s.marks + ' marks'}` },
        h('span', { class: 'dot', style: `background:${s.core}; box-shadow: 0 0 0 3px ${s.rim}, 0 0 14px ${s.glow}` }),
        ok ? s.name : '🔒',
      ) as HTMLButtonElement;
      if (ok)
        b.addEventListener('click', () => {
          this.save.skin = s.id;
          this.saves.save();
          this.showCollection();
        });
      else b.disabled = true;
      skinRow.append(b);
    }
    const trailRow = h('div', { class: 'swatches' });
    for (const tr of TRAILS) {
      const ok = trailUnlocked(this.save, tr);
      const b = h(
        'button',
        { class: `swatch ${this.save.trail === tr.id ? 'sel' : ''}`, title: ok ? tr.name : `Needs ${tr.shards ? tr.shards + ' shards' : tr.marks + ' marks'}` },
        ok ? tr.name : `🔒 ${tr.shards ? tr.shards + ' shards' : tr.marks + ' marks'}`,
      ) as HTMLButtonElement;
      if (ok)
        b.addEventListener('click', () => {
          this.save.trail = tr.id;
          this.saves.save();
          this.showCollection();
        });
      else b.disabled = true;
      trailRow.append(b);
    }
    const panel = h(
      'div',
      { class: 'menu wide collection' },
      h('h2', {}, 'Collection'),
      h('p', { class: 'tagline' }, `${t.solved} solved · ${t.marks}/${t.possible} mastery marks · ${t.shards}/${t.possibleShards} memory shards`),
      h('h3', {}, 'Echo mastery'),
      ...MASTERY.map((m) => h('p', { class: hasMastery(this.save, m.id) ? 'on' : 'off' }, `${hasMastery(this.save, m.id) ? '✓' : '🔒'} ${m.name} — ${m.desc}${hasMastery(this.save, m.id) ? '' : ` (complete World ${m.world})`}`)),
      h('h3', {}, 'Abilities'),
      ...ABILITIES.map((a) => h('p', { class: abilityLearned(this.save, a.world) ? 'on' : 'off' }, `${abilityLearned(this.save, a.world) ? '✓' : '🔒'} ${a.name} — ${a.desc} (World ${a.world})`)),
      h('h3', {}, 'Ball skins'),
      skinRow,
      h('h3', {}, 'Trails'),
      trailRow,
      h('h3', {}, 'Memories'),
      h(
        'div',
        { class: 'lore-list' },
        ...lore.map((l) =>
          this.save.levels[l.id]?.shard ? h('blockquote', { class: 'lore' }, h('b', {}, `${l.world}-${WORLDS.find((w) => w.n === l.world)!.levels.indexOf(l) + 1} `), l.lore!) : h('p', { class: 'off' }, `◆ A shard hides in ${worldUnlocked(this.save, l.world) ? `“${l.name}”` : 'a locked world'}.`),
        ),
      ),
      h('h3', {}, 'Statistics'),
      h('p', { class: 'small' }, `Takes: ${st.takes} · Echoes recorded: ${st.echoes} · Petrified: ${st.deaths} · Bounces: ${st.bounces} · Time played: ${Math.round(st.playSeconds / 60)} min · Worlds complete: ${WORLDS.filter((w) => worldComplete(this.save, w.n)).length}/${WORLDS.length}`),
      button('Back', () => this.showTitle()),
    );
    this.setScreen('collection', panel);
  }

  showSettings(fromPause = false) {
    const s = this.save.settings;
    const slider = (label: string, key: 'master' | 'music' | 'sfx') => {
      const input = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s[key]) }) as HTMLInputElement;
      input.addEventListener('input', () => {
        s[key] = parseFloat(input.value);
        this.applySettings();
      });
      return h('label', { class: 'setting' }, h('span', {}, label), input);
    };
    const toggle = (label: string, key: 'shake' | 'ghostPaths' | 'highContrast') => {
      const input = h('input', { type: 'checkbox' }) as HTMLInputElement;
      input.checked = s[key];
      input.addEventListener('change', () => {
        s[key] = input.checked;
        this.applySettings();
      });
      return h('label', { class: 'setting' }, h('span', {}, label), input);
    };
    const speed = h('select', {}) as HTMLSelectElement;
    for (const v of [1, 0.75, 0.5]) speed.append(h('option', { value: String(v) }, `${v * 100}%`));
    speed.value = String(s.gameSpeed);
    speed.addEventListener('change', () => (s.gameSpeed = parseFloat(speed.value)));
    const touch = h('select', {}) as HTMLSelectElement;
    for (const v of ['auto', 'on', 'off']) touch.append(h('option', { value: v }, v));
    touch.value = s.touch;
    touch.addEventListener('change', () => {
      s.touch = touch.value as 'auto' | 'on' | 'off';
      this.applySettings();
    });

    const binds = h('div', { class: 'binds' });
    for (const a of Object.keys(ACTION_LABELS) as Action[]) {
      const b = button(s.bindings[a].map(keyLabel).join(' / '), () => {
        b.textContent = 'Press a key… (Esc cancels)';
        this.input.onAnyKey = (code) => {
          this.input.onAnyKey = null;
          if (code !== 'Escape') {
            for (const other of Object.keys(s.bindings) as Action[]) s.bindings[other] = s.bindings[other].filter((c) => c !== code);
            s.bindings[a] = [code, ...s.bindings[a].filter((c) => c !== code)].slice(0, 3);
          }
          this.applySettings();
          this.showSettings(fromPause);
          return true;
        };
      }, 'small');
      binds.append(h('label', { class: 'setting' }, h('span', {}, ACTION_LABELS[a]), b));
    }

    const back = () => {
      this.saves.save();
      if (fromPause && this.play) this.pause();
      else this.showTitle();
    };
    const panel = h(
      'div',
      { class: 'menu wide settings' },
      h('h2', {}, 'Settings'),
      h('h3', {}, 'Audio'),
      slider('Master volume', 'master'),
      slider('Music', 'music'),
      slider('Sound effects', 'sfx'),
      h('h3', {}, 'Comfort & accessibility'),
      h('label', { class: 'setting' }, h('span', {}, 'Game speed'), speed),
      toggle('Screen shake', 'shake'),
      toggle('Show echo path previews', 'ghostPaths'),
      toggle('High-contrast echoes', 'highContrast'),
      h('label', { class: 'setting' }, h('span', {}, 'Touch controls'), touch),
      h('h3', {}, 'Controls (click to rebind)'),
      binds,
      button('Reset controls to default', () => {
        s.bindings = structuredClone(DEFAULT_BINDINGS);
        this.applySettings();
        this.showSettings(fromPause);
      }),
      h('h3', {}, 'Save data'),
      h(
        'div',
        { class: 'row' },
        button('Export save', () => {
          void navigator.clipboard?.writeText(this.saves.export());
          this.toast('Save code copied to clipboard.', 'good');
        }),
        button('Import save', () => {
          const code = prompt('Paste a save code:');
          if (!code) return;
          try {
            this.saves.import(code);
            this.applySettings();
            this.toast('Save imported.', 'good');
          } catch {
            this.toast('That save code could not be read.', 'warn');
          }
        }),
      ),
      button('Done', back, 'primary'),
    );
    if (fromPause && this.play) this.showOverlay(panel);
    else this.setScreen('settings', panel);
  }

  showCredits() {
    this.setScreen(
      'credits',
      h(
        'div',
        { class: 'menu panel' },
        h('h2', {}, 'Credits'),
        h('p', {}, 'Ghost Bounce — a puzzle about cooperating with your past selves.'),
        h('p', { class: 'small' }, 'Design, code, levels, synthesized audio and art: the Ghost Bounce team, built with TypeScript, Canvas 2D and WebAudio. No external assets.'),
        h('p', { class: 'small' }, 'Inspired by the time-loop puzzle tradition: Braid, Chronotron, The Company of Myself and Cursor*10.'),
        button('Back', () => this.showTitle(), 'primary'),
      ),
    );
  }

  // --- Touch controls ------------------------------------------------------------

  private buildTouch(root: HTMLElement) {
    const pad = h('div', { id: 'touch' });
    const mk = (label: string, action: Action, cls: string) => {
      const b = h('div', { class: `tbtn ${cls}` }, label);
      const on = (e: Event) => {
        e.preventDefault();
        this.input.setTouch(action, true);
      };
      const off = (e: Event) => {
        e.preventDefault();
        this.input.setTouch(action, false);
      };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
      return b;
    };
    pad.append(
      h('div', { class: 'tgroup left' }, mk('◀', 'left', 'dir'), mk('▶', 'right', 'dir'), mk('▼', 'down', 'dir small')),
      h('div', { class: 'tgroup mid' }, mk('Loop', 'loop', 'act'), mk('Retry', 'retry', 'act'), mk('Undo', 'undo', 'act'), mk('⏪', 'rewind', 'act')),
      h('div', { class: 'tgroup right' }, mk('Burst', 'burst', 'ab'), mk('Anchor', 'anchor', 'ab'), mk('Jump', 'jump', 'jump')),
    );
    root.append(pad);
  }
}

export function levelById(id: string) {
  return findLevel(id);
}
