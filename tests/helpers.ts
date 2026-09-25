import { Bot } from '../src/core/bot';
import { compileLevel } from '../src/core/level';
import { Session } from '../src/core/session';
import type { LevelDef, ObjDef } from '../src/core/types';

export const ROOM = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..P...............#',
  '####################',
];

export function testLevel(objects: ObjDef[], map: string[] = ROOM, extra: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 'test',
    name: 'Test',
    world: 0,
    map,
    loopSeconds: 30,
    maxEchoes: 4,
    parEchoes: 0,
    parTime: 10,
    objects: [...objects, ...(objects.some((o) => o.type === 'exit') ? [] : [{ type: 'exit' as const, x: 18, y: 1 }])],
    objective: '',
    hints: [],
    solution: [],
    ...extra,
  };
}

export function session(def: LevelDef) {
  return new Session(compileLevel(def));
}

/** Drives the live player with a bot script until it finishes; returns the session. */
export function play(s: Session, script: string, onTick?: (s: Session) => void) {
  const bot = new Bot(script);
  for (let guard = 0; guard < 5000; guard++) {
    const mask = bot.next(s.player, s.world.tick);
    if (bot.finished) break;
    s.tick(mask);
    onTick?.(s);
    if (s.status !== 'running') break;
  }
  return s;
}

export const tileX = (px: number) => px / 32 - 0.5;
