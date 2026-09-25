import type { Session } from '../core/session';
import type { Renderer } from './renderer';
import { echoColor } from './theme';

/** Timeline HUD drawn under the level: one lane per echo plus the live take. */
export function drawTimeline(r: Renderer, s: Session, time: number, opts: { plan: boolean; planTick: number; demo: boolean }) {
  const ctx = r.ctx;
  const L = r.level;
  const W = L.width;
  const H = r.hudHeight;
  r.withHud(() => {
    ctx.fillStyle = '#0a0c14';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, W, 1);

    const left = 118;
    const right = W - 150;
    const tw = right - left;
    const loop = L.loopTicks;
    const lanes = s.echoes.length + 1;
    const laneH = Math.min(12, (H - 18) / lanes);
    const top = 9;
    const xAt = (tick: number) => left + (Math.min(tick, loop) / loop) * tw;

    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    // Echo lanes.
    s.echoes.forEach((e, i) => {
      const y = top + i * laneH;
      const col = echoColor(e.id);
      ctx.textAlign = 'right';
      ctx.fillStyle = e.muted ? 'rgba(255,255,255,0.35)' : col;
      ctx.fillText(`${i + 1}${e.muted ? ' muted' : ''}`, left - 8, y + laneH / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(left, y + 1, tw, laneH - 3);
      ctx.globalAlpha = e.muted ? 0.25 : 0.75;
      ctx.fillStyle = col;
      ctx.fillRect(left, y + 2, xAt(e.inputs.length) - left, laneH - 5);
      ctx.globalAlpha = 1;
      if (e.endedBy === 'death') {
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'center';
        ctx.fillText('✕', xAt(e.inputs.length) + 6, y + laneH / 2);
      }
      const st = s.echoStatus.get(e.id);
      if (st && st.divergedAt >= 0) {
        ctx.fillStyle = '#fc8181';
        ctx.fillRect(xAt(st.divergedAt) - 1, y, 2, laneH - 1);
        ctx.textAlign = 'left';
        ctx.fillText('!', xAt(st.divergedAt) + 3, y + laneH / 2);
      }
    });
    // Live take lane.
    const py = top + s.echoes.length * laneH;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff6df';
    ctx.fillText(opts.demo ? 'demo' : 'you', left - 8, py + laneH / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(left, py + 1, tw, laneH - 3);
    ctx.fillStyle = '#fff6df';
    ctx.globalAlpha = 0.8;
    ctx.fillRect(left, py + 2, xAt(s.world.tick) - left, laneH - 5);
    ctx.globalAlpha = 1;

    // Playhead.
    const cur = opts.plan ? opts.planTick : s.world.tick;
    const cx = xAt(cur);
    ctx.fillStyle = opts.plan ? '#f6e05e' : '#ffffff';
    ctx.fillRect(cx - 1, top - 4, 2, lanes * laneH + 6);
    ctx.beginPath();
    ctx.moveTo(cx - 5, top - 7);
    ctx.lineTo(cx + 5, top - 7);
    ctx.lineTo(cx, top - 2);
    ctx.fill();

    // Second ticks.
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let sec = 0; sec <= L.def.loopSeconds; sec++) {
      const x = xAt(sec * 60);
      ctx.fillRect(x, H - 8, 1, sec % 5 === 0 ? 6 : 3);
    }

    // Right-hand readout.
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 13px system-ui, sans-serif';
    const secs = (cur / 60).toFixed(1);
    ctx.fillText(`${secs}s / ${L.def.loopSeconds}s`, right + 16, 18);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = s.liveEchoCount >= L.def.maxEchoes ? '#fbd38d' : '#a0aec0';
    ctx.fillText(`Echoes ${s.echoes.length}/${L.def.maxEchoes}`, right + 16, 38);
    ctx.fillStyle = '#718096';
    ctx.fillText(`Take ${s.takesStarted}`, right + 16, 56);
    void time;
  });
}
