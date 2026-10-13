import { G } from '../util/units';
import { FUEL } from '../field/rebuilt/dims';

/**
 * FUEL aerodynamics, shared by the field simulation (FuelSystem) and the shot solver so predictions match what Rapier
 * integrates. A 5.91in foam ball is light for its size, so air matters:
 *  - quadratic drag  a = -k·Cd·|v|·v
 *  - Magnus lift from backspin  a = k·CL(S)·|v|·(ω̂ × v), with CL(S) = S / (2.022·S + 0.981) (Sawicki et al.) and
 *    spin parameter S = r|ω|/|v|. A hooded flywheel launches with heavy backspin, so shots float a little and drop in
 *    steeper than a vacuum arc.
 * k = ½ρA/m.
 */
export const AERO = {
  /** ½·ρ·A/m (1/m). */
  k: (0.5 * 1.2 * Math.PI * FUEL.radius ** 2) / FUEL.mass,
  cd: 0.5,
  /** Spin parameter r·ω/v a hooded shooter gives the ball at launch. */
  launchSpin: 0.45,
  /** Angular damping of loose FUEL (1/s); in flight this is the spin decay. */
  angularDamping: 0.3,
  /** Rolling resistance of foam on carpet (m/s²). */
  rolling: 0.7,
};

/** Magnus lift coefficient for spin parameter S. */
export function liftCoefficient(s: number) {
  return s <= 0 ? 0 : Math.min(0.35, s / (2.022 * s + 0.981));
}

/** Solver step: identical to the physics step so predictions match Rapier's integration. */
const DT = 1 / 120;
const SPIN_DECAY = 1 / (1 + AERO.angularDamping * DT);

/**
 * Integrate a 2D shot (horizontal, vertical) exactly like the field does: aero acceleration, then gravity, then
 * position (semi-implicit Euler, Rapier's order). `visit` gets each step's previous/new state and returns true to stop.
 */
function fly(speed: number, elev: number, visit: (px: number, py: number, x: number, y: number, vx: number, vy: number, i: number) => boolean) {
  let x = 0;
  let y = 0;
  let vx = speed * Math.cos(elev);
  let vy = speed * Math.sin(elev);
  let w = (AERO.launchSpin * speed) / FUEL.radius;
  for (let i = 0; i < 600; i++) {
    const v = Math.hypot(vx, vy);
    const cl = liftCoefficient((FUEL.radius * w) / Math.max(v, 1e-6));
    const ax = AERO.k * v * (-AERO.cd * vx - cl * vy);
    const ay = AERO.k * v * (-AERO.cd * vy + cl * vx);
    vx += ax * DT;
    vy += (ay - G) * DT;
    w *= SPIN_DECAY;
    const px = x;
    const py = y;
    x += vx * DT;
    y += vy * DT;
    if (visit(px, py, x, y, vx, vy, i)) return true;
  }
  return false;
}

/**
 * Horizontal distance at which the shot, on its way down, crosses height `h` (relative to the exit), or null if it
 * never reaches that height.
 */
export function rangeAtHeight(speed: number, elev: number, h: number): number | null {
  let out: number | null = null;
  let apex = -Infinity;
  let lastX = 0;
  fly(speed, elev, (px, py, x, y, _vx, vy) => {
    apex = Math.max(apex, y);
    lastX = x;
    if (vy < 0 && py >= h && y < h) {
      out = px + ((x - px) * (py - h)) / (py - y);
      return true;
    }
    return false;
  });
  return out ?? (apex >= h ? lastX : null);
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
  let t = 600 * DT;
  fly(speed, elev, (_px, py, _x, y, _vx, vy, i) => {
    if (vy < 0 && py >= h && y < h) {
      t = (i + 1) * DT;
      return true;
    }
    return false;
  });
  return t;
}

export interface ShotSolution {
  elev: number; // rad
  speed: number; // m/s
  ok: boolean; // within the shooter's speed limits
}

/** Descent angle (rad, positive = falling) when the shot crosses height `h` on the way down. */
export function entryAngle(speed: number, elev: number, h: number): number {
  let a = 0;
  fly(speed, elev, (_px, py, _x, y, vx, vy) => {
    if (vy < 0 && py >= h && y < h) {
      a = Math.atan2(-vy, vx);
      return true;
    }
    return false;
  });
  return a;
}

/** Height of the shot (relative to the exit) when it is `x` out horizontally, on the way up or down; null if short. */
export function heightAtRange(speed: number, elev: number, x: number): number | null {
  let out: number | null = null;
  fly(speed, elev, (px, py, nx, ny) => {
    if (nx >= x) {
      out = py + ((ny - py) * (x - px)) / Math.max(1e-9, nx - px);
      return true;
    }
    return false;
  });
  return out;
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
