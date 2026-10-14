import * as THREE from 'three';
import { Kit, M, mat } from './kit';
import { swerveBase, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';
import { TURN_RATE, TURN_ACCEL } from '../../robot/schema';

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
const EXT = inches(10);
const LIFT = inches(8.5);
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
      'The 2026 champion. Structural bumpers double as smoked hopper walls on a teal truss. A rack-driven intake slides out from under a carbon-fiber hopper box that holds 85+ FUEL and latches there. The Dye Rotor single-streams FUEL up a spiral hook into an A-frame turret with a 3in flywheel that shoots on the move.',
    highlights: ['2026 World Champion (Daly captain)', 'Latching rack intake + 85+ FUEL hopper', 'Dye Rotor → single stream ~14 BPS', '55.7:1 turret, 4× X44 flywheel, SOTM', 'Fits under the TRENCH', 'No climber'],
    sources: ['4414 2026 Technical Binder: 2026.team4414.com (CAD renders, Dye Rotor V10, Shooter V11, subsystem notes)', 'Chief Delphi: Team 4414 HighTide 2026 Tech Binder (RIPCURRENT)'],
    frame: { length: L, width: W, height: H, mass: 60, comHeight: 0.17, bumperThickness: inches(3.5), bumperHeight: inches(5.5) },
    drivetrain: { type: 'swerve', maxSpeed: 4.1, maxAccel: 10, maxOmega: TURN_RATE, maxAlpha: TURN_ACCEL },
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
    // Smoked polycarb walls with netting over them, as on the robot.
    const smoke = M.smokeNet();

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
    // ---------- top deck: T-shaped pocketed truss across the width + turret plate
    const deckY = TP[1] + inches(0.5); // the turret plate is part of the T-shaped deck (Shooter V11)
    kit.pocketPlate('deck_arm', [-inches(3.5), deckY, 0], inches(4), W - inches(1), { color: DARK, plane: 'xz', cell: inches(2), rib: inches(0.35) });
    kit.pocketPlate('deck_spine', [-L / 2 + inches(4), deckY, -inches(1.5)], inches(6), inches(9), { color: DARK, plane: 'xz', cell: inches(2), rib: inches(0.35) });

    // ---------- extending hopper + intake (binder "Intake" CAD: a U-shaped carbon-fiber box on 10DP racks)
    // The whole front of the hopper telescopes: a full-height CF front panel and two tall side panels slide forward on
    // the racks (through ~1.3in gaps in the bumper), overlapping the fixed smoked walls so the hopper stays closed. The
    // roller carriage rides at the foot of the side panels; stowed it sits up behind the front panel, above the bumper
    // (inside the starting perimeter), and on deploy it drops to the carpet ahead of the bumper and latches there.
    // Built in the deployed pose; the stowed pose is set by shifting the slide back EXT and lifting the carriage LIFT.
    const slide = kit.group('slide');
    const drop = kit.group('intake_carriage', slide);
    const bt = inches(3.5); // bumper thickness
    const bumperTop = inches(2.5) + inches(5.5);
    const face = L / 2 + bt; // front bumper face
    const nose = face + EXT; // deployed front panel; stowed it's flush with the bumper face
    const bx0 = nose - inches(15); // rear edge of the extension sides (still overlaps the fixed walls when deployed)
    const boxTop = wallTop - inches(0.6);
    const mainC: [number, number, number] = [nose - inches(2.3), inches(2.6), 0];
    const botC: [number, number, number] = [nose - inches(0.9), inches(1.05), 0];
    const mouthTop = bumperTop + inches(1.5); // FUEL rolls in under the front panel
    const zs = W / 2 - inches(0.25);
    // Extension side panels: tall at the back, with the binder's scooped cutout toward the front panel.
    const sidePts: [number, number][] = [
      [bx0, bumperTop + inches(0.3)],
      [nose, bumperTop + inches(0.3)],
      [nose, boxTop - inches(2.5)],
      [nose - inches(4), boxTop - inches(2.5)],
      [nose - inches(6.5), boxTop],
      [bx0, boxTop],
    ];
    // Roller carriage side plates (carry the roller bearings) from the carpet up past the bumper line.
    const plateTop = bumperTop + inches(2);
    const plateBack = nose - inches(5);
    const plateFront = nose + inches(0.4);
    const platePts: [number, number][] = [
      [plateBack, plateTop],
      [plateBack, inches(0.9)],
      [plateFront - inches(0.8), inches(0.6)],
      [plateFront, inches(1.6)],
      [plateFront, plateTop],
    ];
    const extrude = (pts: [number, number][], z: number) => {
      const sh = new THREE.Shape();
      sh.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) sh.lineTo(q[0], q[1]);
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: inches(0.12), bevelEnabled: false });
      geo.translate(0, 0, z - inches(0.06));
      return geo;
    };
    for (const s of [-1, 1]) {
      const z = s * zs;
      kit.add(new THREE.Mesh(extrude(sidePts, z), M.cf()), `ext_side_${s}`, slide);
      kit.add(new THREE.Mesh(extrude(platePts, z - s * inches(0.35)), M.cf()), `intake_plate_${s}`, drop);
      // Riveted aluminum edge angle along the bottom of the extension + the front edge.
      kit.box(`ext_angle_bot_${s}`, [(bx0 + nose) / 2, bumperTop + inches(0.6), z - s * inches(0.35)], [nose - bx0, inches(0.6), inches(0.6)], M.anodBlack(), slide);
      kit.box(`ext_angle_nose_${s}`, [nose - inches(0.35), (mouthTop + boxTop - inches(2.5)) / 2, z - s * inches(0.35)], [inches(0.6), boxTop - inches(2.5) - mouthTop, inches(0.6)], M.anodBlack(), slide);
      // Oversized bent aluminum impact guard on the outside of the carriage (slides along the field perimeter).
      kit.box(`impact_guard_${s}`, [nose - inches(2.4), inches(3.6), s * (zs + inches(0.25))], [inches(5.2), inches(4.4), inches(0.12)], M.anodBlack(), drop);
      for (const [c, r] of [
        [mainC, inches(0.55)],
        [botC, inches(0.4)],
      ] as const) kit.cyl(`ext_bearing_${s}`, [c[0], c[1], s * (zs + inches(0.12))], r, inches(0.12), 'z', M.steel(), drop, 16);
      // 2× X60 on the carriage plates (3.45:1 belt to the main roller).
      const mp: [number, number] = [nose - inches(3.9), bumperTop + inches(0.4)];
      kit.motor(`intake_x60_${s}`, [mp[0], mp[1], s * (zs - inches(1.4))], 'z', drop);
      kit.pulley(`intake_pulley_m_${s}`, [mp[0], mp[1], s * (zs - inches(0.6))], inches(0.6), { parent: drop, color: 0x2a2c31 });
      kit.pulley(`intake_pulley_r_${s}`, [mainC[0], mainC[1], s * (zs - inches(0.6))], inches(1.2), { parent: drop, color: 0x2a2c31, spokes: 5 });
      kit.belt(`intake_belt_a_${s}`, [mp[0] - inches(0.6), mp[1]], [mainC[0] - inches(1.2), mainC[1]], s * (zs - inches(0.6)), drop);
      kit.belt(`intake_belt_b_${s}`, [mp[0] + inches(0.6), mp[1]], [mainC[0] + inches(1.2), mainC[1]], s * (zs - inches(0.6)), drop);
      // 10DP racks (doubled 0.25in polycarbonate) running back through the bumper gaps into the frame.
      const rz = s * (W / 2 - inches(1.6));
      const r0 = L / 2 - inches(9) + EXT;
      const r1 = plateBack;
      kit.box(`rack_${s}`, [(r0 + r1) / 2, inches(5.2), rz], [r1 - r0, inches(0.9), inches(0.5)], M.black(), slide);
      const nT = Math.floor((r1 - r0) / inches(0.65));
      for (let k = 0; k < nT; k++) kit.box(`rack_tooth_${s}_${k}`, [r0 + inches(0.4) + k * inches(0.65), inches(5.75), rz], [inches(0.25), inches(0.25), inches(0.5)], M.black(), slide);
      kit.motor(`rack_x44_${s}`, [L / 2 - inches(3), inches(7.5), s * (W / 2 - inches(3))], 'y', undefined, true);
      kit.pulley(`rack_pinion_${s}`, [L / 2 - inches(3), inches(6.2), rz], inches(0.6), { color: 0x2a2c31 });
    }
    // Full-width CF front panel over the intake mouth, with the binder's center cutout for extra capacity.
    const fpTop = boxTop - inches(2.5);
    const cut = inches(12);
    for (const s of [-1, 1]) kit.box(`ext_front_${s}`, [nose - inches(0.05), (mouthTop + fpTop) / 2, s * (zs + cut / 2) / 2], [inches(0.1), fpTop - mouthTop, zs - cut / 2], M.cf(), slide);
    kit.box('ext_front_mid', [nose - inches(0.05), (mouthTop + fpTop - inches(3)) / 2, 0], [inches(0.1), fpTop - inches(3) - mouthTop, cut], M.cf(), slide);
    kit.box('ext_front_lip', [nose - inches(0.3), mouthTop, 0], [inches(0.6), inches(0.5), 2 * zs], M.anodBlack(), slide);
    // 3in main roller + 1.5in bottom roller (X44 1.5:1) low between the plates, dark grip tubing.
    kit.tubeRoller('intake_main', mainC[0], mainC[1], -zs + inches(0.4), zs - inches(0.4), inches(1.5), 0x34383f, drop);
    kit.tubeRoller('intake_bottom', botC[0], botC[1], -zs + inches(0.4), zs - inches(0.4), inches(0.75), 0x2a2d33, drop);
    kit.motor('intake_x44', [botC[0] - inches(1.6), botC[1] + inches(2.6), -(zs - inches(1.4))], 'z', drop, true);
    kit.belt('intake_bot_belt', [botC[0] - inches(1.6), botC[1] + inches(2.6)], [botC[0], botC[1]], -(zs - inches(0.6)), drop);
    // Stowed pose: everything on the slide back by EXT, the carriage lifted above the bumper behind the front panel.
    for (const c of slide.children) if (c !== drop) c.position.x -= EXT;
    for (const c of drop.children) {
      c.position.x -= EXT;
      c.position.y += LIFT;
    }

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

    rig.joint({ id: 'slide', type: 'prismatic', driver: 'intake-deploy', pivot: [0, 0, 0], axis: [1, 0, 0], stowed: 0, active: EXT, speed: 0.8 }, slide);
    rig.joint({ id: 'carriage', type: 'prismatic', driver: 'intake-deploy', parent: 'slide', pivot: [0, 0, 0], axis: [0, 1, 0], stowed: 0, active: -LIFT, speed: 0.7 }, drop);
    rig.joint({ id: 'rotor', type: 'spin', driver: 'indexer', pivot: [ROTOR[0], 0, ROTOR[2]], axis: [0, 1, 0], speed: 810 }, rotor);
    rig.joint({ id: 'turret', type: 'revolute', driver: 'turret', pivot: TP, axis: [0, 1, 0], speed: 540 }, turretG);
    rig.joint({ id: 'hood', type: 'revolute', driver: 'hood', parent: 'turret', pivot: hoodPivot, axis: [0, 0, 1], stowed: 0, active: -18, speed: 200 }, hood);
    rig.joint({ id: 'flywheel', type: 'spin', driver: 'shooter-wheel', parent: 'turret', pivot: fwC, axis: [0, 0, -1], speed: 4200 }, fly);
    rig.joint({ id: 'hood_roller', type: 'spin', driver: 'shooter-wheel', parent: 'turret', pivot: apex, axis: [0, 0, 1], speed: 3000 }, hoodRoller);

    const exit: [number, number, number] = [fwC[0] + inches(3), fwC[1] + inches(1.6), TP[2]];
    const shooter = { ...r4414.def.shooter!, barrels: [{ exit, pivot: TP }] };
    const zones = [{ center: [mainC[0] + inches(1.2), inches(3), 0] as [number, number, number], size: [inches(6), inches(6), W] as [number, number, number] }];
    return { model: kit.root, joints: rig.joints, parts: rig.parts, patch: { shooter, intake: { ...r4414.def.intake!, zones } } };
  },
};
