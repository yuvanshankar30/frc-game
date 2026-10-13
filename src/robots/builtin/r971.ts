import * as THREE from 'three';
import { Kit, M, mat } from './kit';
import { swerveBase, groundIntake, intakeGearbox, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';

/**
 * 971 Spartan Robotics — Mixtape.
 * Sources: 971 "2026 Second Robot Technical Documentation" (Mixtape · FRC 971), robot photo, released Onshape CAD,
 * robot code github.com/frc971/971-second-robot-2026.
 *  - Drivetrain: rectangular swerve on SDS MK5, 25 × 30in "to fit turrets and climber", split brainpan, bottom-mounted
 *    battery on a pivoting flap, EVA foam bumpers with a fillet, ball ramp that doubles as the turret wiring guide,
 *    superstructure mounted off the drivetrain tubes.
 *  - Climber: one-stage telescoping arm to LEVEL 1, curved string-tensioned hooks, 60:1 MAX Planetary on an X44; split
 *    bumper gap lets the hook reach the tower.
 *  - Ground intake (slapdown, 1678-inspired): single 1/16in-wall beater bar, SplineXL jackshaft driven by a central
 *    1:45 pivot gearbox over #35 chain, SRPP bars, 1/4in aluminum kicker plate; it pushes the hopper out.
 *  - Indexer + hopper: roller floor (X60 1:1), powered separator with omni wheels splitting FUEL into two paths
 *    (X60 1:4), 1.25in kicker roller (X60 1:1) into each shooter, top roller against jams, 1/16in polycarb walls.
 *  - Turrets: two, each on an X44 with a 14:200 belt reduction, 10in ID X-contact bearings, custom 124T aluminum
 *    spur gear, ~210° of travel.
 *  - Shooter: 4in 60A neoprene flywheels on two X60 (1:1), 50° range-of-motion hood on a lead screw (X44, 3:1),
 *    1.25in kicker under the flywheels, 3/16in aluminum plates, PAHT-CF backing.
 *  - Capacity / BPS are estimates (~40 FUEL modeled, ~20 BPS from both turrets).
 */
const L = inches(25);
const W = inches(30);
const H = inches(21.5);
const TR = inches(5.4); // turret bearing radius (10in ID X-contact)
// Both turrets sit side by side at the rear, close together, flanking the central climber (CAD + reveal photo).
const TZ = inches(7.6);
const TL_P: [number, number, number] = [-L / 2 + inches(6.2), inches(12.5), -TZ];
const TR_P: [number, number, number] = [-L / 2 + inches(6.2), inches(12.5), TZ];
// Tall clear hopper over the front ~half of the robot; its front wall swings out over the bumper with the intake.
const BOX_X0 = -L / 2 + inches(12.6);
const BOX_X1 = L / 2 - inches(0.5);
const YEL = 0xf3c020;
const SPONSORS = ['WCP', 'Qualcomm', 'J&J', 'Apple', 'INTUITIVE', 'Google', 'NASA', 'In Memory of Zach Marks', 'The Mintz Family'];

/** Yellow / black hazard tape along a top rail (x from x0 to x1). */
function hazardTape(kit: Kit, name: string, x0: number, x1: number, y: number, z: number, parent?: THREE.Object3D) {
  const n = Math.max(2, Math.round((x1 - x0) / inches(1.2)));
  const seg = (x1 - x0) / n;
  const yel = mat(YEL, { rough: 0.6 });
  const blk = mat(0x111214, { rough: 0.7 });
  for (let k = 0; k < n; k++) kit.box(`${name}_${k}`, [x0 + (k + 0.5) * seg, y, z], [seg, inches(0.04), inches(1.02)], k % 2 ? blk : yel, parent);
}

/** One Mixtape turret + shooter (shooter points +X at joint value 0). */
function turretAssembly(kit: Kit, name: string, p: [number, number, number]) {
  const [px, py, pz] = p;
  const tg = kit.group(`${name}_turret`);
  const dark = mat(0x18191c, { metal: 0.4, rough: 0.5 });
  const yel = mat(YEL, { rough: 0.55 });
  const outer = Math.sign(pz) || 1;
  // Fixed: X-contact bearing, yellow printed clamp ring, X44 + 14:200 belt drive.
  kit.bearingRing(`${name}_bearing`, [px, py, pz], TR, undefined, 0x8d939b);
  const clamp = new THREE.Mesh(new THREE.TorusGeometry(TR + inches(0.45), inches(0.32), 6, 48), yel);
  clamp.rotation.x = Math.PI / 2;
  clamp.position.set(px, py - inches(0.45), pz);
  kit.add(clamp, `${name}_clamp_ring`);
  kit.motor(`${name}_x44`, [px + inches(1.5), py - inches(1.3), pz + outer * (TR + inches(0.6))], 'y', undefined, true);
  // Rotating: 124T spur gear + deck.
  kit.cyl(`${name}_gear124`, [px, py + inches(0.35), pz], TR + inches(0.75), inches(0.25), 'y', mat(0xb7bcc3, { metal: 0.8, rough: 0.3 }), tg, 72);
  kit.cyl(`${name}_deck`, [px, py + inches(0.6), pz], TR + inches(0.2), inches(0.19), 'y', dark, tg, 40);
  // Tall black flywheel housing: two 3/16in plates, PAHT-CF backing, yellow printed spacers along the top.
  const flyC: [number, number, number] = [px + inches(1.2), py + inches(6), pz];
  for (const s of [-1, 1]) {
    kit.pocketPlate(`${name}_plate${s}`, [px - inches(0.2), py + inches(4.7), pz + s * inches(2.5)], inches(7.4), inches(8.2), { color: 0x18191c, parent: tg, cell: inches(1.05), rib: inches(0.55), t: inches(0.1875) });
    kit.box(`${name}_top_spacer${s}`, [px - inches(1.8), py + inches(8.4), pz + s * inches(1.4)], [inches(1.4), inches(0.7), inches(1.9)], yel, tg);
    kit.box(`${name}_yellow_clamp${s}`, [px - inches(2.9), py + inches(1.8), pz + s * inches(2.5)], [inches(1.4), inches(2.2), inches(0.7)], yel, tg);
  }
  kit.box(`${name}_backing`, [px - inches(3.4), py + inches(4.7), pz], [inches(0.35), inches(7.6), inches(4.6)], mat(0x2b2b2b, { rough: 0.85 }), tg);
  hazardTape(kit, `${name}_tape`, px - inches(3.6), px + inches(3.4), py + inches(8.85), pz + inches(2.5), tg);
  // Flywheel: 4in 60A neoprene, belted 1:1 from an X60 low on the outside plate.
  const fly = kit.group(`${name}_flywheel`, tg);
  kit.cyl(`${name}_fly_shaft`, flyC, inches(0.25), inches(5.6), 'z', M.steel(), fly, 8);
  for (let k = -1; k <= 1; k++) kit.cyl(`${name}_neoprene${k}`, [flyC[0], flyC[1], pz + k * inches(1.35)], inches(2), inches(1.1), 'z', mat(0x15161a, { rough: 0.95 }), fly, 28);
  const mz = pz + outer * inches(3.1);
  const motorC: [number, number] = [px - inches(1.6), py + inches(2.4)];
  kit.motor(`${name}_fly_x60`, [motorC[0], motorC[1], pz + outer * inches(4)], 'z', tg);
  kit.pulley(`${name}_fly_pulley`, [flyC[0], flyC[1], mz], inches(1.1), { parent: tg, color: 0x2a2d33, spokes: 5 });
  kit.pulley(`${name}_motor_pulley`, [motorC[0], motorC[1], mz], inches(0.8), { parent: tg, color: 0x2a2d33 });
  kit.belt(`${name}_fly_belt_a`, [motorC[0] - inches(0.8), motorC[1]], [flyC[0] - inches(1.1), flyC[1]], mz, tg);
  kit.belt(`${name}_fly_belt_b`, [motorC[0] + inches(0.8), motorC[1]], [flyC[0] + inches(1.1), flyC[1]], mz, tg);
  // 1.25in kicker under the flywheel.
  const kickC: [number, number, number] = [flyC[0] - inches(1.8), flyC[1] - inches(3.1), pz];
  const kicker = kit.tubeRoller(`${name}_kicker`, kickC[0], kickC[1], pz - inches(2.1), pz + inches(2.1), inches(0.625), 0x9aa1aa, tg);
  // 50° hood on a lead screw (X44, 3:1).
  const hoodPivot: [number, number, number] = [px - inches(2.2), py + inches(8), pz];
  const hood = kit.group(`${name}_hood`, tg);
  for (let k = 0; k < 6; k++) {
    const a = 1.0 - k * 0.3;
    kit.box(`${name}_hood_seg${k}`, [flyC[0] + Math.cos(a) * inches(2.95), flyC[1] + Math.sin(a) * inches(2.95), pz], [inches(1.15), inches(0.2), inches(4.4)], mat(0x2a2d33, { metal: 0.3 }), hood, [0, 0, a - Math.PI / 2]);
  }
  for (const s of [-1, 1]) kit.sectorPlate(`${name}_hood_side${s}`, [hoodPivot[0], hoodPivot[1], pz + s * inches(2.25)], inches(4.6), -0.7, 0.2, { parent: hood, t: inches(0.19), color: 0x18191c, teeth: 1 });
  kit.cyl(`${name}_leadscrew`, [px - inches(3), py + inches(5), pz - outer * inches(1.3)], inches(0.16), inches(5.5), 'y', M.steel(), tg, 8);
  kit.motor(`${name}_hood_x44`, [px - inches(3), py + inches(1.9), pz - outer * inches(1.3)], 'y', tg, true);
  kit.camera(`${name}_cam`, [px + inches(3.6), py + inches(1.6), pz], 0, tg);
  return { tg, fly, flyC, kicker, kickC, hood, hoodPivot, exit: [flyC[0] + inches(3.2), flyC[1] + inches(1.5), pz] as [number, number, number] };
}

export const r971: BuiltinRobot = {
  def: {
    id: 'builtin-971',
    name: 'Mixtape',
    team: '971',
    author: 'Spartan Robotics',
    color: '#2f5fd8',
    description:
      'Two independent turrets on 10in X-contact bearings, each with 4in neoprene flywheels and a lead-screw hood. A powered roller floor and omni-wheel separator split FUEL into two streams. A 1678-style slapdown pushes out the expanding hopper, and a telescoping arm climbs LEVEL 1.',
    highlights: ['Dual independent turrets (~210° each)', 'Omni-wheel separator → two streams', 'Slapdown intake pushes out the hopper', 'Shoot-on-the-move', 'LEVEL 1 telescoping climber', 'Fits under the TRENCH'],
    sources: ['971 Mixtape Technical Documentation 2026 (drivetrain, climber, intake, indexer, turrets, shooter)', 'github.com/frc971/971-second-robot-2026 (robot code + photo)', 'Chief Delphi: 971 CAD and Code Release 2026 (Onshape)'],
    frame: { length: L, width: W, height: H, mass: 59, comHeight: 0.16, bumperThickness: inches(3.5), bumperHeight: inches(5) },
    drivetrain: { type: 'swerve', maxSpeed: 4.5, maxAccel: 10, maxOmega: 10, maxAlpha: 32 },
    intake: {
      zones: [{ center: [L / 2 + inches(7.5), inches(3.5), 0], size: [inches(6), inches(7), W - inches(2)] }],
      rate: 14,
      requiresDeploy: true,
    },
    storage: {
      capacity: 40,
      preload: 8,
      box: { center: [(BOX_X0 + BOX_X1) / 2 + inches(2), inches(12.2), 0], size: [BOX_X1 - BOX_X0 + inches(3), inches(17.5), W - inches(2)] },
    },
    shooter: {
      barrels: [{ exit: [0, 0, 0] }, { exit: [0, 0, 0] }],
      angle: 60,
      hoodMin: 30,
      hoodMax: 80,
      minSpeed: 4,
      maxSpeed: 15,
      rate: 20,
      spread: 1.0,
      turretMin: -105,
      turretMax: 105,
      turretSpeed: 600,
      yawOffset: 0,
      sotm: true,
    },
    climber: { maxLevel: 1, climbTime: 2.6, canAutoClimb: true },
    source: 'builtin:971',
  },
  build() {
    const kit = new Kit('971-mixtape');
    const rig = new Rig();
    const base = swerveBase(kit, rig, L, W, { electronics: [-inches(2), 0] });
    const y0 = base.railTop;

    // Silver drilled-tube superstructure: rear posts + top rails along the sides (yellow/black tape), front hoop.
    const cageTop = H - inches(1);
    const rx = -L / 2 + inches(1);
    for (const sz of [-1, 1]) {
      const z = sz * (W / 2 - inches(1));
      kit.tube('cage_post_rear', [rx, y0, z], [rx, cageTop, z], [inches(1), inches(1)]);
      kit.tube('cage_post_mid', [BOX_X0, y0, z], [BOX_X0, cageTop, z], [inches(1), inches(1)]);
      kit.tube('cage_rail', [rx, cageTop, z], [BOX_X0, cageTop, z], [inches(1), inches(1)]);
      hazardTape(kit, `rail_tape${sz}`, rx, BOX_X0, cageTop + inches(0.52), z);
      // Gussets at the post / drivetrain-tube joints.
      for (const x of [rx + inches(1.4), BOX_X0 - inches(1.4)]) kit.box('cage_gusset', [x, y0 + inches(1.4), z + sz * inches(0.55)], [inches(2.6), inches(2.6), inches(0.09)], M.alu(), undefined, [0, 0, Math.PI / 4]);
    }
    kit.tube('cage_back', [rx, cageTop, -W / 2 + inches(1)], [rx, cageTop, W / 2 - inches(1)], [inches(1), inches(1)]);
    kit.tube('cage_cross', [BOX_X0, cageTop, -W / 2 + inches(1)], [BOX_X0, cageTop, W / 2 - inches(1)], [inches(1), inches(1)]);
    kit.tube('cage_mid', [BOX_X0, y0, -W / 2 + inches(1)], [BOX_X0, y0, W / 2 - inches(1)], [inches(2), inches(1)]);

    // Tall clear hopper: 1/16in polycarb, black sponsor decals, aluminum edge angle. The front wall is a separate
    // flap (below) that the slapdown pushes out over the bumper.
    kit.polyBox('hopper', BOX_X0, BOX_X1, -W / 2 + inches(0.5), W / 2 - inches(0.5), y0, H - inches(0.5), { open: ['top', 'back', 'front'] });
    for (const s of [-1, 1] as const) kit.sponsors(`sponsors_${s}`, [(BOX_X0 + BOX_X1) / 2, y0 + inches(9), s * (W / 2 - inches(0.47))], BOX_X1 - BOX_X0 - inches(1.5), inches(11), SPONSORS, 'xy', s, undefined, '#15171b');
    const hop = kit.group('hopper_ext');
    const fh = H - inches(0.5) - (y0 + inches(5));
    const flap = kit.group('hopper_flap', hop);
    kit.box('flap_panel', [BOX_X1 + inches(1.6), y0 + inches(5) + fh / 2, 0], [0.003, fh / Math.cos(0.3), W - inches(1)], M.polycarb(), flap, [0, 0, 0.3]);
    kit.box('flap_rim', [BOX_X1 + inches(3.1), H - inches(0.5), 0], [inches(0.75), inches(0.75), W - inches(1)], M.alu(), flap);
    for (const s of [-1, 1]) kit.box('flap_wing', [BOX_X1 + inches(1.6), y0 + inches(5) + fh / 2, s * (W / 2 - inches(0.55))], [inches(3.4), fh, 0.003], M.polycarb(), flap);
    kit.sponsors('sponsors_front', [BOX_X1 + inches(2.2), y0 + inches(11), 0], W - inches(6), inches(7), ['SPARTAN ROBOTICS', '971', 'Qualcomm', 'Google'], 'zy', 1, flap, '#15171b');

    // Indexer: roller floor (X60 1:1) → powered omni separator (X60 1:4) splitting FUEL into two paths → kickers.
    const floor = kit.group('roller_floor');
    for (let k = 0; k < 6; k++) kit.tubeRoller(`floor_${k}`, BOX_X1 - inches(2) - k * inches(2.1), y0 + inches(0.8) + k * inches(0.1), -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(0.6), 0x2a2d33, floor);
    kit.motor('floor_x60', [BOX_X1 - inches(5), y0 - inches(1.3), -W / 2 + inches(3)], 'y');
    const SEPX = BOX_X0 - inches(1.5);
    const sep = kit.group('separator');
    for (let k = 0; k < 3; k++) kit.omni(`sep_omni_${k}`, [SEPX, y0 + inches(1.6 + k * 2.2), 0], inches(1.5), inches(0.9), 'y', sep, 0x2a2d33);
    kit.cyl('sep_shaft', [SEPX, y0 + inches(4), 0], inches(0.25), inches(7), 'y', M.steel(), sep, 8);
    kit.motor('sep_x60', [SEPX, y0 - inches(1.3), inches(2.5)], 'y');
    // Split ramps (1/4in aluminum) guiding each stream to its turret.
    for (const s of [-1, 1]) kit.box(`split_ramp${s}`, [SEPX - inches(2), y0 + inches(3), s * inches(4.5)], [inches(5), inches(0.25), inches(5)], M.alu(), undefined, [0, s * 0.55, 0.25]);
    const topRoller = kit.tubeRoller('top_roller', BOX_X0 - inches(0.4), H - inches(3.2), -W / 2 + inches(2), W / 2 - inches(2), inches(0.75), YEL);

    // Twin turrets on pocketed base plates + standoffs.
    const a = turretAssembly(kit, 'tl', TL_P);
    const b = turretAssembly(kit, 'tr', TR_P);
    for (const p of [TL_P, TR_P]) {
      for (const s of [-1, 1]) kit.standoff('turret_standoff', [p[0] + s * inches(4.6), y0, p[2] + Math.sign(p[2]) * inches(4.6)], [p[0] + s * inches(4.6), p[1] - inches(0.7), p[2] + Math.sign(p[2]) * inches(4.6)]);
      kit.pocketPlate('turret_base', [p[0], p[1] - inches(0.8), p[2]], inches(12.4), inches(12.4), { color: 0x18191c, plane: 'xz', cell: inches(2.2), rib: inches(0.35) });
    }

    // Climber: one-stage telescoping arm to LEVEL 1 between the turrets, curved string-tensioned hook,
    // 60:1 MAXPlanetary on an X44 (the split rear bumper lets the hook reach the rung).
    const cx = -L / 2 + inches(2.2);
    for (const s of [-1, 1]) kit.pocketPlate(`climb_gusset${s}`, [cx + inches(1), y0 + inches(4.5), s * inches(1.2)], inches(4), inches(8), { color: 0x9aa1aa, cell: inches(1.5), rib: inches(0.28), t: inches(0.125) });
    kit.tube('climb_outer', [cx, y0, 0], [cx, cageTop, 0], [inches(1.5), inches(1.5)]);
    kit.motor('climb_x44', [cx + inches(2.2), y0 + inches(1.5), 0], 'y', undefined, true);
    const climb = kit.group('climber');
    kit.tube('climb_inner', [cx, y0 + inches(4), 0], [cx, cageTop + inches(1.4), 0], [inches(1.15), inches(1.15)], climb);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(inches(1.5), inches(0.32), 8, 18, Math.PI * 1.15), mat(YEL, { rough: 0.55 }));
    hook.position.set(cx - inches(1.4), cageTop + inches(1.4), 0);
    hook.rotation.z = Math.PI * 0.05;
    kit.add(hook, 'climb_hook', climb);
    kit.cyl('climb_string', [cx - inches(0.2), cageTop - inches(5), inches(0.65)], inches(0.04), inches(12), 'y', mat(0xe8e2d0, { rough: 0.9 }), climb, 4);

    // Slapdown intake (single beater bar, SplineXL jackshaft, kicker plate).
    const ipiv: [number, number, number] = [L / 2 - inches(2), y0 + inches(6.5), 0];
    const intake = groundIntake(kit, 'intake', { bumper: { face: L / 2 + inches(3.5), top: inches(2.56) + inches(5) }, pivot: [ipiv[0], ipiv[1]], rollerX: L / 2 + inches(3.5) + inches(3.5), rollerR: inches(1.25), width: W - inches(0.5), roller: 'silicone', wheel: 0xc0c6cd, armColor: 0x16171a, kicker: true });
    intakeGearbox(kit, 'intake', [ipiv[0], ipiv[1]], 0);
    kit.cyl('splinexl', [ipiv[0], ipiv[1], 0], inches(0.45), W - inches(2), 'z', mat(0x2b2e34, { metal: 0.6 }), intake.group, 8);

    kit.camera('cam_front', [L / 2 - inches(1), cageTop - inches(1), 0], 0);
    kit.camera('cam_back', [-L / 2 + inches(1), cageTop - inches(1), 0], Math.PI);

    rig.joint({ id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: ipiv, axis: [0, 0, 1], stowed: intake.deployAngleDeg + 95, active: 0, speed: 520 }, intake.group);
    rig.joint({ id: 'intake_roll', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.rollerCenter, axis: [0, 0, 1], speed: 2000 }, intake.roller);
    if (intake.kickerNode) rig.joint({ id: 'intake_kick', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.kickerCenter!, axis: [0, 0, -1], speed: 2400 }, intake.kickerNode);
    rig.joint({ id: 'hopper_ext', type: 'prismatic', driver: 'intake-deploy', pivot: [0, 0, 0], axis: [1, 0, 0], stowed: -inches(3.2), active: 0, speed: 0.5 }, hop);
    rig.joint({ id: 'floor', type: 'spin', driver: 'indexer', pivot: [BOX_X1 - inches(2), y0 + inches(0.8), 0], axis: [0, 0, 1], speed: 1200 }, 'floor_0');
    rig.joint({ id: 'separator', type: 'spin', driver: 'indexer', pivot: [SEPX, 0, 0], axis: [0, 1, 0], speed: 900 }, sep);
    rig.joint({ id: 'top_roll', type: 'spin', driver: 'indexer', pivot: [BOX_X0 - inches(0.4), H - inches(3.2), 0], axis: [0, 0, 1], speed: 1000 }, topRoller);
    rig.joint({ id: 'turret_l', type: 'revolute', driver: 'turret', pivot: TL_P, axis: [0, 1, 0], speed: 600 }, a.tg);
    rig.joint({ id: 'turret_r', type: 'revolute', driver: 'turret', pivot: TR_P, axis: [0, 1, 0], speed: 600 }, b.tg);
    for (const [t, id] of [
      [a, 'l'],
      [b, 'r'],
    ] as const) {
      rig.joint({ id: `hood_${id}`, type: 'revolute', driver: 'hood', parent: `turret_${id}`, pivot: t.hoodPivot, axis: [0, 0, 1], active: -28, speed: 200 }, t.hood);
      rig.joint({ id: `fly_${id}`, type: 'spin', driver: 'shooter-wheel', parent: `turret_${id}`, pivot: t.flyC, axis: [0, 0, -1], speed: 3600 }, t.fly);
      rig.joint({ id: `kick_${id}`, type: 'spin', driver: 'indexer', parent: `turret_${id}`, pivot: t.kickC, axis: [0, 0, -1], speed: 1500 }, t.kicker);
    }
    rig.joint({ id: 'climber', type: 'prismatic', driver: 'climber', pivot: [cx, y0, 0], axis: [0, 1, 0], active: inches(8), speed: 0.35 }, climb);

    const shooter = { ...r971.def.shooter!, barrels: [{ exit: a.exit, pivot: TL_P }, { exit: b.exit, pivot: TR_P }] };
    const zones = [{ center: [intake.rollerCenter[0] + inches(1), inches(3.5), 0] as [number, number, number], size: [inches(6), inches(7), W - inches(1)] as [number, number, number] }];
    return { model: kit.root, joints: rig.joints, parts: rig.parts, patch: { shooter, intake: { ...r971.def.intake!, zones } } };
  },
};
