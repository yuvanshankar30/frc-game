import { describe, it, expect } from 'vitest';
import { desiredSpeeds, limitSpeeds, referenceToRobot, swerveModuleStates, tankWheelSpeeds } from './kinematics';

const limits = { maxSpeed: 4, maxAccel: 8, maxOmega: 6, maxAlpha: 20 };

describe('referenceToRobot', () => {
  it('is identity at heading 0', () => {
    const r = referenceToRobot(1, 0.5, 0);
    expect(r.vx).toBeCloseTo(1);
    expect(r.vz).toBeCloseTo(0.5);
  });
  it('a robot turned 90° left sees reference-forward as its right', () => {
    // Heading +90° (CCW) means robot forward points to reference -Z (left).
    const r = referenceToRobot(1, 0, Math.PI / 2);
    expect(r.vx).toBeCloseTo(0);
    expect(r.vz).toBeCloseTo(1);
  });
});

describe('desiredSpeeds', () => {
  it('swerve: full stick = max speed, normalized diagonals', () => {
    const s = desiredSpeeds('swerve', { x: 1, z: 1, rot: 0 }, 0, limits, true);
    expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(4);
  });
  it('tank cannot strafe', () => {
    const s = desiredSpeeds('tank', { x: 0, z: 1, rot: 0 }, 0, limits, true);
    expect(s.vz).toBe(0);
    expect(s.omega).toBeLessThan(0); // right stick turns right (CW)
  });
  it('mecanum strafes slower than it drives', () => {
    const s = desiredSpeeds('mecanum', { x: 0, z: 1, rot: 0 }, 0, limits, false);
    expect(s.vz).toBeCloseTo(3.2);
  });
});

describe('limitSpeeds', () => {
  it('limits acceleration as a vector', () => {
    const n = limitSpeeds({ vx: 0, vz: 0, omega: 0 }, { vx: 4, vz: 0, omega: 6 }, limits, 0.1);
    expect(n.vx).toBeCloseTo(0.8);
    expect(n.omega).toBeCloseTo(2);
  });
});

describe('swerve inverse kinematics', () => {
  it('pure rotation points modules tangentially', () => {
    const states = swerveModuleStates({ vx: 0, vz: 0, omega: 1 }, [{ x: 0.3, z: 0.3 }]);
    // Front-right module (x+, z+) moving CCW travels toward +X/-Z... speed = r*omega
    expect(states[0].speed).toBeCloseTo(Math.hypot(0.3, 0.3));
  });
  it('tank sides differ when turning', () => {
    const w = tankWheelSpeeds({ vx: 1, vz: 0, omega: 2 }, 0.6);
    expect(w.left).toBeCloseTo(0.4);
    expect(w.right).toBeCloseTo(1.6);
  });
});
