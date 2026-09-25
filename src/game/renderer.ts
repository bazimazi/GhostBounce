import { BALL_RADIUS, TILE } from '../core/constants';
import type { CompiledLevel, Rect } from '../core/level';
import type { Echo, Session } from '../core/session';
import { doorSolidRect, type Ball, type WorldState } from '../core/world';
import type { Fx } from './fx';
import { SIGNAL_COLORS, SIGNAL_GLYPHS, echoColor, type Skin, type Theme } from './theme';

export interface DrawOptions {
  world: WorldState;
  /** Positions of each ball at the previous tick, for interpolation. */
  prev: { x: number; y: number }[];
  alpha: number;
  session: Session;
  time: number;
  showPaths: boolean;
  highContrast: boolean;
  skin: Skin;
  trail: string;
  playerTrail: { x: number; y: number }[];
  /** Dim the live player (plan view / demo). */
  ghostOnly: boolean;
  /** How far ahead echo path previews reach, in ticks. */
  pathTicks: number;
}

const TAU = Math.PI * 2;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  level!: CompiledLevel;
  theme!: Theme;
  private staticLayer: HTMLCanvasElement | null = null;
  private signalColor = new Map<string, number>();
  scale = 1;
  offX = 0;
  offY = 0;
  /** Height reserved below the level for the timeline HUD, in level pixels. */
  readonly hudHeight = 78;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  setLevel(level: CompiledLevel, theme: Theme) {
    this.level = level;
    this.theme = theme;
    this.signalColor.clear();
    level.signalIds.forEach((id, i) => this.signalColor.set(id, i));
    this.staticLayer = this.buildStatic();
  }

  sigColor(id: string) {
    return SIGNAL_COLORS[(this.signalColor.get(id) ?? 0) % SIGNAL_COLORS.length];
  }
  sigGlyph(id: string) {
    return SIGNAL_GLYPHS[(this.signalColor.get(id) ?? 0) % SIGNAL_GLYPHS.length];
  }

  /** Fits the level (plus HUD) into the canvas, returns the transform. */
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    if (!this.level) return;
    const vw = this.level.width;
    const vh = this.level.height + this.hudHeight;
    this.scale = Math.min((w * dpr) / vw, (h * dpr) / vh);
    this.offX = (w * dpr - vw * this.scale) / 2;
    this.offY = (h * dpr - vh * this.scale) / 2;
  }

  /** Converts a client (CSS pixel) point to level coordinates. */
  toLevel(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / r.width;
    return { x: ((clientX - r.left) * dpr - this.offX) / this.scale, y: ((clientY - r.top) * dpr - this.offY) / this.scale };
  }

  private buildStatic(): HTMLCanvasElement {
    const L = this.level;
    const th = this.theme;
    const c = document.createElement('canvas');
    c.width = L.width;
    c.height = L.height;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, L.height);
    grad.addColorStop(0, th.bgTop);
    grad.addColorStop(1, th.bgBottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, L.width, L.height);

    // Horologe motif: faint concentric clock rings and tick marks.
    g.strokeStyle = th.ring;
    g.lineWidth = 2;
    const cx = L.width * 0.62;
    const cy = L.height * 0.45;
    for (let r = 60; r < L.width; r += 70) {
      g.beginPath();
      g.arc(cx, cy, r, 0, TAU);
      g.stroke();
    }
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU;
      const r0 = i % 5 === 0 ? 180 : 195;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * 210, cy + Math.sin(a) * 210);
      g.stroke();
    }

    // Solids.
    for (const s of L.solids) {
      const mat = s.mat;
      const base =
        mat === 'rubber' ? '#b83280' : mat === 'mud' ? '#5f4b32' : mat === 'ice' ? '#90cdf4' : mat === 'metal' ? '#4a5568' : th.solid;
      g.fillStyle = base;
      g.fillRect(s.x, s.y, s.w, s.h);
      // Tile texture.
      g.globalAlpha = 0.18;
      g.strokeStyle = mat === 'ice' ? '#ffffff' : '#000000';
      g.lineWidth = 1;
      for (let ty = s.y; ty < s.y + s.h; ty += TILE) {
        for (let tx = s.x; tx < s.x + s.w; tx += TILE) {
          if (mat === 'stone') {
            const off = ((ty / TILE) % 2) * (TILE / 2);
            g.strokeRect(tx + 0.5 - off + (off ? TILE : 0) * 0, ty + 0.5, TILE - 1, TILE / 2 - 1);
            g.strokeRect(tx + 0.5, ty + TILE / 2 + 0.5, TILE - 1, TILE / 2 - 1);
          } else if (mat === 'rubber') {
            g.beginPath();
            g.moveTo(tx, ty + TILE);
            g.lineTo(tx + TILE, ty);
            g.stroke();
          } else if (mat === 'mud') {
            g.fillStyle = '#000';
            g.beginPath();
            g.arc(tx + 9, ty + 12, 3, 0, TAU);
            g.arc(tx + 22, ty + 22, 2, 0, TAU);
            g.fill();
          } else if (mat === 'ice') {
            g.beginPath();
            g.moveTo(tx + 6, ty + 20);
            g.lineTo(tx + 20, ty + 6);
            g.stroke();
          } else {
            g.fillStyle = '#000';
            g.fillRect(tx + 4, ty + 4, 3, 3);
            g.fillRect(tx + TILE - 7, ty + TILE - 7, 3, 3);
          }
        }
      }
      g.globalAlpha = 1;
    }
    // Exposed top edges get a highlight so walkable surfaces read clearly.
    const solidAt = (x: number, y: number) => L.solids.some((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
    for (let ty = 0; ty < L.rows; ty++) {
      for (let tx = 0; tx < L.cols; tx++) {
        const px = tx * TILE + 1;
        const py = ty * TILE + 1;
        if (!solidAt(px, py)) continue;
        const mat = L.solids.find((s) => px >= s.x && px < s.x + s.w && py >= s.y && py < s.y + s.h)!.mat;
        const edge = mat === 'rubber' ? '#fbb6ce' : mat === 'ice' ? '#e6fffa' : mat === 'mud' ? '#a0785a' : th.solidEdge;
        if (ty > 0 && !solidAt(px, py - TILE)) {
          g.fillStyle = edge;
          g.fillRect(tx * TILE, ty * TILE, TILE, 3);
        }
        g.fillStyle = 'rgba(0,0,0,0.25)';
        if (ty < L.rows - 1 && !solidAt(px, py + TILE)) g.fillRect(tx * TILE, ty * TILE + TILE - 3, TILE, 3);
      }
    }

    // Spikes.
    for (const sp of L.spikes) {
      g.fillStyle = '#e2e8f0';
      g.strokeStyle = '#1a202c';
      g.lineWidth = 1;
      const n = 3;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        if (sp.dir === 'up' || sp.dir === 'down') {
          const w = sp.w / n;
          const x0 = sp.x + i * w;
          const base = sp.dir === 'up' ? sp.y + sp.h : sp.y;
          const tip = sp.dir === 'up' ? sp.y : sp.y + sp.h;
          g.moveTo(x0, base);
          g.lineTo(x0 + w / 2, tip);
          g.lineTo(x0 + w, base);
        } else {
          const h = sp.h / n;
          const y0 = sp.y + i * h;
          const base = sp.dir === 'right' ? sp.x : sp.x + sp.w;
          const tip = sp.dir === 'right' ? sp.x + sp.w : sp.x;
          g.moveTo(base, y0);
          g.lineTo(tip, y0 + h / 2);
          g.lineTo(base, y0 + h);
        }
      }
      g.closePath();
      g.fill();
      g.stroke();
    }
    return c;
  }

  begin() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060b';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Applies the level transform; returns a function that restores it. */
  withLevel(fx: Fx | null, fn: () => void) {
    const ctx = this.ctx;
    ctx.save();
    let sx = 0;
    let sy = 0;
    if (fx && fx.shake > 0) {
      sx = (Math.random() - 0.5) * fx.shake;
      sy = (Math.random() - 0.5) * fx.shake;
    }
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offX + sx * this.scale, this.offY + sy * this.scale);
    ctx.beginPath();
    ctx.rect(0, 0, this.level.width, this.level.height);
    ctx.clip();
    fn();
    ctx.restore();
  }

  withHud(fn: () => void) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY + this.level.height * this.scale);
    fn();
    ctx.restore();
  }

  drawWorld(o: DrawOptions, fx: Fx | null) {
    this.withLevel(fx, () => {
      const ctx = this.ctx;
      const L = this.level;
      const w = o.world;
      ctx.drawImage(this.staticLayer!, 0, 0);
      this.drawWires(w);
      this.drawVeils(o.time);
      this.drawFans(w, o.time);
      this.drawPlates(w);
      this.drawSwitches(w, o.time);
      this.drawSprings(w);
      this.drawDoors(w);
      this.drawPlatforms(w);
      this.drawBreakables(w);
      this.drawLasers(w, o.time);
      this.drawReceivers(w);
      this.drawExits(w, o.time);
      this.drawShards(w, o.session, o.time);
      this.drawSigns();
      if (o.showPaths) this.drawEchoPaths(o);
      this.drawBalls(o);
      if (fx) fx.draw(ctx);
      if (fx && fx.flash > 0) {
        ctx.globalAlpha = fx.flash * 0.5;
        ctx.fillStyle = fx.flashColor;
        ctx.fillRect(0, 0, L.width, L.height);
        ctx.globalAlpha = 1;
      }
    });
  }

  // --- Objects -------------------------------------------------------------

  private drawWires(w: WorldState) {
    // Faint dotted connections from signal sources to what they control.
    const ctx = this.ctx;
    const L = this.level;
    const sources = new Map<string, { x: number; y: number }>();
    L.plates.forEach((p) => sources.set(p.id, { x: p.x + p.w / 2, y: p.y }));
    L.switches.forEach((s) => sources.set(s.id, { x: s.x + s.w / 2, y: s.y + s.h / 2 }));
    L.receivers.forEach((r) => sources.set(r.id, { x: r.x + r.w / 2, y: r.y + r.h / 2 }));
    L.breakables.forEach((b) => b.id && sources.set(b.id, { x: b.x + b.w / 2, y: b.y + b.h / 2 }));
    const sinks: { refs: string[]; x: number; y: number }[] = [];
    L.doors.forEach((d) => sinks.push({ refs: d.open.refs, x: d.x + d.w / 2, y: d.y + d.h / 2 }));
    L.platforms.forEach((p, i) => p.active && sinks.push({ refs: p.active.refs, x: w.platX[i] + p.w / 2, y: w.platY[i] + p.h / 2 }));
    L.lasers.forEach((l) => l.active && sinks.push({ refs: l.active.refs, x: l.x + l.w / 2, y: l.y + l.h / 2 }));
    L.fans.forEach((f) => f.active && sinks.push({ refs: f.active.refs, x: f.x + f.w / 2, y: f.y + f.h / 2 }));
    L.exits.forEach((e) => e.active && sinks.push({ refs: e.active.refs, x: e.x, y: e.y }));
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 6]);
    for (const sk of sinks) {
      for (const r of sk.refs) {
        const src = sources.get(r);
        if (!src) continue;
        ctx.strokeStyle = this.sigColor(r);
        ctx.globalAlpha = w.signals[r] ? 0.55 : 0.16;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        const my = Math.min(src.y, sk.y) - 20;
        ctx.bezierCurveTo(src.x, my, sk.x, my, sk.x, sk.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private glyph(id: string, x: number, y: number, on: boolean, size = 10) {
    const ctx = this.ctx;
    ctx.font = `${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = on ? this.sigColor(id) : 'rgba(255,255,255,0.35)';
    ctx.fillText(this.sigGlyph(id), x, y);
  }

  private drawPlates(w: WorldState) {
    const ctx = this.ctx;
    this.level.plates.forEach((p, i) => {
      const on = w.plateOn[i];
      const col = this.sigColor(p.id);
      ctx.fillStyle = on ? col : '#2d3748';
      const depth = on ? 2 : 4;
      ctx.fillRect(p.x, p.y + p.h - depth, p.w, depth);
      ctx.fillStyle = on ? col : '#718096';
      ctx.fillRect(p.x + 2, p.y + p.h - depth - 2, p.w - 4, 2);
      if (on) {
        ctx.globalAlpha = 0.25;
        ctx.fillRect(p.x, p.y - 10, p.w, 10);
        ctx.globalAlpha = 1;
      }
      this.glyph(p.id, p.x + p.w / 2, p.y + p.h + 8, on, 9);
      if (p.who !== 'any') this.whoBadge(p.who, p.x + p.w / 2, p.y - 14);
    });
  }

  private whoBadge(who: 'ghost' | 'player', x: number, y: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.9;
    if (who === 'ghost') {
      ctx.strokeStyle = '#b794f4';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, TAU);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fff6df';
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSwitches(w: WorldState, time: number) {
    const ctx = this.ctx;
    this.level.switches.forEach((s, i) => {
      const on = w.switchOn[i];
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      const col = this.sigColor(s.id);
      ctx.strokeStyle = on ? col : '#a0aec0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = on ? col : '#4a5568';
      ctx.beginPath();
      ctx.arc(cx, cy, on ? 6 + Math.sin(time * 6) : 5, 0, TAU);
      ctx.fill();
      if (s.timerTicks > 0) {
        // Timer arc shows remaining time.
        const frac = w.switchTimer[i] / s.timerTicks;
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, TAU);
        ctx.stroke();
      }
      this.glyph(s.id, cx, cy + 20, on, 9);
      if (s.who !== 'any') this.whoBadge(s.who, cx + 13, cy - 13);
    });
  }

  private drawSprings(w: WorldState) {
    void w;
    const ctx = this.ctx;
    for (const s of this.level.springs) {
      ctx.fillStyle = '#ed8936';
      ctx.strokeStyle = '#fbd38d';
      ctx.lineWidth = 2;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.beginPath();
      if (s.dir === 'up' || s.dir === 'down') {
        for (let x = s.x + 4; x < s.x + s.w - 2; x += 6) {
          ctx.moveTo(x, s.y + 2);
          ctx.lineTo(x + 3, s.y + s.h - 2);
        }
      } else {
        for (let y = s.y + 4; y < s.y + s.h - 2; y += 6) {
          ctx.moveTo(s.x + 2, y);
          ctx.lineTo(s.x + s.w - 2, y + 3);
        }
      }
      ctx.stroke();
      // Arrow shows launch direction.
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      const d = s.dir === 'up' ? [0, -1] : s.dir === 'down' ? [0, 1] : s.dir === 'left' ? [-1, 0] : [1, 0];
      ctx.fillStyle = 'rgba(251,211,141,0.6)';
      ctx.beginPath();
      ctx.moveTo(cx + d[0] * 18, cy + d[1] * 18);
      ctx.lineTo(cx + d[0] * 10 - d[1] * 5, cy + d[1] * 10 - d[0] * 5);
      ctx.lineTo(cx + d[0] * 10 + d[1] * 5, cy + d[1] * 10 + d[0] * 5);
      ctx.fill();
    }
  }

  private drawDoors(w: WorldState) {
    const ctx = this.ctx;
    this.level.doors.forEach((d, i) => {
      const r = doorSolidRect(this.level, w, i);
      // Door frame (always visible so open doors still read as doors).
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1);
      if (r) {
        ctx.fillStyle = '#2a3142';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = this.theme.accent;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        ctx.globalAlpha = 0.25;
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        ctx.beginPath();
        for (let k = -r.w; k < r.h; k += 10) {
          ctx.moveTo(r.x, r.y + k);
          ctx.lineTo(r.x + r.w, r.y + k + r.w);
        }
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      // Lamps for each required signal.
      const refs = d.open.refs;
      refs.forEach((id, k) => {
        const lx = d.vertical ? d.x + d.w / 2 : d.x + 8 + k * 12;
        const ly = d.vertical ? d.y + 8 + k * 12 : d.y + d.h / 2;
        this.glyph(id, lx, ly, !!w.signals[id], 10);
      });
    });
  }

  private drawPlatforms(w: WorldState) {
    const ctx = this.ctx;
    this.level.platforms.forEach((p, i) => {
      const x = w.platX[i];
      const y = w.platY[i];
      // Faint rail showing the path.
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      p.path.forEach((pt, k) => (k ? ctx.lineTo(pt.x + p.w / 2, pt.y + p.h / 2) : ctx.moveTo(pt.x + p.w / 2, pt.y + p.h / 2)));
      ctx.stroke();
      ctx.setLineDash([]);
      if (p.hazard) {
        ctx.fillStyle = '#c53030';
        ctx.fillRect(x, y, p.w, p.h);
        ctx.fillStyle = '#fed7d7';
        for (let k = x; k < x + p.w; k += 8) {
          ctx.beginPath();
          ctx.moveTo(k, y);
          ctx.lineTo(k + 4, y - 5);
          ctx.lineTo(k + 8, y);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(k, y + p.h);
          ctx.lineTo(k + 4, y + p.h + 5);
          ctx.lineTo(k + 8, y + p.h);
          ctx.fill();
        }
      } else {
        const col = p.mat === 'rubber' ? '#d53f8c' : p.mat === 'ice' ? '#90cdf4' : '#718096';
        ctx.fillStyle = col;
        ctx.fillRect(x, y, p.w, p.h);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(x, y, p.w, 2);
      }
      if (p.active) {
        const on = p.active.eval(w.signals);
        p.active.refs.forEach((id, k) => this.glyph(id, x + 8 + k * 11, y + p.h / 2, on && !!w.signals[id], 8));
      }
    });
  }

  private drawBreakables(w: WorldState) {
    const ctx = this.ctx;
    this.level.breakables.forEach((b, i) => {
      if (w.broken[i]) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.setLineDash([3, 4]);
        ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
        ctx.setLineDash([]);
        return;
      }
      // Heavy walls (beyond a burst's 640 px/s) are darker, banded with iron,
      // and show fewer cracks, so the two kinds read differently at a glance.
      const heavy = b.strength > 700;
      ctx.fillStyle = heavy ? '#5a3a1a' : '#975a16';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (heavy) {
        ctx.fillStyle = '#718096';
        for (let yy = b.y + 6; yy < b.y + b.h; yy += 16) ctx.fillRect(b.x, yy, b.w, 3);
        for (let xx = b.x + 6; xx < b.x + b.w; xx += 16) ctx.fillRect(xx, b.y, 3, b.h);
      }
      ctx.strokeStyle = '#f6e05e';
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let yy = b.y; yy < b.y + b.h; yy += TILE) {
        ctx.moveTo(b.x + 6, yy + 4);
        ctx.lineTo(b.x + b.w / 2, yy + 14);
        ctx.lineTo(b.x + b.w - 8, yy + 10);
        ctx.moveTo(b.x + b.w / 2, yy + 14);
        ctx.lineTo(b.x + b.w / 2 - 3, yy + 28);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  private drawLasers(w: WorldState, time: number) {
    const ctx = this.ctx;
    this.level.lasers.forEach((l, i) => {
      ctx.fillStyle = '#2d3748';
      ctx.fillRect(l.x + 3, l.y + 3, l.w - 6, l.h - 6);
      ctx.fillStyle = w.laserOn[i] ? '#fc8181' : '#4a5568';
      ctx.beginPath();
      ctx.arc(l.ox, l.oy, 5, 0, TAU);
      ctx.fill();
      if (l.active) l.active.refs.forEach((id, k) => this.glyph(id, l.x + 8 + k * 10, l.y + 8, !!w.signals[id], 8));
      if (!w.laserOn[i]) return;
      const e = w.laserEnd[i];
      ctx.strokeStyle = 'rgba(252,129,129,0.35)';
      ctx.lineWidth = 7 + Math.sin(time * 20) * 1.5;
      ctx.beginPath();
      ctx.moveTo(l.ox, l.oy);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      ctx.strokeStyle = '#fff5f5';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fed7d7';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 3 + Math.random() * 2, 0, TAU);
      ctx.fill();
    });
  }

  private drawReceivers(w: WorldState) {
    const ctx = this.ctx;
    this.level.receivers.forEach((r, i) => {
      const on = w.receiverOn[i];
      ctx.fillStyle = '#2d3748';
      ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
      ctx.strokeStyle = on ? this.sigColor(r.id) : '#718096';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 8, 0, TAU);
      ctx.stroke();
      this.glyph(r.id, r.x + r.w / 2, r.y + r.h / 2, on, 9);
    });
  }

  private drawFans(w: WorldState, time: number) {
    const ctx = this.ctx;
    this.level.fans.forEach((f) => {
      const on = f.active ? f.active.eval(w.signals) : true;
      ctx.fillStyle = on ? 'rgba(190,227,248,0.06)' : 'rgba(190,227,248,0.02)';
      ctx.fillRect(f.x, f.y, f.w, f.h);
      if (!on) return;
      ctx.strokeStyle = 'rgba(190,227,248,0.35)';
      ctx.lineWidth = 1.5;
      const horizontal = f.dir === 'left' || f.dir === 'right';
      const sign = f.dir === 'up' || f.dir === 'left' ? -1 : 1;
      const len = horizontal ? f.w : f.h;
      for (let k = 0; k < 7; k++) {
        const lane = ((k + 0.5) / 7) * (horizontal ? f.h : f.w);
        const t = (time * 1.4 + k * 0.37) % 1;
        const along = sign > 0 ? t * len : (1 - t) * len;
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(f.x + along, f.y + lane);
          ctx.lineTo(f.x + along - sign * 14, f.y + lane);
        } else {
          ctx.moveTo(f.x + lane, f.y + along);
          ctx.lineTo(f.x + lane, f.y + along - sign * 14);
        }
        ctx.stroke();
      }
      if (f.active) f.active.refs.forEach((id, k) => this.glyph(id, f.x + 8 + k * 10, f.y + 8, !!w.signals[id], 8));
    });
  }

  private drawVeils(time: number) {
    const ctx = this.ctx;
    for (const v of this.level.veils) {
      const ghost = v.blocks === 'ghost';
      ctx.fillStyle = ghost ? 'rgba(183,148,244,0.16)' : 'rgba(255,220,150,0.14)';
      ctx.fillRect(v.x, v.y, v.w, v.h);
      ctx.strokeStyle = ghost ? 'rgba(183,148,244,0.7)' : 'rgba(255,220,150,0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash(ghost ? [4, 4] : []);
      ctx.lineDashOffset = -time * 10;
      ctx.strokeRect(v.x + 1, v.y + 1, v.w - 2, v.h - 2);
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      for (let y = v.y + 16; y < v.y + v.h; y += 48) this.whoBadge(ghost ? 'ghost' : 'player', v.x + v.w / 2, y);
    }
  }

  private drawExits(w: WorldState, time: number) {
    const ctx = this.ctx;
    for (const e of this.level.exits) {
      const on = e.active ? e.active.eval(w.signals) : true;
      ctx.save();
      ctx.translate(e.x, e.y);
      if (on) {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
        g.addColorStop(0, 'rgba(255,255,230,0.9)');
        g.addColorStop(1, 'rgba(255,255,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = on ? '#fffbea' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 2; k++) {
        ctx.save();
        ctx.rotate(time * (k ? -1.2 : 0.8));
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, 11 + k * 5, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      if (!on) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(-4, -2, 8, 7);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(0, -3, 3, Math.PI, 0);
        ctx.stroke();
      }
      ctx.restore();
      if (e.active) e.active.refs.forEach((id, k) => this.glyph(id, e.x - 6 + k * 12, e.y + 24, !!w.signals[id], 9));
    }
  }

  private drawShards(w: WorldState, session: Session, time: number) {
    const ctx = this.ctx;
    this.level.shards.forEach((s, i) => {
      const taken = w.shardTaken[i];
      const had = session.shardsCollected[i];
      if (taken) return;
      ctx.save();
      ctx.translate(s.x, s.y + Math.sin(time * 2.5 + i) * 2);
      ctx.rotate(Math.sin(time) * 0.2);
      ctx.globalAlpha = had ? 0.35 : 1;
      ctx.fillStyle = '#e9d8fd';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(6, 0);
      ctx.lineTo(0, 9);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }

  private drawSigns() {
    const ctx = this.ctx;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of this.level.signs) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(s.text, s.x, s.y);
    }
  }

  // --- Echoes and balls --------------------------------------------------------

  private drawEchoPaths(o: DrawOptions) {
    const ctx = this.ctx;
    const w = o.world;
    const t = w.tick;
    o.session.active.forEach((e: Echo, i) => {
      const b = w.balls[i];
      if (!b || b.gone || !b.alive) return;
      const st = o.session.echoStatus.get(e.id);
      if (st && st.divergedAt >= 0) return;
      const col = echoColor(e.id);
      ctx.fillStyle = col;
      const ahead = o.pathTicks;
      const end = Math.min(e.xs.length, t + ahead);
      for (let k = t + 4; k < end; k += 4) {
        ctx.globalAlpha = 0.45 * (1 - (k - t) / ahead);
        ctx.beginPath();
        ctx.arc(e.xs[k], e.ys[k], 2, 0, TAU);
        ctx.fill();
      }
      // Where this echo's recording ends, if it ends soon.
      if (e.xs.length - t < ahead && e.xs.length > t) {
        const k = e.xs.length - 1;
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = col;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(e.xs[k], e.ys[k], BALL_RADIUS, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    ctx.globalAlpha = 1;
  }

  private drawBalls(o: DrawOptions) {
    const ctx = this.ctx;
    const w = o.world;
    const lerp = (i: number, b: Ball) => {
      const p = o.prev[i];
      if (!p) return { x: b.x, y: b.y };
      return { x: p.x + (b.x - p.x) * o.alpha, y: p.y + (b.y - p.y) * o.alpha };
    };

    // Player trail.
    if (!o.ghostOnly && o.playerTrail.length > 1) this.drawTrail(o.playerTrail, o.skin.rim, o.trail);

    w.balls.forEach((b, i) => {
      if (b.gone) return;
      const { x, y } = lerp(i, b);
      if (b.kind === 'ghost') {
        const st = o.session.echoStatus.get(b.echo);
        this.drawGhost(b, x, y, echoColor(b.echo), (st?.divergedAt ?? -1) >= 0, o.session.echoes.findIndex((e) => e.id === b.echo) + 1, o.time, o.highContrast, w.tick);
      } else if (o.ghostOnly) {
        ctx.globalAlpha = 0.25;
        this.drawPlayer(b, x, y, o.skin, o.time, w.tick);
        ctx.globalAlpha = 1;
      } else this.drawPlayer(b, x, y, o.skin, o.time, w.tick);
    });
  }

  private drawTrail(pts: { x: number; y: number }[], color: string, style: string) {
    const ctx = this.ctx;
    ctx.save();
    if (style === 'ribbon' || style === 'comet') {
      ctx.lineCap = 'round';
      for (let k = 1; k < pts.length; k++) {
        const t = k / pts.length;
        ctx.globalAlpha = t * (style === 'comet' ? 0.5 : 0.3);
        ctx.strokeStyle = color;
        ctx.lineWidth = style === 'comet' ? t * BALL_RADIUS * 1.8 : 3;
        ctx.beginPath();
        ctx.moveTo(pts[k - 1].x, pts[k - 1].y);
        ctx.lineTo(pts[k].x, pts[k].y);
        ctx.stroke();
      }
    } else {
      for (let k = 0; k < pts.length; k += style === 'sparks' ? 1 : 2) {
        const t = k / pts.length;
        ctx.globalAlpha = t * 0.4;
        ctx.fillStyle = color;
        const jitter = style === 'sparks' ? (Math.random() - 0.5) * 6 : 0;
        ctx.beginPath();
        ctx.arc(pts[k].x + jitter, pts[k].y + jitter, style === 'sparks' ? 1.5 : 2 + t * 2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Squash-and-stretch factors from recent impacts and velocity. */
  private deform(b: Ball, tick: number) {
    const since = tick - b.impactTick;
    let sx = 1;
    let sy = 1;
    if (since >= 0 && since < 8) {
      const k = Math.min(0.3, b.impact / 2600) * (1 - since / 8);
      sx = 1 + k;
      sy = 1 - k;
    } else if (b.alive) {
      const k = Math.min(0.12, Math.abs(b.vy) / 6000);
      sx = 1 - k;
      sy = 1 + k;
    }
    return { sx, sy };
  }

  private drawPlayer(b: Ball, x: number, y: number, skin: Skin, time: number, tick: number) {
    const ctx = this.ctx;
    const R = BALL_RADIUS;
    if (!b.alive) {
      this.drawRemnant(x, y, skin.rim);
      return;
    }
    const { sx, sy } = this.deform(b, tick);
    ctx.save();
    ctx.translate(x, y + (1 - sy) * R);
    const glow = ctx.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 2.6);
    glow.addColorStop(0, skin.glow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, R * 2.6, 0, TAU);
    ctx.fill();
    ctx.scale(sx, sy);
    ctx.fillStyle = skin.core;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = skin.rim;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Rotation marker.
    ctx.rotate(b.rot);
    ctx.fillStyle = skin.rim;
    ctx.beginPath();
    ctx.arc(R * 0.5, 0, 2.5, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (b.anchored) this.anchorRing(x, y, skin.rim, time);
    if (!b.burstReady && b.burstTimer === 0) {
      // Spent burst: small dim pip above.
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(x, y - R - 6, 2, 0, TAU);
      ctx.fill();
    }
  }

  private anchorRing(x: number, y: number, color: string, time: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.translate(x, y);
    ctx.rotate(time * 3);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, BALL_RADIUS + 5, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  private drawRemnant(x: number, y: number, rim: string, labelled = false) {
    const ctx = this.ctx;
    const R = BALL_RADIUS;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#718096';
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = labelled ? 0.35 : 1;
    ctx.beginPath();
    ctx.moveTo(-6, -5);
    ctx.lineTo(0, 1);
    ctx.lineTo(5, -4);
    ctx.moveTo(0, 1);
    ctx.lineTo(-1, 8);
    ctx.stroke();
    ctx.restore();
  }

  private drawGhost(b: Ball, x: number, y: number, col: string, diverged: boolean, num: number, time: number, hc: boolean, tick: number) {
    const ctx = this.ctx;
    const R = BALL_RADIUS;
    if (!b.alive) {
      this.drawRemnant(x, y, col, true);
      ctx.save();
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1a202c';
      ctx.strokeText(String(num), x, y + 0.5);
      ctx.fillStyle = col;
      ctx.fillText(String(num), x, y + 0.5);
      ctx.restore();
      return;
    }
    const { sx, sy } = this.deform(b, tick);
    ctx.save();
    let jx = 0;
    if (diverged) jx = Math.sin(time * 40) * 1.5;
    ctx.translate(x + jx, y + (1 - sy) * R);
    ctx.scale(sx, sy);
    ctx.globalAlpha = hc ? 0.85 : 0.55;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.setLineDash(diverged ? [3, 3] : []);
    ctx.beginPath();
    ctx.arc(0, 0, R + 1, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    this.label(num, x + jx, y, '#0b0d17');
    if (b.anchored) this.anchorRing(x, y, col, time);
    if (diverged) {
      ctx.fillStyle = '#fc8181';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', x + R + 4, y - R - 2);
    }
  }

  private label(num: number, x: number, y: number, color: string) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), x, y + 0.5);
  }

  rectHit(r: Rect, x: number, y: number) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }
}
