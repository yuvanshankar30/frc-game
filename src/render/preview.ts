import * as THREE from 'three';
import { assemble, stepJoint, type Assembly } from '../robot/assemble';
import { makeBumpers } from '../robot/bumpers';
import { ALLIANCE_COLOR } from '../field/rebuilt/Field';
import type { RobotDefinition } from '../robot/schema';
import { initPhysics, createWorld } from '../physics/world';
import { applyEnvironment } from './environment';
import { Field } from '../field/rebuilt/Field';
import { BUILTINS, buildBuiltin, loadRobot } from '../robots/registry';

/** Build a static robot visual (no physics) with bumpers. */
export function robotVisual(def: RobotDefinition, model: THREE.Object3D, alliance: 'blue' | 'red') {
  const asm = assemble(def, model);
  const g = new THREE.Group();
  g.add(asm.root);
  g.add(makeBumpers(def, ALLIANCE_COLOR[alliance], def.team || def.name.slice(0, 5)));
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { group: g, asm };
}

/** Turntable preview of one robot, with mouse drag to orbit. */
export class RobotPreview {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
  private current: THREE.Group | null = null;
  private asm: Assembly | null = null;
  private raf = 0;
  private yaw = -0.7;
  private pitch = 0.42;
  private dragging = false;
  private auto = true;
  private t = 0;
  private token = 0;
  private resizeObs: ResizeObserver;
  alliance: 'blue' | 'red' = 'blue';

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.scene.add(new THREE.HemisphereLight(0xe6eeff, 0x303440, 1.2));
    applyEnvironment(this.renderer, this.scene, 0.8);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 4, 2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -1.2;
    sc.right = sc.top = 1.2;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.8);
    rim.position.set(-3, 2, -2);
    this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), new THREE.MeshStandardMaterial({ color: 0x2a2f3c, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointermove', this.onMove);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
    this.loop();
  }

  private onDown = () => {
    this.dragging = true;
    this.auto = false;
  };
  private onUp = () => {
    this.dragging = false;
  };
  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.yaw -= e.movementX * 0.01;
    this.pitch = Math.min(1.3, Math.max(0.05, this.pitch + e.movementY * 0.006));
  };

  async show(id: string) {
    const tok = ++this.token;
    const { def, model } = await loadRobot(id);
    if (tok !== this.token) return;
    this.setVisual(def, model);
  }

  setVisual(def: RobotDefinition, model: THREE.Object3D) {
    if (this.current) this.scene.remove(this.current);
    const { group, asm } = robotVisual(def, model, this.alliance);
    this.current = group;
    this.asm = asm;
    this.scene.add(group);
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
    const dt = 1 / 60;
    this.t += dt;
    if (this.auto) this.yaw += dt * 0.35;
    const r = 2.25;
    this.camera.position.set(Math.cos(this.yaw) * Math.cos(this.pitch) * r, 0.25 + Math.sin(this.pitch) * r, Math.sin(this.yaw) * Math.cos(this.pitch) * r);
    this.camera.lookAt(0, 0.28, 0);
    // Gently cycle mechanisms so the preview shows them moving.
    if (this.asm) {
      const phase = Math.sin(this.t * 0.8) > 0;
      for (const jt of this.asm.joints.values()) {
        const d = jt.def;
        if (d.driver === 'intake-deploy') jt.target = phase ? d.active : d.stowed;
        else if (d.driver === 'turret') jt.target = d.stowed + Math.sin(this.t * 0.6) * 60;
        else if (d.type === 'spin') jt.target = d.driver === 'wheel' ? 0 : 0.4;
        else if (d.driver === 'hood') jt.target = d.stowed + (Math.sin(this.t) * 0.5 + 0.5) * (d.active - d.stowed);
        stepJoint(jt, dt);
      }
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointermove', this.onMove);
    this.renderer.dispose();
  }
}

/** Main-menu backdrop: the REBUILT field with all built-in robots lined up, slow orbit. */
export class MenuShowcase {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
  private raf = 0;
  private t = 0;
  private disposed = false;
  private resizeObs: ResizeObserver;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
    void this.init();
  }

  private async init() {
    const { createArena } = await import('./scene');
    await initPhysics();
    if (this.disposed) return;
    createArena(this.scene, { shadows: true, pixelRatio: 1.5, antialias: true });
    applyEnvironment(this.renderer, this.scene, 0.55);
    const world = createWorld();
    const field = new Field(world, this.scene);
    field.stageFuel();
    field.sync();
    // Line up the robots in front of the blue HUB, alternating alliances.
    BUILTINS.forEach((b, i) => {
      const { def, model } = buildBuiltin(b);
      const alliance = i % 2 === 0 ? 'blue' : 'red';
      const { group } = robotVisual(def, model, alliance);
      // A loose arc in the neutral zone between the blue HUB and the FUEL.
      const z = -2.9 + i * 1.16;
      group.position.set(-2.2 - Math.abs(z) * 0.18, 0, z);
      group.rotation.y = -z * 0.15;
      this.scene.add(group);
    });
    this.loop();
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
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.t += 1 / 60;
    const a = Math.sin(this.t * 0.06) * 0.55;
    const cx = -2.4;
    this.camera.position.set(cx + Math.cos(a) * 4.4, 1.6 + Math.sin(this.t * 0.1) * 0.2, Math.sin(a) * 4.2);
    this.camera.lookAt(cx, 0.35, 0);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.renderer.dispose();
  }
}
