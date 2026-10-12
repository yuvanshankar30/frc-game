/** Point values and thresholds from the 2026 REBUILT manual (Section 6). */
export const SCORING = {
  fuelActive: 1,
  fuelInactive: 0,
  autoTowerL1: 15,
  autoTowerL1MaxRobots: 2,
  teleopTower: { 1: 10, 2: 20, 3: 30 } as Record<number, number>,
  minorFoul: 5,
  majorFoul: 15,
  rp: {
    win: 3,
    tie: 1,
    energized: 100,
    supercharged: 360,
    traversal: 50,
  },
};

export const PERIODS = {
  auto: 20,
  transition: 10,
  shift: 25,
  shiftCount: 4,
  endgame: 30,
};

export type Alliance = 'blue' | 'red';
export const other = (a: Alliance): Alliance => (a === 'blue' ? 'red' : 'blue');

export interface AllianceScore {
  autoFuel: number;
  teleopFuel: number;
  /** FUEL that entered the HUB while it was inactive (0 points, tracked for stats). */
  wastedFuel: number;
  autoTower: number;
  teleopTower: number;
  foulPoints: number;
}

export const emptyScore = (): AllianceScore => ({
  autoFuel: 0,
  teleopFuel: 0,
  wastedFuel: 0,
  autoTower: 0,
  teleopTower: 0,
  foulPoints: 0,
});

export function fuelPoints(s: AllianceScore) {
  return (s.autoFuel + s.teleopFuel) * SCORING.fuelActive;
}

export function towerPoints(s: AllianceScore) {
  return s.autoTower + s.teleopTower;
}

export function totalPoints(s: AllianceScore) {
  return fuelPoints(s) + towerPoints(s) + s.foulPoints;
}

export interface RankingPoints {
  win: number;
  energized: boolean;
  supercharged: boolean;
  traversal: boolean;
  total: number;
}

export function rankingPoints(mine: AllianceScore, theirs: AllianceScore): RankingPoints {
  const a = totalPoints(mine);
  const b = totalPoints(theirs);
  const win = a > b ? SCORING.rp.win : a === b ? SCORING.rp.tie : 0;
  const energized = fuelPoints(mine) >= SCORING.rp.energized;
  const supercharged = fuelPoints(mine) >= SCORING.rp.supercharged;
  const traversal = towerPoints(mine) >= SCORING.rp.traversal;
  return {
    win,
    energized,
    supercharged,
    traversal,
    total: win + +energized + +supercharged + +traversal,
  };
}

/** Tower points for one robot's final level in a given period. */
export function towerValue(level: number, period: 'auto' | 'teleop') {
  if (level <= 0) return 0;
  if (period === 'auto') return level >= 1 ? SCORING.autoTowerL1 : 0;
  return SCORING.teleopTower[Math.min(level, 3)] ?? 0;
}
