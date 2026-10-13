import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stripHardware, HARDWARE_NAME, detectFormat } from './loaders';
import { mergeStatic } from './optimize';
import { autoRig } from '../editor/autorig';
import { newRobotDefinition } from '../editor/defaults';

const box = (name: string, w: number, h: number, d: number, x = 0, y = 0, z = 0, mat?: THREE.Material) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat ?? new THREE.MeshStandardMaterial());
  m.name = name;
  m.position.set(x, y, z);
  return m;
};

describe('CAD import cleanup', () => {
  it('recognizes FRC hardware names but not structure', () => {
    for (const n of ['Socket Head Cap Screw 10-32', 'SHCS_1/4-20x0.5', 'nylock nut', 'Washer #10', 'POP Rivet 3/16', '91251A537', 'Hex_Nut_3']) expect(HARDWARE_NAME.test(n)).toBe(true);
    for (const n of ['Intake Plate', 'Bellypan', 'Shooter Hood', 'Hex Shaft 1/2', 'Tube 2x1', 'Swerve Module FL']) expect(HARDWARE_NAME.test(n)).toBe(false);
  });

  it('removes fasteners and tiny parts, keeps the robot', () => {
    const root = new THREE.Group();
    const frame = new THREE.Group();
    frame.name = 'Frame';
    frame.add(box('Rail', 700, 50, 25), box('Bolt 10-32', 5, 5, 20), box('tiny spacer', 3, 3, 3));
    root.add(frame);
    const hw = new THREE.Group();
    hw.name = 'Hardware Screws';
    hw.add(box('a', 5, 5, 5));
    root.add(hw);
    root.updateMatrixWorld(true);
    const n = stripHardware(root, 0.001);
    expect(n).toBe(3);
    expect(root.getObjectByName('Rail')).toBeTruthy();
    expect(root.getObjectByName('Hardware Screws')).toBeFalsy();
  });

  it('detects the newer formats', () => {
    expect(detectFormat('bot.3MF')).toBe('3mf');
    expect(detectFormat('bot.fbx')).toBe('fbx');
    expect(detectFormat('bot.ply')).toBe('ply');
    expect(detectFormat('bot.stp')).toBe('step');
  });
});

describe('static mesh merging', () => {
  it('merges parts per material and leaves joint subtrees alone', () => {
    const chassis = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 'red' });
    const grey = new THREE.MeshStandardMaterial({ color: 'grey' });
    for (let i = 0; i < 20; i++) chassis.add(box(`p${i}`, 0.1, 0.1, 0.1, i * 0.2, 0, 0, i % 2 ? red : grey));
    const pivot = new THREE.Group();
    pivot.name = 'joint:intake';
    pivot.add(box('roller', 0.5, 0.05, 0.05));
    chassis.add(pivot);
    const removed = mergeStatic([chassis], (o) => o.name.startsWith('joint:'));
    expect(removed).toBe(20);
    const merged = chassis.children.filter((c) => c.name.startsWith('merged:'));
    expect(merged.length).toBe(2);
    expect(chassis.getObjectByName('roller')?.parent).toBe(pivot);
    // Same world-space bounds as the 20 boxes.
    const b = new THREE.Box3().setFromObject(merged[0].parent!);
    expect(b.max.x).toBeCloseTo(3.85, 3);
  });
});

describe('auto-rig', () => {
  it('rigs subsystems from part names with sensible pivots and axes', () => {
    const model = new THREE.Group();
    const turret = new THREE.Group();
    turret.name = 'Turret Assembly';
    turret.add(box('Turret Plate', 0.3, 0.02, 0.3, 0, 0.5, 0));
    const hood = box('Shooter Hood', 0.15, 0.1, 0.2, 0.1, 0.6, 0);
    turret.add(hood);
    model.add(turret);
    model.add(box('Intake Roller', 0.05, 0.05, 0.6, 0.45, 0.1, 0));
    model.add(box('Wheel FL', 0.1, 0.1, 0.04, 0.3, 0.05, -0.3));
    const def = newRobotDefinition('t');
    def.model.scale = 1;
    def.model.rotation = [0, 0, 0];
    const r = autoRig(def, model);
    const byKind = Object.fromEntries(r.joints.map((j) => [j.name.split(':')[0], j]));
    expect(byKind.turret.axis).toEqual([0, 1, 0]);
    expect(byKind.hood.parent).toBe(byKind.turret.id);
    expect(byKind['intake-roller'].axis).toEqual([0, 0, 1]);
    expect(byKind.wheel.axis).toEqual([0, 0, 1]);
    expect(r.parts.find((p) => p.node === 'Shooter Hood')?.joint).toBe(byKind.hood.id);
  });
});
