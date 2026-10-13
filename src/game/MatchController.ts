import { PERIODS, type Alliance, type AllianceScore, emptyScore, other, towerValue, SCORING } from './scoring';

export type Phase = 'pre' | 'auto' | 'pause' | 'transition' | 'shift' | 'endgame' | 'post';

export interface PhaseInfo {
  phase: Phase;
  /** 1..4 when phase === 'shift' */
  shift: number;
  /** Seconds left in the current phase. */
  phaseRemaining: number;
  /** The match clock as shown on the field display (counts down per period). */
  clock: number;
}

/**
 * Pure match state machine: periods, shifts, which HUB is active, and the score.
 * No rendering or physics; driven by `tick(dt)` from the game loop.
 */
export class MatchController {
  phase: Phase = 'pre';
  /** Elapsed time in the current period (auto or teleop). */
  private t = 0;
  /** Pause between AUTO and TELEOP (FMS delay), seconds. */
  readonly autoTeleopGap: number;
  /** Alliance whose HUB is inactive during SHIFT 1 (decided after AUTO). */
  firstInactive: Alliance | null = null;
  score: Record<Alliance, AllianceScore> = { blue: emptyScore(), red: emptyScore() };
  /** Match time (s since AUTO started), used for the AUTO→TELEOP scoring grace window. */
  private matchT = 0;
  private autoEndAt: number | null = null;
  private rng: () => number;
  private listeners: ((p: Phase) => void)[] = [];

  constructor(opts: { autoTeleopGap?: number; rng?: () => number } = {}) {
    this.autoTeleopGap = opts.autoTeleopGap ?? 3;
    this.rng = opts.rng ?? Math.random;
  }

  onPhaseChange(fn: (p: Phase) => void) {
    this.listeners.push(fn);
  }

  start() {
    this.score = { blue: emptyScore(), red: emptyScore() };
    this.firstInactive = null;
    this.matchT = 0;
    this.autoEndAt = null;
    this.currentShift = 0;
    this.teleopT = 0;
    this.setPhase('auto');
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.t = 0;
    for (const l of this.listeners) l(p);
  }

  /** Elapsed TELEOP time, or -1 when not in TELEOP. */
  private teleopT = 0;

  tick(dt: number) {
    if (this.phase === 'pre') return;
    this.matchT += dt;
    if (this.phase !== 'post') this.advance(dt);
    // FUEL that scores within GRACE of AUTO ending still counts for AUTO, so the SHIFT order is decided after it.
    if (this.firstInactive === null && this.autoEndAt !== null && (this.matchT - this.autoEndAt >= SCORING.graceSeconds || this.phase === 'shift')) this.decideFirstInactive();
  }

  private advance(dt: number) {
    this.t += dt;
    if (this.phase === 'auto') {
      if (this.t >= PERIODS.auto) {
        this.autoEndAt = this.matchT;
        this.setPhase(this.autoTeleopGap > 0 ? 'pause' : 'transition');
        this.teleopT = 0;
      }
      return;
    }
    if (this.phase === 'pause') {
      if (this.t >= this.autoTeleopGap) {
        this.setPhase('transition');
        this.teleopT = 0;
      }
      return;
    }
    this.teleopT += dt;
    const next = this.teleopPhaseAt(this.teleopT);
    if (next.phase !== this.phase || next.shift !== this.currentShift) {
      // Entering SHIFT 1 needs the HUB order (normally decided at the end of the AUTO grace window).
      if (next.phase === 'shift' && this.firstInactive === null) this.decideFirstInactive();
      this.currentShift = next.shift;
      this.setPhase(next.phase);
      this.t = this.teleopT - next.start;
    }
  }

  /** True while FUEL entering alliance `a`'s HUB scores. */
  hubCounts(a: Alliance): boolean {
    if (this.isHubActive(a)) return true;
    // Only AUTO FUEL gets the manual's grace period while TELEOP is starting.
    // A HUB that is inactive for a SHIFT must not score at all.
    return this.inAutoScoring();
  }

  /** In the grace window after AUTO, scored FUEL is still AUTO FUEL. */
  private inAutoScoring() {
    return this.phase === 'auto' || (this.autoEndAt !== null && this.matchT - this.autoEndAt <= SCORING.graceSeconds);
  }

  private currentShift = 0;

  private teleopPhaseAt(t: number): { phase: Phase; shift: number; start: number } {
    const { transition, shift, shiftCount, endgame } = PERIODS;
    if (t < transition) return { phase: 'transition', shift: 0, start: 0 };
    const shiftsEnd = transition + shift * shiftCount;
    if (t < shiftsEnd) {
      const i = Math.floor((t - transition) / shift);
      return { phase: 'shift', shift: i + 1, start: transition + i * shift };
    }
    if (t < shiftsEnd + endgame) return { phase: 'endgame', shift: 0, start: shiftsEnd };
    return { phase: 'post', shift: 0, start: shiftsEnd + endgame };
  }

  private decideFirstInactive() {
    const b = this.score.blue.autoFuel;
    const r = this.score.red.autoFuel;
    // The alliance that scored more FUEL in AUTO starts TELEOP with its HUB inactive.
    this.firstInactive = b > r ? 'blue' : r > b ? 'red' : this.rng() < 0.5 ? 'blue' : 'red';
  }

  get shift() {
    return this.phase === 'shift' ? this.currentShift : 0;
  }

  isHubActive(a: Alliance): boolean {
    switch (this.phase) {
      case 'auto':
      case 'transition':
      case 'endgame':
        return true;
      case 'shift': {
        const inactiveOdd = this.firstInactive ?? 'blue';
        const inactive = this.currentShift % 2 === 1 ? inactiveOdd : other(inactiveOdd);
        return a !== inactive;
      }
      default:
        // Before / after the match, and during the AUTO→TELEOP pause, nothing scores.
        return false;
    }
  }

  /** Seconds until alliance `a`'s HUB next changes active state (Infinity if it won't). */
  untilHubChange(a: Alliance): number {
    const info = this.info();
    const now = this.isHubActive(a);
    switch (this.phase) {
      case 'auto':
        // Both HUBs switch off for the AUTO→TELEOP pause (or the transition starts right away).
        return this.autoTeleopGap > 0 ? info.phaseRemaining : Infinity;
      case 'pause':
        return info.phaseRemaining; // both come back on for TRANSITION
      case 'transition':
        return this.firstInactive === a ? info.phaseRemaining : info.phaseRemaining + PERIODS.shift;
      case 'shift':
        // After SHIFT 4 both HUBs are active for END GAME: only the inactive one flips.
        if (this.shift === PERIODS.shiftCount) return now ? Infinity : info.phaseRemaining;
        return info.phaseRemaining;
      default:
        return Infinity;
    }
  }

  /** Free-practice style scoring outside a match is handled by the caller. */
  get running() {
    return this.phase !== 'pre' && this.phase !== 'post';
  }

  get isAuto() {
    return this.phase === 'auto';
  }

  info(): PhaseInfo {
    const { auto, transition, shift, endgame } = PERIODS;
    let phaseLen = 0;
    switch (this.phase) {
      case 'auto':
        phaseLen = auto;
        break;
      case 'pause':
        phaseLen = this.autoTeleopGap;
        break;
      case 'transition':
        phaseLen = transition;
        break;
      case 'shift':
        phaseLen = shift;
        break;
      case 'endgame':
        phaseLen = endgame;
        break;
    }
    const phaseRemaining = Math.max(0, phaseLen - this.t);
    const teleopTotal = transition + shift * PERIODS.shiftCount + endgame;
    let clock = 0;
    if (this.phase === 'pre') clock = auto;
    else if (this.phase === 'auto') clock = phaseRemaining;
    else if (this.phase === 'pause') clock = teleopTotal;
    else if (this.phase !== 'post') clock = Math.max(0, teleopTotal - this.teleopT);
    return { phase: this.phase, shift: this.shift, phaseRemaining, clock };
  }

  /** Called by the HUB when a FUEL ball enters it. Returns points awarded. */
  scoreFuel(a: Alliance): number {
    const s = this.score[a];
    if (this.phase === 'pre' || !this.hubCounts(a)) {
      if (this.running) s.wastedFuel++;
      return 0;
    }
    if (this.inAutoScoring()) s.autoFuel++;
    else s.teleopFuel++;
    return SCORING.fuelActive;
  }

  /** Award AUTO tower points (called at the end of AUTO with each robot's level). */
  awardAutoTower(a: Alliance, levels: number[]) {
    const climbed = levels.filter((l) => l >= 1).slice(0, SCORING.autoTowerL1MaxRobots);
    this.score[a].autoTower = climbed.reduce((sum, l) => sum + towerValue(l, 'auto'), 0);
  }

  /** Award TELEOP tower points (called at the end of the match). */
  awardTeleopTower(a: Alliance, levels: number[]) {
    this.score[a].teleopTower = levels.reduce((sum, l) => sum + towerValue(l, 'teleop'), 0);
  }
}
