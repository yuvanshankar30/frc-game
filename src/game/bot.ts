import * as THREE from 'three';
import type { Robot, RobotCommand } from '../robot/Robot';
import type { Field } from '../field/rebuilt/Field';
import { FIELD, HUB } from '../field/rebuilt/dims';
import { wrapAngle, clamp } from '../util/units';

type BotState = 'collect' | 'score' | 'climb';

/**
 * Simple autonomous driver used to fill empty alliance slots. Not smart — it collects FUEL,
 * drives into its ALLIANCE ZONE, shoots at the HUB (when active, or near the shift change),
 * and climbs in END GAME if its robot can.
 */
export class BotController {
  private state: BotState = 'collect';
  private target = new THREE.Vector3();
  private retarget = 0;
  private stuckT = 0;
  private lastPos = new THREE.Vector3();
  private wander = Math.random() * Math.PI * 2;

  constructor(readonly robot: Robot) {}

  command(field: Field, info: { hubActive: boolean; endgame: boolean; clock: number; running: boolean }, dt: number): RobotCommand {
    const r = this.robot;
    const p = r.position;
    const yaw = r.yaw;
    const cap = r.def.storage.capacity;
    const sign = r.alliance === 'blue' ? -1 : 1;
    const cmd: RobotCommand = { x: 0, z: 0, rot: 0, refYaw: 0, intake: false, shoot: false, eject: false, climb: false };
    if (!info.running) return cmd;

    // State selection.
    const canClimb = !!r.def.climber && r.def.climber.maxLevel > 0;
    if (info.endgame && canClimb && info.clock < 14) this.state = 'climb';
    else if (this.state === 'collect' && (r.stored.length >= cap * 0.75 || (info.hubActive && r.stored.length >= 10))) this.state = 'score';
    else if (this.state === 'score' && r.stored.length === 0) this.state = 'collect';

    if (r.climb !== 'none') return cmd;

    this.retarget -= dt;
    if (this.state === 'collect') {
      if (this.retarget <= 0) {
        this.retarget = 1.2;
        this.target.copy(this.nearestFuel(field, p) ?? new THREE.Vector3(sign * 1.5 + Math.cos(this.wander), 0, Math.sin(this.wander) * 2));
      }
      cmd.intake = true;
    } else if (this.state === 'score') {
      // Shooting spot: inside our alliance zone, in front of the HUB.
      if (this.retarget <= 0) {
        this.retarget = 3;
        const hx = sign * HUB.centerX;
        this.target.set(hx + sign * (1.6 + Math.random() * 1.2), 0, (Math.random() - 0.5) * 3);
      }
      cmd.intake = true;
      const nearSpot = p.distanceTo(this.target) < 1.0;
      if (nearSpot && (info.hubActive || r.stored.length >= cap)) cmd.shoot = true;
    } else {
      const t = field.towers[r.alliance];
      this.target.set(t.rungX - sign * (r.halfLength + 0.4), 0, t.rungZ);
      if (r.canClimbHere(field) && p.distanceTo(this.target) < 0.9) cmd.climb = true;
    }

    // Steering toward the target with simple obstacle avoidance (HUBs, TOWERs).
    const to = new THREE.Vector3().subVectors(this.target, p);
    to.y = 0;
    const avoid = new THREE.Vector3();
    for (const a of ['blue', 'red'] as const) {
      const h = field.hubs[a].center;
      const d = new THREE.Vector3(p.x - h.x, 0, p.z - h.z);
      const dist = d.length();
      if (dist < 1.6) avoid.addScaledVector(d.normalize(), (1.6 - dist) * 3);
    }
    // Stay inside the field.
    if (Math.abs(p.z) > FIELD.width / 2 - 0.7) avoid.z -= Math.sign(p.z) * 2;
    if (Math.abs(p.x) > FIELD.length / 2 - 0.8) avoid.x -= Math.sign(p.x) * 2;
    const dir = to.clone().normalize().add(avoid);
    const dist = to.length();
    const speed = clamp(dist / 1.5, 0.15, 1);
    if (dir.lengthSq() > 1e-6 && dist > 0.25) dir.normalize().multiplyScalar(speed);
    else dir.set(0, 0, 0);
    // Field-frame command (refYaw 0 = +X forward, +Z right).
    cmd.x = dir.x;
    cmd.z = dir.z;
    // Face the direction of travel (intake forward), or the HUB when shooting (assist handles fixed shooters).
    let desiredYaw = Math.atan2(-dir.z, dir.x);
    if (this.state === 'climb' && dist < 1.2) desiredYaw = field.towers[r.alliance].climbYaw;
    if (dir.lengthSq() > 0.01 || this.state === 'climb') cmd.rot = clamp(wrapAngle(desiredYaw - yaw) * 1.5, -1, 1);
    if (cmd.shoot) cmd.rot = 0;

    // Unstick: if not moving for a while, back up and wander.
    if (p.distanceTo(this.lastPos) < 0.02 && dist > 0.5) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    this.lastPos.copy(p);
    if (this.stuckT > 1.2) {
      this.wander += 1.7;
      this.retarget = 0;
      this.stuckT = 0;
      this.target.set(p.x + Math.cos(this.wander) * 2, 0, p.z + Math.sin(this.wander) * 2);
    }
    return cmd;
  }

  private nearestFuel(field: Field, p: THREE.Vector3) {
    const f = field.fuel;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < f.capacity; i++) {
      if (f.state[i] !== 'field') continue;
      const q = f.position(i);
      if (q.y > 0.3) continue;
      // Avoid FUEL hugging walls, inside the HUB footprint, or in the opponent's depot.
      if (Math.abs(q.z) > FIELD.width / 2 - 0.35 || Math.abs(q.x) > FIELD.length / 2 - 0.35) continue;
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2 + Math.random() * 0.3;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return null;
    const q = f.position(best);
    return new THREE.Vector3(q.x, 0, q.z);
  }
}
