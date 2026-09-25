// Level authoring tool: runs a level's reference solution headlessly and
// prints a trace, so levels can be designed and verified without a browser.
//
//   npm run solve -- w1-2            trace one level
//   npm run solve -- w1-2 --every 10 sample every 10 ticks (default 20)
//   npm run solve -- all             check every level's solution
//   npm run solve -- w1-2 --map      print the map with tile coordinates

import { runSolution } from '../src/core/bot';
import { TILE } from '../src/core/constants';
import { compileLevel } from '../src/core/level';
import { Session } from '../src/core/session';
import { ALL_LEVELS, findLevel } from '../src/levels';

const args = process.argv.slice(2);
const target = args[0];
const everyIdx = args.indexOf('--every');
const every = everyIdx >= 0 ? parseInt(args[everyIdx + 1], 10) : 20;
const tiles = (v: number) => (v / TILE - 0.5).toFixed(2);

if (!target) {
  console.log('usage: npm run solve -- <level-id|all> [--every N] [--map]');
  process.exit(1);
}

if (target === 'all') {
  let failed = 0;
  for (const def of ALL_LEVELS) {
    try {
      const res = runSolution(new Session(compileLevel(def)), def.solution);
      const summary = res.takes.map((t) => `${t.ended}@${t.ticks}`).join(' ');
      console.log(`${res.solved ? 'OK  ' : 'FAIL'} ${def.id.padEnd(8)} ${def.name.padEnd(28)} ${summary}${res.error ? ' ' + res.error : ''}`);
      if (!res.solved) failed++;
    } catch (e) {
      console.log(`ERR  ${def.id.padEnd(8)} ${(e as Error).message}`);
      failed++;
    }
  }
  console.log(`${ALL_LEVELS.length - failed}/${ALL_LEVELS.length} solved`);
  process.exit(failed ? 1 : 0);
}

const def = findLevel(target);
if (!def) {
  console.log(`no level "${target}"`);
  process.exit(1);
}

if (args.includes('--map')) {
  const cols = Math.max(...def.map.map((r) => r.length));
  let header = '    ';
  for (let x = 0; x < cols; x++) header += x % 10;
  console.log(header);
  def.map.forEach((row, y) => console.log(String(y).padStart(3) + ' ' + row));
}

const level = compileLevel(def);
const session = new Session(level);
console.log(`${def.id} "${def.name}" — ${def.solution.length} take(s), loop ${def.loopSeconds}s, max echoes ${def.maxEchoes}`);
const res = runSolution(session, def.solution, (s, take) => {
  const w = s.world;
  const p = s.player;
  const evs = s.lastEvents
    .filter((e) => e.t !== 'bounce' || e.speed > 200)
    .map((e) => {
      switch (e.t) {
        case 'plate':
        case 'receiver':
          return `${e.t}:${e.id}=${e.on ? 'on' : 'off'}`;
        case 'switch':
          return `switch:${e.id}=${e.on ? 'on' : 'off'}(b${e.b})`;
        case 'door':
          return `door${e.i}:${e.open ? 'open' : 'close'}`;
        case 'petrify':
        case 'vanish':
        case 'jump':
        case 'burst':
        case 'anchor':
        case 'spring':
          return `${e.t}(b${e.b} @${tiles(e.x)},${tiles(e.y)})`;
        case 'bounce':
          return `bounce(b${e.b} ${Math.round(e.speed)})`;
        default:
          return e.t;
      }
    });
  const diverged = [...s.echoStatus.entries()].filter(([, st]) => st.divergedAt === w.tick - 1).map(([id]) => `DIVERGED(echo${id})`);
  if (w.tick % every === 0 || evs.length || diverged.length) {
    console.log(
      `  T${take + 1} t=${String(w.tick).padStart(4)} x=${tiles(p.x).padStart(6)} y=${tiles(p.y).padStart(6)} v=(${Math.round(p.vx)},${Math.round(p.vy)})${p.air === 0 ? ' G' : ''} ${[...evs, ...diverged].join(' ')}`,
    );
  }
});
for (const [i, t] of res.takes.entries()) console.log(`take ${i + 1}: ended by ${t.ended} at tick ${t.ticks}`);
console.log(res.solved ? 'SOLVED' : `NOT SOLVED${res.error ? ': ' + res.error : ''}`);
process.exit(res.solved ? 0 : 1);
