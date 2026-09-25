import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, SaveManager, checksum, freshSave, migrate, type KV } from '../src/game/save';

class MemStore implements KV {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('save system', () => {
  it('round-trips progress', () => {
    const store = new MemStore();
    const a = new SaveManager(store);
    a.level('w1-1').done = true;
    a.data.stats.takes = 12;
    a.save();
    const b = new SaveManager(store);
    expect(b.data.levels['w1-1'].done).toBe(true);
    expect(b.data.stats.takes).toBe(12);
  });

  it('alternates slots and loads the newest valid one', () => {
    const store = new MemStore();
    const a = new SaveManager(store);
    a.data.stats.takes = 1;
    a.save();
    a.data.stats.takes = 2;
    a.save();
    expect(store.m.size).toBe(2);
    expect(new SaveManager(store).data.stats.takes).toBe(2);
  });

  it('survives a corrupted (interrupted) latest write by falling back to the previous slot', () => {
    const store = new MemStore();
    const a = new SaveManager(store);
    a.data.stats.takes = 1;
    a.save(); // gen 1 -> slot 1
    a.data.stats.takes = 2;
    a.save(); // gen 2 -> slot 0
    // Simulate a torn write of the newest slot.
    store.setItem('ghostbounce.save.0', store.getItem('ghostbounce.save.0')!.slice(0, 40));
    const b = new SaveManager(store);
    expect(b.recovered).toBe(true);
    expect(b.data.stats.takes).toBe(1);
  });

  it('rejects slots whose checksum does not match', () => {
    const store = new MemStore();
    const a = new SaveManager(store);
    a.data.stats.takes = 5;
    a.save();
    const key = [...store.m.keys()][0];
    const slot = JSON.parse(store.getItem(key)!);
    slot.body = slot.body.replace('"takes":5', '"takes":999');
    store.setItem(key, JSON.stringify(slot));
    const b = new SaveManager(store);
    expect(b.data.stats.takes).toBe(0);
    expect(b.recovered).toBe(true);
  });

  it('migrates a version 1 save', () => {
    const v1 = { version: 1, levels: { 'w1-1': { done: true, bestEchoes: 0, bestTime: 5, shard: true, attempts: 3 } }, stats: { takes: 7 }, settings: { master: 0.3 } };
    const d = migrate(v1);
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.levels['w1-1'].shard).toBe(true);
    expect(d.stats.takes).toBe(7);
    expect(d.stats.deaths).toBe(0);
    expect(d.settings.master).toBe(0.3);
    expect(d.settings.bindings.jump.length).toBeGreaterThan(0);
    expect(d.daily).toEqual({});
  });

  it('fills in settings added after the save was written', () => {
    const old = freshSave() as unknown as Record<string, unknown>;
    const settings = { ...(old.settings as Record<string, unknown>) };
    delete settings.highContrast;
    const d = migrate({ ...old, settings });
    expect(d.settings.highContrast).toBe(false);
  });

  it('exports and imports a save code', () => {
    const a = new SaveManager(new MemStore());
    a.level('w2-3').done = true;
    const code = a.export();
    const b = new SaveManager(new MemStore());
    b.import(code);
    expect(b.data.levels['w2-3'].done).toBe(true);
  });

  it('keeps working without storage', () => {
    const a = new SaveManager(null);
    a.level('x').done = true;
    expect(() => a.save()).not.toThrow();
  });

  it('checksum is stable', () => {
    expect(checksum('ghost')).toBe(checksum('ghost'));
    expect(checksum('ghost')).not.toBe(checksum('ghosT'));
  });
});
