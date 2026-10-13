import * as THREE from 'three';
import { Kit, M, mat, decalTex } from './kit';
import { swerveBase, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';

/**
 * 4414 HighTide — RIPCURRENT (2026 World Champions, Daly division captain).
 * Source: 4414 2026 Technical Binder (2026.team4414.com) — CAD renders and subsystem notes:
 *  - Drivetrain: teal pre-drilled tube, chamfered corners, swerve geared 7.67:1; "left drive rail split to bias the
 *    battery to the very edge" for the Dye Rotor; two cross rails structure the rotor. "25 × 32in" per binder;
 *    that is a 114in perimeter (> R104's 110in), so the frame is modeled at 23.5 × 31.5in.
 *  - Bumpers: "structural bumpers that double as hopper walls and shooter mount", WCP bumper cones.
 *  - Hopper walls: smoked polycarbonate on teal pocketed truss, chamfered rear corners, carbon-fiber end plates.
 *  - Intake: 3in 1/8in-wall polycarbonate roller (2× X60, 3.45:1) + 1.5in bottom roller (X44, 1.5:1), sliding on
 *    doubled 0.25in polycarbonate 10DP racks (X44 each side, 3.33:1); deploys between ~1.3in bumper gaps at the start
 *    of the match and stays down via steel latches; extending carbon-fiber hopper box ("85+ under the trench, 100+ with
 *    net over the bump").
 *  - Dye Rotor (V10): round spoked pan, curved outer wall on standoffs, central tower with stacked omni wheels, spiral
 *    hook with passive omni rollers onto 3in TTB urethane wheels — single-stream feed, ~12–14 BPS gap-free.
 *  - Shooter (V11): A-frame hood plates, dual GT2 belts over the hood side plates, hood roller, four Kraken X44 on a
 *    3in flywheel; turret 55.7:1 on one X44 with a flex-wheel cable-chain tensioner; T-shaped pocketed top deck.
 *  - No climber.
 */
const L = inches(23.5);
const W = inches(31.5);
const H = inches(21.5);
const EXT = inches(8);
const TEAL = 0x1a9e9a;
const DARK = 0x1d1f23;
const TP: [number, number, number] = [-inches(2.5), inches(13), -inches(1.5)]; // turret pivot (above the rotor tower; A-frame tops out under 21.5in)
const ROTOR: [number, number, number] = [-inches(1.5), 0, inches(1)];

export const r4414: BuiltinRobot = {
  def: {
    id: 'builtin-4414',
    name: 'RIPCURRENT',
    team: '4414',
    author: 'HighTide',
    color: '#1a9e9a',
    description:
      'The 2026 champion. Structural bumpers double as smoked hopper walls on a teal truss. A rack-driven intake latches out to open a carbon-fiber hopper box that holds 85+ FUEL. The Dye Rotor single-streams FUEL up a spiral hook into an A-frame turret with a 3in flywheel that shoots on the move.',
    highlights: ['2026 World Champion (Daly captain)', 'Latching rack intake + 85+ FUEL hopper', 'Dye Rotor → single stream ~14 BPS', '55.7:1 turret, 4× X44 flywheel, SOTM', 'Fits under the TRENCH', 'No climber'],
    sources: ['4414 2026 Technical Binder: 2026.team4414.com (CAD renders, Dye Rotor V10, Shooter V11, subsystem notes)', 'Chief Delphi: Team 4414 HighTide 2026 Tech Binder (RIPCURRENT)'],
    frame: { length: L, width: W, height: H, mass: 60, comHeight: 0.17, bumperThickness: inches(3.5), bumperHeight: inches(5.5) },
    drivetrain: { type: 'swerve', maxSpeed: 4.1, maxAccel: 10, maxOmega: 10, maxAlpha: 32 },
    intake: {
      zones: [{ center: [L / 2 + inches(3.5) + EXT - inches(1), inches(3.2), 0], size: [inches(6), inches(6.5), W - inches(3)] }],
      rate: 16,
      requiresDeploy: true,
      latch: true,
    },
    storage: {
      capacity: 88,
      preload: 8,
      box: { center: [(-L / 2 + inches(1) + L / 2 + EXT - inches(1)) / 2, inches(11.85), 0], size: [L + EXT - inches(2), inches(18.3), W - inches(1.5)] },
      net: { stretch: inches(5), color: '#101114' },
      indexer: { mode: 'rotor', center: [-inches(1.5), inches(1)], rps: 2.25 },
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
    const dark = mat(DARK, { metal: 0.45, rough: 0.45 });
    const smoke = M.smoke();

    // ---------- drivetrain: teal pre-drilled tube with chamfered corners + rotor cross rails
    const tealTube = mat(TEAL, { metal: 0.5, rough: 0.4 });
    for (const s of [-1, 1]) {
      kit.tube('teal_rail', [-L / 2 + inches(3), y0 - inches(0.5), s * (W / 2 - inches(1))], [L / 2 - inches(3), y0 - inches(0.5), s * (W / 2 - inches(1))], undefined, undefined, tealTube);
      kit.tube('teal_cross', [s * inches(5.5), y0 - inches(0.5), -W / 2 + inches(2)], [s * inches(5.5), y0 - inches(0.5), W / 2 - inches(2)], undefined, undefined, tealTube);
      for (const sx of [-1, 1]) {
        const c = kit.box('chamfer', [sx * (L / 2 - inches(1.8)), y0 - inches(0.5), s * (W / 2 - inches(1.8))], [inches(4), inches(1), inches(2)], tealTube);
        c.rotation.y = (sx * s * Math.PI) / 4;
      }
    }

    // ---------- structural bumper walls: smoked polycarb on teal pocketed truss
    const wallTop = H - inches(0.2);
    const wallH = wallTop - y0;
    const wy = y0 + wallH / 2;
    const CH = inches(3); // rear chamfer
    for (const s of [-1, 1]) {
      kit.box('wall_side', [inches(1.5) - CH / 2, wy, s * (W / 2 + inches(0.15))], [L - CH - inches(3), wallH, inches(0.1)], smoke);
      // Teal top rail along the wall edge, a truss post mid-wall.
      kit.box('wall_rail_top', [inches(1.5) - CH / 2, wallTop - inches(0.35), s * (W / 2 + inches(0.3))], [L - CH - inches(3), inches(0.7), inches(0.5)], tealTube);
      kit.truss('truss_mid', [-inches(3.4), y0, s * (W / 2 + inches(0.32))], [-inches(1.6), y0, s * (W / 2 + inches(0.32))], wallH, { color: TEAL, member: inches(0.32) });
      // carbon-fiber end plate where the extension slides in
      kit.panel('cf_end', [L / 2 - inches(2.6), wy, s * (W / 2 + inches(0.32))], inches(3.2), wallH, M.cf());
      // Chamfered rear corner: smoked panel framed by a full-height teal truss tower (the look of the binder renders).
      const cx = -L / 2 + CH / 2 - inches(0.3);
      const cz = s * (W / 2 - CH / 2 + inches(0.3));
      const cp = kit.box('wall_chamfer', [cx, wy, cz], [CH * 1.41, wallH, inches(0.1)], smoke);
      cp.rotation.y = s * Math.PI * 0.25;
      const ca: [number, number, number] = [-L / 2 - inches(0.35), y0, s * (W / 2 - CH)];
      const cb: [number, number, number] = [-L / 2 + CH, y0, s * (W / 2 + inches(0.35))];
      kit.truss('truss_chamfer', ca, cb, wallH, { color: TEAL, member: inches(0.32) });
      kit.truss('truss_corner_back', [-L / 2 - inches(0.35), y0, s * (W / 2 - CH - inches(3.2))], ca, wallH, { color: TEAL, member: inches(0.32) });
      kit.truss('truss_corner_side', cb, [-L / 2 + CH + inches(3.2), y0, s * (W / 2 + inches(0.35))], wallH, { color: TEAL, member: inches(0.32) });
    }
    // Green status LED strip along the top of the left wall.
    kit.led('led_strip', [inches(1.5) - CH / 2, wallTop + inches(0.1), -(W / 2 + inches(0.3))], [L - CH - inches(3), inches(0.25), inches(0.3)], 0x39ff5a);
    kit.box('wall_back', [-L / 2 - inches(0.15), wy, 0], [inches(0.1), wallH, W - 2 * CH], smoke);
    kit.box('wall_rail_back', [-L / 2 - inches(0.3), wallTop - inches(0.35), 0], [inches(0.5), inches(0.7), W - 2 * CH], tealTube);
    // Sponsor print on the smoked walls ("fabworks" on the CAD) + name plate.
    for (const s of [-1, 1]) {
      kit.sponsors(`sponsors_${s}`, [-inches(2), wy - inches(1.5), s * (W / 2 + inches(0.22))], L * 0.55, wallH * 0.38, ['fabworks', 'HAAS', 'Google', 'HighTide 4414'], 'xy', s as 1 | -1, undefined, '#c9d2d8');
    }
    const plate = new THREE.MeshBasicMaterial({ map: decalTex(['RIPCURRENT'], { fg: '#e8f4f3', w: 512, h: 96 }), transparent: true, depthWrite: false });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.55, inches(1.6)), plate);
      p.position.set(-inches(2), wallTop - inches(3.6), s * (W / 2 + inches(0.24)));
      if (s < 0) p.rotation.y = Math.PI;
      kit.add(p, 'nameplate');
    }

    // ---------- top deck: T-shaped pocketed truss across the width + turret plate
    const deckY = TP[1] + inches(0.5); // the turret plate is part of the T-shaped deck (Shooter V11)
    kit.pocketPlate('deck_arm', [-inches(3.5), deckY, 0], inches(4), W - inches(1), { color: DARK, plane: 'xz', cell: inches(2), rib: inches(0.35) });
    kit.pocketPlate('deck_spine', [-L / 2 + inches(4), deckY, -inches(1.5)], inches(6), inches(9), { color: DARK, plane: 'xz', cell: inches(2), rib: inches(0.35) });

    // ---------- sliding intake + extending carbon-fiber hopper box (on 10DP racks through the bumper gaps)
    // Stowed, the box's front face is flush with the front bumper; it rides ABOVE the bumper and the rollers hang
    // in front of the bumper face at carpet height. Deploying slides everything EXT forward and it latches out.
    const slide = kit.group('slide');
    const bt = inches(3.5); // bumper thickness
    const bumperTop = inches(2.5) + inches(5.5);
    const face = L / 2 + bt; // front bumper face
    const bx0 = L / 2 - inches(5); // box rear edge (inside the frame, overlaps the walls when stowed)
    const boxTop = wallTop - inches(0.6);
    // One continuous CF side plate per side: the hopper-box wall above the bumper, dropping in front of the bumper
    // face to carry the rollers at the carpet, with a slanted front edge over the intake mouth.
    const mainC: [number, number, number] = [face + inches(3.3), inches(2.6), 0];
    const botC: [number, number, number] = [face + inches(5), inches(1.1), 0];
    const mouthTop = bumperTop + inches(7.2); // FUEL rolls up the ramp and under the front panel into the box
    const nose = face + inches(6.1);
    const sidePts: [number, number][] = [
      [bx0, bumperTop + inches(0.3)],
      [face + inches(0.3), bumperTop + inches(0.3)],
      [face + inches(0.3), inches(0.9)],
      [nose, inches(0.5)],
      [nose, inches(3.6)],
      [face + inches(3.2), mouthTop],
      [face + inches(1.2), boxTop],
      [bx0, boxTop],
    ];
    const zs = W / 2 - inches(0.25);
    for (const s of [-1, 1]) {
      const z = s * zs;
      const sh = new THREE.Shape();
      sh.moveTo(sidePts[0][0], sidePts[0][1]);
      for (const q of sidePts.slice(1)) sh.lineTo(q[0], q[1]);
      sh.closePath();
      // Lightening pockets in the lower (roller) section.
      for (const [hx, hy] of [
        [face + inches(2.2), inches(5.2)],
        [face + inches(4.1), inches(5.6)],
      ]) {
        const hole = new THREE.Path();
        hole.absarc(hx, hy, inches(0.7), 0, Math.PI * 2, true);
        sh.holes.push(hole);
      }
      const geo = new THREE.ExtrudeGeometry(sh, { depth: inches(0.12), bevelEnabled: false });
      geo.translate(0, 0, z - inches(0.06));
      kit.add(new THREE.Mesh(geo, M.cf()), `ext_side_${s}`, slide);
      // Riveted aluminum edge angle along the bottom of the box section + the slanted nose edge.
      kit.box(`ext_angle_bot_${s}`, [(bx0 + face) / 2, bumperTop + inches(0.6), z - s * inches(0.35)], [face - bx0, inches(0.6), inches(0.6)], M.alu(), slide);
      const ex = (face + inches(3.2) + face + inches(1.2)) / 2;
      const ang = Math.atan2(boxTop - mouthTop, inches(1.2) - inches(3.2));
      kit.box(`ext_angle_nose_${s}`, [ex, (mouthTop + boxTop) / 2, z - s * inches(0.35)], [Math.hypot(boxTop - mouthTop, inches(2)), inches(0.6), inches(0.6)], M.alu(), slide, [0, 0, ang]);
      // Roller bearings (flanged) on the plate.
      for (const [c, r] of [
        [mainC, inches(0.55)],
        [botC, inches(0.4)],
      ] as const) kit.cyl(`ext_bearing_${s}`, [c[0], c[1], s * (zs + inches(0.12))], r, inches(0.12), 'z', M.steel(), slide, 16);
      // 2× X60 on the side plates (3.45:1 belt to the main roller), mounted outboard above the bumper line.
      const mp: [number, number] = [face + inches(1.4), bumperTop + inches(2.6)];
      kit.motor(`intake_x60_${s}`, [mp[0], mp[1], s * (zs + inches(1.1))], 'z', slide);
      kit.pulley(`intake_pulley_m_${s}`, [mp[0], mp[1], s * (zs + inches(0.3))], inches(0.6), { parent: slide, color: 0x2a2c31 });
      kit.pulley(`intake_pulley_r_${s}`, [mainC[0], mainC[1], s * (zs + inches(0.3))], inches(1.2), { parent: slide, color: 0x2a2c31, spokes: 5 });
      kit.belt(`intake_belt_a_${s}`, [mp[0] - inches(0.6), mp[1]], [mainC[0] - inches(1.2), mainC[1]], s * (zs + inches(0.3)), slide);
      kit.belt(`intake_belt_b_${s}`, [mp[0] + inches(0.6), mp[1]], [mainC[0] + inches(1.2), mainC[1]], s * (zs + inches(0.3)), slide);
      // 10DP racks (doubled 0.25in polycarbonate) running back through the ~1.3in bumper gaps into the frame.
      const rz = s * (W / 2 - inches(1.6));
      const r0 = L / 2 - inches(9);
      const r1 = face + inches(0.3);
      kit.box(`rack_${s}`, [(r0 + r1) / 2, inches(5.2), rz], [r1 - r0, inches(0.9), inches(0.5)], mat(0xe9eef3, { opacity: 0.75, rough: 0.2 }), slide);
      const nT = Math.floor((r1 - r0) / inches(0.65));
      for (let k = 0; k < nT; k++) kit.box(`rack_tooth_${s}_${k}`, [r0 + inches(0.4) + k * inches(0.65), inches(5.75), rz], [inches(0.25), inches(0.25), inches(0.5)], mat(0xd8dee5), slide);
      kit.motor(`rack_x44_${s}`, [L / 2 - inches(3), inches(7.5), s * (W / 2 - inches(3))], 'y', undefined, true);
      kit.pulley(`rack_pinion_${s}`, [L / 2 - inches(3), inches(6.2), rz], inches(0.6), { color: 0x2a2c31 });
    }
    // Slanted CF front panel over the intake mouth, top chamfer, box floor and a polycarb ramp from the rollers up
    // over the bumper into the box.
    const fpLen = Math.hypot(boxTop - mouthTop, inches(2));
    kit.box('ext_front', [face + inches(2.2), (mouthTop + boxTop) / 2, 0], [inches(0.09), fpLen, 2 * zs], M.cf(), slide, [0, 0, Math.atan2(inches(2), boxTop - mouthTop)]);
    kit.box('ext_front_lip', [face + inches(3.2), mouthTop, 0], [inches(0.7), inches(0.5), 2 * zs], M.alu(), slide);
    kit.box('ext_floor', [(bx0 + face) / 2, bumperTop + inches(0.3), 0], [face - bx0, inches(0.12), 2 * zs - inches(0.2)], dark, slide);
    const rampLen = Math.hypot(inches(2.6), bumperTop - inches(3.8));
    kit.box('ext_ramp', [face + inches(1.4), (bumperTop + inches(3.8)) / 2 + inches(0.3), 0], [rampLen, inches(0.1), 2 * zs - inches(0.3)], mat(0xe6f0fa, { opacity: 0.45, rough: 0.1 }), slide, [0, 0, -Math.atan2(bumperTop - inches(3.8), inches(2.6))]);
    // 3in 1/8in-wall polycarbonate main roller + 1.5in bottom roller (X44 1.5:1) between the plates.
    const mainRoller = kit.tubeRoller('intake_main', mainC[0], mainC[1], -zs, zs, inches(1.5), 0xeef2f6, slide);
    const botRoller = kit.tubeRoller('intake_bottom', botC[0], botC[1], -zs, zs, inches(0.75), 0xd5dde6, slide);
    kit.motor('intake_x44', [botC[0] - inches(0.6), botC[1] + inches(2.4), -(zs + inches(0.9))], 'z', slide, true);
    kit.belt('intake_bot_belt', [botC[0] - inches(0.6), botC[1] + inches(2.4)], [botC[0], botC[1]], -(zs + inches(0.3)), slide);

    // ---------- Dye Rotor (V10): spoked pan, curved wall on standoffs, center tower, spiral hook
    const ry = y0 + inches(0.4);
    const rotor = kit.group('dye_rotor');
    kit.cyl('rotor_pan', [ROTOR[0], ry, ROTOR[2]], inches(10.4), inches(0.2), 'y', dark, rotor, 56);
    // Raised paddle fins that sweep FUEL around (visible when the rotor turns).
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.3;
      kit.box(`rotor_fin_${k}`, [ROTOR[0] + Math.cos(a) * inches(6.5), ry + inches(1.4), ROTOR[2] + Math.sin(a) * inches(6.5)], [inches(7), inches(2.4), inches(0.3)], mat(0xd8dde2, { metal: 0.3, rough: 0.4 }), rotor, [0, -a, 0]);
    }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      kit.box(`rotor_spoke_${k}`, [ROTOR[0] + Math.cos(a) * inches(5.5), ry + inches(0.25), ROTOR[2] + Math.sin(a) * inches(5.5)], [inches(9.8), inches(0.35), inches(0.5)], k % 2 ? mat(0x2b2e34, { metal: 0.4 }) : mat(TEAL, { metal: 0.5, rough: 0.35 }), rotor, [0, -a, 0]);
    }
    const ringGeo = new THREE.TorusGeometry(inches(7), inches(0.25), 6, 48);
    const ring = new THREE.Mesh(ringGeo, mat(0x2b2e34, { metal: 0.4 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(ROTOR[0], ry + inches(0.3), ROTOR[2]);
    kit.add(ring, 'rotor_ring', rotor);
    // Stationary curved outer wall (≈270°) on standoffs + base plate.
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(inches(10.8), inches(10.8), inches(4.5), 56, 1, true, 0.6, Math.PI * 1.5), mat(0x23262b, { metal: 0.3, rough: 0.55 }));
    (wall.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    wall.position.set(ROTOR[0], ry + inches(2.3), ROTOR[2]);
    kit.add(wall, 'rotor_wall');
    for (let k = 0; k < 12; k++) {
      const a = 0.6 + (k / 11) * Math.PI * 1.5;
      kit.standoff('rotor_standoff', [ROTOR[0] + Math.cos(a) * inches(11.1), ry, ROTOR[2] + Math.sin(a) * inches(11.1)], [ROTOR[0] + Math.cos(a) * inches(11.1), ry + inches(4.5), ROTOR[2] + Math.sin(a) * inches(11.1)]);
    }
    // Center tower: stacked omni wheels + ring structure, turret column above.
    kit.cyl('tower_core', [ROTOR[0], ry + inches(3.5), ROTOR[2]], inches(2.3), inches(6.5), 'y', dark, undefined, 24);
    for (let k = 0; k < 3; k++) kit.omni(`tower_omni_${k}`, [ROTOR[0] + inches(2.4), ry + inches(1.6 + k * 1.9), ROTOR[2] - inches(1.4)], inches(1.5), inches(0.9), 'x', undefined, 0x30333a);
    // Spiral hook with passive omni rollers rising toward the turret feed.
    const hook = kit.group('hook');
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * 1.15 + k * 0.22;
      const rr = inches(7.6) - k * inches(0.45);
      kit.omni(`hook_omni_${k}`, [ROTOR[0] + Math.cos(a) * rr, ry + inches(2) + k * inches(0.55), ROTOR[2] + Math.sin(a) * rr], inches(0.62), inches(0.5), 'y', hook, 0x3a3d44);
      kit.box(`hook_rail_${k}`, [ROTOR[0] + Math.cos(a) * (rr + inches(0.9)), ry + inches(2) + k * inches(0.55), ROTOR[2] + Math.sin(a) * (rr + inches(0.9))], [inches(1.4), inches(0.25), inches(0.3)], dark, hook, [0, -a, 0]);
    }
    kit.cyl('ttb_wheel_a', [ROTOR[0] - inches(3), ry + inches(7.5), ROTOR[2] - inches(2)], inches(1.5), inches(1.1), 'z', mat(0x9a6a3a, { rough: 0.7 }));
    kit.cyl('ttb_wheel_b', [ROTOR[0] - inches(3), ry + inches(7.5), ROTOR[2] - inches(4)], inches(1.5), inches(1.1), 'z', mat(0x9a6a3a, { rough: 0.7 }));
    // Three rotor motors (Krakens with Talon FX) standing at the rotor edge.
    for (let k = 0; k < 3; k++) kit.motor(`rotor_motor_${k}`, [ROTOR[0] + inches(4 + k * 1.2), ry + inches(1.4), ROTOR[2] + inches(9.5 - k * 2.6)], 'y');

    // ---------- turret column + A-frame shooter (rotates)
    kit.cyl('turret_column', [TP[0], (ry + inches(6.5) + TP[1]) / 2, TP[2]], inches(2.4), TP[1] - ry - inches(6.5), 'y', dark, undefined, 24);
    kit.bearingRing('turret_bearing', [TP[0], TP[1], TP[2]], inches(4.6), undefined, 0x2a2c31);
    const turretG = kit.group('t_turret');
    // Oval turret plate (pocketed) with a big spur gear ring under it.
    const oval = new THREE.Shape();
    oval.absellipse(0, 0, inches(6.2), inches(5.2), 0, Math.PI * 2, false, 0);
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2 + 0.15;
      const h = new THREE.Path();
      h.absarc(Math.cos(a0 + 0.35) * inches(3.6), Math.sin(a0 + 0.35) * inches(3), inches(0.9), 0, Math.PI * 2, true);
      oval.holes.push(h);
    }
    const ovalGeo = new THREE.ExtrudeGeometry(oval, { depth: inches(0.25), bevelEnabled: false });
    ovalGeo.rotateX(-Math.PI / 2);
    ovalGeo.translate(TP[0] + inches(0.8), TP[1] + inches(0.4), TP[2]);
    kit.add(new THREE.Mesh(ovalGeo, dark), 't_plate', turretG);
    kit.cyl('t_gear', [TP[0], TP[1] - inches(0.25), TP[2]], inches(5.3), inches(0.3), 'y', mat(0x8a6a40, { metal: 0.6, rough: 0.35 }), turretG, 64);
    // Four Kraken X44 stacked under the plate (flywheel drive), copper gear accents.
    for (let k = 0; k < 4; k++) kit.motor(`t_x44_${k}`, [TP[0] - inches(3.2), TP[1] - inches(1.6) - k * inches(0.05), TP[2] + inches(-3 + k * 2)], 'y', turretG, true);
    kit.motor('t_turret_x44', [TP[0] + inches(4.8), TP[1] - inches(1.6), TP[2] - inches(3)], 'y', turretG, true);
    // A-frame hood plates with GT2 belts, hood rollers and the 3in flywheel at the front.
    const fwC: [number, number, number] = [TP[0] + inches(3.3), TP[1] + inches(2.6), TP[2]];
    const apex: [number, number, number] = [TP[0] - inches(0.5), TP[1] + inches(7.2), TP[2]];
    for (const s of [-1, 1]) {
      const z = TP[2] + s * inches(2.6);
      const tri = new THREE.Shape();
      tri.moveTo(TP[0] - inches(4), TP[1] + inches(0.6));
      tri.lineTo(TP[0] + inches(4.6), TP[1] + inches(0.6));
      tri.lineTo(apex[0] + inches(1.2), apex[1]);
      tri.lineTo(apex[0] - inches(1.2), apex[1]);
      tri.closePath();
      const hole = new THREE.Path();
      hole.moveTo(TP[0] - inches(2.4), TP[1] + inches(1.5));
      hole.lineTo(TP[0] + inches(2.6), TP[1] + inches(1.5));
      hole.lineTo(apex[0], apex[1] - inches(1.6));
      hole.closePath();
      tri.holes.push(hole);
      const tg = new THREE.ExtrudeGeometry(tri, { depth: inches(0.19), bevelEnabled: false });
      tg.translate(0, 0, z - inches(0.095));
      kit.add(new THREE.Mesh(tg, dark), `t_aframe_${s}`, turretG);
      kit.belt(`t_belt_${s}`, [TP[0] - inches(3.2), TP[1] + inches(0.8)], [apex[0], apex[1]], z + s * inches(0.2), turretG);
      kit.belt(`t_belt2_${s}`, [apex[0], apex[1]], [fwC[0], fwC[1]], z + s * inches(0.2), turretG);
      kit.pulley(`t_apex_pulley_${s}`, [apex[0], apex[1], z + s * inches(0.3)], inches(0.9), { parent: turretG, color: 0x2a2c31 });
    }
    kit.cyl('t_apex_shaft', apex, inches(0.25), inches(6), 'z', M.steel(), turretG, 8);
    const hoodRoller = kit.tubeRoller('t_hood_roller', apex[0], apex[1], TP[2] - inches(1.8), TP[2] + inches(1.8), inches(0.9), 0x1a1b1e, turretG);
    const flyName = 't_flywheel';
    const fly = kit.group(flyName, turretG);
    kit.cyl('t_fly_body', fwC, inches(1.5), inches(3.4), 'z', mat(0x111213, { rough: 0.9 }), fly, 28);
    for (const s of [-1, 1]) kit.pulley(`t_fly_hub_${s}`, [fwC[0], fwC[1], fwC[2] + s * inches(1.75)], inches(1.45), { parent: fly, t: inches(0.12), color: 0xc28a50, spokes: 6 });
    // Hood (moving) — curved shell over the flywheel.
    const hoodPivot: [number, number, number] = [TP[0] + inches(1), TP[1] + inches(5.6), TP[2]];
    const hood = kit.group('t_hood', turretG);
    for (let k = 0; k < 5; k++) {
      const a = 0.9 - k * 0.32;
      kit.box(`t_hood_seg${k}`, [fwC[0] + Math.cos(a) * inches(2.4), fwC[1] + Math.sin(a) * inches(2.4), TP[2]], [inches(1.2), inches(0.18), inches(3.6)], dark, hood, [0, 0, a - Math.PI / 2]);
    }
    kit.camera('t_camera', [TP[0] + inches(5), TP[1] + inches(1.5), TP[2] + inches(3.5)], 0, turretG);
    kit.box('cable_chain', [TP[0] - inches(5.5), TP[1] - inches(0.5), TP[2] + inches(3)], [inches(1), inches(0.8), inches(6)], M.black(), undefined, [0, 0.6, 0]);

    // ---------- battery at the very left edge (split rail), cameras, LEDs
    kit.box('battery_lead_pos', [-inches(4), y0 + inches(8), -W / 2 + inches(4)], [inches(6), inches(0.4), inches(0.4)], mat(0xd02020));
    kit.camera('cam_front', [L / 2 - inches(1), H - inches(1.5), W / 2 - inches(3)], 0);
    kit.camera('cam_back', [-L / 2 + inches(1), H - inches(1.5), -W / 2 + inches(3)], Math.PI);

    rig.joint({ id: 'slide', type: 'prismatic', driver: 'intake-deploy', pivot: [0, 0, 0], axis: [1, 0, 0], stowed: 0, active: EXT, speed: 1.4 }, slide);
    rig.joint({ id: 'roll_main', type: 'spin', driver: 'intake-roller', parent: 'slide', pivot: mainC, axis: [0, 0, 1], speed: 2200 }, mainRoller);
    rig.joint({ id: 'roll_bot', type: 'spin', driver: 'intake-roller', parent: 'slide', pivot: botC, axis: [0, 0, 1], speed: 2600 }, botRoller);
    rig.joint({ id: 'rotor', type: 'spin', driver: 'indexer', pivot: [ROTOR[0], 0, ROTOR[2]], axis: [0, 1, 0], speed: 810 }, rotor);
    rig.joint({ id: 'turret', type: 'revolute', driver: 'turret', pivot: TP, axis: [0, 1, 0], speed: 540 }, turretG);
    rig.joint({ id: 'hood', type: 'revolute', driver: 'hood', parent: 'turret', pivot: hoodPivot, axis: [0, 0, 1], stowed: 0, active: -18, speed: 200 }, hood);
    rig.joint({ id: 'flywheel', type: 'spin', driver: 'shooter-wheel', parent: 'turret', pivot: fwC, axis: [0, 0, -1], speed: 4200 }, fly);
    rig.joint({ id: 'hood_roller', type: 'spin', driver: 'shooter-wheel', parent: 'turret', pivot: apex, axis: [0, 0, 1], speed: 3000 }, hoodRoller);

    const exit: [number, number, number] = [fwC[0] + inches(3), fwC[1] + inches(1.6), TP[2]];
    const shooter = { ...r4414.def.shooter!, barrels: [{ exit, pivot: TP }] };
    const zones = [{ center: [mainC[0] + EXT + inches(1.2), inches(3), 0] as [number, number, number], size: [inches(6), inches(6), W] as [number, number, number] }];
    return { model: kit.root, joints: rig.joints, parts: rig.parts, patch: { shooter, intake: { ...r4414.def.intake!, zones } } };
  },
};
