import { approach, clamp } from '../../util/units';

export type DrivetrainType = 'swerve' | 'tank' | 'mecanum';

export interface DriveLimits {
  maxSpeed: number; // m/s
  maxAccel: number; // m/s^2
  maxOmega: number; // rad/s
  maxAlpha: number; // rad/s^2
}

/** Robot-relative chassis speeds. vx forward (+X local), vz right (+Z local), omega CCW about +Y. */
export interface ChassisSpeeds {
  vx: number;
  vz: number;
  omega: number;
}

export interface DriveInput {
  /** Desired translation in FIELD/REFERENCE frame, each axis -1..1 (x forward from reference, z right). */
  x: number;
  z: number;
  /** Rotation command -1..1, positive = turn left (CCW from above). */
  rot: number;
}

/**
 * Convert a reference-frame translation command into robot-relative velocity.
 * `heading` is the robot yaw in the reference frame (CCW about +Y, 0 = facing reference +X).
 */
export function referenceToRobot(x: number, z: number, heading: number) {
  // Robot local +X = (cos h, -sin h) in (x,z) because yaw is CCW about +Y (from +X toward -Z).
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return { vx: x * c - z * s, vz: x * s + z * c };
}

/** Desired chassis speeds for a drivetrain given operator input. */
export function desiredSpeeds(
  type: DrivetrainType,
  input: DriveInput,
  heading: number,
  limits: DriveLimits,
  fieldOriented: boolean,
): ChassisSpeeds {
  // Square-ish response curve for finer control at low stick values.
  const curve = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 1.6);
  let x = curve(clamp(input.x, -1, 1));
  let z = curve(clamp(input.z, -1, 1));
  const mag = Math.hypot(x, z);
  if (mag > 1) {
    x /= mag;
    z /= mag;
  }
  const omega = curve(clamp(input.rot, -1, 1)) * limits.maxOmega;

  if (type === 'tank') {
    // Arcade drive, always robot-relative: forward stick is throttle, side stick also turns.
    const turn = clamp(omega / limits.maxOmega - z, -1, 1);
    return { vx: x * limits.maxSpeed, vz: 0, omega: turn * limits.maxOmega };
  }

  const r = fieldOriented ? referenceToRobot(x, z, heading) : { vx: x, vz: z };
  // Mecanum loses some strafe authority to roller slip.
  const strafeScale = type === 'mecanum' ? 0.8 : 1;
  return { vx: r.vx * limits.maxSpeed, vz: r.vz * limits.maxSpeed * strafeScale, omega };
}

/** Apply acceleration limits (translation as a vector, rotation separately). */
export function limitSpeeds(current: ChassisSpeeds, target: ChassisSpeeds, limits: DriveLimits, dt: number): ChassisSpeeds {
  const dvx = target.vx - current.vx;
  const dvz = target.vz - current.vz;
  const dv = Math.hypot(dvx, dvz);
  const maxDv = limits.maxAccel * dt;
  const k = dv > maxDv ? maxDv / dv : 1;
  return {
    vx: current.vx + dvx * k,
    vz: current.vz + dvz * k,
    omega: approach(current.omega, target.omega, limits.maxAlpha * dt),
  };
}

export interface SwerveModuleState {
  speed: number;
  angle: number; // rad, robot frame, 0 = forward, CCW positive
}

/** Inverse kinematics for swerve modules at given positions (robot frame x forward, z right). */
export function swerveModuleStates(speeds: ChassisSpeeds, modules: { x: number; z: number }[]): SwerveModuleState[] {
  return modules.map(({ x, z }) => {
    // v = v_chassis + omega × r ; omega about +Y: (x,z) -> omega × r = (omega*z, -omega*x)... in (x,z) plane:
    // For a rotation CCW about +Y, a point at (x, z) moves with velocity (omega * z, -omega * x)... using y-up right-handed:
    // ω=(0,ω,0), r=(x,0,z) => ω×r = (ω*z, 0, -ω*x)
    const vx = speeds.vx + speeds.omega * z;
    const vz = speeds.vz - speeds.omega * x;
    // Angle measured CCW from +X toward -Z.
    return { speed: Math.hypot(vx, vz), angle: Math.atan2(-vz, vx) };
  });
}

/** Tank side speeds (left/right) for a given chassis speed and track width. */
export function tankWheelSpeeds(speeds: ChassisSpeeds, trackWidth: number) {
  // Left side is at -Z (z = -tw/2): ω×r gives vx = ω*z, so left = vx - ω*tw/2, right = vx + ω*tw/2
  return {
    left: speeds.vx - (speeds.omega * trackWidth) / 2,
    right: speeds.vx + (speeds.omega * trackWidth) / 2,
  };
}
