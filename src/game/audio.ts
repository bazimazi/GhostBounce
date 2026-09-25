import type { Material } from '../core/constants';

// All audio is synthesised with WebAudio: no asset pipeline, tiny builds,
// and every sound can react to gameplay values (impact speed, position).
// Ghost sounds are filtered and quieter so a crowd of echoes stays readable.

type Voice = { ghost?: boolean; pan?: number; gain?: number };

const SCALES: Record<number, number[]> = {
  // Semitone offsets per world, giving each area its own mood.
  1: [0, 2, 4, 7, 9],
  2: [0, 3, 5, 7, 10],
  3: [0, 2, 4, 6, 9],
  4: [0, 2, 3, 7, 8],
  5: [0, 3, 5, 6, 10],
  6: [0, 1, 5, 7, 8],
  7: [0, 2, 4, 7, 11],
};
const ROOTS: Record<number, number> = { 1: 57, 2: 55, 3: 60, 4: 53, 5: 52, 6: 58, 7: 62 };
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ghostFilter!: BiquadFilterNode;
  private noiseBuf!: AudioBuffer;
  private musicTimer: number | null = null;
  private musicWorld = 0;
  private step = 0;
  volumes = { master: 0.8, music: 0.5, sfx: 0.8 };
  private lastBounce = 0;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.sfxBus = c.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = c.createGain();
    this.musicBus.connect(this.master);
    this.ghostFilter = c.createBiquadFilter();
    this.ghostFilter.type = 'lowpass';
    this.ghostFilter.frequency.value = 1400;
    const ghostGain = c.createGain();
    ghostGain.gain.value = 0.45;
    this.ghostFilter.connect(ghostGain);
    ghostGain.connect(this.sfxBus);
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.musicWorld) this.startMusic(this.musicWorld);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfxBus.gain.value = this.volumes.sfx;
    this.musicBus.gain.value = this.volumes.music * 0.5;
  }

  private out(v: Voice): AudioNode {
    const c = this.ctx!;
    let node: AudioNode = v.ghost ? this.ghostFilter : this.sfxBus;
    if (v.pan !== undefined && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, v.pan));
      p.connect(node);
      node = p;
    }
    return node;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, v: Voice = {}, slideTo?: number, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * (v.gain ?? 1), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.out(v));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, freq: number, vol: number, v: Voice = {}, q = 1, sweepTo?: number) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol * (v.gain ?? 1), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out(v));
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  bounce(speed: number, mat: Material, v: Voice) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastBounce < 0.025) return;
    this.lastBounce = now;
    const k = Math.min(1, speed / 700);
    const vol = 0.05 + k * 0.22;
    if (mat === 'rubber') this.tone(180 + k * 240, 0.18, 'sine', vol, v, 520 + k * 300);
    else if (mat === 'metal') this.tone(700 + k * 400, 0.12, 'triangle', vol * 0.7, v, 500);
    else if (mat === 'ice') this.tone(1400 + k * 600, 0.08, 'sine', vol * 0.6, v, 1800);
    else if (mat === 'mud') this.noise(0.1, 300, vol * 1.2, v, 2);
    else {
      this.tone(110 + k * 90, 0.12, 'sine', vol * 1.2, v, 70);
      this.noise(0.05, 1800, vol * 0.5, v, 1.5);
    }
  }

  jump(v: Voice) {
    this.tone(320, 0.12, 'triangle', 0.08, v, 560);
  }
  burst(v: Voice) {
    this.noise(0.22, 600, 0.25, v, 1, 3000);
    this.tone(260, 0.2, 'sawtooth', 0.05, v, 900);
  }
  anchor(v: Voice) {
    this.tone(880, 0.3, 'sine', 0.08, v, 440);
    this.tone(1320, 0.3, 'sine', 0.04, v, 660);
  }
  spring(v: Voice) {
    this.tone(200, 0.3, 'square', 0.05, v, 900);
  }
  plate(on: boolean, v: Voice) {
    this.tone(on ? 520 : 390, 0.06, 'square', 0.05, v);
    this.noise(0.04, 3000, 0.08, v, 3);
  }
  switchFlip(on: boolean, v: Voice) {
    this.tone(on ? 660 : 440, 0.18, 'triangle', 0.12, v);
    this.tone(on ? 990 : 660, 0.25, 'sine', 0.06, v, undefined, 0.05);
  }
  door(open: boolean, v: Voice) {
    this.noise(0.35, open ? 300 : 500, 0.12, v, 0.8, open ? 900 : 200);
    this.tone(open ? 90 : 120, 0.3, 'sine', 0.1, v, open ? 140 : 70);
  }
  breakWall(v: Voice) {
    this.noise(0.4, 800, 0.4, v, 0.6, 150);
    this.tone(80, 0.3, 'sine', 0.25, v, 40);
  }
  petrify(v: Voice) {
    this.tone(1200, 0.5, 'triangle', 0.09, v, 300);
    this.noise(0.3, 4000, 0.1, v, 4, 800);
  }
  receiver(on: boolean, v: Voice) {
    this.tone(on ? 740 : 370, 0.15, 'sine', 0.07, v);
  }
  vanish(v: Voice) {
    this.tone(900, 0.35, 'sine', 0.04, v, 1800);
  }
  shard() {
    [0, 4, 7, 12].forEach((s, i) => this.tone(mtof(76 + s), 0.4, 'sine', 0.09, {}, undefined, i * 0.07));
  }
  win() {
    const root = ROOTS[this.musicWorld] ?? 60;
    [0, 4, 7, 11, 14].forEach((s, i) => this.tone(mtof(root + 12 + s), 0.9, 'triangle', 0.1, {}, undefined, i * 0.09));
  }
  loop() {
    // Reverse "whoosh" as time folds back.
    this.noise(0.45, 200, 0.2, {}, 1.2, 2400);
    this.tone(1200, 0.4, 'sine', 0.05, {}, 300);
  }
  rewindTick() {
    this.tone(1600, 0.03, 'square', 0.015);
  }
  death() {
    this.tone(300, 0.6, 'sawtooth', 0.06, {}, 60);
  }
  ui(kind: 'move' | 'ok' | 'back' | 'deny') {
    if (kind === 'move') this.tone(880, 0.04, 'sine', 0.04);
    else if (kind === 'ok') this.tone(660, 0.1, 'triangle', 0.08, {}, 990);
    else if (kind === 'back') this.tone(500, 0.1, 'triangle', 0.06, {}, 330);
    else this.tone(160, 0.15, 'square', 0.05);
  }

  // --- Generative music: a slow pad plus sparse plucks in the world's scale.
  startMusic(world: number) {
    this.musicWorld = world;
    if (!this.ctx) return;
    this.stopMusic();
    this.step = 0;
    const tick = () => this.musicStep();
    tick();
    this.musicTimer = window.setInterval(tick, 400);
  }

  stopMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private musicStep() {
    if (!this.ctx) return;
    const c = this.ctx;
    const w = this.musicWorld || 1;
    const scale = SCALES[w] ?? SCALES[1];
    const root = ROOTS[w] ?? 57;
    const s = this.step++;
    const bar = Math.floor(s / 16);
    const chordRoots = [0, 3, 4, 2];
    const cr = scale[chordRoots[bar % 4] % scale.length];
    if (s % 16 === 0) {
      // Pad chord.
      for (const deg of [0, 2, 4]) {
        const m = root - 12 + cr + scale[deg % scale.length];
        const t = c.currentTime;
        const o = c.createOscillator();
        const o2 = c.createOscillator();
        const g = c.createGain();
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 900;
        o.type = 'sawtooth';
        o2.type = 'triangle';
        o.frequency.value = mtof(m);
        o2.frequency.value = mtof(m) * 1.004;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.035, t + 2);
        g.gain.linearRampToValueAtTime(0.0001, t + 6.6);
        o.connect(f);
        o2.connect(f);
        f.connect(g);
        g.connect(this.musicBus);
        o.start(t);
        o2.start(t);
        o.stop(t + 6.8);
        o2.stop(t + 6.8);
      }
    }
    // Sparse, deterministic-looking pluck pattern.
    const pattern = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0];
    if (pattern[s % 16] && (s * 7919) % 5 !== 0) {
      const deg = (s * 3 + bar) % scale.length;
      const oct = (s * 5) % 3 === 0 ? 12 : 0;
      const m = root + 12 + scale[deg] + oct;
      const t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = mtof(m);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g);
      g.connect(this.musicBus);
      o.start(t);
      o.stop(t + 1.5);
    }
  }
}
