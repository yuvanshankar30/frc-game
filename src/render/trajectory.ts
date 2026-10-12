import * as THREE from 'three';
import type { Robot } from '../robot/Robot';
import type { Field } from '../field/rebuilt/Field';
import { FUEL_AIR_DAMPING } from '../robot/ballistics';
import { HUB } from '../field/rebuilt/dims';

const N = 90;
const DT = 1 / 60;

/** Dotted arc showing where the next FUEL would go with the current aim. */
export class TrajectoryPreview {
  private line: THREE.Line;
  private positions = new Float32Array(N * 3);

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.LineDashedMaterial({ color: 0xffe066, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.85 });
    this.line = new THREE.Line(geo, mat);
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);
  }

  update(robot: Robot, field: Field, visible: boolean) {
    const shot = visible && robot.stored.length > 0 && robot.climb === 'none' ? robot.previewShot() : null;
    if (!shot) {
      this.line.visible = false;
      return;
    }
    const p = shot.pos.clone();
    const v = shot.vel.clone();
    const k = Math.pow(1 / (1 + FUEL_AIR_DAMPING / 120), 2);
    const hub = field.hubs[robot.alliance].target;
    let count = 0;
    for (let i = 0; i < N; i++) {
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
      count = i + 1;
      v.y -= 9.81 * DT;
      v.multiplyScalar(k);
      p.addScaledVector(v, DT);
      if (p.y < 0) break;
      // Stop at the HUB opening plane on the way down.
      if (v.y < 0 && p.y < HUB.openingHeight && Math.hypot(p.x - hub.x, p.z - hub.z) < 0.6) {
        count++;
        if (count <= N) {
          this.positions[(count - 1) * 3] = p.x;
          this.positions[(count - 1) * 3 + 1] = p.y;
          this.positions[(count - 1) * 3 + 2] = p.z;
        }
        break;
      }
    }
    const geo = this.line.geometry as THREE.BufferGeometry;
    geo.setDrawRange(0, Math.min(count, N));
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.line.computeLineDistances();
    this.line.visible = true;
  }
}
