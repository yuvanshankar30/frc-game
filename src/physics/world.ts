import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };
export type World = RAPIER.World;

let ready: Promise<void> | null = null;

/** Rapier is WASM; it must be initialized once before any world is created. */
export function initPhysics() {
  ready ??= RAPIER.init();
  return ready;
}

export const PHYSICS_DT = 1 / 120;

export function createWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = PHYSICS_DT;
  world.integrationParameters.numSolverIterations = 6;
  return world;
}

/** Collision groups: high 16 bits = membership, low 16 bits = filter. */
export const GROUP = {
  FIELD: 0x0001,
  ROBOT: 0x0002,
  FUEL: 0x0004,
  WHEEL: 0x0008,
  NET: 0x0010,
  /** Robot hopper walls: only collide with FUEL carried inside a robot. */
  HOPPER: 0x0020,
  /** FUEL inside a robot's hopper. */
  STORED: 0x0040,
  /** Bumper skirt to the carpet that only loose FUEL hits (keeps balls from wedging under bumpers). */
  SKIRT: 0x0080,
};

export function groups(member: number, filter: number) {
  return (member << 16) | filter;
}

export const ALL = 0xffff;

export const MATERIAL = {
  carpet: { friction: 0.9, restitution: 0.1 },
  steel: { friction: 0.4, restitution: 0.25 },
  polycarb: { friction: 0.3, restitution: 0.35 },
  fuel: { friction: 0.7, restitution: 0.45 },
  bumper: { friction: 0.6, restitution: 0.15 },
};
