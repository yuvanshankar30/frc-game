import { useEffect, useRef, useState } from 'react';
import { useStore, type Hud, type PlayerHud } from './store';
import { Game } from '../core/Game';
import { BUILTINS } from '../robots/registry';
import { CAMERA_LABELS } from '../render/cameras';
import { keyLabel } from '../core/input/bindings';
import { SCORING, fuelPoints, towerPoints } from '../game/scoring';
import { toast } from './toast';

function fmtClock(t: number) {
  const s = Math.ceil(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const PHASE_LABEL: Record<string, string> = {
  pre: 'READY',
  auto: 'AUTO',
  pause: 'AUTO ▸ TELEOP',
  transition: 'TRANSITION',
  shift: 'SHIFT',
  endgame: 'END GAME',
  post: 'FINAL',
};

export function GameView() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const { mode, players, settings, setScreen } = useStore();
  const hud = useStore((s) => s.hud);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const g = new Game(canvas.current, settings);
    game.current = g;
    const bots = [...BUILTINS.map((b) => b.def.id)].sort(() => Math.random() - 0.5);
    g.start({ mode, players, settings, botRobots: bots })
      .then(() => setLoading(false))
      .catch((e) => {
        console.error(e);
        setError(String(e?.message ?? e));
      });
    return () => g.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quit = () => setScreen('menu');
  const restart = () => {
    game.current?.resetMatch();
    game.current?.setPaused(false);
  };

  return (
    <div className="game">
      <canvas ref={canvas} />
      {loading && !error && (
        <div className="loading">
          <div className="spinner" />
          Building the field and robots…
        </div>
      )}
      {error && (
        <div className="overlay">
          <div className="dialog">
            <h2>Could not start</h2>
            <div className="errbox">{error}</div>
            <div className="actions">
              <button className="btn" onClick={quit}>
                Back to menu
              </button>
            </div>
          </div>
        </div>
      )}
      {hud && !loading && <HudView hud={hud} game={game.current} onQuit={quit} onRestart={restart} />}
    </div>
  );
}

function HudView({ hud, game, onQuit, onRestart }: { hud: Hud; game: Game | null; onQuit: () => void; onRestart: () => void }) {
  const settings = useStore((s) => s.settings);
  const kb = settings.keyboard;
  const practice = hud.mode === 'practice';
  const n = hud.players.length;
  return (
    <div className="hud">
      {hud.fps > 0 && <div className="fps">{hud.fps} fps</div>}
      <div className="scorebar">
        <div className="score-side blue">
          <div className="pts">{hud.score.blue.total}</div>
          <div className="sub">
            FUEL {fuelPoints(hud.score.blue)} · TOWER {towerPoints(hud.score.blue)}
          </div>
          <div className={`hub-pill ${hud.hubActive.blue ? 'on' : ''}`}>{hud.hubActive.blue ? 'HUB ACTIVE' : 'HUB INACTIVE'}</div>
        </div>
        <div className="clock">
          <div className="p">{practice ? 'PRACTICE' : `${PHASE_LABEL[hud.phase]}${hud.phase === 'shift' ? ` ${hud.shift}` : ''}`}</div>
          <div className="t">{practice ? '∞' : fmtClock(hud.clock)}</div>
          {!practice && hud.phase !== 'post' && hud.phase !== 'pre' && <div className="p">next {fmtClock(hud.phaseRemaining)}</div>}
        </div>
        <div className="score-side red">
          <div className="pts">{hud.score.red.total}</div>
          <div className="sub">
            FUEL {fuelPoints(hud.score.red)} · TOWER {towerPoints(hud.score.red)}
          </div>
          <div className={`hub-pill ${hud.hubActive.red ? 'on' : ''}`}>{hud.hubActive.red ? 'HUB ACTIVE' : 'HUB INACTIVE'}</div>
        </div>
      </div>
      {hud.banner && <div className="banner">{hud.banner}</div>}

      {hud.players.map((p, i) => (
        <PlayerPanel key={i} p={p} style={n === 1 ? { left: 16 } : { left: `calc(${(i * 100) / n}% + 16px)` }} outpost={hud.outpost[p.alliance]} />
      ))}
      {n === 1 && hud.players[0]?.canClimb && hud.players[0].climbState === 'none' && (
        <div className="climb-hint">
          Press <kbd>{keyLabel(kb.actions.climb[0] ?? 'C')}</kbd> / <kbd>Y</kbd> to climb
        </div>
      )}
      {n === 1 && (
        <div className="help">
          <kbd>{keyLabel(kb.axes.forward[0])}</kbd>
          <kbd>{keyLabel(kb.axes.left[0])}</kbd>
          <kbd>{keyLabel(kb.axes.back[0])}</kbd>
          <kbd>{keyLabel(kb.axes.right[0])}</kbd> drive · <kbd>{keyLabel(kb.axes.rotLeft[0])}</kbd>
          <kbd>{keyLabel(kb.axes.rotRight[0])}</kbd> rotate
          <br />
          <kbd>{keyLabel(kb.actions.intake[0])}</kbd> intake · <kbd>{keyLabel(kb.actions.shoot[0])}</kbd> shoot · <kbd>{keyLabel(kb.actions.eject[0])}</kbd> eject
          <br />
          <kbd>{keyLabel(kb.actions.climb[0])}</kbd> climb · <kbd>{keyLabel(kb.actions.feed[0])}</kbd> HP feed · <kbd>{keyLabel(kb.actions.camera[0])}</kbd> camera
          <br />
          <kbd>{keyLabel(kb.actions.assist[0])}</kbd> aim assist · <kbd>{keyLabel(kb.actions.reset[0])}</kbd> reset · <kbd>Esc</kbd> pause
        </div>
      )}

      {hud.paused && !hud.results && (
        <div className="overlay">
          <div className="dialog">
            <h2>Paused</h2>
            <div className="actions" style={{ justifyContent: 'flex-start' }}>
              <button className="btn primary" onClick={() => game?.setPaused(false)}>
                Resume
              </button>
              <button className="btn" onClick={onRestart}>
                {practice ? 'Reset field' : 'Restart match'}
              </button>
              <button
                className="btn"
                onClick={() => {
                  game?.resetRobot(0);
                  game?.setPaused(false);
                  toast('Robot reset to its starting position');
                }}
              >
                Reset robot
              </button>
              <button className="btn danger" onClick={onQuit}>
                Quit to menu
              </button>
            </div>
          </div>
        </div>
      )}
      {hud.results && <Results hud={hud} onQuit={onQuit} onRestart={onRestart} />}
    </div>
  );
}

function PlayerPanel({ p, style, outpost }: { p: PlayerHud; style: React.CSSProperties; outpost: number }) {
  const pct = p.capacity ? (p.stored / p.capacity) * 100 : 0;
  const acc = p.shots ? Math.round((p.scored / p.shots) * 100) : 0;
  return (
    <div className="player-hud" style={style}>
      <div className="title">
        <span className="num" style={{ background: p.alliance === 'blue' ? 'var(--blue)' : 'var(--red)' }}>
          {p.team || 'CUSTOM'}
        </span>
        <span>{p.robotName}</span>
        <span className="spacer" />
        <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{CAMERA_LABELS[p.camera]}</span>
      </div>
      <div className="fuel-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="kv">
        <span>
          FUEL <b>{p.stored}</b>/{p.capacity}
        </span>
        <span>
          Scored <b>{p.scored}</b>/{p.shots} {p.shots > 0 && <>({acc}%)</>}
        </span>
        <span>
          Dist <b>{p.distance.toFixed(1)}m</b> <span className={p.aimOk ? 'tag-ok' : 'tag-warn'}>{p.aimOk ? 'in range' : 'out of range'}</span>
        </span>
        <span>
          Assist <b className={p.assist ? 'tag-ok' : 'tag-warn'}>{p.assist ? 'ON' : 'OFF'}</b>
        </span>
        <span>
          HP <b>{outpost}</b>
        </span>
        {p.climbState !== 'none' && (
          <span>
            Climb <b>{p.climbLevel ? `LEVEL ${p.climbLevel}` : p.climbState}</b>
          </span>
        )}
      </div>
    </div>
  );
}

function Results({ hud, onQuit, onRestart }: { hud: Hud; onQuit: () => void; onRestart: () => void }) {
  const r = hud.results!;
  const col = (a: 'blue' | 'red') => {
    const s = hud.score[a];
    const rp = r.rp[a];
    return (
      <div className={`res-col ${a}`}>
        <div style={{ fontWeight: 800, letterSpacing: '0.05em' }}>{a.toUpperCase()}</div>
        <div className="big">{s.total}</div>
        <div className="res-line">
          <span>AUTO FUEL</span>
          <b>{s.autoFuel}</b>
        </div>
        <div className="res-line">
          <span>TELEOP FUEL</span>
          <b>{s.teleopFuel}</b>
        </div>
        <div className="res-line">
          <span>Inactive-HUB FUEL (0 pts)</span>
          <b>{s.wastedFuel}</b>
        </div>
        <div className="res-line">
          <span>AUTO TOWER</span>
          <b>{s.autoTower}</b>
        </div>
        <div className="res-line">
          <span>TELEOP TOWER</span>
          <b>{s.teleopTower}</b>
        </div>
        <div className="res-line">
          <span>Ranking points</span>
          <b>{rp.total}</b>
        </div>
        <div className="rp">
          <span className={rp.win ? 'got' : ''}>{rp.win === 3 ? 'WIN +3' : rp.win === 1 ? 'TIE +1' : 'LOSS'}</span>
          <span className={rp.energized ? 'got' : ''}>ENERGIZED ≥{SCORING.rp.energized}</span>
          <span className={rp.supercharged ? 'got' : ''}>SUPERCHARGED ≥{SCORING.rp.supercharged}</span>
          <span className={rp.traversal ? 'got' : ''}>TRAVERSAL ≥{SCORING.rp.traversal}</span>
        </div>
      </div>
    );
  };
  return (
    <div className="overlay">
      <div className="dialog" style={{ minWidth: 620 }}>
        <h2>{r.winner === 'tie' ? 'Tie match' : `${r.winner === 'blue' ? 'Blue' : 'Red'} alliance wins`}</h2>
        <div className="results">
          {col('blue')}
          {col('red')}
        </div>
        <div className="actions">
          <button className="btn" onClick={onQuit}>
            Menu
          </button>
          <button className="btn primary" onClick={onRestart}>
            Play again
          </button>
        </div>
      </div>
    </div>
  );
}
