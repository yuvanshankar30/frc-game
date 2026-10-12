import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { RobotDefinition } from '../robot/schema';
import { assemble, applyJoint, type Assembly } from '../robot/assemble';
import { makeBumpers } from '../robot/bumpers';
import { FUEL } from '../field/rebuilt/dims';
import { DEG } from '../util/units';

export type GizmoTarget =
  | { kind: 'model' }
  | { kind: 'pivot'; joint: string }
  | { kind: 'intake'; index: number }
  | { kind: 'barrel'; index: number; which: 'exit' | 'pivot' }
  | { kind: 'hopper' }
  | null;

export const JOINT_COLORS = [0xff5a5f, 0x3ad07a, 0x4ea3ff, 0xffb020, 0xc77dff, 0x00d1c1, 0xff7ab6, 0xa3e635, 0xf97316, 0x60a5fa];

/**
 * 3D viewport for the robot editor: shows the assembled robot in the robot frame with
 * overlays (frame/bumpers, joint pivots, intake zones, shooter exits, hopper) and gizmos.
 */
export class EditorViewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  readonly orbit: OrbitControls;
  readonly gizmo: TransformControls;
  private gizmoHelper: THREE.Object3D;
  private proxy = new THREE.Object3D();
  private robotRoot = new THREE.Group();
  private overlays = new THREE.Group();
  private asm: Assembly | null = null;
  private raf = 0;
  private resizeObs: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private highlight = new Set<THREE.Mesh>();
  private highlightMat = new THREE.MeshStandardMaterial({ color: 0xffd400, emissive: 0x806000, transparent: true, opacity: 0.85 });
  private origMats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private target: GizmoTarget = null;
  private def: RobotDefinition | null = null;
  /** Joint value overrides for preview sliders. */
  previewValues = new Map<string, number>();
  showOverlays = true;
  ghostChassis = false;

  /** Called when the user clicks a mesh (node name) — or null for empty space. */
  onPick: (node: string | null, shift: boolean) => void = () => {};
  /** Called when the gizmo moves its target. */
  onGizmoChange: (t: NonNullable<GizmoTarget>, obj: THREE.Object3D) => void = () => {};

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(0x10131a);
    this.scene.add(new THREE.HemisphereLight(0xeef2ff, 0x30333a, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    const back = new THREE.DirectionalLight(0x99bbff, 0.8);
    back.position.set(-3, 2, -2);
    this.scene.add(back);
    const grid = new THREE.GridHelper(4, 40, 0x3a4560, 0x232a3a);
    this.scene.add(grid);
    // Robot-frame axes: +X forward (red), +Z right (blue).
    const fwd = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.002, 0), 0.75, 0xff4444, 0.08, 0.05);
    const right = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.002, 0), 0.5, 0x4488ff, 0.06, 0.04);
    this.scene.add(fwd, right);
    const label = makeLabel('FRONT (+X)', '#ff6b6b');
    label.position.set(0.85, 0.05, 0);
    this.scene.add(label);
    this.scene.add(this.robotRoot, this.overlays);

    this.camera.position.set(1.4, 1.1, 1.6);
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.target.set(0, 0.25, 0);
    this.orbit.enableDamping = true;
    this.gizmo = new TransformControls(this.camera, canvas);
    this.gizmo.setSize(0.8);
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !(e as unknown as { value: boolean }).value;
    });
    this.gizmo.addEventListener('objectChange', () => {
      if (this.target) this.onGizmoChange(this.target, this.proxy);
    });
    this.gizmoHelper = this.gizmo.getHelper();
    this.scene.add(this.gizmoHelper);
    this.scene.add(this.proxy);

    let downAt = { x: 0, y: 0 };
    canvas.addEventListener('pointerdown', (e) => (downAt = { x: e.clientX, y: e.clientY }));
    canvas.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
      if ((this.gizmo as unknown as { dragging: boolean }).dragging) return;
      this.pick(e);
    });
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
    this.loop();
  }

  private pick(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes: THREE.Object3D[] = [];
    this.robotRoot.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.pickable) meshes.push(o);
    });
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    this.onPick(hit ? hit.object.name : null, e.shiftKey);
  }

  /** Rebuild the robot visual from a fresh clone of the raw model. */
  setRobot(def: RobotDefinition, rawModel: THREE.Object3D | null) {
    this.def = def;
    this.clearHighlight();
    this.robotRoot.clear();
    this.asm = null;
    if (rawModel) {
      const clone = rawModel.clone(true);
      clone.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.userData.pickable = true;
      });
      this.asm = assemble(def, clone);
      this.robotRoot.add(this.asm.root);
      for (const [id, v] of this.previewValues) {
        const jt = this.asm.joints.get(id);
        if (jt) {
          jt.value = v;
          applyJoint(jt);
        }
      }
    }
    const bumpers = makeBumpers(def, 0x1f5fff, def.team || 'TEAM');
    bumpers.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => {
          const c = (x as THREE.MeshStandardMaterial).clone();
          c.transparent = true;
          c.opacity = 0.3;
          return c;
        });
        m.material = mat;
      }
    });
    this.robotRoot.add(bumpers);
    this.rebuildOverlays();
    this.attachGizmo(this.target);
  }

  /** Apply a preview value to a joint without a full rebuild. */
  setPreview(id: string, value: number | null) {
    if (value === null) this.previewValues.delete(id);
    else this.previewValues.set(id, value);
    const jt = this.asm?.joints.get(id);
    if (jt) {
      jt.value = value ?? (jt.def.type === 'spin' ? 0 : jt.def.stowed);
      applyJoint(jt);
    }
  }

  highlightNodes(names: string[], color?: number) {
    this.clearHighlight();
    if (!names.length) return;
    const set = new Set(names);
    const mat = color !== undefined ? new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 }) : this.highlightMat;
    this.robotRoot.traverse((o) => {
      if (!set.has(o.name)) return;
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh && m.userData.pickable && !this.origMats.has(m)) {
          this.origMats.set(m, m.material);
          m.material = mat;
          this.highlight.add(m);
        }
      });
    });
  }

  clearHighlight() {
    for (const m of this.highlight) {
      const orig = this.origMats.get(m);
      if (orig) m.material = orig;
    }
    this.highlight.clear();
    this.origMats.clear();
  }

  /** Tint every part by the joint it is mapped to. */
  tintByJoint(def: RobotDefinition) {
    const colorOf = new Map(def.joints.map((j, i) => [j.id, JOINT_COLORS[i % JOINT_COLORS.length]]));
    const groups = new Map<number, string[]>();
    for (const p of def.parts) {
      if (!p.joint) continue;
      const c = colorOf.get(p.joint);
      if (c === undefined) continue;
      groups.set(c, [...(groups.get(c) ?? []), p.node]);
    }
    this.clearHighlight();
    for (const [color, nodes] of groups) {
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 });
      const set = new Set(nodes);
      this.robotRoot.traverse((o) => {
        if (!set.has(o.name)) return;
        o.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh && m.userData.pickable && !this.origMats.has(m)) {
            this.origMats.set(m, m.material);
            m.material = mat;
            this.highlight.add(m);
          }
        });
      });
    }
  }

  rebuildOverlays() {
    this.overlays.clear();
    const def = this.def;
    if (!def || !this.showOverlays) return;
    const f = def.frame;
    // Frame perimeter (without bumpers) and height box.
    const frameBox = new THREE.Box3(new THREE.Vector3(-f.length / 2, 0, -f.width / 2), new THREE.Vector3(f.length / 2, f.height, f.width / 2));
    this.overlays.add(new THREE.Box3Helper(frameBox, new THREE.Color(0x8899aa)));
    // Extension limit (12in).
    const ext = 0.3048;
    const extBox = new THREE.Box3(new THREE.Vector3(-f.length / 2 - ext, 0, -f.width / 2 - ext), new THREE.Vector3(f.length / 2 + ext, 0.002, f.width / 2 + ext));
    this.overlays.add(new THREE.Box3Helper(extBox, new THREE.Color(0x404858)));
    // Trench clearance line.
    const trench = new THREE.Mesh(new THREE.PlaneGeometry(f.length + 0.3, f.width + 0.3), new THREE.MeshBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.08, side: THREE.DoubleSide }));
    trench.rotation.x = -Math.PI / 2;
    trench.position.y = 0.5652;
    this.overlays.add(trench);
    // Wheels.
    const wx = f.length / 2 - f.wheelInset;
    const wz = f.width / 2 - f.wheelInset;
    for (const [x, z] of [[wx, wz], [wx, -wz], [-wx, wz], [-wx, -wz]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(f.wheelRadius, f.wheelRadius, 0.03, 16), new THREE.MeshBasicMaterial({ color: 0x55ffaa, wireframe: true }));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, f.wheelRadius, z);
      this.overlays.add(w);
    }
    // Joint pivots + axes.
    def.joints.forEach((j, i) => {
      const color = JOINT_COLORS[i % JOINT_COLORS.length];
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 8), new THREE.MeshBasicMaterial({ color, depthTest: false }));
      s.position.fromArray(j.pivot);
      s.renderOrder = 10;
      this.overlays.add(s);
      const axis = new THREE.Vector3().fromArray(j.axis).normalize();
      if (axis.lengthSq() > 0) {
        const arrow = new THREE.ArrowHelper(axis, s.position, 0.15, color, 0.04, 0.025);
        (arrow.line.material as THREE.LineBasicMaterial).depthTest = false;
        this.overlays.add(arrow);
      }
    });
    // Intake zones.
    def.intake?.zones.forEach((z) => {
      const b = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3().fromArray(z.center), new THREE.Vector3().fromArray(z.size));
      this.overlays.add(new THREE.Box3Helper(b, new THREE.Color(0x3ad07a)));
    });
    // Hopper.
    if (def.storage.box) {
      const b = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3().fromArray(def.storage.box.center), new THREE.Vector3().fromArray(def.storage.box.size));
      this.overlays.add(new THREE.Box3Helper(b, new THREE.Color(0xf2c418)));
    }
    // Shooter barrels: exit points + direction arrows (at turret 0, hood mid).
    const sh = def.shooter;
    if (sh) {
      const elev = ((sh.hoodMin !== null && sh.hoodMax !== null ? (sh.hoodMin + sh.hoodMax) / 2 : sh.angle) * DEG);
      const yaw = sh.yawOffset * DEG;
      const dir = new THREE.Vector3(Math.cos(elev) * Math.cos(yaw), Math.sin(elev), -Math.cos(elev) * Math.sin(yaw));
      sh.barrels.forEach((b) => {
        const p = new THREE.Vector3().fromArray(b.exit);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(FUEL.radius, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffd400, wireframe: true }));
        ball.position.copy(p);
        this.overlays.add(ball);
        this.overlays.add(new THREE.ArrowHelper(dir, p, 0.45, 0xffd400, 0.07, 0.04));
        if (sh.turretMin !== null) {
          const piv = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.06, 24), new THREE.MeshBasicMaterial({ color: 0xff9900, side: THREE.DoubleSide }));
          piv.rotation.x = -Math.PI / 2;
          piv.position.set(b.pivot[0], b.exit[1] - 0.05, b.pivot[2]);
          this.overlays.add(piv);
        }
      });
    }
  }

  /** Attach the gizmo to an editable thing. */
  attachGizmo(t: GizmoTarget, mode: 'translate' | 'rotate' | 'scale' = 'translate') {
    this.target = t;
    const def = this.def;
    if (!t || !def) {
      this.gizmo.detach();
      return;
    }
    this.proxy.position.set(0, 0, 0);
    this.proxy.rotation.set(0, 0, 0);
    this.proxy.scale.set(1, 1, 1);
    switch (t.kind) {
      case 'model':
        this.proxy.position.fromArray(def.model.position);
        this.proxy.rotation.set(def.model.rotation[0] * DEG, def.model.rotation[1] * DEG, def.model.rotation[2] * DEG, 'YXZ');
        break;
      case 'pivot': {
        const j = def.joints.find((x) => x.id === t.joint);
        if (!j) return this.gizmo.detach();
        this.proxy.position.fromArray(j.pivot);
        mode = 'translate';
        break;
      }
      case 'intake': {
        const z = def.intake?.zones[t.index];
        if (!z) return this.gizmo.detach();
        this.proxy.position.fromArray(z.center);
        this.proxy.scale.fromArray(z.size);
        break;
      }
      case 'hopper': {
        const b = def.storage.box;
        if (!b) return this.gizmo.detach();
        this.proxy.position.fromArray(b.center);
        this.proxy.scale.fromArray(b.size);
        break;
      }
      case 'barrel': {
        const b = def.shooter?.barrels[t.index];
        if (!b) return this.gizmo.detach();
        this.proxy.position.fromArray(t.which === 'exit' ? b.exit : b.pivot);
        mode = 'translate';
        break;
      }
    }
    this.gizmo.setMode(mode);
    this.gizmo.attach(this.proxy);
  }

  /** Bounding box of the placed model (robot frame), ignoring bumpers/overlays. */
  modelBounds(): THREE.Box3 | null {
    if (!this.asm) return null;
    this.asm.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    this.asm.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) box.expandByObject(o);
    });
    return box.isEmpty() ? null : box;
  }

  frameCamera() {
    const box = this.modelBounds() ?? new THREE.Box3(new THREE.Vector3(-0.4, 0, -0.4), new THREE.Vector3(0.4, 0.6, 0.4));
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3()).length();
    this.orbit.target.copy(c);
    this.camera.position.copy(c).add(new THREE.Vector3(1, 0.75, 1.1).normalize().multiplyScalar(Math.max(0.8, s * 1.4)));
  }

  setView(v: 'front' | 'side' | 'top' | 'iso') {
    const t = this.orbit.target;
    const d = this.camera.position.distanceTo(t);
    const dir = { front: [1, 0.15, 0], side: [0, 0.15, 1], top: [0.001, 1, 0], iso: [1, 0.75, 1.1] }[v];
    this.camera.position.copy(t).add(new THREE.Vector3(...(dir as [number, number, number])).normalize().multiplyScalar(d));
  }

  private resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.gizmo.dispose();
    this.orbit.dispose();
    this.renderer.dispose();
  }
}

function makeLabel(text: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = 'bold 30px Inter, Arial';
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.32, 0.08, 1);
  return s;
}
