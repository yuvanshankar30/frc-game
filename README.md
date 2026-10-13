# FRC Sim: REBUILT 2026

A browser-based FRC driving simulator in the spirit of MoSim, built for the 2026 game **REBUILT**. It ships six real robots modeled from public team data. You can also import your own robot from CAD (STEP/IGES, GLB/GLTF, STL, OBJ, 3MF, FBX or PLY) and map its parts to working mechanisms.

![stack](https://img.shields.io/badge/three.js-r186-black) ![physics](https://img.shields.io/badge/physics-Rapier-orange) ![ts](https://img.shields.io/badge/TypeScript-strict-blue)

## Quick start

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # unit tests (match logic, scoring, kinematics, ballistics, schema, built-ins)
pnpm build      # typecheck + production build into dist/
```

## Modes

- **Match:** a full 2:40 match:
  - AUTO (20s), then TRANSITION (10s).
  - Four 25s SHIFTS with alternating active HUBs. The alliance that scored more in AUTO starts inactive.
  - END GAME (30s).
  - Results with ranking points (ENERGIZED, SUPERCHARGED, TRAVERSAL) and per-robot stats.
- **Practice:** no clock, both HUBs always active.
- **Multiplayer:** local split screen with keyboard + keyboard, keyboard + gamepad, or two gamepads. Online multiplayer needs a game server and is planned.

FUEL flies with quadratic air drag and Magnus lift from the backspin a hooded shooter puts on it, and rolls to a stop on the carpet. The shot solver integrates the same model, so the aim matches what the field does. Swerve robots turn at a competition-typical ~360°/s, and translation and rotation share the wheels' top speed: spinning while you drive slows both.

FUEL inside a robot is real physics. Each robot's hopper has walls that only carried FUEL collides with. Intaken balls arc in over the bumper, slosh around as you drive, can spill out on hard hits, and the shooter feeds from the ball nearest its feeder.

## Controls (default, all rebindable in Settings)

| Action | Keyboard | Xbox pad |
|---|---|---|
| Drive / strafe | `W A S D` | left stick |
| Rotate | `J L` (also `Q E`) | right stick |
| Intake (hold) | `Shift` | LT / LB |
| Shoot (hold) | `Space` | RT / RB |
| Eject | `X` | B |
| Climb one level / lower | `C` | Y |
| Human player feed | `F` | X |
| Cycle camera | `V` | D-pad up |
| Toggle aim assist | `T` | D-pad down |
| Rev flywheel (expert mode) | `G` | A |
| Reset robot | `R` | Back |
| Pause | `Esc` / `P` | Start |

Climbing goes one level per press: near your TOWER the first press lines up and climbs to LEVEL 1, each further press climbs to the next rung (up to what the robot can reach; LEVEL 1 only in AUTO), and a press at the top lowers the robot back to the carpet.

Outside its ALLIANCE ZONE a robot shuttles: Shoot lobs FUEL back onto the carpet in its own zone (the HUD shows PASS instead of LOCKED).

Settings has a keyboard rotation ramp and heading hold, which keeps swerve and mecanum robots on line when you aren't turning. **Expert mode** turns off aim assist and heading hold: you rev the flywheel yourself and Shoot only runs the indexer, so FUEL fed into a wheel that isn't up to speed falls short. Player 2 on the same keyboard drives with the arrow keys and rotates with `,` and `.`.

Cameras: third person, driver station, first person and overhead. The third-person camera follows the robot from its alliance's side of the field and doesn't swing around when the robot turns, so up on the stick is always the same direction on screen (like MoSim's and xRC's follow cameras). Driving is field-oriented in every camera except first person.

Each finished match is saved to a local high score table (top 10, on this computer) shown on the results screen.

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
| 4414 HighTide | RIPCURRENT | Structural-bumper hopper walls, latching rack intake + extending net hopper, Dye Rotor, 3in flywheel turret with SOTM (binder CAD) | 88 | ~14 BPS | none |
| 971 Spartan Robotics | Mixtape | Clear front hopper, twin independent turrets, mecanum spindexer, pivot ground intake (released code) | ~36 | ~20 BPS | none |
| 2910 Jack in the Bot | Re•Blitz | Pivot intake 0–114°, extending hopper, 4-lane rear drum, hood 0–37° (released code) | 58 | 25 BPS | none |
| 1690 Orbit | KEPLER | Clear hopper, spindexer, compact turret with SOTM | ~48 | ~13 BPS | L1 |
| 254 The Cheesy Poofs | Overload | Smoked "blue box" hopper, timing-belt floor, full-width rear drum + hood | ~50 | ~24 BPS | none |
| 1678 Citrus Circuits | Limestone | Slapdown intake, angled roller floor, ball tunnel, 3.5in grip-tape drum, hood 17.5–52.5°, climber-lifted hopper roof (design write-up + code) | ~55 | ~26 BPS | L1 |

## Custom robots from CAD

Open **Robot Editor** from the menu:

1. **Import:** drop STEP/STP/IGES files (tessellated in the browser by OpenCascade WASM, coarse / normal / fine detail), GLB, GLTF (together with its `.bin` and textures), STL, OBJ, 3MF, FBX, PLY, or a `.frcbot` package. Several files at once are combined into one robot. **Remove fasteners & tiny parts** (on by default) drops screws, nuts, washers, rivets, McMaster part numbers and anything under ~8 mm, which is usually most of a robot's part count. In game, everything that moves together is merged into a few meshes, so a 20,000-part assembly still runs at 60 FPS.
2. **Model:** pick the units and up axis (auto-guessed), rotate so the front faces +X, then click **Center & drop to floor**. **Fit frame to model** sets the frame size.
3. **Robot:** set the name, team, frame, bumpers, mass and drivetrain (swerve, tank or mecanum) with speeds.
4. **Joints:** **Auto-rig from names** creates joints for parts named like wheels, rollers, intake, turret, hood, flywheel/drum, indexer/spindexer and climber, with pivots and axes from each part's bounding box (a hood inside a turret gets the turret as its parent). Check the pivots and set the deploy angles. Or select a part, click **Add joint** and place the pivot with the gizmo or by snapping to the part's center. Choose the joint type (revolute, prismatic or spin) and what drives it:
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

### Using a team's real CAD

Large assemblies (100–500 MB of STEP) are best converted offline:

```bash
node scripts/cad-to-glb.mjs robot.step robot.glb --ratio 0.4   # keeps part tree + names + colors, simplifies meshes
```

Then import the GLB in the Robot Editor. Opening a built-in robot as a template and importing CAD **replaces the model
but keeps the robot's stats and mechanisms**. Exported packages named `public/cad/builtin-<team>.frcbot` override that
built-in robot's procedural model in game (see `public/cad/README.md` for the Onshape links of 971, 2910 and 1690).

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

Match flow follows the manual: a 3-2-1 countdown, then AUTO (20s, both HUBs active). Robots are disabled for the
3s AUTO→TELEOP delay. TELEOP runs TRANSITION (10s), four 25s SHIFTs with alternating HUBs, and END GAME (30s).
FUEL entering a HUB within 3s after AUTO ends still scores as AUTO FUEL. A HUB that is inactive for a SHIFT, or
after the match ends, scores nothing. The alliance that scored more AUTO FUEL, grace window included, starts SHIFT 1
inactive.

## Sound

The only sounds are the FRC field cues and FUEL dropping around the arena; robots make no motor noise.
- **Field cues:** the field sound files from Team 254's [Cheesy Arena](https://github.com/Team254/cheesy-arena)
  field software (`static/audio`), played at the same points as its 2026 timing: start, AUTO end, TELEOP start,
  each shift change, END GAME warning and match end. They live in `public/sfx/` (see its README).
- **Ball drops:** each real FUEL bounce makes a soft foam thud, quieter and more muffled with distance from the
  camera, with arena reverb.

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

`pnpm test` runs the unit tests: the match state machine, shifts, scoring and RP, drivetrain kinematics, ballistics, schema, rules checks for all built-ins, and the CAD cleanup, mesh merging and auto-rig.

The browser tests need the dev server running on :5273 (or `URL=...`) and use your installed Chrome through `playwright-core`:

| Script | What it checks |
|---|---|
| `node scripts/robot-suite.mjs <dir>` | Every built-in robot: shooting from 2, 3.5 and 5m, intake, BUMP and TRENCH traversal, climbing |
| `node scripts/editor-test.mjs <dir>` | STL → editor → joint → save → test drive |
| `node scripts/step-test.mjs <file.step> <dir>` | STEP import through the OpenCascade worker |
| `node scripts/package-test.mjs <dir>` | `.frcbot` export → re-import → play, with joints intact |
| `node scripts/robot-gallery.mjs <dir>` | Preview screenshots of every robot |
| `node scripts/drive-test.mjs` | Drive physics: top speed, braking, BUMP crossings (no beaching), driving through FUEL, TRENCH |
| `node scripts/robot-closeup.mjs <team> <dir>` | Close-up turntable shots of one robot |
| `node scripts/ingame-closeup.mjs <team> <dir>` | In-game shots with the intake deployed |
| `node scripts/flow-test.mjs` | Countdown, AUTO-end disable, shooting while rotating, hopper spills, FUEL under the frame |
| `node scripts/intake-test.mjs` | Driving through FUEL with the intake on vs off: speed, missed entries, spills |
| `node scripts/fill-test.mjs` | Feeds every robot until its hopper is full: does it reach its capacity? |
| `node scripts/wall-test.mjs` | Full-speed hits on the guardrails and alliance walls (no sinking or climbing), FUEL bulldozed into a wall stays on the field |

Not affiliated with FIRST® or MoSim.
