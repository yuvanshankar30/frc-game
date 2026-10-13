import * as THREE from 'three';
import { Kit, M, mat } from './kit';
import { swerveBase, turret, groundIntake, intakeGearbox, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';

/**
 * 1690 Orbit — KEPLER.
 * Sources: "FRC Orbit 1690 2026 Robot CAD Release" (Onshape + x_t, CAD render), reveal video + Chief Delphi
 * "Orbit 1690 2026 Robot Reveal – KEPLER" (team replies), BehindTheBumpers walkthrough.
 *  - 25 × 29in (the 29in side is the intake side); dark pocketed X-truss perimeter walls; curved pocketed arch over
 *    the top that carries the turret; clear polycarbonate panels on the hopper.
 *  - Turret + shoot-on-the-move that keeps intaking while shooting; spindexer feeding a single channel; roller floor,
 *    vertical roller and guide funnel; shooter wheel recovery ~50 ms at top speed; ~13 BPS counted in the reveal.
 *  - LEVEL 1 climb with closed-loop hooks on the outside of the tower ("for now we stick to the L1 climb").
 *  - Capacity: community estimate 50–55; modeled box holds ~48.
 */
const L = inches(25);
const W = inches(29);
const H = inches(21);
const TP: [number, number, number] = [-L / 2 + inches(6), inches(13), 0];
const DARK = 0xb9bfc7; // bare aluminum truss (photos / CAD)

export const r1690: BuiltinRobot = {
  def: {
    id: 'builtin-1690',
    name: 'KEPLER',
    team: '1690',
    author: 'Orbit',
    color: '#2f66ff',
    description:
      'Compact and low. Dark pocketed truss walls carry a curved arch with a gear-driven turret that shoots on the move. A spindexer feeds a single channel while the fast roller intake keeps pulling FUEL in.',
    highlights: ['Turret + SOTM, intakes while shooting', 'Spindexer → single channel', '~13 BPS (reveal count)', 'Pocketed truss walls + arch', 'LEVEL 1 climb (team-confirmed)', 'Very low: fits under the TRENCH'],
    sources: ['Chief Delphi: FRC Orbit 1690 2026 Robot CAD Release (Onshape + x_t, render)', 'Chief Delphi: Orbit 1690 2026 Robot Reveal: "KEPLER"', 'YouTube: FRC team 1690 Orbit 2026 robot reveal "KEPLER"'],
    frame: { length: L, width: W, height: H, mass: 57, comHeight: 0.15, bumperThickness: inches(3.25), bumperHeight: inches(5) },
    drivetrain: { type: 'swerve', maxSpeed: 4.7, maxAccel: 12, maxOmega: 11, maxAlpha: 36 },
    intake: {
      zones: [{ center: [L / 2 + inches(7.5), inches(3.5), 0], size: [inches(7), inches(7), W - inches(1)] }],
      rate: 18,
      requiresDeploy: true,
    },
    storage: {
      capacity: 48,
      preload: 8,
      box: { center: [inches(1.5), inches(10.6), 0], size: [inches(22), inches(15.5), W - inches(2)] },
      indexer: { mode: 'rotor', center: [-inches(3.5), 0], rps: 2 },
    },
    shooter: {
      barrels: [{ exit: [0, 0, 0] }],
      angle: 60,
      hoodMin: 44,
      hoodMax: 78,
      minSpeed: 4,
      maxSpeed: 15,
      rate: 13,
      spread: 0.9,
      turretMin: -200,
      turretMax: 200,
      turretSpeed: 720,
      yawOffset: 180,
      sotm: true,
    },
    climber: { maxLevel: 1, climbTime: 2.2, canAutoClimb: true },
    source: 'builtin:1690',
  },
  build() {
    const kit = new Kit('1690-kepler');
    const rig = new Rig();
    const base = swerveBase(kit, rig, L, W, { electronics: [inches(4), -inches(6)] });
    const y0 = base.railTop;

    // ---------- triangulated aluminum truss perimeter walls + clear inner panels
    const wallH = H - y0 - inches(2.5);
    const wy = y0 + wallH / 2;
    for (const s of [-1, 1]) {
      const z = s * (W / 2 - inches(0.3));
      kit.truss(`wall_truss_${s}`, [-L / 2 + inches(1), y0, z], [L / 2 - inches(3), y0, z], wallH, { color: DARK, member: inches(0.4), rows: 2 });
      kit.box(`wall_poly_${s}`, [-inches(1), wy, s * (W / 2 - inches(0.55))], [L - inches(4), wallH, 0.003], M.polycarb());
    }
    kit.truss('wall_truss_back', [-L / 2 + inches(0.4), y0, -W / 2 + inches(0.5)], [-L / 2 + inches(0.4), y0, W / 2 - inches(0.5)], wallH, { color: DARK, member: inches(0.4), rows: 2 });
    // Curved pocketed arch over the top (front-to-back), carrying the turret.
    const arch = new THREE.Shape();
    const R0 = inches(13);
    const R1 = inches(15.5);
    arch.absarc(0, 0, R1, Math.PI * 0.18, Math.PI * 0.82, false);
    arch.absarc(0, 0, R0, Math.PI * 0.82, Math.PI * 0.18, true);
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * (0.22 + k * 0.083);
      const h = new THREE.Path();
      h.absarc(Math.cos(a) * (R0 + R1) * 0.5, Math.sin(a) * (R0 + R1) * 0.5, inches(0.8), 0, Math.PI * 2, true);
      arch.holes.push(h);
    }
    for (const s of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(arch, { depth: inches(0.19), bevelEnabled: false });
      g.rotateY(Math.PI / 2);
      g.translate(s * inches(5.5) - inches(2), H - R1 - inches(0.5), 0);
      const m = new THREE.Mesh(g, mat(DARK, { metal: 0.45, rough: 0.45 }));
      m.rotation.y = 0;
      kit.add(m, `arch_${s}`);
    }
    kit.pocketPlate('arch_deck', [TP[0] + inches(2), TP[1] - inches(0.6), 0], inches(11), inches(14), { color: DARK, plane: 'xz', cell: inches(2.4), rib: inches(0.35) });

    // ---------- guide funnel + roller floor + spindexer + vertical roller
    for (const s of [-1, 1]) kit.box(`funnel_${s}`, [inches(1), y0 + inches(4), s * inches(10)], [inches(14), inches(0.15), inches(5)], M.polycarb(), undefined, [s * 0.55, 0, 0]);
    const floor = kit.group('roller_floor');
    for (let k = 0; k < 5; k++) kit.tubeRoller(`floor_${k}`, L / 2 - inches(2.5) - k * inches(2.4), y0 + inches(0.8), -W / 2 + inches(2), W / 2 - inches(2), inches(0.6), 0xbfc5cc, floor);
    const spindex = kit.group('spindexer');
    const SC: [number, number, number] = [-inches(3.5), y0 + inches(0.6), 0];
    kit.cyl('spin_plate', SC, inches(8.5), inches(0.25), 'y', mat(0xe8ebef, { rough: 0.35 }), spindex, 48);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      kit.box(`spin_paddle_${k}`, [SC[0] + Math.cos(a) * inches(4.2), SC[1] + inches(1.3), Math.sin(a) * inches(4.2)], [inches(8.2), inches(2.2), inches(0.25)], mat(0x2f66ff, { metal: 0.3 }), spindex, [0, -a, 0]);
    }
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(inches(8.8), inches(8.8), inches(3), 48, 1, true), mat(DARK, { metal: 0.3, opacity: 0.999 }));
    (ring.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    ring.position.set(SC[0], SC[1] + inches(1.6), 0);
    kit.add(ring, 'spin_wall');
    const vroller = kit.group('vertical_roller');
    kit.cyl('vroller_body', [-L / 2 + inches(9.5), y0 + inches(5), inches(5.5)], inches(1), inches(8), 'y', M.silicone(0xff3355), vroller, 16);
    kit.motor('spin_motor', [SC[0], y0 - inches(1.4), inches(5)], 'y', undefined, true);
    kit.motor('floor_motor', [L / 2 - inches(5), y0 - inches(1.3), -W / 2 + inches(3)], 'y', undefined, true);

    // ---------- compact gear-driven turret (rests facing backward), yellow printed parts
    kit.cyl('turret_column', [TP[0], (y0 + TP[1]) / 2, TP[2]], inches(2.2), TP[1] - y0, 'y', M.anodBlack());
    const t = turret(kit, 't', TP, { ringR: inches(4.5), flywheelR: inches(2), flywheelW: inches(3.5), color: 0x1d2026, accent: 0xf2c418 });
    kit.box('yellow_feed', [TP[0] + inches(2.5), TP[1] + inches(2), TP[2]], [inches(1.6), inches(2.4), inches(3.2)], mat(0xf2c418, { rough: 0.6 }));

    // ---------- fast roller intake (pivot) with kicker
    const ipiv: [number, number, number] = [L / 2 - inches(1.5), y0 + inches(5.5), 0];
    const intake = groundIntake(kit, 'intake', { bumper: { face: L / 2 + inches(3.25), top: inches(2.56) + inches(5) }, pivot: [ipiv[0], ipiv[1]], rollerX: L / 2 + inches(3.25) + inches(3.5), rollerR: inches(1.4), width: W, roller: 'silicone', wheel: 0xbfc5cc, armColor: DARK, kicker: true });
    intakeGearbox(kit, 'intake', [ipiv[0], ipiv[1]], -W / 2 + inches(2));

    // ---------- LEVEL 1 climber: closed-loop hooks that ride up the outside of the tower
    const climb = kit.group('climber');
    for (const s of [-1, 1]) {
      kit.tube(`climb_tube_${s}`, [L / 2 - inches(6), y0, s * inches(9)], [L / 2 - inches(6), y0 + inches(12), s * inches(9)], [inches(1), inches(1)], climb);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(inches(1.3), inches(0.3), 8, 18), mat(0xffd000, { metal: 0.3 }));
      hook.position.set(L / 2 - inches(5), y0 + inches(13.2), s * inches(9));
      kit.add(hook, `climb_hook_${s}`, climb);
    }
    kit.motor('climb_motor', [L / 2 - inches(6), y0 + inches(1.5), 0], 'z', undefined, true);
    kit.limelight([L / 2 - inches(2), H - inches(4), -W / 2 + inches(3)]);
    kit.led('led_l', [0, y0 + inches(0.6), -W / 2 - inches(0.1)], [L - inches(6), inches(0.6), 0.006], 0x9a7dff);
    kit.led('led_r', [0, y0 + inches(0.6), W / 2 + inches(0.1)], [L - inches(6), inches(0.6), 0.006], 0x9a7dff);
    for (const s of [-1, 1] as const) kit.sponsors(`sponsors_${s}`, [0, y0 + inches(5), s * (W / 2 - inches(0.62))], inches(14), inches(5), ['ORBIT', '1690', 'KEPLER', 'Binyamina'], 'xy', s, undefined, '#dfe6ee');

    rig.joint({ id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: ipiv, axis: [0, 0, 1], stowed: intake.deployAngleDeg + 95, active: 0, speed: 650 }, intake.group);
    rig.joint({ id: 'roll', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.rollerCenter, axis: [0, 0, 1], speed: 2400 }, intake.roller);
    if (intake.kickerNode) rig.joint({ id: 'intake_kick', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.kickerCenter!, axis: [0, 0, -1], speed: 2600 }, intake.kickerNode);
    rig.joint({ id: 'floor', type: 'spin', driver: 'indexer', pivot: [L / 2 - inches(2.5), y0 + inches(0.8), 0], axis: [0, 0, 1], speed: 1500 }, 'floor_0');
    rig.joint({ id: 'spindex', type: 'spin', driver: 'indexer', pivot: [SC[0], y0, 0], axis: [0, 1, 0], speed: 720 }, spindex);
    rig.joint({ id: 'vroll', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(9.5), 0, inches(5.5)], axis: [0, 1, 0], speed: 1500 }, vroller);
    rig.joint({ id: 'turret', type: 'revolute', driver: 'turret', pivot: TP, axis: [0, 1, 0], stowed: 180, speed: 720 }, t.turretNode);
    rig.joint({ id: 'hood', type: 'revolute', driver: 'hood', parent: 'turret', pivot: t.hoodPivot, axis: [0, 0, 1], active: -24, speed: 220 }, t.hoodNode);
    rig.joint({ id: 'fly', type: 'spin', driver: 'shooter-wheel', parent: 'turret', pivot: t.flyCenter, axis: [0, 0, -1], speed: 3600 }, t.flyNode);
    rig.joint({ id: 'climber', type: 'prismatic', driver: 'climber', pivot: [L / 2 - inches(6), y0, 0], axis: [0, 1, 0], active: inches(8), speed: 0.35 }, climb);

    // The turret model points +X at joint 0; with stowed = 180 it rests facing back (yawOffset 180).
    const exit: [number, number, number] = [TP[0] - (t.exit[0] - TP[0]), t.exit[1], TP[2]];
    const shooter = { ...r1690.def.shooter!, barrels: [{ exit, pivot: TP }] };
    const zones = [{ center: [intake.rollerCenter[0] + inches(1), inches(3.5), 0] as [number, number, number], size: [inches(6), inches(7), W - inches(1)] as [number, number, number] }];
    return { model: kit.root, joints: rig.joints, parts: rig.parts, patch: { shooter, intake: { ...r1690.def.intake!, zones } } };
  },
};
