import * as THREE from 'three';
import type { Robot } from '../robot/Robot';
import type { Alliance } from '../game/scoring';
import { FIELD } from '../field/rebuilt/dims';

export type CameraMode = 'chase' | 'driver' | 'fpv' | 'overhead';
export const CAMERA_MODES: CameraMode[] = ['chase', 'driver', 'fpv', 'overhead'];
export const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: 'Third person',
  driver: 'Driver station',
  fpv: 'First person',
  overhead: 'Overhead',
};

/**
 * One player's camera. Also defines the "reference yaw" the driver's stick input is relative to.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'chase';
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private initialized = false;
  /** Smoothed yaw used for chase-camera-relative driving. */
  private chaseYaw = 0;
  /** Which driver station slot (0..2) the driver view uses. */
  station = 1;

  constructor(
    readonly alliance: Alliance,
    fov = 56,
  ) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 200);
  }

  /** Chase-camera drive frame, frozen while the driver is translating (null = follow the camera). */
  private heldYaw: number | null = null;

  /**
   * Yaw of "forward" for the driver's controls. In the chase camera the frame is captured when the driver starts
   * moving and held until they let go: if the camera is still swinging into place (after a camera switch), a straight
   * stick would otherwise curve (the "drift" in issue #4).
   */
  referenceYaw(robot: Robot, driveFrame: 'camera' | 'driver-station', translating = false): number {
    const dsYaw = this.alliance === 'blue' ? 0 : Math.PI;
    if (this.mode === 'fpv') return robot.yaw;
    if (driveFrame === 'driver-station' || this.mode === 'driver' || this.mode === 'overhead') {
      this.heldYaw = null;
      return dsYaw;
    }
    if (!translating) this.heldYaw = null;
    else this.heldYaw ??= this.chaseYaw;
    return this.heldYaw ?? this.chaseYaw;
  }

  setMode(m: CameraMode) {
    this.mode = m;
    this.initialized = false;
    this.heldYaw = null;
  }

  cycle() {
    const i = CAMERA_MODES.indexOf(this.mode);
    this.setMode(CAMERA_MODES[(i + 1) % CAMERA_MODES.length]);
  }

  private seenTeleports = 0;

  update(robot: Robot, dt: number) {
    if (robot.teleports !== this.seenTeleports) {
      // The robot was reset / placed: cut to it.
      this.seenTeleports = robot.teleports;
      this.initialized = false;
      this.heldYaw = null;
    }
    const p = robot.visual.position;
    const yaw = robot.yaw;
    const desiredPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();
    let snap = !this.initialized;
    const sign = this.alliance === 'blue' ? -1 : 1;
    switch (this.mode) {
      case 'chase': {
        // Follow the robot from its alliance's side of the field. The view doesn't swing round when the robot turns
        // (a swerve robot's heading has nothing to do with where it's driving), so stick directions on screen stay
        // put, as in MoSim / xRC-style follow cameras.
        const k = 1 - Math.exp(-dt * 2.2);
        const fieldYaw = this.alliance === 'blue' ? 0 : Math.PI;
        let d = fieldYaw - this.chaseYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.chaseYaw += snap ? d : d * k;
        const back = new THREE.Vector3(-Math.cos(this.chaseYaw), 0, Math.sin(this.chaseYaw));
        // Far and high enough to see the robot, the FUEL around it and where it's heading.
        desiredPos.copy(p).addScaledVector(back, 4.1).add(new THREE.Vector3(0, 2.7, 0));
        desiredLook.copy(p).addScaledVector(back, -2.2).add(new THREE.Vector3(0, 0.2, 0));
        break;
      }
      case 'driver': {
        // Standing behind the alliance wall at a station, watching the robot.
        // Station positions along the wall, clear of the TOWER (blue frame, mirrored for red).
        const zs = [-2.6, -1.25, 2.4][this.station] * -sign;
        desiredPos.set(sign * (FIELD.length / 2 + 0.9), 1.95, zs);
        desiredLook.set(p.x, 0.3, p.z);
        snap = snap || false;
        break;
      }
      case 'fpv': {
        const fwd = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const h = robot.def.frame.height + 0.12;
        desiredPos.copy(p).addScaledVector(fwd, robot.halfLength * 0.55).add(new THREE.Vector3(0, h + 0.05, 0));
        desiredLook.copy(desiredPos).addScaledVector(fwd, 5).add(new THREE.Vector3(0, -0.9, 0));
        snap = true;
        break;
      }
      case 'overhead': {
        desiredPos.set(sign * 2.5, 13, 0);
        desiredLook.set(sign * 0.6, 0, 0);
        break;
      }
    }
    if (snap) {
      this.pos.copy(desiredPos);
      this.look.copy(desiredLook);
      this.initialized = true;
    } else {
      const kp = 1 - Math.exp(-dt * (this.mode === 'driver' ? 20 : 8));
      const kl = 1 - Math.exp(-dt * (this.mode === 'driver' ? 6 : 14));
      this.pos.lerp(desiredPos, kp);
      this.look.lerp(desiredLook, kl);
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  setAspect(a: number) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}
