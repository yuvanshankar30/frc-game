# FRC Sim: REBUILT 2026

A browser-based FRC driving simulator in the spirit of MoSim, built for the 2026 game **REBUILT**. It ships six real robots modeled from public team data. You can also import your own robot from CAD (STEP, GLB/GLTF, STL or OBJ) and map its parts to working mechanisms.

![stack](https://img.shields.io/badge/three.js-r186-black) ![physics](https://img.shields.io/badge/physics-Rapier-orange) ![ts](https://img.shields.io/badge/TypeScript-strict-blue)

## Quick start

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # unit tests (match logic, scoring, kinematics, ballistics, schema, built-ins)
pnpm build      # typecheck + production build into dist/
```

## Modes

- **Play Match:** a full 2:40 match:
  - AUTO (20s), then TRANSITION (10s).
  - Four 25s SHIFTS with alternating active HUBs. The alliance that scored more in AUTO starts inactive.
  - END GAME (30s).
  - Results with ranking points (ENERGIZED, SUPERCHARGED, TRAVERSAL).
  - Optional bots fill the other five slots for a 3v3.
- **Free Practice:** no clock, both HUBs always active.
- **Local 2-Player:** split screen with keyboard + keyboard, keyboard + gamepad, or two gamepads.

## Controls (default, all rebindable in Settings)

| Action | Keyboard | Xbox pad |
|---|---|---|
| Drive / strafe | `W A S D` | left stick |
| Rotate | `Q E` / `← →` | right stick |
| Intake (hold) | `Shift` / `J` | LT / LB |
| Shoot (hold) | `Space` | RT / RB |
| Eject | `X` | B |
| Climb / descend | `C` | Y |
| Human player feed | `F` | X |
| Cycle camera | `V` | D-pad up |
| Toggle aim assist | `T` | D-pad down |
| Reset robot | `R` | Back |
| Pause | `Esc` / `P` | Start |

Cameras: third person, driver station, first person and overhead. In third person, controls follow the camera by default; switch to driver-station field-oriented in Settings.

**Aim assist** (on by default, like MoSim's semi-automatic play) does the following:
- Turrets track the HUB.
- Fixed shooters rotate the robot to line up.
- Shoot-on-the-move robots lead their shots.
- The robot holds fire until it is lined up.

A dashed arc previews the next shot.

## Built-in robots

Stats come from team binders, reveal threads and CAD releases. Each robot file lists its sources, and values that are estimates are marked in code.

| Team | Robot | Architecture | Capacity | Rate | Climb |
|---|---|---|---|---|---|
| 4414 HighTide | RIPCURRENT | Swerve, sliding box intake + extending hopper, Dye Rotor, 3in flywheel turret with SOTM | 88 | ~14 BPS | none |
| 971 Spartan Robotics | Mixtape | Swerve, dual independent turrets, mecanum-column spindexer, SOTM | ~50 | ~20 BPS | L1 |
| 2910 Jack in the Bot | Re•Blitz | Swerve (MK5n R1), sliding intake + hopper, 4-wide rear drum + hood | 58 | 25 BPS | none |
| 1690 Orbit | KEPLER | Swerve, spindexer, compact turret with SOTM, intakes while shooting | ~52 | ~13 BPS | L1 |
| 254 The Cheesy Poofs | Overload | Swerve (MK5n R1), belt floor, full-width rear drum + hood | ~60 | ~24 BPS | none |
| 1678 Citrus Circuits | Limestone | Swerve, roller floor + ball tunnel, full-width grip-tape drum | ~70 | ~26 BPS | L1 |

## Custom robots from CAD

Open **Robot Editor** from the menu:

1. **Import:** drop STEP/STP/IGES files (tessellated in the browser by OpenCascade WASM), GLB/GLTF, one or more STLs, OBJ, or a `.frcbot` package.
2. **Model:** pick the units and up axis (auto-guessed), rotate so the front faces +X, then click **Center & drop to floor**. **Fit frame to model** sets the frame size.
3. **Robot:** set the name, team, frame, bumpers, mass and drivetrain (swerve, tank or mecanum) with speeds.
4. **Joints:** select a part, click **Add joint** and place the pivot with the gizmo or by snapping to the part's center. Choose the joint type (revolute, prismatic or spin) and what drives it:
   - intake deploy or roller
   - indexer
   - flywheel
   - turret or hood (these follow the aim)
   - climber
   - wheels

   Then click **Assign parts** and click the CAD parts that move with it. Preview the motion with the slider.
5. **Mechanisms:**
   - Intake capture zones (side intakes are supported).
   - Hopper capacity and preload, with FUEL drawn inside the hopper.
   - Shooter lanes and turrets: exit points, hood range, speeds, fire rate, spread, turret range, shoot-on-the-move.
   - Climber level.
6. **Save:** checks the 2026 robot rules (perimeter, height, bumpers, mass), then **Save to Garage**, **Save & test drive**, or **Export .frcbot** to share.

A `.frcbot` file is a zip containing `robot.json` (see `src/robot/schema.ts`) and `model.glb`. Drop one into the **Garage** to install it. Any built-in robot can also be opened in the editor as a template or exported as a `.frcbot`.

## Field

The geometry comes from the 2026 Game Manual (Section 5) and the WPILib `2026-rebuilt-welded` AprilTag layout. It includes:
- HUBs with a hex opening at 72in, a net and a NEUTRAL ZONE exit.
- BUMPs (6.5in, 15°).
- TRENCH arms with 22.25in clearance.
- TOWERs with rungs at 27/45/63in.
- DEPOTs and OUTPOSTs (CHUTE + CORRAL).
- 504 FUEL.

All dimensions live in `src/field/rebuilt/dims.ts`, and point values live in `src/game/scoring.ts`.

## Project layout

```
src/
  core/        Game loop, input (keyboard/gamepad + rebinding), audio
  physics/     Rapier world setup
  field/       REBUILT field builder, FUEL pool, dims
  game/        MatchController (periods/shifts/hub state), scoring, bots
  robot/       schema, runtime Robot (drive/intake/shooter/climb), assembly of joints, ballistics
  robots/      built-in robots (procedural models + real-team stats), registry
  cad/         CAD import (STEP worker, GLB/STL/OBJ), .frcbot pack/unpack, IndexedDB storage
  editor/      Robot Editor (viewport, gizmos, joints, mechanisms)
  render/      cameras, arena, previews, trajectory
  ui/          React screens + HUD
scripts/       headless test drivers (playwright-core + system Chrome)
```

## Testing

`pnpm test` runs the unit tests: the match state machine, shifts, scoring and RP, drivetrain kinematics, ballistics, schema, and rules checks for all built-ins.

The browser tests need the dev server running on :5273 (or `URL=...`) and use your installed Chrome through `playwright-core`:

| Script | What it checks |
|---|---|
| `node scripts/robot-suite.mjs <dir>` | Every built-in robot: shooting from 2, 3.5 and 5m, intake, BUMP and TRENCH traversal, climbing |
| `node scripts/match-test.mjs <dir>` | A fast-forwarded 3v3 bot match: phases, scores, results |
| `node scripts/editor-test.mjs <dir>` | STL → editor → joint → save → test drive |
| `node scripts/step-test.mjs <file.step> <dir>` | STEP import through the OpenCascade worker |
| `node scripts/package-test.mjs <dir>` | `.frcbot` export → re-import → play, with joints intact |
| `node scripts/robot-gallery.mjs <dir>` | Preview screenshots of every robot |

Not affiliated with FIRST® or MoSim.
