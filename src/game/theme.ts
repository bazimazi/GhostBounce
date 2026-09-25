// Visual identity: each world has its own palette; echoes use a fixed,
// colour-blind-conscious set of hues that are always paired with numbers.

export interface Theme {
  bgTop: string;
  bgBottom: string;
  solid: string;
  solidEdge: string;
  solidDark: string;
  accent: string;
  accentSoft: string;
  text: string;
  ring: string;
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

export function worldTheme(world: number): Theme {
  const spec: Record<number, [number, number, number, number]> = {
    // bg hue, bg sat, accent hue, accent sat
    0: [225, 30, 190, 70],
    1: [222, 38, 186, 72],
    2: [24, 30, 38, 80],
    3: [335, 30, 350, 78],
    4: [42, 28, 46, 85],
    5: [150, 26, 105, 60],
    6: [268, 30, 285, 70],
    7: [215, 12, 45, 30],
  };
  const [bh, bs, ah, as] = spec[world] ?? spec[0];
  return {
    bgTop: hsl(bh, bs, 12),
    bgBottom: hsl(bh, bs + 5, 6),
    solid: hsl(bh, bs * 0.7, 22),
    solidEdge: hsl(ah, as * 0.6, 55),
    solidDark: hsl(bh, bs * 0.7, 15),
    accent: hsl(ah, as, 62),
    accentSoft: hsl(ah, as, 62, 0.25),
    text: hsl(ah, 30, 88),
    ring: hsl(ah, as, 70, 0.07),
  };
}

export const ECHO_COLORS = ['#4fd1c5', '#b794f4', '#f6ad55', '#f687b3', '#68d391', '#63b3ed', '#fc8181', '#faf089'];
export const echoColor = (id: number) => ECHO_COLORS[id % ECHO_COLORS.length];

/** Signal wiring colours + glyphs so connections read without colour alone. */
export const SIGNAL_COLORS = ['#f6e05e', '#90cdf4', '#fbb6ce', '#9ae6b4', '#fbd38d', '#d6bcfa', '#81e6d9', '#feb2b2'];
export const SIGNAL_GLYPHS = ['●', '▲', '■', '◆', '★', '✚', '⬟', '✦'];

export interface Skin {
  id: string;
  name: string;
  core: string;
  rim: string;
  glow: string;
  /** Unlock requirement. */
  shards?: number;
  marks?: number;
}

export const SKINS: Skin[] = [
  { id: 'dawn', name: 'Dawn', core: '#fff6df', rim: '#ffd89b', glow: 'rgba(255,220,150,0.55)' },
  { id: 'tide', name: 'Tide', core: '#e6fffb', rim: '#81e6d9', glow: 'rgba(129,230,217,0.5)', shards: 3 },
  { id: 'ember', name: 'Ember', core: '#fff1e6', rim: '#fc8181', glow: 'rgba(252,129,129,0.5)', shards: 7 },
  { id: 'verdant', name: 'Verdant', core: '#f0fff4', rim: '#68d391', glow: 'rgba(104,211,145,0.5)', marks: 40 },
  { id: 'nebula', name: 'Nebula', core: '#faf5ff', rim: '#b794f4', glow: 'rgba(183,148,244,0.55)', shards: 12 },
  { id: 'gilded', name: 'Gilded', core: '#fffff0', rim: '#ecc94b', glow: 'rgba(236,201,75,0.6)', marks: 90 },
  { id: 'archive', name: 'Archivist', core: '#ffffff', rim: '#a0aec0', glow: 'rgba(226,232,240,0.7)', shards: 20 },
];

export interface Trail {
  id: string;
  name: string;
  marks?: number;
  shards?: number;
}

export const TRAILS: Trail[] = [
  { id: 'dots', name: 'Dotted' },
  { id: 'ribbon', name: 'Ribbon', marks: 20 },
  { id: 'sparks', name: 'Sparks', marks: 60 },
  { id: 'comet', name: 'Comet', shards: 16 },
];
