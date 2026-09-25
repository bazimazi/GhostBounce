// Simulation constants. Units: pixels and seconds. The simulation runs at a
// fixed tick rate with a fixed number of substeps so that identical inputs
// always produce identical results (see docs/TECHNICAL_DESIGN.md).

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SUBSTEPS = 4;
export const SUB_DT = DT / SUBSTEPS;

export const TILE = 32;
export const BALL_RADIUS = 11;

export interface PhysicsTuning {
  gravity: number;
  maxRunSpeed: number;
  groundAccel: number;
  airAccel: number;
  groundDecel: number;
  airDrag: number;
  jumpSpeed: number;
  jumpCutFactor: number;
  coyoteTicks: number;
  jumpBufferTicks: number;
  restitution: number;
  bounceThreshold: number;
  maxFallSpeed: number;
  fastFallGravity: number;
  burstSpeed: number;
  burstTicks: number;
  anchorTicks: number;
  maxSpeed: number;
}

/** Default tuning. Levels may override individual values (e.g. low gravity). */
export const DEFAULT_TUNING: PhysicsTuning = {
  gravity: 1500,
  maxRunSpeed: 250,
  groundAccel: 1900,
  airAccel: 1150,
  groundDecel: 1300,
  airDrag: 120,
  jumpSpeed: 575,
  jumpCutFactor: 0.45,
  coyoteTicks: 6,
  jumpBufferTicks: 7,
  restitution: 0.42,
  bounceThreshold: 140,
  maxFallSpeed: 900,
  fastFallGravity: 2600,
  burstSpeed: 640,
  burstTicks: 9,
  anchorTicks: 150,
  maxSpeed: 1100,
};

/** Bounce behaviour per surface material. */
export type Material = 'stone' | 'rubber' | 'mud' | 'ice' | 'metal';

export const MATERIALS: Record<Material, { restitution: number; friction: number; minBounce: number }> = {
  stone: { restitution: 0.42, friction: 1, minBounce: 0 },
  metal: { restitution: 0.5, friction: 0.9, minBounce: 0 },
  // Rubber keeps nearly all energy and always rebounds at least to a useful height.
  rubber: { restitution: 0.92, friction: 1, minBounce: 520 },
  mud: { restitution: 0, friction: 2.2, minBounce: 0 },
  ice: { restitution: 0.3, friction: 0.08, minBounce: 0 },
};

/** Ticks a pressure plate stays active after the last ball leaves (smooths bounces). */
export const PLATE_HOLD_TICKS = 6;
/** Door/gate open speed in fraction-per-second. */
export const DOOR_SPEED = 4;
/** Distance in pixels at which a replaying ghost counts as diverged from its recording. */
export const DIVERGENCE_EPSILON = 1.5;
