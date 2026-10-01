import type { Theme } from './theme';

const TAU = Math.PI * 2;
const noise = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

/** All scenery is cosmetic and seeded, independent of the replay simulation. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export function paintObservatory(ctx: CanvasRenderingContext2D, w: number, h: number, th: Theme) {
  const bg = ctx.createLinearGradient(0, 0, w * 0.5, h);
  bg.addColorStop(0, th.bgTop);
  bg.addColorStop(1, th.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  glow(ctx, w * 0.68, h * 0.38, w * 0.48, th.accentSoft);
  glow(ctx, w * 0.16, h * 0.2, w * 0.38, 'rgba(104,91,188,0.14)');
  for (let i = 0; i < 150; i++) {
    ctx.fillStyle = `rgba(208,237,240,${0.12 + noise(i + 3) * 0.5})`;
    const x = noise(i + 1) * w, y = noise(i + 501) * h;
    const r = noise(i + 71) > 0.95 ? 1.6 : 0.7;
    ctx.fillRect(x, y, r, r);
    if (r > 1) {
      ctx.globalAlpha = 0.3;
      ctx.fillRect(x - 3, y + 0.5, 7, 0.5);
      ctx.fillRect(x + 0.5, y - 3, 0.5, 7);
      ctx.globalAlpha = 1;
    }
  }
  // Distant observatory towers, their windows, and connecting sky bridges.
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < 15; i++) {
      const x = i * w / 13 - 30 + layer * 43;
      const bw = 28 + noise(i + 70) * 45;
      const top = h * (0.5 + noise(i + layer * 21) * 0.3);
      ctx.fillStyle = layer ? '#0b1923' : '#10232e';
      ctx.globalAlpha = layer ? 0.85 : 0.55;
      ctx.fillRect(x, top, bw, h - top);
      ctx.beginPath();
      ctx.ellipse(x + bw / 2, top, bw / 2, bw * 0.45, 0, Math.PI, TAU);
      ctx.fill();
      ctx.fillRect(x + bw / 2 - 1, top - bw * 0.65, 2, bw * 0.3);
      ctx.fillRect(x + bw, top + 40, w / 13, 4);
      ctx.fillStyle = th.accent;
      ctx.globalAlpha = 0.1;
      for (let y = top + 15; y < h; y += 21) {
        ctx.fillRect(x + bw * 0.3, y, 2, 7);
        ctx.fillRect(x + bw * 0.7, y, 2, 7);
      }
    }
  }
  ctx.globalAlpha = 1;
  // Subtle overhead shafts keep the architecture in the distance.
  for (let i = 0; i < 3; i++) {
    const x = w * (0.3 + i * 0.3);
    const light = ctx.createLinearGradient(x, 0, x - 100, h);
    light.addColorStop(0, 'rgba(163,226,226,0.035)');
    light.addColorStop(1, 'transparent');
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 35, 0);
    ctx.lineTo(x - 80, h); ctx.lineTo(x - 230, h); ctx.fill();
  }
}

export function drawOrrery(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, th: Theme, strength = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = th.accent;
  ctx.lineWidth = 1;
  for (let ring = 0; ring < 4; ring++) {
    ctx.save();
    ctx.rotate(time * (ring % 2 ? -0.025 : 0.018) + ring * 0.4);
    const rad = r * (0.48 + ring * 0.175);
    ctx.globalAlpha = strength * (ring === 3 ? 0.19 : 0.1);
    ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, rad + 5, 0, TAU); ctx.stroke();
    for (let i = 0; i < 60; i++) {
      const a = i * TAU / 60;
      const inner = rad - (i % 5 === 0 ? 10 : 3);
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); ctx.stroke();
    }
    ctx.globalAlpha = strength * 0.5;
    ctx.fillStyle = ring % 2 ? '#d5b97e' : th.accent;
    ctx.beginPath(); ctx.arc(rad, 0, ring === 3 ? 3 : 2, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = strength * 0.13;
  ctx.rotate(-0.5);
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.35, 0, 0, TAU); ctx.stroke();
  ctx.rotate(1.1);
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.35, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}

export function drawMotes(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, th: Theme) {
  ctx.save();
  for (let i = 0; i < 32; i++) {
    const x = (noise(i + 300) * w + Math.sin(time * 0.2 + i) * 15 + w) % w;
    const y = (noise(i + 900) * h - time * (2 + noise(i) * 5) % h + h) % h;
    ctx.globalAlpha = 0.1 + (Math.sin(time * 0.8 + i * 2.3) + 1) * 0.16;
    ctx.fillStyle = i % 4 ? th.accent : '#ffe5b0';
    ctx.beginPath(); ctx.arc(x, y, i % 5 ? 1 : 1.8, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/** A lit glass sphere with a tiny expressive face, reused by the title scene. */
export function drawOrb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, core: string, rim: string, time: number, look = 0) {
  ctx.save();
  ctx.translate(x, y);
  const body = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.05, r * 0.15, r * 0.2, r * 1.1);
  body.addColorStop(0, '#ffffff'); body.addColorStop(0.35, core);
  body.addColorStop(0.78, rim); body.addColorStop(1, '#4a646d');
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = rim; ctx.lineWidth = Math.max(1, r * 0.06); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = r * 0.06;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 3.7, 4.9); ctx.stroke();
  const blink = Math.sin(time * 1.1) > 0.996 ? 0.08 : 1;
  ctx.fillStyle = '#183039';
  for (const ex of [-0.23, 0.23]) {
    ctx.beginPath(); ctx.ellipse(r * (ex + look * 0.1), r * 0.04, r * 0.09, r * 0.15 * blink, 0, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(24,48,57,0.65)'; ctx.lineWidth = Math.max(0.8, r * 0.04);
  ctx.beginPath(); ctx.arc(look * r * 0.1, r * 0.19, r * 0.1, 0.1, Math.PI - 0.1); ctx.stroke();
  ctx.restore();
}
