import { Kit, M, mat } from './kit';
import { swerveBase, turret, pivotIntake, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';

/**
 * 1690 Orbit — KEPLER.
 * Sources: reveal video thumbnail + Chief Delphi "Orbit 1690 2026 Robot Reveal – KEPLER" (team replies),
 * "Orbit 1690 Double Swipe Auto".
 *  - Low robot with a clear polycarbonate box hopper over a spindexer feeding a single channel
 *  - 25 × 29in (the 29in side is the intake side); fast roller intake
 *  - Compact gear-driven turret + shoot-on-the-move, intakes continuously while shooting
 *  - Shooter wheel recovery ~50 ms at top speed (enough for 20 BPS); ~13 BPS counted in the reveal
 *  - LEVEL 1 climb with hooks on the outside of the tower ("for now we stick to the L1 climb")
 *  - Capacity: community estimate 50–55; modeled box holds ~48
 */
const L = inches(25);
const W = inches(29);
const H = inches(21);
const TP: [number, number, number] = [-L / 2 + inches(5.5), inches(13), 0];
const BLUE = 0x2f66ff;

export const r1690: BuiltinRobot = {
  def: {
    id: 'builtin-1690',
    name: 'KEPLER',
    team: '1690',
    author: 'Orbit',
    color: '#2f66ff',
    description:
      'Low and compact. A clear hopper sits over a spindexer that feeds a single channel into a gear-driven turret. It intakes and shoots on the move at the same time.',
    highlights: ['Turret + SOTM, intakes while shooting', 'Spindexer single channel', '~13 BPS (reveal count)', '~48 FUEL', 'LEVEL 1 climb (team-confirmed)', 'Very low: fits under the TRENCH'],
    sources: ['Chief Delphi: Orbit 1690 2026 Robot Reveal: "KEPLER"', 'YouTube: FRC team 1690 Orbit 2026 robot reveal "KEPLER"'],
    frame: { length: L, width: W, height: H, mass: 57, comHeight: 0.15 },
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

    kit.polyBox('hopper', -L / 2 + inches(9), L / 2 - inches(0.5), -W / 2 + inches(0.4), W / 2 - inches(0.4), y0, H, { open: ['top', 'front'], decals: ['ORBIT', '1690 · KEPLER'] });
    // Guide funnel + roller floor + spindexer.
    for (const s of [-1, 1]) kit.box(`funnel_${s}`, [inches(1), y0 + inches(4), s * inches(10)], [inches(14), inches(0.15), inches(5)], M.polycarb(), undefined, [s * 0.55, 0, 0]);
    for (let k = 0; k < 4; k++) kit.tubeRoller(`floor_${k}`, L / 2 - inches(2.5) - k * inches(2.6), y0 + inches(0.8), -W / 2 + inches(2), W / 2 - inches(2), inches(0.6), 0xbfc5cc);
    const spindex = kit.group('spindexer');
    kit.cyl('spin_plate', [-inches(3), y0 + inches(0.6), 0], inches(8.5), inches(0.25), 'y', mat(0xe8ebef, { rough: 0.35 }), spindex, 40);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      kit.box(`spin_paddle_${k}`, [-inches(3) + Math.cos(a) * inches(4.2), y0 + inches(1.8), Math.sin(a) * inches(4.2)], [inches(8.2), inches(2.2), inches(0.25)], mat(BLUE, { metal: 0.3 }), spindex, [0, -a, 0]);
    }
    const vroller = kit.group('vertical_roller');
    kit.cyl('vroller_body', [-L / 2 + inches(9.5), y0 + inches(5), inches(5.5)], inches(1), inches(8), 'y', M.silicone(0xff3355), vroller, 16);
    kit.motor('spin_motor', [-inches(3), y0 - inches(1.4), inches(5)], 'y', undefined, true);

    // Compact gear-driven turret (rests facing backward).
    kit.pocketPlate('turret_tower_l', [TP[0], (y0 + TP[1]) / 2, -inches(4)], inches(7), TP[1] - y0, { color: 0x1d2026, cell: inches(2) });
    kit.pocketPlate('turret_tower_r', [TP[0], (y0 + TP[1]) / 2, inches(4)], inches(7), TP[1] - y0, { color: 0x1d2026, cell: inches(2) });
    const t = turret(kit, 't', TP, { ringR: inches(4.5), flywheelR: inches(2), flywheelW: inches(3.5), color: 0x1d2026, accent: BLUE });

    // Fast roller intake (pivot).
    const ipiv: [number, number, number] = [L / 2 - inches(1), y0 + inches(6), 0];
    const intake = pivotIntake(kit, 'intake', ipiv, inches(10), W, { color: 0x1d2026, wheel: 0xff3355, armAngle: 0.45 });

    // LEVEL 1 climber: closed-loop hooks that ride up the outside of the tower.
    const climb = kit.group('climber');
    for (const s of [-1, 1]) {
      kit.tube(`climb_tube_${s}`, [L / 2 - inches(6), y0, s * inches(9)], [L / 2 - inches(6), y0 + inches(12), s * inches(9)], [inches(1), inches(1)], climb);
      kit.box(`climb_hook_${s}`, [L / 2 - inches(4.8), y0 + inches(12.6), s * inches(9)], [inches(2.6), inches(1.2), inches(0.5)], mat(0xffd000, { metal: 0.3 }), climb);
    }
    kit.motor('climb_motor', [L / 2 - inches(6), y0 + inches(1.5), 0], 'z', undefined, true);
    kit.limelight([L / 2 - inches(2), H - inches(4), -W / 2 + inches(3)]);
    kit.led('led_l', [0, y0 + inches(0.6), -W / 2 - inches(0.1)], [L - inches(6), inches(0.6), 0.006], 0x9a7dff);
    kit.led('led_r', [0, y0 + inches(0.6), W / 2 + inches(0.1)], [L - inches(6), inches(0.6), 0.006], 0x9a7dff);

    rig.joint({ id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: ipiv, axis: [0, 0, 1], stowed: 100, active: 0, speed: 650 }, intake.group);
    rig.joint({ id: 'roll', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.rollerCenter, axis: [0, 0, 1], speed: 2400 }, intake.roller);
    rig.joint({ id: 'spindex', type: 'spin', driver: 'indexer', pivot: [-inches(3), y0, 0], axis: [0, 1, 0], speed: 720 }, spindex);
    rig.joint({ id: 'vroll', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(9.5), 0, inches(5.5)], axis: [0, 1, 0], speed: 1500 }, vroller);
    rig.joint({ id: 'turret', type: 'revolute', driver: 'turret', pivot: TP, axis: [0, 1, 0], stowed: 180, speed: 720 }, t.turretNode);
    rig.joint({ id: 'hood', type: 'revolute', driver: 'hood', parent: 'turret', pivot: t.hoodPivot, axis: [0, 0, 1], active: -24, speed: 220 }, t.hoodNode);
    rig.joint({ id: 'fly', type: 'spin', driver: 'shooter-wheel', parent: 'turret', pivot: t.flyCenter, axis: [0, 0, -1], speed: 3600 }, t.flyNode);
    rig.joint({ id: 'climber', type: 'prismatic', driver: 'climber', pivot: [L / 2 - inches(6), y0, 0], axis: [0, 1, 0], active: inches(8), speed: 0.35 }, climb);

    // The turret model points +X at joint 0; with stowed = 180 it rests facing back, so the
    // barrel exit (given at turret 0 relative to yawOffset = 180) is mirrored to the back.
    const exit: [number, number, number] = [TP[0] - (t.exit[0] - TP[0]), t.exit[1], TP[2]];
    const shooter = { ...r1690.def.shooter!, barrels: [{ exit, pivot: TP }] };
    return { model: kit.root, joints: rig.joints, parts: rig.parts, patch: { shooter } };
  },
};
