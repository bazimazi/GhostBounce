// Per-tick input is a single byte bitmask. Recordings are arrays of these
// bytes, which keeps echoes tiny and makes replay trivially deterministic.

export const IN_LEFT = 1;
export const IN_RIGHT = 2;
export const IN_JUMP = 4;
export const IN_DOWN = 8;
export const IN_BURST = 16;
export const IN_ANCHOR = 32;
export const IN_UP = 64;

export type InputMask = number;

export const has = (mask: InputMask, bit: number) => (mask & bit) !== 0;
