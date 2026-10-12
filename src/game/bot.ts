import * as THREE from 'three';
import type { Robot, RobotCommand } from '../robot/Robot';
import type { Field } from '../field/rebuilt/Field';
import { FIELD, HUB, TOWER } from '../field/rebuilt/dims';
import { wrapAngle, clamp } from '../util/units';

type BotState = 'collect' | 'score' | 'climb';

export interface BotInfo {
  hubActive: boolean;
  /** Seconds until our HUB next changes state (Infinity if unknown). */
  untilChange: number;
  endgame: boolean;
  clock: number;
  running: boolean;
  auto: boolean;
}

const SHOOT_MIN = 1.7;
const SHOOT_MAX = 4.3;

/**
 * Autonomous driver for empty alliance slots. It plays a simple but sensible REBUILT strategy:
 * collect FUEL in the NEUTRAL ZONE, carry it into the ALLIANCE ZONE, unload while our HUB is
 * active (pre-positioning before the shift flips), and climb at the end if the robot can.
 */
export class BotController {
  private state: BotState = 'collect';
  private target = new THREE.Vector3();
  private retarget = 0;
  private stuckT = 0;
  private reverseT = 0;
  private reverseDir = new THREE.Vector3();
  private lastPos = new THREE.Vector3();
  private seed = Math.random();

  constructor(readonly robot: Robot) {}

  command(field: Field, info: BotInfo, dt: number): RobotCommand {
    const r = this.robot;
    const p = r.position;
    const yaw = r.yaw;
    const cap = Math.max(1, r.def.storage.capacity);
    const sign = r.alliance === 'blue' ? -1 : 1; // our alliance wall is at sign * L/2
    const cmd: RobotCommand = { x: 0, z: 0, rot: 0, refYaw: 0, intake: false, shoot: false, eject: false, climb: false };
    if (!info.running || r.climb !== 'none') return cmd;

    const hub = field.hubs[r.alliance].center;
    const distHub = Math.hypot(p.x - hub.x, p.z - hub.z);
    const inZone = sign * p.x > FIELD.length / 2 - FIELD.allianceZoneDepth + 0.1;
    const canShoot = !!r.def.shooter;
    const canClimb = !!r.def.climber && r.def.climber.maxLevel > 0;
    const hubSoon = info.hubActive || info.untilChange < 4;

    // ---- choose a state
    const climbTime = (r.def.climber?.climbTime ?? 3) + 7;
    if (info.endgame && canClimb && info.clock < climbTime) this.state = 'climb';
    else if (!canShoot) this.state = 'collect';
    else if (this.state === 'collect') {
      const full = r.stored.length >= cap * 0.85;
      const enough = r.stored.length >= Math.min(cap * 0.4, 20) && hubSoon;
      if (full || enough || (info.auto && r.stored.length > 0)) this.state = 'score';
    } else if (this.state === 'score' && r.stored.length === 0) this.state = 'collect';

    // ---- targets
    this.retarget -= dt;
    if (this.state === 'collect') {
      if (this.retarget <= 0) {
        this.retarget = 0.8;
        this.target.copy(this.nearestFuel(field, p) ?? new THREE.Vector3(-sign * 1.5, 0, (this.seed - 0.5) * 4));
      }
      cmd.intake = r.stored.length < cap;
    } else if (this.state === 'score') {
      // Nearest point on a ring around our HUB, on our alliance side.
      if (this.retarget <= 0) {
        this.retarget = 1.5;
        const ang = clamp(Math.atan2(p.z - hub.z, sign * (p.x - hub.x)), -1.1, 1.1) + (this.seed - 0.5) * 0.3;
        const rad = 2.6 + this.seed * 0.8;
        this.target.set(hub.x + sign * Math.cos(ang) * rad, 0, hub.z + Math.sin(ang) * rad);
      }
      cmd.intake = r.stored.length < cap;
      const inRange = distHub > SHOOT_MIN && distHub < SHOOT_MAX && inZone;
      if (inRange && (info.hubActive || r.stored.length >= cap)) {
        cmd.shoot = true;
        this.target.copy(p);
      } else if (inRange && !info.hubActive) {
        // Wait in position for our HUB to come back.
        this.target.copy(p);
      }
    } else {
      const t = field.towers[r.alliance];
      this.target.set(t.rungX - sign * (r.halfLength + TOWER.rungDiameter + 0.25), 0, t.rungZ);
      if (r.canClimbHere(field) && p.distanceTo(this.target) < 0.5) cmd.climb = true;
    }

    // ---- steering
    const to = new THREE.Vector3().subVectors(this.target, p);
    to.y = 0;
    const dist = to.length();
    const dir = dist > 1e-3 ? to.clone().divideScalar(dist) : new THREE.Vector3();
    // Avoid HUB bodies (and the TOWER unless we're climbing) with a tangential push.
    const avoid = new THREE.Vector3();
    const obstacles: { c: THREE.Vector3; r: number }[] = [
      { c: field.hubs.blue.center, r: HUB.footprint / 2 + r.halfWidth + 0.25 },
      { c: field.hubs.red.center, r: HUB.footprint / 2 + r.halfWidth + 0.25 },
    ];
    if (this.state !== 'climb') {
      for (const a of ['blue', 'red'] as const) {
        const t = field.towers[a];
        obstacles.push({ c: new THREE.Vector3(t.rungX - Math.sign(t.rungX) * 0.5, 0, t.rungZ), r: 0.75 + r.halfWidth });
      }
    }
    for (const o of obstacles) {
      const d = new THREE.Vector3(p.x - o.c.x, 0, p.z - o.c.z);
      const dl = d.length();
      if (dl < o.r + 0.6 && dl > 1e-3) {
        d.divideScalar(dl);
        const push = (o.r + 0.6 - dl) / 0.6;
        avoid.addScaledVector(d, push * 1.5);
        // Slide around: tangent toward the target side.
        const tan = new THREE.Vector3(-d.z, 0, d.x);
        if (tan.dot(dir) < 0) tan.negate();
        avoid.addScaledVector(tan, push);
      }
    }
    // Stay off the walls.
    const mx = FIELD.length / 2 - r.halfLength - 0.15;
    const mz = FIELD.width / 2 - r.halfWidth - 0.15;
    if (p.x > mx) avoid.x -= 1;
    if (p.x < -mx) avoid.x += 1;
    if (p.z > mz) avoid.z -= 1;
    if (p.z < -mz) avoid.z += 1;

    let move = dir.clone().multiplyScalar(clamp(dist / 1.2, 0, 1)).add(avoid);
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      move = this.reverseDir.clone();
    }
    if (move.lengthSq() > 1) move.normalize();
    cmd.x = move.x;
    cmd.z = move.z;

    // Heading: intake-first while collecting; tower-facing while climbing; free while shooting (assist aims).
    if (!cmd.shoot) {
      let desiredYaw = Math.atan2(-move.z, move.x);
      if (this.state === 'climb' && dist < 1.5) desiredYaw = field.towers[r.alliance].climbYaw;
      if (move.lengthSq() > 0.02 || this.state === 'climb') cmd.rot = clamp(wrapAngle(desiredYaw - yaw) * 1.8, -1, 1);
    }

    // Stuck detection → back off in a new direction for a moment.
    const moved = p.distanceTo(this.lastPos);
    this.lastPos.copy(p);
    if (move.lengthSq() > 0.1 && moved < 0.25 * dt) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 0.9) {
      this.stuckT = 0;
      this.reverseT = 0.7;
      const a = Math.atan2(-move.z, -move.x) + (Math.random() - 0.5) * 1.6;
      this.reverseDir.set(Math.cos(a), 0, Math.sin(a));
      this.retarget = 0;
    }
    return cmd;
  }

  private nearestFuel(field: Field, p: THREE.Vector3) {
    const f = field.fuel;
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < f.capacity; i++) {
      if (f.state[i] !== 'field') continue;
      const q = f.position(i);
      if (q.y > 0.3) continue;
      if (Math.abs(q.z) > FIELD.width / 2 - 0.3 || Math.abs(q.x) > FIELD.length / 2 - 0.3) continue;
      // Skip FUEL tucked against HUB bases.
      let blocked = false;
      for (const a of ['blue', 'red'] as const) {
        const h = field.hubs[a].center;
        if (Math.abs(q.x - h.x) < HUB.footprint / 2 + 0.2 && Math.abs(q.z - h.z) < HUB.footprint / 2 + 0.2) blocked = true;
      }
      if (blocked) continue;
      // Prefer dense areas a little by adding a jitter; prefer FUEL ahead of us.
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      const score = d + this.seed * 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) return null;
    const q = f.position(best);
    return new THREE.Vector3(q.x, 0, q.z);
  }
}
