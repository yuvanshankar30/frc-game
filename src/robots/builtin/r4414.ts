import * as THREE from 'three';
import { Kit, M, mat, decalTex } from './kit';
import { swerveBase, turret, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';

/**
 * 4414 HighTide — RIPCURRENT (2026 World Champions, Daly division captain).
 * Source: 4414 2026 Technical Binder (2026.team4414.com), CAD renders and subsystem notes:
 *  - Drivetrain: teal pre-drilled tube, chamfered corners, MK5n-style swerve; "left drive rail split to bias the
 *    battery to the very edge" for the Dye Rotor; two cross rails structure the rotor.
 *  - Bumpers: "structural bumpers that double as hopper walls and shooter mounting", WCP bumper cones,
 *    corner cutouts for breaker/RSL/radio. Modeled as tall smoked walls on teal pocketed truss.
 *  - Intake: 3in 1/8in-wall polycarbonate roller (2× X60, 3.45:1) + 1.5in bottom roller (X44, 1.5:1). Slides out
 *    on doubled 0.25in polycarbonate 10DP gear racks (X44 each side, 3.33:1), "deploys at the beginning of the
 *    match between ~1.3in bumper gaps and stays down via steel latches"; bent aluminum impact guards.
 *  - Extending hopper: "holds 85+ balls under the trench, 100+ with net over the bump".
 *  - Dye Rotor: round tub, passive rollers on hook and ramp, vertical 3in omni + horizontal 1.25in omnis feeding 3in
 *    TTB urethane wheels — single-stream feed, ~12–14 BPS gap-free (team, Chief Delphi).
 *  - Shooter: four Kraken X44 on a 3in flywheel, dual GT2 belts over the hood side plates, hood roller.
 *  - Turret: 55.7:1 on a single X44 with flex-wheel cable-chain tensioner; precomputed shot maps + SOTM.
 *  - "25 × 32in" base per binder; 25×32 is a 114in perimeter (> R104's 110in), so the frame is 23.5 × 31.5in.
 *  - No climber.
 */
const L = inches(23.5);
const W = inches(31.5);
const H = inches(21.5);
const EXT = inches(10); // intake / hopper extension
const TEAL = 0x18b6b0;
const TP: [number, number, number] = [-inches(1.5), inches(15.2), 0]; // turret pivot over the Dye Rotor

export const r4414: BuiltinRobot = {
  def: {
    id: 'builtin-4414',
    name: 'RIPCURRENT',
    team: '4414',
    author: 'HighTide',
    color: '#18b6b0',
    description:
      'The 2026 champion. Its structural bumpers double as hopper walls. A rack-driven 3in intake latches out at the start of the match and extends a netted hopper that carries 85+ FUEL. A Dye Rotor single-streams FUEL into a 3in flywheel turret that shoots on the move.',
    highlights: ['2026 World Champion (Daly captain)', 'Latching rack intake + extending hopper', 'Dye Rotor → single stream ~14 BPS', '55.7:1 turret, shoot-on-the-move', 'Fits under the TRENCH', 'No climber'],
    sources: ['4414 2026 Technical Binder: 2026.team4414.com (CAD renders + subsystem notes)', 'Chief Delphi: Team 4414 HighTide 2026 Tech Binder (RIPCURRENT)'],
    frame: { length: L, width: W, height: H, mass: 60, comHeight: 0.17, bumperThickness: inches(3.25) },
    drivetrain: { type: 'swerve', maxSpeed: 4.1, maxAccel: 10, maxOmega: 10, maxAlpha: 32 },
    intake: {
      zones: [{ center: [L / 2 + inches(3.25) + EXT - inches(0.5), inches(3.5), 0], size: [inches(6), inches(7), W - inches(3)] }],
      rate: 16,
      requiresDeploy: true,
      latch: true,
    },
    storage: {
      capacity: 88,
      preload: 8,
      box: { center: [(-L / 2 + inches(1) + L / 2 + EXT - inches(1)) / 2, inches(11.5), 0], size: [L + EXT - inches(2), inches(17.5), W - inches(2.5)] },
    },
    shooter: {
      barrels: [{ exit: [0, 0, 0] }],
      angle: 60,
      hoodMin: 45,
      hoodMax: 76,
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
    const rig = new Rig();
    const base = swerveBase(kit, rig, L, W, { electronics: [-inches(5), -W / 2 + inches(4.5)] });
    const y0 = base.railTop;
    const tealTube = mat(TEAL, { metal: 0.5, rough: 0.4 });
    // Teal frame rails overlay + chamfered corner braces.
    for (const s of [-1, 1]) {
      kit.tube('teal_rail', [-L / 2 + inches(1), y0 - inches(0.5), s * (W / 2 - inches(1))], [L / 2 - inches(1), y0 - inches(0.5), s * (W / 2 - inches(1))], undefined, undefined, tealTube);
      kit.tube('teal_cross', [s * inches(4), y0 - inches(0.5), -W / 2 + inches(2)], [s * inches(4), y0 - inches(0.5), W / 2 - inches(2)], undefined, undefined, tealTube);
    }

    // Structural bumper walls (left, right, back) with teal pocketed truss along the top edges.
    const wallMat = M.smokeDark();
    const wallH = H - y0;
    const wy = y0 + wallH / 2;
    for (const s of [-1, 1]) {
      kit.box('wall_side', [0, wy, s * (W / 2 + inches(0.2))], [L, wallH, inches(0.12)], wallMat);
      kit.pocketPlate('truss_top', [0, H - inches(1.2), s * (W / 2 + inches(0.35))], L, inches(2.4), { color: TEAL, cell: inches(2.4) });
      kit.pocketPlate('truss_corner', [-L / 2 + inches(1.2), wy, s * (W / 2 + inches(0.35))], inches(2.4), wallH, { color: TEAL, cell: inches(2.4) });
    }
    kit.box('wall_back', [-L / 2 - inches(0.2), wy, 0], [inches(0.12), wallH, W], wallMat);
    kit.pocketPlate('truss_back', [-L / 2 - inches(0.35), H - inches(1.2), 0], W, inches(2.4), { color: TEAL, cell: inches(2.4), plane: 'zy' });
    // Name plate on the walls.
    const plate = new THREE.MeshBasicMaterial({ map: decalTex(['RIPCURRENT', 'HIGHTIDE 4414'], { fg: '#d8f6f4' }), transparent: true, depthWrite: false });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.7, wallH * 0.45), plate);
      p.position.set(0, wy + inches(1), s * (W / 2 + inches(0.3)));
      if (s < 0) p.rotation.y = Math.PI;
      kit.add(p, 'nameplate');
    }

    // Sliding intake + extending hopper (prismatic along +X on gear racks).
    const slide = kit.group('slide');
    for (const s of [-1, 1]) {
      // Gear racks (doubled polycarbonate) and extension side panel with holes.
      kit.box(`rack_${s}`, [L / 2 - inches(4), y0 + inches(1.3), s * (W / 2 - inches(1.6))], [inches(16), inches(0.9), inches(0.5)], mat(0xe8eef4, { opacity: 0.6, rough: 0.2 }), slide);
      kit.pocketPlate(`ext_panel_${s}`, [L / 2 + inches(1.5), y0 + inches(6.5), s * (W / 2 - inches(0.4))], inches(12), inches(11), { color: 0x2c3036, parent: slide, cell: inches(2.5) });
      kit.box(`guard_${s}`, [L / 2 + inches(6.8), inches(4), s * (W / 2 - inches(0.2))], [inches(2), inches(5), inches(0.15)], M.alu(), slide, [0, 0, 0.35]);
      kit.motor(`rack_motor_${s}`, [L / 2 - inches(2.5), y0 + inches(3.2), s * (W / 2 - inches(3))], 'y', slide, true);
    }
    kit.tubeRoller('intake_main', L / 2 + inches(6.2), inches(3.4), -W / 2 + inches(1.2), W / 2 - inches(1.2), inches(1.5), 0xf2f5f8, slide);
    kit.tubeRoller('intake_bottom', L / 2 + inches(4.0), inches(1.6), -W / 2 + inches(1.2), W / 2 - inches(1.2), inches(0.75), 0xdfe6ee, slide);
    kit.motor('intake_motor_a', [L / 2 + inches(3.5), inches(6.5), -W / 2 + inches(3)], 'z', slide);
    kit.motor('intake_motor_b', [L / 2 + inches(3.5), inches(6.5), W / 2 - inches(3)], 'z', slide);
    kit.netHopper('hopper_net', L / 2 - inches(2), L / 2 + inches(7.5), -W / 2 + inches(0.6), W / 2 - inches(0.6), y0 + inches(10), H - inches(0.5), slide, false);
    kit.box('front_panel', [L / 2 + inches(7.6), y0 + inches(8), 0], [inches(0.12), inches(8), W - inches(4)], M.smokeDark(), slide);

    // Dye Rotor tub with radial ribs, ramp and hook up to the turret.
    const rotorC: [number, number, number] = [-inches(1.5), y0 + inches(0.5), 0];
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(inches(10.5), inches(10.5), inches(4), 48, 1, true), mat(0x2a2d33, { metal: 0.3, rough: 0.6, opacity: 0.999 }));
    (ring.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    ring.position.set(rotorC[0], rotorC[1] + inches(2), 0);
    kit.add(ring, 'rotor_wall');
    const rotor = kit.group('dye_rotor');
    kit.cyl('rotor_floor', [rotorC[0], rotorC[1], 0], inches(10.3), inches(0.25), 'y', mat(0x3a3e45, { metal: 0.4 }), rotor, 48);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      kit.box(`rotor_rib_${k}`, [rotorC[0] + Math.cos(a) * inches(5.5), rotorC[1] + inches(1.2), Math.sin(a) * inches(5.5)], [inches(9.5), inches(2.2), inches(0.25)], mat(0x1d1f23, { metal: 0.3 }), rotor, [0, -a, 0]);
    }
    kit.cyl('rotor_hub', [rotorC[0], rotorC[1] + inches(1.5), 0], inches(2.2), inches(3), 'y', M.aluDark(), rotor, 24);
    kit.motor('rotor_motor', [rotorC[0] + inches(6), y0 - inches(1.6), inches(7)], 'y');
    // Ramp + hook (single-stream path up to the turret).
    kit.box('ramp', [rotorC[0] - inches(6.5), y0 + inches(5), -inches(4)], [inches(2.5), inches(9), inches(3.5)], mat(0x22252b, { metal: 0.4 }), undefined, [0, 0, 0.25]);
    kit.cyl('omni_vertical', [rotorC[0] - inches(7), y0 + inches(3), -inches(5.5)], inches(1.5), inches(1), 'x', M.silicone(0x3a3a3a));
    kit.cyl('ttb_wheel', [rotorC[0] - inches(5.8), y0 + inches(8.5), -inches(3)], inches(1.5), inches(1.2), 'z', mat(0xff6a00, { rough: 0.7 }));

    // Central column + turret.
    kit.cyl('turret_column', [TP[0], (y0 + inches(4) + TP[1]) / 2, TP[2]], inches(2.6), TP[1] - y0 - inches(4), 'y', M.anodBlack(), undefined, 24);
    const t = turret(kit, 't', TP, { ringR: inches(5.2), flywheelR: inches(1.5), flywheelW: inches(3.5), color: 0x1d2026, accent: TEAL });
    kit.box('cable_chain', [TP[0] - inches(5), TP[1] - inches(1), -inches(3)], [inches(1), inches(0.8), inches(6)], M.black(), undefined, [0, 0.6, 0]);
    kit.camera('cam_front', [L / 2 - inches(1), H - inches(1.5), W / 2 - inches(3)], 0);
    kit.camera('cam_back', [-L / 2 + inches(1), H - inches(1.5), -W / 2 + inches(3)], Math.PI);
    kit.led('led_bar', [-L / 2 - inches(0.4), y0 + inches(3), 0], [0.006, inches(0.8), W - inches(6)], TEAL);

    rig.joint({ id: 'slide', type: 'prismatic', driver: 'intake-deploy', pivot: [0, 0, 0], axis: [1, 0, 0], stowed: 0, active: EXT, speed: 1.4 }, slide);
    rig.joint({ id: 'roll_main', type: 'spin', driver: 'intake-roller', parent: 'slide', pivot: [L / 2 + inches(6.2), inches(3.4), 0], axis: [0, 0, 1], speed: 2200 }, 'intake_main');
    rig.joint({ id: 'roll_bot', type: 'spin', driver: 'intake-roller', parent: 'slide', pivot: [L / 2 + inches(4.0), inches(1.6), 0], axis: [0, 0, 1], speed: 2600 }, 'intake_bottom');
    rig.joint({ id: 'rotor', type: 'spin', driver: 'indexer', pivot: [rotorC[0], 0, 0], axis: [0, 1, 0], speed: 810 }, rotor);
    rig.joint({ id: 'turret', type: 'revolute', driver: 'turret', pivot: TP, axis: [0, 1, 0], speed: 540 }, t.turretNode);
    rig.joint({ id: 'hood', type: 'revolute', driver: 'hood', parent: 'turret', pivot: t.hoodPivot, axis: [0, 0, 1], stowed: 0, active: -22, speed: 200 }, t.hoodNode);
    rig.joint({ id: 'flywheel', type: 'spin', driver: 'shooter-wheel', parent: 'turret', pivot: t.flyCenter, axis: [0, 0, -1], speed: 4200 }, t.flyNode);

    const shooter = { ...r4414.def.shooter!, barrels: [{ exit: t.exit, pivot: TP }] };
    return { model: kit.root, joints: rig.joints, parts: rig.parts, patch: { shooter } };
  },
};
