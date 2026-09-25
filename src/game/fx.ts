// Lightweight particle and screen-shake effects. Purely cosmetic: nothing
// here feeds back into the simulation, so it may use Math.random freely.

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  gravity: number;
  kind: 'dot' | 'ring' | 'spark' | 'shard';
}

export class Fx {
  particles: Particle[] = [];
  shake = 0;
  flash = 0;
  flashColor = '#fff';
  shakeEnabled = true;

  burst(x: number, y: number, color: string, n: number, speed: number, opts: Partial<Particle> = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0,
        max: 0.35 + Math.random() * 0.35,
        color,
        size: 2 + Math.random() * 2,
        gravity: 300,
        kind: 'dot',
        ...opts,
      });
    }
  }

  dust(x: number, y: number, color: string, strength: number) {
    const n = Math.min(10, Math.floor(strength / 80));
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      this.particles.push({
        x,
        y,
        vx: dir * (40 + Math.random() * strength * 0.25),
        vy: -Math.random() * 60,
        life: 0,
        max: 0.3 + Math.random() * 0.2,
        color,
        size: 1.5 + Math.random() * 1.5,
        gravity: 200,
        kind: 'dot',
      });
    }
  }

  ring(x: number, y: number, color: string, size = 30, max = 0.45) {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0, max, color, size, gravity: 0, kind: 'ring' });
  }

  addShake(amount: number) {
    if (this.shakeEnabled) this.shake = Math.min(12, this.shake + amount);
  }

  doFlash(color: string, amount = 0.5) {
    this.flash = amount;
    this.flashColor = color;
  }

  update(dt: number) {
    for (const p of this.particles) {
      p.life += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2 * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 2);
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const t = p.life / p.max;
      ctx.globalAlpha = 1 - t;
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 * (1 - t) + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.3 + t), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'shard') {
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 8);
        ctx.fillRect(-p.size / 2, -p.size, p.size, p.size * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
