import { useEffect, useRef, useState } from 'react';
import { useStore, type Hud } from './store';
import { Game } from '../core/Game';
import { ScoreBar, DriverPanel, Minimap, ControlsHelp } from './Hud';
import { keyLabel } from '../core/input/bindings';
import { SCORING } from '../game/scoring';
import { toast } from './toast';
import { recordHighScore, type HighScore } from '../game/highscores';

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
    g.start({ mode, players, settings })
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
      {hud.fps > 0 && <div className="fps">{hud.fps} FPS</div>}
      <ScoreBar hud={hud} />
      {hud.banner && <div className="banner">{hud.banner}</div>}

      {hud.players.map((p, i) => (
        <DriverPanel key={i} p={p} style={n === 1 ? { left: 14 } : { left: `calc(${(i * 100) / n}% + 14px)` }} outpost={hud.outpost[p.alliance]} />
      ))}
      {n === 1 && settings.minimap && hud.players[0] && <Minimap game={game} alliance={hud.players[0].alliance} />}
      {n === 1 && hud.players[0] && (() => {
        const p = hud.players[0];
        const key = <kbd>{keyLabel(kb.actions.climb[0] ?? 'C')}</kbd>;
        if (p.canClimb && p.climbState === 'none') return <div className="climb-hint">{key} Climb to L1</div>;
        if (p.climbState === 'hanging')
          return <div className="climb-hint">{key} {p.climbLevel < p.maxClimb ? `Climb to L${p.climbLevel + 1}` : 'Lower to the carpet'}</div>;
        return null;
      })()}
      {n === 1 && <ControlsHelp kb={kb} />}

      {hud.paused && !hud.results && (
        <div className="overlay">
          <div className="dialog pause">
            <h2>Paused</h2>
            <div className="menu-list">
              <button className="mi" onClick={() => game?.setPaused(false)}>
                Resume
              </button>
              <button className="mi" onClick={onRestart}>
                {practice ? 'Reset field' : 'Restart match'}
              </button>
              <button
                className="mi"
                onClick={() => {
                  game?.resetRobot(0);
                  game?.setPaused(false);
                  toast('Robot reset to its starting position');
                }}
              >
                Reset robot
              </button>
              <button className="mi mi-danger" onClick={onQuit}>
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

function Results({ hud, onQuit, onRestart }: { hud: Hud; onQuit: () => void; onRestart: () => void }) {
  const r = hud.results!;
  const expert = useStore((st) => st.settings.expert);
  const [best, setBest] = useState<{ rank: number | null; table: HighScore[] } | null>(null);
  const saved = useRef(false);
  useEffect(() => {
    if (saved.current) return;
    saved.current = true;
    // Each driver's alliance score goes in this computer's high score table (one entry per player).
    void (async () => {
      let res: { rank: number | null; table: HighScore[] } | null = null;
      for (const p of hud.players) {
        const out = await recordHighScore({ score: hud.score[p.alliance].total, robot: p.robotName, team: p.team, expert, at: Date.now() });
        if (!res || (out.rank ?? 99) < (res.rank ?? 99)) res = out;
        else res.table = out.table;
      }
      setBest(res);
    })();
  }, [hud, expert]);
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
        <table className="res-robots">
          <thead>
            <tr>
              <th>Robot</th>
              <th>Intaked</th>
              <th>Shots</th>
              <th>Made</th>
              <th>Acc</th>
              <th>Climb</th>
            </tr>
          </thead>
          <tbody>
            {hud.players.map((p, i) => (
              <tr key={i} className={p.alliance}>
                <td>
                  <b>{p.team || 'CSTM'}</b> {p.robotName}
                </td>
                <td>{p.intaked}</td>
                <td>{p.shots}</td>
                <td>{p.scored}</td>
                <td>{p.shots ? `${Math.round((p.scored / p.shots) * 100)}%` : '—'}</td>
                <td>{p.climbLevel ? `L${p.climbLevel}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {best && (
          <div className="highscores">
            <div className="hs-title">
              High scores on this computer{best.rank === 1 ? ' (new best!)' : best.rank ? ` (this match is #${best.rank})` : ''}
            </div>
            <ol>
              {best.table.slice(0, 5).map((h, i) => (
                <li key={`${h.at}-${i}`}>
                  <b>{h.score}</b> {h.team ? `${h.team} ` : ''}
                  {h.robot}
                  {h.expert ? ' · expert' : ''} <span className="note">{new Date(h.at).toLocaleDateString()}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
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
