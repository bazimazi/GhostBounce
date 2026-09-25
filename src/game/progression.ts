import type { LevelDef } from '../core/types';
import { CAMPAIGN_LEVELS, CHALLENGES, WORLDS, type Challenge } from '../levels';
import type { LevelRecord, SaveData } from './save';
import { SKINS, TRAILS, type Skin, type Trail } from './theme';

// Progression rules: what is unlocked, what each level's mastery marks are,
// and which rewards the player has earned. Everything derives from the save
// data, so there is a single source of truth.

export interface Marks {
  solved: boolean;
  echoes: boolean;
  time: boolean;
  shard: boolean;
  hasShard: boolean;
}

const hasShardObj = (def: LevelDef) => def.objects.some((o) => o.type === 'shard');

export function marksFor(def: LevelDef, rec: LevelRecord | undefined): Marks {
  const hasShard = hasShardObj(def);
  return {
    solved: !!rec?.done,
    echoes: !!rec?.done && rec.bestEchoes !== null && rec.bestEchoes <= def.parEchoes,
    time: !!rec?.done && rec.bestTime !== null && rec.bestTime <= def.parTime,
    shard: hasShard && !!rec?.shard,
    hasShard,
  };
}

export function markCount(m: Marks) {
  return (m.solved ? 1 : 0) + (m.echoes ? 1 : 0) + (m.time ? 1 : 0) + (m.shard ? 1 : 0);
}
export const markMax = (m: Marks) => 3 + (m.hasShard ? 1 : 0);

export function totals(save: SaveData) {
  let marks = 0;
  let possible = 0;
  let shards = 0;
  let possibleShards = 0;
  let solved = 0;
  for (const def of [...CAMPAIGN_LEVELS, ...CHALLENGES.map((c) => c.def)]) {
    const m = marksFor(def, save.levels[def.id]);
    marks += markCount(m);
    possible += markMax(m);
    if (m.hasShard) possibleShards++;
    if (m.shard) shards++;
    if (m.solved) solved++;
  }
  return { marks, possible, shards, possibleShards, solved };
}

export function worldComplete(save: SaveData, n: number) {
  const w = WORLDS.find((x) => x.n === n);
  return !!w && w.levels.every((l) => save.levels[l.id]?.done);
}

export function worldUnlocked(save: SaveData, n: number) {
  return n === 1 || worldComplete(save, n - 1);
}

export function levelUnlocked(save: SaveData, def: LevelDef) {
  if (!worldUnlocked(save, def.world)) return false;
  const w = WORLDS.find((x) => x.n === def.world)!;
  const i = w.levels.indexOf(def);
  return i <= 0 || !!save.levels[w.levels[i - 1].id]?.done;
}

export function nextLevel(def: LevelDef): LevelDef | null {
  const i = CAMPAIGN_LEVELS.indexOf(def);
  return i >= 0 && i < CAMPAIGN_LEVELS.length - 1 ? CAMPAIGN_LEVELS[i + 1] : null;
}

/** First unsolved unlocked level, used by "Continue". */
export function continueLevel(save: SaveData): LevelDef {
  if (save.lastLevel) {
    const last = CAMPAIGN_LEVELS.find((l) => l.id === save.lastLevel);
    if (last && !save.levels[last.id]?.done && levelUnlocked(save, last)) return last;
  }
  return CAMPAIGN_LEVELS.find((l) => levelUnlocked(save, l) && !save.levels[l.id]?.done) ?? CAMPAIGN_LEVELS[CAMPAIGN_LEVELS.length - 1];
}

export interface MasteryUnlock {
  id: 'sight' | 'foresight';
  name: string;
  desc: string;
  world: number;
}

/** Upgrades to the recording tools themselves, earned by finishing worlds. */
export const MASTERY: MasteryUnlock[] = [
  {
    id: 'sight',
    name: 'Echo Sight',
    desc: 'Plan view (P / Tab): freeze time and scrub through the loop to see exactly where every echo will be.',
    world: 1,
  },
  {
    id: 'foresight',
    name: 'Long Foresight',
    desc: 'Echo path previews reach three seconds ahead instead of one and a half.',
    world: 3,
  },
];

export function hasMastery(save: SaveData, id: MasteryUnlock['id']) {
  const m = MASTERY.find((x) => x.id === id)!;
  return worldComplete(save, m.world);
}

export const ABILITIES = [
  { id: 'burst', name: 'Burst', world: 3, desc: 'A sharp dash in any direction (Shift / J), once per airtime. Smashes cracked walls.' },
  { id: 'anchor', name: 'Anchor', world: 6, desc: 'Hold (C / K) to freeze in mid-air for a moment — a perfect perch for later echoes.' },
] as const;

export function abilityLearned(save: SaveData, world: number) {
  const w = WORLDS.find((x) => x.n === world);
  return !!w && !!save.levels[w.levels[0].id]?.done;
}

const meets = (save: SaveData, need: { shards?: number; marks?: number }) => {
  const t = totals(save);
  return (need.shards === undefined || t.shards >= need.shards) && (need.marks === undefined || t.marks >= need.marks);
};
export const skinUnlocked = (save: SaveData, s: Skin) => meets(save, s);
export const trailUnlocked = (save: SaveData, t: Trail) => meets(save, t);
export const challengeUnlocked = (save: SaveData, c: Challenge) => totals(save).marks >= c.unlockMarks;

/** A stable snapshot of every unlockable, for "new unlock" announcements. */
export function unlockSet(save: SaveData): Set<string> {
  const s = new Set<string>();
  for (const w of WORLDS) if (worldUnlocked(save, w.n)) s.add(`world:${w.n}|World ${w.n}: ${w.name}`);
  for (const m of MASTERY) if (hasMastery(save, m.id)) s.add(`mastery:${m.id}|${m.name}`);
  for (const sk of SKINS) if (skinUnlocked(save, sk)) s.add(`skin:${sk.id}|Ball skin: ${sk.name}`);
  for (const t of TRAILS) if (trailUnlocked(save, t)) s.add(`trail:${t.id}|Trail: ${t.name}`);
  for (const c of CHALLENGES) if (challengeUnlocked(save, c)) s.add(`challenge:${c.def.id}|Challenge: ${c.def.name}`);
  if (dailyUnlocked(save)) s.add('daily|Daily Echo puzzles');
  return s;
}

export const dailyUnlocked = (save: SaveData) => worldComplete(save, 2);
