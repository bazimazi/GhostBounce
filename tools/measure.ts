// Prints key movement measurements (in tiles) used by the level design guide.
import { Bot } from '../src/core/bot';
import { compileLevel } from '../src/core/level';
import { Session } from '../src/core/session';
import type { LevelDef, ObjDef } from '../src/core/types';

const W = '########################################';
const E = '#......................................#';
function lvl(objects: ObjDef[], floor = W, extra: Partial<LevelDef> = {}): LevelDef {
  return { id: 'm', name: 'm', world: 0, map: [W, ...Array(15).fill(E), '#..P...................................#', floor], loopSeconds: 30, maxEchoes: 3, parEchoes: 0, parTime: 9, objects: [...objects, { type: 'exit', x: 38, y: 1 }], objective: '', hints: [], solution: [], ...extra };
}
function run(def: LevelDef, scripts: string[]) {
  const s = new Session(compileLevel(def));
  let minY = Infinity, maxX = -Infinity, startX = 0;
  scripts.forEach((sc, i) => {
    const bot = new Bot(sc);
    if (i === scripts.length - 1) { startX = s.player.x; }
    for (let g = 0; g < 3000; g++) {
      const m = bot.next(s.player, s.world.tick);
      if (bot.finished) break;
      s.tick(m);
      if (i === scripts.length - 1) { minY = Math.min(minY, s.player.y); maxX = Math.max(maxX, s.player.x); }
      if (s.status !== 'running') break;
    }
    if (i < scripts.length - 1) { s.endTake(); s.commit(); }
  });
  const floorY = 17 * 32 - 11;
  return { rise: ((floorY - minY) / 32).toFixed(2), maxX: ((maxX - startX) / 32).toFixed(2) };
}
console.log('full jump (bottom rise, tiles):', run(lvl([]), ['j 30; w 60']).rise);
console.log('tap jump:', run(lvl([]), ['j 4; w 60']).rise);
console.log('running jump horizontal reach (to landing):', run(lvl([]), ['r 40; jr 36; w 30']).maxX);
console.log('spring (default 860):', run(lvl([{ type: 'spring', x: 6, y: 16 }]), ['go 6; w 80']).rise);
console.log('echo bounce, no jump:', run(lvl([]), ['go 8; w 600; end', 'go 6; j 20; land 8; w 80']).rise);
console.log('echo bounce + jump:', run(lvl([]), ['go 8; w 600; end', 'go 6; j 20; land 8; j 30; w 80']).rise);
const rubber = '#' + '='.repeat(38) + '#';
console.log('rubber floor bounce steady:', run(lvl([], rubber), ['j 30; w 200; w 60']).rise);
console.log('rubber jump:', run(lvl([], rubber), ['sq 60; j 30; w 80']).rise);
console.log('burst horizontal from standstill (ground):', run(lvl([], W, { abilities: ['burst'] }), ['w 10; b r; w 60']).maxX);
console.log('burst up from jump apex (rise):', run(lvl([], W, { abilities: ['burst'] }), ['j 24; b u; w 60']).rise);
console.log('fan up region (2600):', run(lvl([{ type: 'fan', x: 5, y: 8, w: 3, h: 9, dir: 'up' }]), ['go 6; w 120']).rise);
