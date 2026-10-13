import * as THREE from 'three';
import { initPhysics, createWorld, PHYSICS_DT, type World } from '../physics/world';
import { Field } from '../field/rebuilt/Field';
import { FIELD } from '../field/rebuilt/dims';
import { Robot, idleCommand, type RobotCommand } from '../robot/Robot';
import { loadRobot } from '../robots/registry';
import { MatchController, type Phase } from '../game/MatchController';
import { type Alliance, totalPoints, rankingPoints } from '../game/scoring';
import { DriverInput, type DeviceSpec } from './input/Input';
import { CameraRig } from '../render/cameras';
import { createRenderer, createArena } from '../render/scene';
import { applyEnvironment } from '../render/environment';
import { useStore, type GameMode, type PlayerSetup, type Settings, type Hud } from '../ui/store';
import { sfx } from './audio';
import { sideTransform } from '../field/builder';

interface Player {
  /** Smoothed rotation command (keyboard keys ramp instead of snapping). */
  rotSmooth: number;
  /** Sim times of recent shots (live BPS). */
  shotTimes: number[];
  setup: PlayerSetup;
  input: DriverInput;
  robot: Robot;
  rig: CameraRig;
  assist: boolean;
}

export interface GameConfig {
  mode: GameMode;
  players: PlayerSetup[];
  settings: Settings;
}

/** Starting Z per driver station slot (blue frame). Avoids the HUB, which straddles the starting line. */
const STATION_Z = [-2.6, 1.3, 3.1];

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  world!: World;
  field!: Field;
  readonly match: MatchController;
  players: Player[] = [];
  private raf = 0;
  private last = 0;
  private acc = 0;
  private hudTimer = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;
  paused = false;
  private disposed = false;
  private banner: { text: string; until: number } | null = null;
  private time = 0;
  private config!: GameConfig;
  private results: Hud['results'] = null;
  private resizeObs: ResizeObserver;

  constructor(readonly canvas: HTMLCanvasElement, settings: Settings) {
    this.match = new MatchController({ autoTeleopGap: settings.autoTeleopGap });
    this.renderer = createRenderer(canvas, { shadows: settings.shadows, pixelRatio: settings.pixelRatio, antialias: settings.antialias });
    createArena(this.scene, { shadows: settings.shadows, pixelRatio: settings.pixelRatio, antialias: settings.antialias });
    applyEnvironment(this.renderer, this.scene, 0.55);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
  }

  async start(config: GameConfig) {
    this.config = config;
    await initPhysics();
    if (this.disposed) return;
    this.world = createWorld();
    this.field = new Field(this.world, this.scene);
    this.field.onHubEntry = (a, i) => this.onHubEntry(a, i);
    sfx.volume = config.settings.volume;

    // Spawn players.
    let n = 0;
    for (const setup of config.players) {
      const { def, model } = await loadRobot(setup.robotId);
      if (this.disposed) return;
      const robot = new Robot(def, model, setup.alliance, this.world, this.scene, `p${n}`, def.team || def.name.slice(0, 5));
      const device: DeviceSpec =
        setup.device === 'keyboard'
          ? { kind: 'keyboard', bindings: config.settings.keyboard }
          : setup.device === 'keyboard2'
            ? { kind: 'keyboard', bindings: config.settings.keyboard2 }
            : { kind: 'gamepad', index: Number(setup.device.split(':')[1] ?? 0), bindings: config.settings.gamepad };
      const rig = new CameraRig(setup.alliance);
      rig.station = setup.station;
      rig.setMode(config.settings.defaultCamera);
      this.players.push({ setup, input: new DriverInput(device), robot, rig, assist: config.settings.assist, rotSmooth: 0, shotTimes: [] });
      n++;
    }
    this.resetMatch();
    this.resize();
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this;
    this.last = performance.now();
    this.loop();
  }

  private stationOf(r: Robot) {
    const p = this.players.find((x) => x.robot === r);
    return p ? p.setup.station : r.station;
  }

  private placeRobot(r: Robot) {
    const T = sideTransform(r.alliance);
    const x = -FIELD.length / 2 + FIELD.allianceZoneDepth - r.halfLength - 0.03;
    const z = STATION_Z[this.stationOf(r)] ?? 0;
    const p = T.p(x, 0, z);
    r.teleport(p.x, p.z, T.yaw(0));
  }

  /** Re-stage the field and robots for a fresh match / practice session. */
  resetMatch() {
    const mode = this.config.mode;
    this.field.stageFuel();
    this.results = null;
    for (const r of this.allRobots()) {
      r.clearHopper(); // stageFuel() already reset every ball
      r.fuel = this.field.fuel;
      this.placeRobot(r);
      r.stats.shots = r.stats.scored = r.stats.intaked = 0;
      r.intakeLatched = false;
      r.preload(this.field.fuel, r.def.storage.preload);
    }
    this.match.phase = 'pre';
    if (mode === 'practice') {
      this.match.score = { blue: { ...emptyish() }, red: { ...emptyish() } };
      this.field.setHubActive('blue', true);
      this.field.setHubActive('red', true);
      this.showBanner('FREE PRACTICE', 2);
    } else {
      // Pre-match: robots disabled for a 3-2-1 countdown, then the match starts with the "Charge!" cue.
      this.match.phase = 'pre';
      this.match.score = { blue: { ...emptyish() }, red: { ...emptyish() } };
      this.countdown = 3.2;
      this.lastCount = 4;
    }
    this.lastPhase = this.match.phase;
  }

  private lastPhase: Phase = 'pre';
  private lastSpeed = 0;
  /** Seconds left in the pre-match countdown (match modes). */
  private countdown = 0;
  private lastCount = 0;

  private allRobots(): Robot[] {
    return this.players.map((p) => p.robot);
  }

  private onHubEntry(a: Alliance, ball: number) {
    let pts = 0;
    if (this.config.mode === 'practice') {
      this.match.score[a].teleopFuel++;
      pts = 1;
    } else {
      pts = this.match.scoreFuel(a);
    }
    const shooter = this.field.fuel.lastShooter[ball];
    if (shooter && pts > 0) {
      const r = this.allRobots().find((x) => x.id === shooter);
      if (r) r.stats.scored++;
    }
    if (this.players.some((p) => p.robot.id === shooter)) {
      if (pts > 0) sfx.score();
      else sfx.wasted();
    }
  }

  private onPhaseChange(from: Phase, to: Phase) {
    const robots = this.allRobots();
    if (from === 'auto') {
      for (const a of ['blue', 'red'] as const) {
        this.match.awardAutoTower(a, robots.filter((r) => r.alliance === a).map((r) => r.climbLevel));
      }
    }
    switch (to) {
      case 'pause':
        this.showBanner('AUTO COMPLETE — ROBOTS DISABLED', this.match.autoTeleopGap);
        sfx.buzzer();
        break;
      case 'transition':
        this.showBanner('TELEOP — TRANSITION SHIFT', 2.5);
        sfx.bells();
        break;
      case 'shift': {
        const active = this.match.isHubActive('blue') ? 'BLUE' : 'RED';
        this.showBanner(`SHIFT ${this.match.shift} — ${active} HUB ACTIVE`, 2.5);
        const mine = this.players[0]?.robot.alliance;
        sfx.chime(mine ? this.match.isHubActive(mine) : true);
        break;
      }
      case 'endgame':
        this.showBanner('END GAME — BOTH HUBS ACTIVE', 2.5);
        sfx.whistle();
        break;
      case 'post': {
        for (const a of ['blue', 'red'] as const) {
          this.match.awardTeleopTower(a, robots.filter((r) => r.alliance === a).map((r) => r.climbLevel));
        }
        const b = totalPoints(this.match.score.blue);
        const r = totalPoints(this.match.score.red);
        this.results = {
          winner: b > r ? 'blue' : r > b ? 'red' : 'tie',
          rp: { blue: rankingPoints(this.match.score.blue, this.match.score.red), red: rankingPoints(this.match.score.red, this.match.score.blue) },
        };
        this.showBanner('MATCH OVER', 3);
        sfx.buzzer();
        break;
      }
    }
  }

  showBanner(text: string, secs: number) {
    this.banner = { text, until: this.time + secs };
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.pushHud(true);
  }

  resetRobot(index = 0) {
    const pl = this.players[index];
    if (pl) this.placeRobot(pl.robot);
  }

  // ---------------------------------------------------------------- loop

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    // Read input once per frame (edge-triggered actions).
    const states = this.players.map((p) => p.input.read());
    states.forEach((s, i) => {
      const p = this.players[i];
      if (s.pressed.pause) this.setPaused(!this.paused);
      if (s.pressed.camera) p.rig.cycle();
      if (s.pressed.assist) p.assist = !p.assist;
      if (s.pressed.reset && !this.paused) this.placeRobot(p.robot);
      if (s.pressed.feed && !this.paused) this.field.feedFromOutpost(p.robot.alliance);
    });

    if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      const st = this.config.settings;
      const cmds: RobotCommand[] = states.map((s, i) => {
        const p = this.players[i];
        // Keyboard rotation ramps up (digital keys would otherwise snap to full turn rate).
        if (p.input.device.kind === 'keyboard' && st.rotationRamp > 0) {
          const k = Math.min(1, dt / st.rotationRamp);
          p.rotSmooth += (s.rot - p.rotSmooth) * (s.rot === 0 ? Math.min(1, k * 2) : k);
          if (Math.abs(p.rotSmooth) < 0.01) p.rotSmooth = 0;
        } else p.rotSmooth = s.rot;
        return {
          x: s.x,
          z: s.z,
          rot: p.rotSmooth * st.rotationSpeed,
          refYaw: p.rig.referenceYaw(p.robot, this.config.settings.driveFrame),
          intake: s.held.intake,
          shoot: s.held.shoot,
          eject: s.held.eject,
          climb: s.pressed.climb,
        };
      });
      while (this.acc >= PHYSICS_DT && steps < 6) {
        this.stepSim(cmds, PHYSICS_DT);
        // Edge-triggered climb only applies to the first sub-step.
        for (const c of cmds) c.climb = false;
        this.acc -= PHYSICS_DT;
        steps++;
      }
      if (steps === 6) this.acc = 0;
    }

    // Robot sounds (local player 1) + impacts.
    const p0 = this.players[0];
    if (p0) {
      const enabled = !this.paused && (this.config.mode === 'practice' || (this.match.running && this.match.phase !== 'pause'));
      const v = p0.robot.body.linvel();
      const speed = Math.hypot(v.x, v.z);
      sfx.updateRobot({ speed, maxSpeed: p0.robot.def.drivetrain.maxSpeed, spin: p0.robot.spin, intake: p0.robot.intakeOn, feeding: p0.robot.feeding, enabled });
      const dv = this.lastSpeed - speed;
      if (dv > 1.6 && !this.paused) sfx.impact(Math.min(1, dv / 4));
      this.lastSpeed = speed;
    }
    if (this.paused) sfx.stopLoops();

    // Render.
    for (const r of this.allRobots()) r.sync();
    this.field.sync();
    for (const p of this.players) p.rig.update(p.robot, dt);
    this.render();

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.pushHud();
    }
  };

  private stepSim(cmds: RobotCommand[], dt: number) {
    this.time += dt;
    const auto = this.match.phase === 'auto';
    const running = this.config.mode === 'practice' || this.match.running;
    this.players.forEach((p, i) => {
      // Robots are disabled during the pre-match countdown, the AUTO→TELEOP pause and after the match.
      const enabled = this.config.mode === 'practice' || (running && this.match.phase !== 'pause');
      const cmd = enabled ? cmds[i] : idleCommand();
      const shooting = cmd.shoot;
      const before = p.robot.stats.shots;
      const intakedBefore = p.robot.stats.intaked;
      p.robot.step(cmd, { field: this.field, auto, assist: p.assist, headingHold: this.config.settings.headingHold }, dt);
      if (p.robot.stats.shots > before) {
        if (shooting) sfx.shoot();
        for (let k = before; k < p.robot.stats.shots; k++) p.shotTimes.push(this.time);
        while (p.shotTimes.length && this.time - p.shotTimes[0] > 2) p.shotTimes.shift();
      }
      if (p.robot.stats.intaked > intakedBefore) sfx.intake();
      if (cmd.climb && p.robot.climb !== 'none') sfx.climb();
    });
    this.field.step(dt);
    this.world.step();
    if (this.config.mode !== 'practice' && this.match.phase === 'pre' && this.countdown > 0) {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastCount && n >= 1 && n <= 3) {
        this.lastCount = n;
        this.showBanner(`${n}`, 0.9);
        sfx.countdown(false);
      }
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.match.start();
        this.matchStart = this.time;
        this.lastPhase = 'auto';
        this.showBanner('AUTO', 2);
        sfx.charge();
      }
    }
    if (this.config.mode !== 'practice') {
      this.match.tick(dt);
      if (this.match.phase !== this.lastPhase) {
        const from = this.lastPhase;
        this.lastPhase = this.match.phase;
        this.onPhaseChange(from, this.match.phase);
      }
      for (const a of ['blue', 'red'] as const) {
        const active = this.match.isHubActive(a);
        if (active !== this.field.isHubLit(a)) this.field.setHubActive(a, active);
      }
    }
    // Keep robots on the field.
    for (const r of this.allRobots()) if (!r.inField()) this.placeRobot(r);
  }

  private render() {
    const r = this.renderer;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const n = this.players.length;
    if (n <= 1) {
      r.setScissorTest(false);
      r.setViewport(0, 0, w, h);
      if (this.players[0]) r.render(this.scene, this.players[0].rig.camera);
      return;
    }
    r.setScissorTest(true);
    const vw = Math.floor(w / n);
    this.players.forEach((p, i) => {
      r.setViewport(i * vw, 0, vw, h);
      r.setScissor(i * vw, 0, vw, h);
      r.render(this.scene, p.rig.camera);
    });
    r.setScissorTest(false);
  }

  private resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const n = Math.max(1, this.players.length);
    for (const p of this.players) p.rig.setAspect(w / n / h);
  }

  /** Seconds since the match started, counting AUTO, the pause and TELEOP. */
  private matchStart = 0;
  matchElapsed() {
    return this.match.phase === 'pre' ? 0 : this.time - this.matchStart;
  }

  private pushHud(force = false) {
    void force;
    const info = this.match.info();
    const score = this.match.score;
    const hud: Hud = {
      phase: info.phase,
      shift: info.shift,
      clock: info.clock,
      phaseRemaining: info.phaseRemaining,
      hubActive: { blue: this.field.isHubLit('blue'), red: this.field.isHubLit('red') },
      score: {
        blue: { ...score.blue, total: totalPoints(score.blue) },
        red: { ...score.red, total: totalPoints(score.red) },
      },
      outpost: { blue: this.field.outposts.blue.count, red: this.field.outposts.red.count },
      players: this.players.map((p) => ({
        robotName: p.robot.def.name,
        team: p.robot.def.team,
        alliance: p.robot.alliance,
        stored: p.robot.stored.length,
        capacity: p.robot.def.storage.capacity,
        climbLevel: p.robot.climbLevel,
        climbState: p.robot.climb,
        canClimb: p.robot.canClimbHere(this.field),
        aimOk: p.robot.aimOk,
        distance: p.robot.aimDistance,
        camera: p.rig.mode,
        assist: p.assist,
        shots: p.robot.stats.shots,
        scored: p.robot.stats.scored,
        intaked: p.robot.stats.intaked,
        intaking: p.robot.intakeOn,
        spin: p.robot.spin,
        ready: p.robot.shotReady,
        bps: p.shotTimes.filter((t) => this.time - t <= 1).length,
        speed: Math.hypot(p.robot.body.linvel().x, p.robot.body.linvel().z),
        hubFlip: this.config.mode === 'practice' ? Infinity : this.match.untilHubChange(p.robot.alliance),
        inZone: (p.robot.alliance === 'blue' ? -1 : 1) * p.robot.position.x > FIELD.length / 2 - FIELD.allianceZoneDepth,
      })),
      fps: this.fps,
      mode: this.config.mode,
      paused: this.paused,
      banner: this.banner && this.banner.until > this.time ? this.banner.text : null,
      matchTime: this.matchElapsed(),
      firstInactive: this.match.firstInactive,
      autoTeleopGap: this.match.autoTeleopGap,
      results: this.results,
    };
    useStore.getState().setHud(hud);
  }

  dispose() {
    this.disposed = true;
    sfx.stopLoops();
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry?.dispose();
    });
    try {
      this.world?.free();
    } catch {
      /* already freed */
    }
    useStore.getState().setHud(null);
  }
}

function emptyish() {
  return { autoFuel: 0, teleopFuel: 0, wastedFuel: 0, autoTower: 0, teleopTower: 0, foulPoints: 0 };
}

