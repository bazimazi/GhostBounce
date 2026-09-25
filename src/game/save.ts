import { DEFAULT_BINDINGS, type Bindings } from './input';

// Versioned, corruption-resistant persistence. Saves alternate between two
// slots, each carrying a generation counter and checksum; loading picks the
// newest slot whose checksum verifies. An interrupted write can therefore
// only ever damage the slot being written, never the last good save.

export const SAVE_VERSION = 2;
const KEY = 'ghostbounce.save';

export interface LevelRecord {
  done: boolean;
  bestEchoes: number | null;
  /** Seconds of the fastest winning take. */
  bestTime: number | null;
  shard: boolean;
  attempts: number;
}

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  gameSpeed: number;
  shake: boolean;
  ghostPaths: boolean;
  highContrast: boolean;
  touch: 'auto' | 'on' | 'off';
  bindings: Bindings;
}

export interface Stats {
  takes: number;
  echoes: number;
  deaths: number;
  bounces: number;
  playSeconds: number;
}

export interface SaveData {
  version: number;
  levels: Record<string, LevelRecord>;
  settings: Settings;
  stats: Stats;
  skin: string;
  trail: string;
  lastLevel: string | null;
  /** Daily puzzle completion keyed by date string. */
  daily: Record<string, boolean>;
  /** Ids of unlock notifications already shown. */
  seen: string[];
}

export function defaultSettings(): Settings {
  return {
    master: 0.8,
    music: 0.5,
    sfx: 0.8,
    gameSpeed: 1,
    shake: true,
    ghostPaths: true,
    highContrast: false,
    touch: 'auto',
    bindings: structuredClone(DEFAULT_BINDINGS),
  };
}

export function freshSave(): SaveData {
  return {
    version: SAVE_VERSION,
    levels: {},
    settings: defaultSettings(),
    stats: { takes: 0, echoes: 0, deaths: 0, bounces: 0, playSeconds: 0 },
    skin: 'dawn',
    trail: 'dots',
    lastLevel: null,
    daily: {},
    seen: [],
  };
}

/** Upgrades older save formats step by step. */
export function migrate(raw: Record<string, unknown>): SaveData {
  let d = raw as Record<string, unknown> & { version?: number };
  if (!d.version || d.version < 1) throw new Error('unknown save format');
  if (d.version === 1) {
    // v1 stored settings flat on the root and had no daily / seen lists.
    const base = freshSave();
    const v1 = d as Record<string, unknown>;
    d = {
      ...base,
      levels: (v1.levels as SaveData['levels']) ?? {},
      stats: { ...base.stats, ...(v1.stats as Partial<Stats>) },
      settings: { ...base.settings, ...((v1.settings as Partial<Settings>) ?? {}) },
      version: 2,
    };
  }
  const base = freshSave();
  const out = { ...base, ...d } as SaveData;
  out.settings = { ...base.settings, ...out.settings };
  out.settings.bindings = { ...base.settings.bindings, ...out.settings.bindings };
  out.stats = { ...base.stats, ...out.stats };
  out.version = SAVE_VERSION;
  return out;
}

export function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

interface Slot {
  gen: number;
  sum: string;
  body: string;
}

export class SaveManager {
  data: SaveData;
  private gen = 0;
  private store: KV | null;
  /** Set when a slot failed verification on load (shown to the player). */
  recovered = false;

  constructor(store: KV | null) {
    this.store = store;
    this.data = this.load();
  }

  private readSlot(i: number): (Slot & { data: SaveData }) | null {
    try {
      const txt = this.store?.getItem(`${KEY}.${i}`);
      if (!txt) return null;
      const slot = JSON.parse(txt) as Slot;
      if (checksum(slot.body) !== slot.sum) {
        this.recovered = true;
        return null;
      }
      return { ...slot, data: migrate(JSON.parse(slot.body)) };
    } catch {
      this.recovered = true;
      return null;
    }
  }

  private load(): SaveData {
    const slots = [this.readSlot(0), this.readSlot(1)].filter((s): s is Slot & { data: SaveData } => s !== null);
    if (slots.length === 0) return freshSave();
    slots.sort((a, b) => b.gen - a.gen);
    this.gen = slots[0].gen;
    return slots[0].data;
  }

  get hasProgress() {
    return Object.values(this.data.levels).some((l) => l.done);
  }

  save() {
    if (!this.store) return;
    this.gen++;
    const body = JSON.stringify(this.data);
    const slot: Slot = { gen: this.gen, sum: checksum(body), body };
    try {
      this.store.setItem(`${KEY}.${this.gen % 2}`, JSON.stringify(slot));
    } catch {
      // Storage full or unavailable: keep playing, progress stays in memory.
    }
  }

  reset() {
    const settings = this.data.settings;
    this.data = freshSave();
    this.data.settings = settings;
    this.save();
  }

  level(id: string): LevelRecord {
    return (this.data.levels[id] ??= { done: false, bestEchoes: null, bestTime: null, shard: false, attempts: 0 });
  }

  export(): string {
    return btoa(unescape(encodeURIComponent(JSON.stringify(this.data))));
  }

  import(code: string) {
    const data = migrate(JSON.parse(decodeURIComponent(escape(atob(code.trim())))));
    this.data = data;
    this.save();
  }
}
