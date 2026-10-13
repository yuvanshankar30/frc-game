import { G } from '../util/units';

/** Linear damping applied to FUEL bodies (must match FuelSystem). */
export const FUEL_AIR_DAMPING = 0.25;
/** Solver step: identical to the physics step so predictions match Rapier's integration. */
const DT = 1 / 120;
const K_DAMP = (c: number) => 1 / (1 + c * DT);

/**
 * Simulate a 2D shot (horizontal distance, height) using the same integration Rapier uses
 * for linear damping (v *= 1 / (1 + dt*c)). Returns the horizontal distance at which the
 * ball, on its way down, crosses height `h` — or null if it never reaches that height.
 */
export function rangeAtHeight(speed: number, elev: number, h: number, damping = FUEL_AIR_DAMPING): number | null {
  let x = 0;
  let y = 0;
  let vx = speed * Math.cos(elev);
  let vy = speed * Math.sin(elev);
  let apex = -Infinity;
  const k = K_DAMP(damping);
  for (let i = 0; i < 600; i++) {
    vy -= G * DT;
    vx *= k;
    vy *= k;
    const px = x;
    const py = y;
    x += vx * DT;
    y += vy * DT;
    apex = Math.max(apex, y);
    if (vy < 0 && py >= h && y < h) {
      const t = (py - h) / (py - y);
      return px + (x - px) * t;
    }
  }
  return apex >= h ? x : null;
}

/** Speed needed to hit a target `d` away and `h` above the exit at elevation `elev`. Null if impossible. */
export function solveSpeed(d: number, h: number, elev: number, maxSpeed = 30): number | null {
  let lo = 0.5;
  let hi = maxSpeed;
  const rHi = rangeAtHeight(hi, elev, h);
  if (rHi === null || rHi < d) return null;
  for (let it = 0; it < 20; it++) {
    const mid = (lo + hi) / 2;
    const r = rangeAtHeight(mid, elev, h);
    if (r === null || r < d) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Time of flight for a solved shot (used for shoot-on-the-move lead). */
export function flightTime(speed: number, elev: number, h: number): number {
  let y = 0;
  let vy = speed * Math.sin(elev);
  const k = K_DAMP(FUEL_AIR_DAMPING);
  for (let i = 0; i < 600; i++) {
    vy -= G * DT;
    vy *= k;
    const py = y;
    y += vy * DT;
    if (vy < 0 && py >= h && y < h) return (i + 1) * DT;
  }
  return 600 * DT;
}

export interface ShotSolution {
  elev: number; // rad
  speed: number; // m/s
  ok: boolean; // within the shooter's speed limits
}

/** Descent angle (rad, positive = falling) when the shot crosses height `h` on the way down. */
export function entryAngle(speed: number, elev: number, h: number): number {
  let y = 0;
  let vx = speed * Math.cos(elev);
  let vy = speed * Math.sin(elev);
  const k = K_DAMP(FUEL_AIR_DAMPING);
  for (let i = 0; i < 600; i++) {
    vy -= G * DT;
    vx *= k;
    vy *= k;
    const py = y;
    y += vy * DT;
    if (vy < 0 && py >= h && y < h) return Math.atan2(-vy, vx);
  }
  return 0;
}

/** Height of the shot (relative to the exit) when it is `x` out horizontally, on the way up or down; null if short. */
export function heightAtRange(speed: number, elev: number, x: number): number | null {
  let px = 0;
  let y = 0;
  let vx = speed * Math.cos(elev);
  let vy = speed * Math.sin(elev);
  const k = K_DAMP(FUEL_AIR_DAMPING);
  for (let i = 0; i < 600; i++) {
    vy -= G * DT;
    vx *= k;
    vy *= k;
    const nx = px + vx * DT;
    const ny = y + vy * DT;
    if (nx >= x) return y + ((ny - y) * (x - px)) / Math.max(1e-9, nx - px);
    px = nx;
    y = ny;
  }
  return null;
}

/** Ball center clearance (m) needed over the HUB's top frame relative to the aim height. */
export const RIM_CLEARANCE = 0.07;

/** The HUB's top frame along a shot: from where a ball first touches its outer edge to its inner edge (m from the
 * target, horizontally). */
export interface RimSpan {
  outer: number;
  inner: number;
}

/** Does a shot clear the HUB's top frame on its way to a target `d` away and `h` up? */
export function clearsRim(speed: number, elev: number, d: number, h: number, rim: RimSpan | null) {
  return !rim || [rim.outer, rim.inner].every((r) => r >= d || (heightAtRange(speed, elev, d - r) ?? -Infinity) >= h + RIM_CLEARANCE);
}

/** Steepest-enough entry for FUEL to drop cleanly through the HUB's opening. */
export const MIN_ENTRY = (42 * Math.PI) / 180;

/**
 * Choose launch elevation + speed for a target.
 * With a hood: the flattest angle (fastest, least drag-sensitive shot) whose descent into the
 * HUB is at least MIN_ENTRY and that clears the HUB's top frame (`rim`; the frame is square, so it's farther out on a
 * diagonal approach), within the speed limits. With a fixed angle: just solve speed.
 */
export function solveShot(
  d: number,
  h: number,
  shooter: { angle: number; hoodMin: number | null; hoodMax: number | null; minSpeed: number; maxSpeed: number },
  rim: RimSpan | null = null,
): ShotSolution {
  const DEG = Math.PI / 180;
  const candidates: number[] = [];
  if (shooter.hoodMin !== null && shooter.hoodMax !== null) {
    const lo = Math.min(shooter.hoodMin, shooter.hoodMax);
    const hi = Math.max(shooter.hoodMin, shooter.hoodMax);
    for (let a = lo; a <= hi + 1e-6; a += 3) candidates.push(a * DEG);
  } else {
    candidates.push(shooter.angle * DEG);
  }
  let fallback: ShotSolution | null = null;
  for (const elev of candidates) {
    const s = solveSpeed(d, h, elev, shooter.maxSpeed * 1.6);
    if (s === null) continue;
    const inLimits = s <= shooter.maxSpeed && s >= shooter.minSpeed * 0.8;
    if (inLimits && (candidates.length === 1 || (entryAngle(s, elev, h) >= MIN_ENTRY && clearsRim(s, elev, d, h, rim)))) return { elev, speed: s, ok: true };
    if (inLimits && !fallback) fallback = { elev, speed: s, ok: true };
    if (!inLimits && (!fallback || !fallback.ok)) {
      const clamped = Math.min(Math.max(s, shooter.minSpeed), shooter.maxSpeed);
      if (!fallback || Math.abs(s - clamped) < Math.abs(fallback.speed - clamped)) fallback = { elev, speed: clamped, ok: false };
    }
  }
  return fallback ?? { elev: candidates[candidates.length - 1], speed: shooter.maxSpeed, ok: false };
}
