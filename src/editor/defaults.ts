import type * as THREE from 'three';
import { parseRobot, type RobotDefinition } from '../robot/schema';

/** A sensible starting definition for a freshly imported robot. */
export function newRobotDefinition(name: string): RobotDefinition {
  const L = 0.7;
  const W = 0.7;
  return parseRobot({
    id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name || 'My Robot',
    color: '#f2c418',
    description: 'Custom robot imported from CAD.',
    frame: { length: L, width: W, height: 0.55 },
    drivetrain: { type: 'swerve', maxSpeed: 4.4, maxAccel: 10, maxOmega: 10, maxAlpha: 30 },
    intake: { zones: [{ center: [L / 2 + 0.16, 0.1, 0], size: [0.16, 0.16, W - 0.05] }], rate: 12, requiresDeploy: false },
    storage: { capacity: 40, preload: 8, box: { center: [0, 0.25, 0], size: [L * 0.75, 0.25, W * 0.8] } },
    shooter: { barrels: [{ exit: [-0.1, 0.6, 0], pivot: [0, 0, 0] }], angle: 60, minSpeed: 4, maxSpeed: 15, rate: 10 },
    climber: null,
    source: 'package',
  });
}

/** Set the frame size from a bounding box in the robot frame (assumes bumpers are not in the CAD). */
export function fitFrameToBounds(d: RobotDefinition, box: THREE.Box3) {
  const sx = box.max.x - box.min.x;
  const sy = box.max.y - box.min.y;
  const sz = box.max.z - box.min.z;
  if (sx > 0.1 && sx < 2) d.frame.length = Math.round(sx * 1000) / 1000;
  if (sz > 0.1 && sz < 2) d.frame.width = Math.round(sz * 1000) / 1000;
  if (sy > 0.05 && sy < 2.5) d.frame.height = Math.round(sy * 1000) / 1000;
  // Keep the default intake + hopper glued to the new frame.
  if (d.intake && d.intake.zones.length === 1) {
    d.intake.zones[0].center = [d.frame.length / 2 + d.frame.bumperThickness + 0.08, 0.1, 0];
    d.intake.zones[0].size = [0.16, 0.16, d.frame.width - 0.04];
  }
  if (d.storage.box) {
    d.storage.box.center = [0, d.frame.height * 0.45, 0];
    d.storage.box.size = [d.frame.length * 0.75, d.frame.height * 0.4, d.frame.width * 0.8];
  }
  if (d.shooter && d.shooter.barrels.length === 1) d.shooter.barrels[0].exit = [-d.frame.length * 0.15, d.frame.height + 0.04, 0];
  return d;
}
