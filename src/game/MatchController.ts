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
    if (this.phase === 'pre' || this.phase === 'post') return;
    this.t += dt;
    if (this.phase === 'auto') {
      if (this.t >= PERIODS.auto) {
        this.decideFirstInactive();
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
      this.currentShift = next.shift;
      this.setPhase(next.phase);
      this.t = this.teleopT - next.start;
    }
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
    if (this.phase === 'auto') return now ? info.phaseRemaining + this.autoTeleopGap + PERIODS.transition : Infinity;
    if (this.phase === 'pause') return this.autoTeleopGap - this.t + (now ? 0 : 0);
    if (this.phase === 'transition') return this.firstInactive === a ? info.phaseRemaining : info.phaseRemaining + PERIODS.shift;
    if (this.phase === 'shift') return info.phaseRemaining;
    return Infinity;
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
    if (!this.isHubActive(a)) {
      if (this.running) s.wastedFuel++;
      return 0;
    }
    if (this.phase === 'auto') s.autoFuel++;
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
