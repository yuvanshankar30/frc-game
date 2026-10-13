# Field sounds

The FRC field cues, from Team 254's Cheesy Arena field software
([static/audio](https://github.com/Team254/cheesy-arena/tree/main/static/audio)), mapped the way its 2026 timing
(`game/match_sounds.go`) plays them. Replace any file to change a cue (`.mp3`, `.ogg` or `.wav`); a missing file falls
back to a short synthesized tone.

| File            | Cheesy Arena file   | Played when                                |
|-----------------|---------------------|--------------------------------------------|
| `match-start`   | `start.wav`         | AUTO starts (0:00)                         |
| `match-end`     | `end.wav`           | AUTO ends, and the match ends              |
| `teleop-start`  | `resume.wav`        | TELEOP starts                              |
| `shift`         | `shift_change.wav`  | Each HUB shift change                      |
| `endgame`       | `warning.wav`       | END GAME starts (30 s left)                |

The field sounds are FIRST's; they're included for this private, non-commercial project the same way Cheesy Arena
redistributes them.
