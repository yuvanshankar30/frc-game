import { Kit, M, mat } from './kit';
import { swerveBase, turret, pivotIntake, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';

/**
 * 971 Spartan Robotics — Mixtape.
 * Sources: robot photo (github.com/frc971/971-second-robot-2026 README), released Onshape CAD screenshot,
 * robot code (subsystems: GroundPivot, GroundRollers, RollerFloor, Kicker, TurretLeft/Right, HoodLeft/Right,
 * FlywheelLeft/Right — no climber subsystem), Chief Delphi reveal thread.
 *  - Low chassis with a large clear polycarbonate hopper box across the front ~2/3 of the robot
 *  - Two individually controlled turrets in the rear corners, each with its own hood + flywheel (two streams)
 *  - Indexing: counter-rotating mecanum-wheel columns spindex FUEL against a fixed back wall, roller floor,
 *    horizontal roller pushing down into the spindexing pan, kickers into each turret
 *  - Pivoting ground intake (GroundPivot + GroundRollers)
 *  - Shot solver uses robot pose AND velocity (SOTM)
 *  - Capacity / BPS: estimates (~40 FUEL in the modeled box, ~20 BPS from both turrets)
 */
const L = inches(24.5);
const W = inches(29.5);
const H = inches(21.5);
const TL: [number, number, number] = [-L / 2 + inches(5), inches(13.5), -inches(8)];
const TR: [number, number, number] = [-L / 2 + inches(5), inches(13.5), inches(8)];
const BOX_X0 = -L / 2 + inches(9);
const BOX_X1 = L / 2 - inches(0.5);

export const r971: BuiltinRobot = {
  def: {
    id: 'builtin-971',
    name: 'Mixtape',
    team: '971',
    author: 'Spartan Robotics',
    color: '#d23a3a',
    description:
      'Twin-turret robot. A large clear hopper fills the front, FUEL spindexes off mecanum columns into kickers, and two independently aimed turrets fire two streams on the move.',
    highlights: ['Dual independent turrets + hoods', 'Mecanum-column spindexer', 'Pivoting ground intake', 'Shoot-on-the-move', 'Fits under the TRENCH', 'No climber (none in released code)'],
    sources: ['github.com/frc971/971-second-robot-2026 (Mixtape robot code + photo)', 'Chief Delphi: 971 CAD and Code Release 2026 (Onshape)', 'Chief Delphi: FRC 971 2026 robot reveal: "Mixtape"'],
    frame: { length: L, width: W, height: H, mass: 58, comHeight: 0.16 },
    drivetrain: { type: 'swerve', maxSpeed: 4.5, maxAccel: 10, maxOmega: 10, maxAlpha: 32 },
    intake: {
      zones: [{ center: [L / 2 + inches(7.5), inches(3.5), 0], size: [inches(6), inches(7), W - inches(2)] }],
      rate: 14,
      requiresDeploy: true,
    },
    storage: {
      capacity: 40,
      preload: 8,
      box: { center: [(BOX_X0 + BOX_X1) / 2 + inches(0.3), inches(11.7), 0], size: [BOX_X1 - BOX_X0 - inches(1), inches(16.5), W - inches(2)] },
    },
    shooter: {
      barrels: [{ exit: [0, 0, 0] }, { exit: [0, 0, 0] }],
      angle: 60,
      hoodMin: 45,
      hoodMax: 80,
      minSpeed: 4,
      maxSpeed: 15,
      rate: 20,
      spread: 1.0,
      turretMin: -110,
      turretMax: 110,
      turretSpeed: 600,
      yawOffset: 0,
      sotm: true,
    },
    climber: null,
    source: 'builtin:971',
  },
  build() {
    const kit = new Kit('971-mixtape');
    const rig = new Rig();
    const base = swerveBase(kit, rig, L, W, { electronics: [-inches(7), 0] });
    const y0 = base.railTop;

    // Big clear hopper box with sponsor decals.
    kit.polyBox('hopper', BOX_X0, BOX_X1, -W / 2 + inches(0.4), W / 2 - inches(0.4), y0, H - inches(0.5), {
      open: ['top', 'front'],
      decals: ['SPARTAN ROBOTICS', '971 · MIXTAPE'],
      decalColor: '#ffffff',
    });
    // Front lip (lower) so the intake can feed over it.
    kit.box('hopper_lip', [BOX_X1, y0 + inches(4), 0], [0.003, inches(8), W - inches(1)], M.polycarb());

    // Roller floor sloping toward the spindexer.
    const floor = kit.group('roller_floor');
    for (let k = 0; k < 6; k++) kit.tubeRoller(`floor_${k}`, BOX_X1 - inches(2) - k * inches(2.4), y0 + inches(0.9) + k * inches(0.15), -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(0.6), 0x2a2d33, floor);
    kit.motor('floor_motor', [BOX_X1 - inches(4), y0 - inches(1.4), -W / 2 + inches(3)], 'y', undefined, true);

    // Spindexing pan: two mecanum columns + fixed back wall + horizontal push-down roller.
    const pan = kit.group('pan');
    kit.box('back_wall', [BOX_X0 - inches(0.5), y0 + inches(6), 0], [inches(0.25), inches(10), W - inches(5)], mat(0x30343b, { metal: 0.4 }), pan);
    const colA = kit.group('mecanum_a');
    const colB = kit.group('mecanum_b');
    for (const [g, z, tag] of [
      [colA, -inches(4.5), 'a'],
      [colB, inches(4.5), 'b'],
    ] as const) {
      for (let k = 0; k < 4; k++) {
        kit.cyl(`mec_${tag}_${k}`, [BOX_X0 + inches(2.2), y0 + inches(1.5 + k * 2.5), z], inches(1.9), inches(1.5), 'y', mat(0x9aa4b0, { metal: 0.5, rough: 0.4 }), g, 18);
        for (let r = 0; r < 6; r++) {
          const a = (r / 6) * Math.PI * 2 + k;
          kit.box(`mec_${tag}_${k}_roller${r}`, [BOX_X0 + inches(2.2) + Math.cos(a) * inches(1.95), y0 + inches(1.5 + k * 2.5), z + Math.sin(a) * inches(1.95)], [inches(0.35), inches(1.6), inches(0.35)], M.black(), g, [0.6, -a, 0]);
        }
      }
    }
    kit.tubeRoller('pushdown', BOX_X0 + inches(4.5), y0 + inches(11), -inches(9), inches(9), inches(0.9), 0xffcc00);
    kit.motor('mec_motor_a', [BOX_X0 + inches(2.2), y0 - inches(1.4), -inches(4.5)], 'y', undefined, true);
    kit.motor('mec_motor_b', [BOX_X0 + inches(2.2), y0 - inches(1.4), inches(4.5)], 'y', undefined, true);

    // Twin turrets on rear towers.
    const tl = turret(kit, 'tl', TL, { ringR: inches(4), flywheelR: inches(1.5), flywheelW: inches(3), color: 0x1c1e22, accent: 0xb02020 });
    const tr = turret(kit, 'tr', TR, { ringR: inches(4), flywheelR: inches(1.5), flywheelW: inches(3), color: 0x1c1e22, accent: 0xb02020 });
    for (const p of [TL, TR]) {
      kit.pocketPlate('tower_plate', [p[0], (y0 + p[1]) / 2, p[2] - inches(3.2)], inches(6), p[1] - y0, { color: 0x1c1e22, cell: inches(2) });
      kit.pocketPlate('tower_plate', [p[0], (y0 + p[1]) / 2, p[2] + inches(3.2)], inches(6), p[1] - y0, { color: 0x1c1e22, cell: inches(2) });
    }
    const kickA = kit.tubeRoller('kicker_l', TL[0] + inches(3), y0 + inches(7), TL[2] - inches(2), TL[2] + inches(2), inches(1), 0x3a8a3a);
    const kickB = kit.tubeRoller('kicker_r', TR[0] + inches(3), y0 + inches(7), TR[2] - inches(2), TR[2] + inches(2), inches(1), 0x3a8a3a);

    // Pivoting ground intake (stows up in front of the hopper).
    const ipiv: [number, number, number] = [L / 2 - inches(0.5), y0 + inches(7.5), 0];
    const intake = pivotIntake(kit, 'intake', ipiv, inches(10.5), W - inches(0.5), { color: 0x24272d, wheel: 0x30c050, armAngle: 0.5 });
    kit.limelight([-L / 2 + inches(1), H - inches(3), 0], Math.PI);
    kit.led('led', [0, y0 + inches(0.6), -W / 2 - inches(0.1)], [L - inches(4), inches(0.6), 0.006], 0xff3030);

    rig.joint({ id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: ipiv, axis: [0, 0, 1], stowed: 112, active: 0, speed: 520 }, intake.group);
    rig.joint({ id: 'intake_roll', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.rollerCenter, axis: [0, 0, 1], speed: 2000 }, intake.roller);
    rig.joint({ id: 'floor', type: 'spin', driver: 'indexer', pivot: [BOX_X1 - inches(2), y0 + inches(0.9), 0], axis: [0, 0, 1], speed: 1200 }, 'floor_0');
    rig.joint({ id: 'mec_a', type: 'spin', driver: 'indexer', pivot: [BOX_X0 + inches(2.2), 0, -inches(4.5)], axis: [0, 1, 0], speed: 900 }, colA);
    rig.joint({ id: 'mec_b', type: 'spin', driver: 'indexer', pivot: [BOX_X0 + inches(2.2), 0, inches(4.5)], axis: [0, -1, 0], speed: 900 }, colB);
    rig.joint({ id: 'pushdown', type: 'spin', driver: 'indexer', pivot: [BOX_X0 + inches(4.5), y0 + inches(11), 0], axis: [0, 0, 1], speed: 1000 }, 'pushdown');
    rig.joint({ id: 'kick_l', type: 'spin', driver: 'indexer', pivot: [TL[0] + inches(3), y0 + inches(7), TL[2]], axis: [0, 0, -1], speed: 1500 }, kickA);
    rig.joint({ id: 'kick_r', type: 'spin', driver: 'indexer', pivot: [TR[0] + inches(3), y0 + inches(7), TR[2]], axis: [0, 0, -1], speed: 1500 }, kickB);
    rig.joint({ id: 'turret_l', type: 'revolute', driver: 'turret', pivot: TL, axis: [0, 1, 0], speed: 600 }, tl.turretNode);
    rig.joint({ id: 'turret_r', type: 'revolute', driver: 'turret', pivot: TR, axis: [0, 1, 0], speed: 600 }, tr.turretNode);
    rig.joint({ id: 'hood_l', type: 'revolute', driver: 'hood', parent: 'turret_l', pivot: tl.hoodPivot, axis: [0, 0, 1], active: -24, speed: 200 }, tl.hoodNode);
    rig.joint({ id: 'hood_r', type: 'revolute', driver: 'hood', parent: 'turret_r', pivot: tr.hoodPivot, axis: [0, 0, 1], active: -24, speed: 200 }, tr.hoodNode);
    rig.joint({ id: 'fly_l', type: 'spin', driver: 'shooter-wheel', parent: 'turret_l', pivot: tl.flyCenter, axis: [0, 0, -1], speed: 3600 }, tl.flyNode);
    rig.joint({ id: 'fly_r', type: 'spin', driver: 'shooter-wheel', parent: 'turret_r', pivot: tr.flyCenter, axis: [0, 0, -1], speed: 3600 }, tr.flyNode);

    const shooter = { ...r971.def.shooter!, barrels: [{ exit: tl.exit, pivot: TL }, { exit: tr.exit, pivot: TR }] };
    return { model: kit.root, joints: rig.joints, parts: rig.parts, patch: { shooter } };
  },
};
