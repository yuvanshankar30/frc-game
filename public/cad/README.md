# Real CAD for built-in robots

Put a rigged robot package here named after the built-in id, and the game uses it instead of the
procedural model (stats come from the package):

    public/cad/builtin-971.frcbot
    public/cad/builtin-2910.frcbot
    public/cad/builtin-1690.frcbot

How to make one:

1. Export the team's released CAD as STEP (Onshape: right-click the top-level assembly → Export → STEP).
   - 971 Mixtape:  frc971.onshape.com/documents/cabaa0c1c77517916df80783
   - 2910 Re•Blitz: 2910.onshape.com/documents/28894ad47d9c63a665e2a36b
   - 1690 KEPLER:  orbit1690.onshape.com/documents/d09a47dbfc1b125f63a78ac7
2. Convert and simplify it: `node scripts/cad-to-glb.mjs robot.step robot.glb --ratio 0.4`
3. In the game: Garage → pick the built-in → Open as template → Import CAD (the GLB). Stats and mechanisms
   are kept; add joints (intake, turret, hood, climber…) and assign the CAD parts to them.
4. Save → Export .frcbot, rename it to `builtin-<team>.frcbot`, and drop it in this folder.
