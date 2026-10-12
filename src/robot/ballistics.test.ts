import { describe, it, expect } from 'vitest';
import { rangeAtHeight, solveSpeed, solveShot, entryAngle, MIN_ENTRY } from './ballistics';

describe('ballistics', () => {
  it('solved speed lands the ball at the target distance', () => {
    const elev = (60 * Math.PI) / 180;
    for (const d of [1.5, 3, 5, 7]) {
      const v = solveSpeed(d, 1.3, elev)!;
      expect(v).toBeGreaterThan(0);
      expect(rangeAtHeight(v, elev, 1.3)!).toBeCloseTo(d, 1);
    }
  });
  it('farther shots need more speed', () => {
    const elev = (55 * Math.PI) / 180;
    expect(solveSpeed(6, 1.3, elev)!).toBeGreaterThan(solveSpeed(3, 1.3, elev)!);
  });
  it('a hooded shooter picks the flattest angle that still drops in steeply', () => {
    const s = solveShot(4, 1.3, { angle: 60, hoodMin: 40, hoodMax: 80, minSpeed: 3, maxSpeed: 15 });
    expect(s.ok).toBe(true);
    expect(entryAngle(s.speed, s.elev, 1.3)).toBeGreaterThanOrEqual(MIN_ENTRY);
    expect((s.elev * 180) / Math.PI).toBeLessThan(72);
  });
  it('reports out of range when the shooter is too weak', () => {
    const s = solveShot(12, 1.3, { angle: 45, hoodMin: null, hoodMax: null, minSpeed: 3, maxSpeed: 6 });
    expect(s.ok).toBe(false);
  });
});
