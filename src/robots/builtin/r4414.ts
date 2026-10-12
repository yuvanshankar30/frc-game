import { Kit, M, mat } from './kit';
import { swerveBase, turret, type BuiltinRobot, type JointIn, type PartIn } from './common';
import { inches } from '../../util/units';

/**
 * 4414 HighTide — RIPCURRENT (2026 World Champions, Daly division captain).
 * Sources: 4414 2026 Technical Binder (2026.team4414.com) & Chief Delphi binder thread.
 *  - "25 × 32in" swerve base per the binder, Kraken X60 drive at 7.67:1. 25×32 is a 114in
 *    perimeter (> 110in, R104), so that figure likely includes bumper mounts; the frame here
 *    is modeled at 23.5 × 31.5in (110in) with the same proportions.
 *  - Sliding box intake on racks (2× X60 + X44 bottom bar), extending hopper: 85+ FUEL under the trench
 *  - "Dye Rotor" indexer optimized for high-BPS single-stream shooting, ~12–14 BPS gap-free
 *  - Turret (55.7:1, cable-chain) with a 3in flywheel on 4× Kraken X44, shoot-on-the-move
 *  - No climber in the binder
 */
const L = inches(23.5);
const W = inches(31.5);
const H = inches(21.5);
const EXT = inches(10); // intake/hopper extension

const TURRET_PIVOT: [number, number, number] = [-inches(6.5), inches(13), 0];

export const r4414: BuiltinRobot = {
  def: {
    id: 'builtin-4414',
    name: 'RIPCURRENT',
    team: '4414',
    author: 'HighTide',
    color: '#00a3e0',
    description:
      'Champion turret robot. Sliding box intake with an extending hopper that swallows 85+ FUEL, a Dye Rotor single-stream indexer, and a 3in flywheel turret that shoots on the move.',
    highlights: ['2026 World Champion (Daly captain)', 'Extending hopper: 85+ FUEL', 'Dye Rotor → single stream ~14 BPS', 'Turret + shoot-on-the-move', 'Fits under the TRENCH', 'No climb'],
    sources: ['4414 2026 Technical Binder — 2026.team4414.com', 'Chief Delphi: "Team 4414 HighTide 2026 Tech Binder — RIPCURRENT"'],
    frame: { length: L, width: W, height: H, mass: 60, comHeight: 0.17 },
    drivetrain: { type: 'swerve', maxSpeed: 4.1, maxAccel: 10, maxOmega: 10, maxAlpha: 32 },
    intake: {
      zones: [{ center: [L / 2 + inches(3.25) + EXT - inches(1), inches(4), 0], size: [inches(7), inches(7), W - inches(3)] }],
      rate: 16,
      requiresDeploy: true,
    },
    storage: {
      capacity: 88,
      preload: 8,
      box: { center: [inches(3), inches(9), 0], size: [L + EXT - inches(4), inches(13), W - inches(3)] },
    },
    shooter: {
      barrels: [{ exit: [TURRET_PIVOT[0] + inches(6.5), TURRET_PIVOT[1] + inches(6.5), 0], pivot: [TURRET_PIVOT[0], 0, TURRET_PIVOT[2]] }],
      angle: 60,
      hoodMin: 42,
      hoodMax: 78,
      minSpeed: 4,
      maxSpeed: 16,
      rate: 14,
      spread: 0.9,
      turretMin: -190,
      turretMax: 190,
      turretSpeed: 540,
      yawOffset: 0,
      sotm: true,
    },
    climber: null,
    source: 'builtin:4414',
  },
  build() {
    const kit = new Kit('4414-ripcurrent');
    const base = swerveBase(kit, L, W, { electronics: [-inches(7), 0] });
    const teal = 0x00a3e0;
    const y0 = base.railTop;

    // Extending assembly: intake box + hopper front wall + net, all on racks.
    const slide = kit.group('slide');
    for (const s of [-1, 1]) {
      kit.box(`rack_${s}`, [L / 2 - inches(4), y0 + inches(1), s * (W / 2 - inches(1.5))], [inches(14), inches(0.5), inches(0.75)], M.aluDark(), slide);
      kit.plate(`intake_plate_${s}`, [L / 2 + inches(3), inches(5), s * (W / 2 - inches(0.6))], [inches(9), inches(7), inches(0.25)], slide, teal);
    }
    kit.roller('intake_roller_top', L / 2 + inches(5.5), inches(6.5), -W / 2 + inches(1), W / 2 - inches(1), inches(1.25), slide, 0x2a62ff);
    kit.roller('intake_roller_bottom', L / 2 + inches(6.2), inches(2.4), -W / 2 + inches(1), W / 2 - inches(1), inches(1.1), slide, 0xf0f0f0);
    kit.motor('intake_motor_a', [L / 2 + inches(2), inches(8), -W / 2 + inches(2.5)], 'z', slide);
    kit.motor('intake_motor_b', [L / 2 + inches(2), inches(8), W / 2 - inches(2.5)], 'z', slide);
    kit.netHopper('hopper_front', L / 2 - inches(3), L / 2 + inches(1), -W / 2 + inches(1), W / 2 - inches(1), y0, H - inches(1), slide);

    // Fixed rear hopper (polycarb) over the Dye Rotor.
    kit.polyHopper('hopper_rear', -L / 2 + inches(1), L / 2 - inches(3), -W / 2 + inches(1), W / 2 - inches(1), y0, H - inches(2.5));
    const rotor = kit.group('dye_rotor');
    kit.cyl('rotor_disk', [-inches(2), y0 + inches(1.2), 0], inches(10), inches(0.4), 'y', mat(0xe8e8e8, { rough: 0.4 }), rotor, 40);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      kit.box(`rotor_fin_${k}`, [-inches(2) + Math.cos(a) * inches(5), y0 + inches(2.4), Math.sin(a) * inches(5)], [inches(10), inches(2), inches(0.3)], M.alu(), rotor, [0, -a, 0]);
    }
    kit.motor('rotor_motor', [-inches(2), y0 - inches(1.5), inches(7)], 'y');

    // Turret on the rear.
    kit.cyl('turret_tower', [TURRET_PIVOT[0], (y0 + TURRET_PIVOT[1]) / 2, 0], inches(2.5), TURRET_PIVOT[1] - y0, 'y', M.aluDark());
    const t = turret(kit, 't', TURRET_PIVOT, { ringR: inches(5), flywheelR: inches(1.5), flywheelW: inches(3.5), color: 0x1b4f72 });
    kit.limelight([L / 2 - inches(2), H - inches(2), 0]);
    kit.led('led_bar', [-L / 2 + inches(0.5), y0 + inches(3), 0], [0.01, inches(1), W - inches(6)], teal);

    const joints: JointIn[] = [
      ...base.joints,
      { id: 'slide', type: 'prismatic', driver: 'intake-deploy', pivot: [0, 0, 0], axis: [1, 0, 0], stowed: 0, active: EXT, speed: 1.6 },
      { id: 'roll_top', type: 'spin', driver: 'intake-roller', parent: 'slide', pivot: [L / 2 + inches(5.5), inches(6.5), 0], axis: [0, 0, 1], speed: 1800 },
      { id: 'roll_bot', type: 'spin', driver: 'intake-roller', parent: 'slide', pivot: [L / 2 + inches(6.2), inches(2.4), 0], axis: [0, 0, 1], speed: 1800 },
      { id: 'rotor', type: 'spin', driver: 'indexer', pivot: [-inches(2), y0, 0], axis: [0, 1, 0], speed: 810 },
      { id: 'turret', type: 'revolute', driver: 'turret', pivot: TURRET_PIVOT, axis: [0, 1, 0], speed: 540 },
      { id: 'hood', type: 'revolute', driver: 'hood', parent: 'turret', pivot: t.hoodPivot, axis: [0, 0, 1], stowed: 0, active: -22, speed: 200 },
      { id: 'flywheel', type: 'spin', driver: 'shooter-wheel', parent: 'turret', pivot: t.flyCenter, axis: [0, 0, -1], speed: 3600 },
    ];
    const parts: PartIn[] = [
      ...base.parts,
      { node: 'slide', joint: 'slide' },
      { node: 'intake_roller_top', joint: 'roll_top' },
      { node: 'intake_roller_bottom', joint: 'roll_bot' },
      { node: 'dye_rotor', joint: 'rotor' },
      { node: t.turretNode, joint: 'turret' },
      { node: t.hoodNode, joint: 'hood' },
      { node: t.flyNode, joint: 'flywheel' },
    ];
    const shooter = { ...r4414.def.shooter!, barrels: [{ exit: t.exit, pivot: TURRET_PIVOT }] };
    return { model: kit.root, joints, parts, patch: { shooter } };
  },
};
