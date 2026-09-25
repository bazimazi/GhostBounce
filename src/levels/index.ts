import { mirrorLevel } from '../core/mirror';
import type { LevelDef } from '../core/types';
import { CHALLENGE_DEFS } from './challenges';
import { WORLD1 } from './world1';
import { WORLD2 } from './world2';
import { WORLD3 } from './world3';
import { WORLD4 } from './world4';
import { WORLD5 } from './world5';
import { WORLD6 } from './world6';
import { WORLD7 } from './world7';

export interface WorldInfo {
  n: number;
  name: string;
  tagline: string;
  levels: LevelDef[];
}

export const WORLDS: WorldInfo[] = [
  { n: 1, name: 'First Echo', tagline: 'Every attempt leaves something behind.', levels: WORLD1 },
  { n: 2, name: 'Shared Weight', tagline: 'No one lifts the Horologe alone.', levels: WORLD2 },
  { n: 3, name: 'Momentum Lab', tagline: 'A bounce that remembers.', levels: WORLD3 },
  { n: 4, name: 'Temporal Machinery', tagline: 'Every gear keeps its own time.', levels: WORLD4 },
  { n: 5, name: 'The Living Maze', tagline: 'Failure, kept in stone.', levels: WORLD5 },
  { n: 6, name: 'Fractured Timelines', tagline: 'Many selves, one purpose.', levels: WORLD6 },
  { n: 7, name: 'The Infinite Archive', tagline: 'Everything you were, working together.', levels: WORLD7 },
].filter((w) => w.levels.length > 0);

export interface Challenge {
  def: LevelDef;
  /** Total mastery marks needed to unlock. */
  unlockMarks: number;
  kind: 'room' | 'trial';
  /** Short description of the twist. */
  rule: string;
}

export const CHALLENGES: Challenge[] = CHALLENGE_DEFS;

export const CAMPAIGN_LEVELS: LevelDef[] = WORLDS.flatMap((w) => w.levels);
export const ALL_LEVELS: LevelDef[] = [...CAMPAIGN_LEVELS, ...CHALLENGES.map((c) => c.def)];

export function findLevel(id: string): LevelDef | undefined {
  return ALL_LEVELS.find((l) => l.id === id) ?? (id.startsWith('daily-') ? dailyLevel(id.slice(6)) : undefined);
}

/** Levels eligible for the Daily Echo: multi-echo puzzles from World 2 on. */
export const DAILY_POOL: LevelDef[] = CAMPAIGN_LEVELS.filter((l) => l.world >= 2 && l.solution.length >= 2 && !l.noMirror);

/** The Daily Echo for a date (YYYY-MM-DD): a mirrored campaign puzzle. */
export function dailyLevel(date: string): LevelDef | undefined {
  if (DAILY_POOL.length === 0) return undefined;
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) h = Math.imul(h ^ date.charCodeAt(i), 16777619);
  const base = DAILY_POOL[(h >>> 0) % DAILY_POOL.length];
  const m = mirrorLevel(base, `daily-${date}`);
  return { ...m, name: `Daily Echo: ${base.name} (mirrored)` };
}

export const todayString = () => new Date().toISOString().slice(0, 10);
