import type { Dir, LevelDef, ObjDef } from './types';

// Horizontal mirroring of a level and its reference solution. Used by the
// Daily Echo mode: a familiar puzzle seen through the looking glass. Every
// mirrored level is verified by the test suite, just like the originals.

const flipDir = (d: Dir): Dir => (d === 'left' ? 'right' : d === 'right' ? 'left' : d);

export function mirrorLevel(def: LevelDef, id = `${def.id}-m`): LevelDef {
  const cols = Math.max(...def.map.map((r) => r.length));
  const mx = (x: number, w = 1) => cols - x - w;
  const objects: ObjDef[] = def.objects.map((o): ObjDef => {
    switch (o.type) {
      case 'plate':
        return { ...o, x: mx(o.x, o.w ?? 1) };
      case 'door':
      case 'breakable':
      case 'fan':
      case 'veil':
        return 'dir' in o ? { ...o, x: mx(o.x, o.w), dir: flipDir(o.dir) } : { ...o, x: mx(o.x, o.w) };
      case 'platform':
        return { ...o, x: mx(o.x, o.w), to: o.to.map(([x, y]) => [mx(x, o.w), y] as [number, number]) };
      case 'spring':
        return { ...o, x: mx(o.x), dir: o.dir ? flipDir(o.dir) : o.dir };
      case 'laser':
        return { ...o, x: mx(o.x), dir: flipDir(o.dir) };
      case 'sign':
        return { ...o, x: mx(o.x) };
      default:
        return { ...o, x: mx(o.x) };
    }
  });
  return {
    ...def,
    id,
    name: `${def.name} (mirrored)`,
    map: def.map.map((r) => r.padEnd(cols, '.').split('').reverse().join('')),
    objects,
    solution: def.solution.map((s) => mirrorScript(s, cols)),
  };
}

export function mirrorScript(src: string, cols: number): string {
  return src
    .split(/[;\n]/)
    .map((raw) => {
      const parts = raw.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return '';
      const [op, a, ...rest] = parts;
      const swapLR = (s: string) => s.replace(/[lrLR]/g, (c) => ({ l: 'r', r: 'l', L: 'R', R: 'L' })[c]!);
      switch (op) {
        case 'r':
          return ['l', a, ...rest].filter(Boolean).join(' ');
        case 'l':
          return ['r', a, ...rest].filter(Boolean).join(' ');
        case 'jr':
          return ['jl', a].filter(Boolean).join(' ');
        case 'jl':
          return ['jr', a].filter(Boolean).join(' ');
        case 'k':
          return ['k', swapLR(a), ...rest].join(' ');
        case 'b':
          return ['b', swapLR(a ?? '')].join(' ').trim();
        case 'go':
          return `go ${cols - 1 - parseFloat(a)}`;
        case 'land':
          return a === undefined ? 'land' : `land ${cols - 1 - parseFloat(a)}`;
        default:
          return parts.join(' ');
      }
    })
    .filter(Boolean)
    .join('; ');
}
