import { describe, it, expect } from 'vitest';
import { MatchController } from './MatchController';
import { SCORING, PERIODS, rankingPoints, emptyScore, totalPoints, towerValue } from './scoring';

function run(m: MatchController, secs: number, dt = 1 / 120) {
  for (let t = 0; t < secs; t += dt) m.tick(dt);
}

describe('MatchController', () => {
  it('runs AUTO, the pause, TRANSITION, 4 shifts and END GAME in order', () => {
    const m = new MatchController({ autoTeleopGap: 3, rng: () => 0.1 });
    const phases: string[] = [];
    m.onPhaseChange((p) => phases.push(m.phase === 'shift' ? `shift${m.shift}` : p));
    m.start();
    run(m, PERIODS.auto + 3 + PERIODS.transition + 4 * PERIODS.shift + PERIODS.endgame + 1);
    expect(phases).toEqual(['auto', 'pause', 'transition', 'shift1', 'shift2', 'shift3', 'shift4', 'endgame', 'post']);
  });

  it('both HUBs are active in AUTO, TRANSITION and END GAME', () => {
    const m = new MatchController({ autoTeleopGap: 0 });
    m.start();
    expect(m.isHubActive('blue') && m.isHubActive('red')).toBe(true);
    run(m, PERIODS.auto + 1);
    expect(m.phase).toBe('transition');
    expect(m.isHubActive('blue') && m.isHubActive('red')).toBe(true);
    run(m, PERIODS.transition + 4 * PERIODS.shift);
    expect(m.phase).toBe('endgame');
    expect(m.isHubActive('blue') && m.isHubActive('red')).toBe(true);
  });

  it('the alliance that scores more in AUTO is inactive in SHIFT 1, then hubs alternate', () => {
    const m = new MatchController({ autoTeleopGap: 0 });
    m.start();
    m.scoreFuel('blue');
    m.scoreFuel('blue');
    m.scoreFuel('red');
    run(m, PERIODS.auto + PERIODS.transition + 1);
    expect(m.phase).toBe('shift');
    expect(m.shift).toBe(1);
    expect(m.isHubActive('blue')).toBe(false);
    expect(m.isHubActive('red')).toBe(true);
    run(m, PERIODS.shift);
    expect(m.shift).toBe(2);
    expect(m.isHubActive('blue')).toBe(true);
    expect(m.isHubActive('red')).toBe(false);
  });

  it('ties pick the first inactive alliance randomly', () => {
    const a = new MatchController({ autoTeleopGap: 0, rng: () => 0.2 });
    a.start();
    run(a, PERIODS.auto + SCORING.graceSeconds + 0.1);
    expect(a.firstInactive).toBe('blue');
    const b = new MatchController({ autoTeleopGap: 0, rng: () => 0.8 });
    b.start();
    run(b, PERIODS.auto + SCORING.graceSeconds + 0.1);
    expect(b.firstInactive).toBe('red');
  });

  it('FUEL in an inactive HUB scores nothing but is tracked', () => {
    const m = new MatchController({ autoTeleopGap: 0, rng: () => 0.1 });
    m.start();
    run(m, PERIODS.auto + PERIODS.transition + SCORING.graceSeconds + 0.5);
    const inactive = m.isHubActive('blue') ? 'red' : 'blue';
    expect(m.scoreFuel(inactive)).toBe(0);
    expect(m.score[inactive].wastedFuel).toBe(1);
  });

  it('FUEL within the 3 s grace after AUTO counts as AUTO FUEL; nothing scores later in a long pause', () => {
    const m = new MatchController({ autoTeleopGap: 5 });
    m.start();
    run(m, PERIODS.auto + 1);
    expect(m.phase).toBe('pause');
    expect(m.scoreFuel('blue')).toBe(1);
    expect(m.score.blue.autoFuel).toBe(1);
    run(m, 2.5);
    expect(m.scoreFuel('blue')).toBe(0);
  });

  it('grace FUEL decides the SHIFT order', () => {
    const m = new MatchController({ autoTeleopGap: 3, rng: () => 0.9 });
    m.start();
    run(m, PERIODS.auto + 1);
    m.scoreFuel('blue'); // lands in the grace window: blue "won" AUTO
    run(m, 3);
    expect(m.firstInactive).toBe('blue');
  });

  it('a HUB does not score while inactive during a SHIFT', () => {
    const m = new MatchController({ autoTeleopGap: 0, rng: () => 0.1 });
    m.start();
    run(m, PERIODS.auto + PERIODS.transition + 1);
    const inactive = m.isHubActive('blue') ? 'red' : 'blue';
    expect(m.scoreFuel(inactive)).toBe(0);
  });

  it('FUEL does not score after the match ends', () => {
    const m = new MatchController({ autoTeleopGap: 0 });
    m.start();
    run(m, PERIODS.auto + PERIODS.transition + PERIODS.shift * PERIODS.shiftCount + PERIODS.endgame + 1);
    expect(m.phase).toBe('post');
    expect(m.scoreFuel('red')).toBe(0);
  });

  it('clock counts down per period', () => {
    const m = new MatchController({ autoTeleopGap: 0 });
    m.start();
    expect(m.info().clock).toBeCloseTo(20, 1);
    run(m, 5);
    expect(m.info().clock).toBeCloseTo(15, 1);
    run(m, 15 + 10);
    expect(m.info().clock).toBeCloseTo(130, 0);
  });

  it('tower points follow the manual (AUTO L1 15 pts, max 2 robots; TELEOP 10/20/30)', () => {
    const m = new MatchController();
    m.start();
    m.awardAutoTower('blue', [1, 1, 1]);
    expect(m.score.blue.autoTower).toBe(30);
    m.awardTeleopTower('blue', [1, 2, 3]);
    expect(m.score.blue.teleopTower).toBe(60);
    expect(towerValue(0, 'teleop')).toBe(0);
  });
});

describe('ranking points', () => {
  it('awards ENERGIZED / SUPERCHARGED / TRAVERSAL thresholds', () => {
    const a = { ...emptyScore(), teleopFuel: 365, teleopTower: 50 };
    const b = { ...emptyScore(), teleopFuel: 99 };
    const rp = rankingPoints(a, b);
    expect(rp).toMatchObject({ win: 3, energized: true, supercharged: true, traversal: true, total: 6 });
    const rb = rankingPoints(b, a);
    expect(rb).toMatchObject({ win: 0, energized: false, supercharged: false, traversal: false, total: 0 });
    expect(totalPoints(a)).toBe(415);
  });

  it('ties give 1 RP', () => {
    expect(rankingPoints(emptyScore(), emptyScore()).win).toBe(1);
  });
});
