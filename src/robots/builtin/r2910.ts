import * as THREE from 'three';
import { Kit, M, mat } from './kit';
import { swerveBase, groundIntake, intakeGearbox, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';
import { TURN_RATE, TURN_ACCEL } from '../../robot/schema';

/**
 * 2910 Jack in the Bot — Re•Blitz (2026 World Championship Finalist, Newton captain).
 * Sources: "2910 Tech Binder 2026: Reblitz" (CAD + tech binder release, Chief Delphi #521705), robot code
 * github.com/FRCTeam2910/2026CompetitionRobot-Public (intake pivot 0–114.3°, hood 0–37°, bumpers 35.625in square),
 * robot photos.
 *  - Drivebase: 27.5 × 27in, SDS MK5n R1 (4× X60 drive, 4× X44 steer), custom module lowering blocks, center brainpan,
 *    polycarbonate bellypan so it doesn't get stuck on FUEL.
 *  - Intake: over-the-bumper slap-down, X60 at 40:1 with #35 chain to the final sprocket, ~0.6in billet side plates
 *    (partial-depth pockets, split in two), 2x2 "bash bar" on top of the 2in OD main roller, two 1.25in OD lower
 *    dead-axle rollers, 2× X60 on the rollers; accommodates 4 balls at once; deploying it pushes the hopper out.
 *  - Hopper: light-tinted polycarbonate, one-piece, stows above the shooter in starting configuration and slides out on
 *    R3 bearings when the intake deploys; "catchers" lock it out. Closed top so it goes under the trench.
 *  - Feeder: 15° inclined powered floor with ten 1.25in rollers + an indexing roller with nine 2.25in 35A compliant
 *    wheels, all chain-driven by 4× X60, Teflon backing boards, CANranges.
 *  - Shooter: FUEL indexes from the back and shoots out the FRONT; 4in OD aluminum drum with 1.5in hood rollers and a
 *    6in flywheel at 6.7:1 overdrive; 4 balls wide; >30 BPS, sustained 34 BPS over a full hopper.
 *  - No climber.
 */
const L = inches(27.5);
const W = inches(27);
const H = inches(21.5);
const GREEN = 0x1fb04a;

export const r2910: BuiltinRobot = {
  def: {
    id: 'builtin-2910',
    name: 'Re•Blitz',
    team: '2910',
    author: 'Jack in the Bot',
    color: '#1fb04a',
    description:
      'Rebuilt in three weeks and taken to Einstein. A slapdown with a 2x2 bash bar pushes out a tinted one-piece hopper. FUEL climbs a 15° powered feeder to a rear tower, where a 4-wide drum and flywheel fire forward over the robot at 30+ BPS.',
    highlights: ['2026 Championship Finalist', '30+ BPS (34 sustained), 4 balls wide', 'Shoots forward over the hopper', 'Slapdown with 2x2 bash bar', 'Tinted one-piece sliding hopper', 'No climber (none in code)'],
    sources: ['2910 Tech Binder 2026: Reblitz (Chief Delphi CAD + tech binder release)', 'github.com/FRCTeam2910/2026CompetitionRobot-Public (Constants.java)', 'frcteam2910.org: "We Rebuilt our Robot. Then we went to Einstein."'],
    frame: { length: L, width: W, height: H, mass: 61, comHeight: 0.16, bumperThickness: inches(4), bumperHeight: inches(5.5) },
    drivetrain: { type: 'swerve', maxSpeed: 3.9, maxAccel: 11, maxOmega: TURN_RATE, maxAlpha: TURN_ACCEL },
    intake: {
      zones: [{ center: [L / 2 + inches(9), inches(3.5), 0], size: [inches(7), inches(7), W - inches(1)] }],
      rate: 24,
      requiresDeploy: true,
    },
    storage: {
      capacity: 58,
      preload: 8,
      box: { center: [inches(3.5), inches(10.7), 0], size: [inches(28), inches(15.5), W - inches(1.8)] },
    },
    shooter: {
      barrels: [-1.5, -0.5, 0.5, 1.5].map((k) => ({ exit: [-L / 2 + inches(7), inches(20.4), k * inches(5.6)] as [number, number, number], pivot: [0, 0, 0] as [number, number, number] })),
      angle: 55,
      // Hood travel 0–37° (code); modeled as launch elevation 40–77°.
      hoodMin: 40,
      hoodMax: 77,
      minSpeed: 4,
      maxSpeed: 15,
      rate: 30,
      spread: 1.5,
      turretMin: null,
      turretMax: null,
      yawOffset: 0,
      sotm: true,
      sotmSkill: 0.6, // strafes sideways past the HUB on its side intakes while shooting
    },
    climber: null,
    source: 'builtin:2910',
  },
  build() {
    const kit = new Kit('2910-reblitz');
    const rig = new Rig();
    const base = swerveBase(kit, rig, L, W, { electronics: [inches(1), 0] });
    const y0 = base.railTop;
    const tint = mat(0x9aa0a8, { opacity: 0.42, rough: 0.12 }); // light-gray tinted polycarbonate (CAD)
    const plateMat = mat(0xb9bec5, { metal: 0.75, rough: 0.35 });

    kit.box('bellypan_poly', [0, inches(1.2), 0], [L - inches(2), 0.003, W - inches(2)], M.polycarb());

    // ---------- shooter tower (rear): pocketed billet plates, drum + flywheel + hood rollers, firing forward
    const TX = -L / 2 + inches(5);
    // Billet isogrid tower plates, full height, with a rounded nose around the drum and a chamfered back.
    const towerOutline: [number, number][] = [
      [-inches(5.2), -inches(9.5)],
      [inches(5.2), -inches(9.5)],
      [inches(5.2), inches(4.5)],
      [inches(3.2), inches(8.6)],
      [inches(0.5), inches(9.6)],
      [-inches(3.4), inches(9.2)],
      [-inches(5.2), inches(6.5)],
    ];
    for (const s of [-1, 1]) {
      // Generatively pocketed billet tower plates (CAD) and an outer gearbox plate.
      kit.webPlate(`tower_plate${s}`, [TX, inches(11.5), s * (W / 2 - inches(0.6))], 0, 0, { outline: towerOutline, cell: inches(1.9), rib: inches(0.24), t: inches(0.25), color: 0x8d939b, seed: s > 0 ? 5 : 6 });
      kit.webPlate(`tower_plate_out${s}`, [TX - inches(0.5), inches(10), s * (W / 2 + inches(0.45))], inches(8), inches(13), { cell: inches(2.1), rib: inches(0.24), color: 0x7f858d, seed: s > 0 ? 8 : 9 });
    }
    kit.box('tower_backing', [TX - inches(3.5), inches(11), 0], [inches(0.25), inches(16), W - inches(1.4)], mat(0xeeeeee, { rough: 0.3 }));
    const drumC: [number, number, number] = [TX - inches(1), inches(17.5), 0];
    const drum = kit.drum('drum', drumC[0], drumC[1], W - inches(1.8), inches(2));
    const fly = kit.group('flywheel6');
    for (const s of [-1, 1]) kit.pulley(`flywheel6_${s}`, [drumC[0], drumC[1], s * (W / 2 - inches(0.15))], inches(3), { parent: fly, color: 0x9aa1aa, spokes: 6, t: inches(0.5) });
    // Tan 3-spoke flywheel on the outside of the left plate and a big gray spoked hood/overdrive gear below it (CAD).
    kit.pulley('drum_gear_gold', [drumC[0] - inches(0.5), drumC[1] - inches(1.5), -(W / 2 + inches(0.9))], inches(3), { color: 0xd2b679, spokes: 3, t: inches(0.5) });
    kit.pulley('drum_gear_hub', [drumC[0] - inches(0.5), drumC[1] - inches(1.5), -(W / 2 + inches(1.2))], inches(0.9), { color: 0x6d737b, spokes: 3 });
    kit.pulley('overdrive_gear', [TX + inches(2.5), inches(8.5), -(W / 2 + inches(0.9))], inches(4.2), { color: 0xa9afb6, spokes: 8, t: inches(0.25) });
    // Four Krakens across the back face (CAD rear view).
    for (const [z, y] of [
      [-inches(8), inches(9)],
      [inches(8), inches(9)],
      [-inches(8), inches(12.5)],
      [inches(8), inches(12.5)],
    ])
      kit.motor('back_kraken', [TX - inches(4.4), y, z], 'x');
    const hood = kit.group('hood');
    const hp: [number, number, number] = [TX + inches(2.5), inches(20.6), 0];
    for (let k = 0; k < 3; k++) kit.tubeRoller(`hood_roller${k}`, drumC[0] + inches(2.4) + k * inches(1.3), drumC[1] + inches(2.6) - k * inches(0.4), -W / 2 + inches(1.6), W / 2 - inches(1.6), inches(0.75), 0x8f969e, hood);
    for (const s of [-1, 1]) kit.sectorPlate(`hood_sector${s}`, [hp[0], hp[1], s * (W / 2 - inches(1.2))], inches(4.2), Math.PI * 0.8, Math.PI * 1.2, { parent: hood, color: GREEN, teeth: 16 });
    for (const s of [-1, 1]) {
      kit.motor(`shooter_x60_${s}a`, [TX - inches(2), inches(8), s * (W / 2 + inches(1.3))], 'z');
      kit.motor(`shooter_x60_${s}b`, [TX + inches(1.5), inches(8), s * (W / 2 + inches(1.3))], 'z');
      kit.belt(`shooter_chain_${s}`, [TX - inches(2), inches(8)], [drumC[0], drumC[1]], s * (W / 2 + inches(0.2)));
    }

    // ---------- feeder: 15° powered floor (ten 1.25in rollers) + indexer with nine 2.25in compliant wheels
    const feed = kit.group('feeder_floor');
    const ang = (15 * Math.PI) / 180;
    for (let k = 0; k < 10; k++) {
      const x = L / 2 - inches(3) - k * inches(1.9);
      const y = y0 + inches(1) + (L / 2 - inches(3) - x) * Math.tan(ang) * 0.6;
      kit.tubeRoller(`feed_${k}`, x, y, -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(0.625), 0x2a2d33, feed);
    }
    const indexer = kit.group('indexer');
    for (let k = 0; k < 9; k++) kit.compliant(`index_wheel_${k}`, [TX + inches(3.5), inches(10.5), -W / 2 + inches(2.2) + k * ((W - inches(4.4)) / 8)], inches(1.125), inches(0.9), GREEN, indexer);
    kit.cyl('index_shaft', [TX + inches(3.5), inches(10.5), 0], inches(0.25), W - inches(2), 'z', M.steel(), indexer, 6);
    kit.box('canrange_hopper', [0, y0 + inches(14), -W / 2 + inches(1)], [inches(1), inches(1), inches(0.6)], mat(0xff6600));
    kit.box('canrange_tower', [TX, inches(16), W / 2 - inches(1.2)], [inches(1), inches(1), inches(0.6)], mat(0xff6600));

    // ---------- one-piece tinted hopper with chamfered front-top edge (slides out with the intake)
    const hop = kit.group('hopper_ext');
    const hx0 = -L / 2 + inches(9.5);
    const hx1 = L / 2 + inches(2);
    const hy0 = y0;
    const hy1 = H - inches(0.4);
    const ch = inches(4);
    // Ahead of the frame the hopper rides above the front bumper.
    const hyF = inches(2.56) + inches(5.5) + inches(0.3);
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(hx0, hy0);
      sh.lineTo(L / 2 - inches(0.3), hy0);
      sh.lineTo(L / 2 - inches(0.3), hyF);
      sh.lineTo(hx1, hyF);
      sh.lineTo(hx1, hy1 - ch);
      sh.lineTo(hx1 - ch, hy1);
      sh.lineTo(hx0, hy1);
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.003, bevelEnabled: false });
      g.translate(0, 0, s * (W / 2 - inches(0.4)));
      kit.add(new THREE.Mesh(g, tint), `hopper_side${s}`, hop);
      kit.box(`hopper_bracket_top${s}`, [(hx0 + hx1 - ch) / 2, hy1, s * (W / 2 - inches(0.4))], [hx1 - hx0 - ch, inches(0.6), inches(0.6)], plateMat, hop);
      kit.box(`hopper_bracket_front${s}`, [hx1, (hyF + hy1 - ch) / 2, s * (W / 2 - inches(0.4))], [inches(0.6), hy1 - hyF - ch, inches(0.6)], plateMat, hop);
      const z = s * (W / 2 - inches(0.4));
      const cb = kit.box(`hopper_bracket_chamfer${s}`, [hx1 - ch / 2, hy1 - ch / 2, z], [ch * 1.414, inches(0.6), inches(0.6)], plateMat, hop);
      cb.rotation.z = -Math.PI / 4;
      kit.box(`hopper_bracket_mid${s}`, [(hx0 + hx1) / 2, hy0 + inches(7), z], [hx1 - hx0, inches(0.6), inches(0.6)], plateMat, hop);
      // Rivet rows along the frame (black button heads every ~1.6in), slots, and the triangular side frame.
      for (const [ax, ay, bx, by] of [
        [hx0 + inches(0.8), hy1, hx1 - ch, hy1],
        [hx0 + inches(0.8), hy0 + inches(7), hx1, hy0 + inches(7)],
        [hx1, hyF + inches(0.6), hx1, hy1 - ch],
      ]) {
        const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / inches(1.6)));
        for (let k = 0; k <= n; k++) kit.cyl(`rivet${s}`, [ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, z + s * inches(0.33)], inches(0.17), inches(0.08), 'z', mat(0x1a1b1e, { rough: 0.6 }), hop, 8);
      }
      for (const yy of [hy1 - inches(3), hy0 + inches(10.5)]) kit.box(`hopper_slot${s}`, [hx0 + inches(9), yy, z + s * inches(0.02)], [inches(8), inches(0.3), inches(0.03)], mat(0xf2f3f5, { rough: 0.4 }), hop);
      const tri: [number, number][] = [
        [-inches(5), -inches(4)],
        [inches(5), -inches(4)],
        [inches(1.5), inches(4.5)],
      ];
      const tsh = new THREE.Shape();
      tri.forEach(([x, y], k) => (k ? tsh.lineTo(x, y) : tsh.moveTo(x, y)));
      tsh.closePath();
      const hole = new THREE.Path();
      [
        [-inches(3.6), -inches(3.2)],
        [inches(1.3), inches(3)],
        [inches(3.7), -inches(3.2)],
      ].forEach(([x, y], k) => (k ? hole.lineTo(x, y) : hole.moveTo(x, y)));
      hole.closePath();
      tsh.holes.push(hole);
      const tg = new THREE.ExtrudeGeometry(tsh, { depth: inches(0.19), bevelEnabled: false });
      tg.translate(inches(1), y0 + inches(5.5), z + s * inches(0.2) - inches(0.1));
      kit.add(new THREE.Mesh(tg, plateMat), `side_triangle${s}`, hop);
    }
    kit.box('hopper_roof', [(hx0 + hx1 - ch) / 2, hy1, 0], [hx1 - hx0 - ch, 0.003, W - inches(0.8)], tint, hop);
    const chamfer = kit.box('hopper_chamfer', [hx1 - ch / 2, hy1 - ch / 2, 0], [ch * 1.414, 0.003, W - inches(0.8)], tint, hop);
    chamfer.rotation.z = -Math.PI / 4;
    kit.box('hopper_front', [hx1, hyF + inches(3), 0], [0.003, inches(6), W - inches(0.8)], tint, hop);
    kit.box('hopper_front_tube', [hx1, hy1 - ch, 0], [inches(0.5), inches(1), W - inches(0.8)], M.tube(), hop);

    // ---------- slap-down intake: billet side plates, 2x2 bash bar over the 2in roller, two 1.25in lower rollers
    const ipiv: [number, number, number] = [L / 2 - inches(1.5), y0 + inches(7), 0];
    const intake = groundIntake(kit, 'intake', { bumper: { face: L / 2 + inches(4), top: inches(2.56) + inches(5.5) }, pivot: [ipiv[0], ipiv[1]], rollerX: L / 2 + inches(4) + inches(4.5), rollerR: inches(1), width: W, roller: 'silicone', wheel: 0x17181b, armColor: 0xa9afb6, kicker: true, deflector: false });
    intakeGearbox(kit, 'intake', [ipiv[0], ipiv[1]], W / 2 - inches(2));
    kit.box('bash_bar', [intake.rollerCenter[0] - inches(0.5), intake.rollerCenter[1] + inches(2.4), 0], [inches(2), inches(2), W - inches(0.6)], M.tube(), intake.group);
    // Big black upper roller under the bash bar (front view: two large black rollers stacked + a lower one).
    kit.tubeRoller('intake_upper', intake.rollerCenter[0] - inches(2.9), intake.rollerCenter[1] + inches(1.9), -W / 2 + inches(1.2), W / 2 - inches(1.2), inches(1.1), 0x17181b, intake.group);
    // Spoked billet hubs at the intake pivot (CAD side view).
    for (const s of [-1, 1]) kit.pulley(`intake_spoke_hub${s}`, [ipiv[0], ipiv[1], s * (W / 2 + inches(0.2))], inches(2.4), { color: 0xa9afb6, spokes: 6, t: inches(0.3) });
    kit.tubeRoller('intake_lower2', intake.rollerCenter[0] - inches(2.9), inches(2.1), -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(0.625), 0x17181b, intake.group);

    kit.limelight([L / 2 - inches(3), H - inches(2), 0], 0);
    kit.led('led', [-L / 2 + inches(0.4), inches(14), 0], [0.006, inches(0.6), W - inches(6)], GREEN);

    rig.joint({ id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: ipiv, axis: [0, 0, 1], stowed: intake.deployAngleDeg + 95, active: 0, speed: 600 }, intake.group);
    rig.joint({ id: 'intake_roll', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.rollerCenter, axis: [0, 0, 1], speed: 2200 }, intake.roller);
    if (intake.kickerNode) rig.joint({ id: 'intake_kick', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.kickerCenter!, axis: [0, 0, -1], speed: 2400 }, intake.kickerNode);
    rig.joint({ id: 'hopper_ext', type: 'prismatic', driver: 'intake-deploy', pivot: [0, 0, 0], axis: [1, 0, 0], stowed: -inches(6), active: 0, speed: 0.6 }, hop);
    rig.joint({ id: 'feed', type: 'spin', driver: 'indexer', pivot: [L / 2 - inches(3), y0 + inches(1), 0], axis: [0, 0, 1], speed: 1400 }, 'feed_0');
    rig.joint({ id: 'indexer', type: 'spin', driver: 'indexer', pivot: [TX + inches(3.5), inches(10.5), 0], axis: [0, 0, 1], speed: 1600 }, indexer);
    rig.joint({ id: 'drum', type: 'spin', driver: 'shooter-wheel', pivot: drumC, axis: [0, 0, 1], speed: 3200 }, drum);
    rig.joint({ id: 'flywheel6', type: 'spin', driver: 'shooter-wheel', pivot: drumC, axis: [0, 0, 1], speed: 3200 }, fly);
    rig.joint({ id: 'hood', type: 'revolute', driver: 'hood', pivot: hp, axis: [0, 0, 1], stowed: 0, active: 37, speed: 180 }, hood);
    const zones = [{ center: [intake.rollerCenter[0] + inches(1), inches(3.5), 0] as [number, number, number], size: [inches(7), inches(7), W - inches(1)] as [number, number, number] }];
    return { model: kit.root, joints: rig.joints, parts: rig.parts, patch: { intake: { ...r2910.def.intake!, zones } } };
  },
};
