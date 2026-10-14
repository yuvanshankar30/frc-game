import { useEffect, useRef, useState } from 'react';
import type { Hud, PlayerHud } from './store';
import type { Game } from '../core/Game';
import { PERIODS, type Alliance } from '../game/scoring';
import { CAMERA_LABELS } from '../render/cameras';
import { FIELD, HUB } from '../field/rebuilt/dims';
import { keyLabel, type KeyboardBindings } from '../core/input/bindings';
import { FEATURES } from '../game/features';

export function fmtClock(t: number) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const PHASE_NAME: Record<string, string> = {
  pre: 'READY',
  auto: 'AUTO',
  pause: 'AUTO END',
  transition: 'TRANSITION',
  shift: 'SHIFT',
  endgame: 'END GAME',
  post: 'FINAL',
};

/** Broadcast-style score bar: alliance blocks with team numbers, score, HUB state; clock in the middle. */
export function ScoreBar({ hud }: { hud: Hud }) {
  const practice = hud.mode === 'practice';
  const side = (a: Alliance) => {
    const s = hud.score[a];
    const teams = hud.players.filter((p) => p.alliance === a).map((p) => p.team || 'CSTM');
    const active = hud.hubActive[a];
    return (
      <div className={`sb-side sb-${a}`}>
        <div className="sb-teams">
          {teams.length ? teams.map((t, i) => <span key={i}>{t}</span>) : <span className="sb-empty">—</span>}
        </div>
        <div className="sb-score">{s.total}</div>
        <div className={`sb-hub ${active ? 'on' : ''}`} title={active ? 'HUB active' : 'HUB inactive'}>
          <HubGlyph on={active} />
          <span>{active ? 'ACTIVE' : 'OFF'}</span>
        </div>
      </div>
    );
  };
  return (
    <div className="sb-wrap">
      <div className="sb">
        {side('blue')}
        <div className="sb-mid">
          <div className="sb-phase">{practice ? 'PRACTICE' : `${PHASE_NAME[hud.phase]}${hud.phase === 'shift' ? ` ${hud.shift}` : ''}`}</div>
          <div className="sb-clock">{practice ? '--:--' : fmtClock(hud.clock)}</div>
        </div>
        {side('red')}
      </div>
      {!practice && <ShiftTimeline hud={hud} />}
    </div>
  );
}

function HubGlyph({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden>
      <polygon points="10,1 18,5.5 18,14.5 10,19 2,14.5 2,5.5" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Thin strip under the score bar: AUTO, TRANSITION, four shifts, END GAME with the active HUB per segment. */
function ShiftTimeline({ hud }: { hud: Hud }) {
  const gap = hud.autoTeleopGap; // AUTO→TELEOP delay
  const segs: { label: string; len: number; active: 'both' | Alliance | 'none' }[] = [
    { label: 'AUTO', len: PERIODS.auto, active: 'both' },
    { label: '', len: gap, active: 'none' },
    { label: 'T', len: PERIODS.transition, active: 'both' },
  ];
  const first = hud.firstInactive;
  for (let k = 1; k <= 4; k++) {
    const inactive: Alliance | null = first ? (k % 2 === 1 ? first : first === 'blue' ? 'red' : 'blue') : null;
    segs.push({ label: `S${k}`, len: PERIODS.shift, active: inactive ? (inactive === 'blue' ? 'red' : 'blue') : 'none' });
  }
  segs.push({ label: 'END', len: PERIODS.endgame, active: 'both' });
  const total = segs.reduce((a, s) => a + s.len, 0);
  const t = Math.min(total, hud.matchTime);
  return (
    <div className="tl">
      {segs.map((s, i) => (
        <div key={i} className={`tl-seg tl-${s.active}`} style={{ flex: s.len }}>
          {s.label}
        </div>
      ))}
      <div className="tl-now" style={{ left: `${(t / total) * 100}%` }} />
    </div>
  );
}

/** Driver dashboard: robot plate, hopper gauge, mechanism lights, shooting numbers, HUB countdown. */
export function DriverPanel({ p, style, outpost }: { p: PlayerHud; style: React.CSSProperties; outpost: number }) {
  const pct = p.capacity ? p.stored / p.capacity : 0;
  const acc = p.shots ? Math.round((p.scored / p.shots) * 100) : null;
  const blocks = 12;
  const lit = Math.round(pct * blocks);
  const flip = Number.isFinite(p.hubFlip) ? p.hubFlip : null;
  return (
    <div className={`dp dp-${p.alliance}`} style={style}>
      <div className="dp-head">
        <span className="dp-num">{p.team || 'CSTM'}</span>
        <span className="dp-name">{p.robotName}</span>
        <span className="dp-cam">{CAMERA_LABELS[p.camera]}</span>
      </div>
      <div className="dp-body">
        <div className="dp-fuel">
          <div className="dp-label">HOPPER</div>
          <div className="dp-big">
            {p.stored}
            <small>/{p.capacity}</small>
          </div>
          <div className="dp-blocks">
            {Array.from({ length: blocks }, (_, i) => (
              <i key={i} className={i < lit ? 'on' : ''} />
            ))}
          </div>
        </div>
        <div className="dp-grid">
          <Stat k="SHOTS" v={p.shots} />
          <Stat k="MADE" v={p.scored} />
          <Stat k="ACC" v={acc === null ? '—' : `${acc}%`} />
          <Stat k="BPS" v={p.bps} />
          <Stat k="DIST" v={`${p.distance.toFixed(1)}m`} warn={!p.aimOk} />
          <Stat k="SPEED" v={`${(p.speed * 3.281).toFixed(1)}`} unit="ft/s" />
        </div>
      </div>
      <div className="dp-lights">
        <span className={`lt ${p.inZone ? 'lt-good' : 'lt-bad'}`} title={p.inZone ? 'In your ALLIANCE ZONE' : 'Outside your zone: the HUB net blocks shots'}>
          ZONE
        </span>
        <Light on={p.intaking > 0.5} label="INTAKE" />
        <Light on={p.spin > 0.85} label="FLYWHEEL" />
        <Light on={p.ready} label={p.shuttling ? 'PASS' : 'LOCKED'} good />
        <Light on={p.assist} label="ASSIST" />
        {FEATURES.climbing && <Light on={p.climbState !== 'none'} label={p.climbLevel ? `L${p.climbLevel}` : 'CLIMB'} good={p.climbLevel > 0} />}
        <span className="dp-hp">HP {outpost}</span>
      </div>
      {flip !== null && <div className="dp-flip">HUB flips in {fmtClock(flip)}</div>}
    </div>
  );
}

function Stat({ k, v, unit, warn }: { k: string; v: string | number; unit?: string; warn?: boolean }) {
  return (
    <div className={`dp-stat ${warn ? 'warn' : ''}`}>
      <span>{k}</span>
      <b>
        {v}
        {unit && <small> {unit}</small>}
      </b>
    </div>
  );
}

function Light({ on, label, good }: { on: boolean; label: string; good?: boolean }) {
  return <span className={`lt ${on ? (good ? 'lt-good' : 'lt-on') : ''}`}>{label}</span>;
}

/** Top-down minimap drawn straight from the live game (robots, FUEL, HUB state). */
export function Minimap({ game, alliance }: { game: Game | null; alliance: Alliance }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (frame++ % 3 !== 0) return;
      const c = ref.current;
      if (!c || !game?.field) return;
      const g = c.getContext('2d')!;
      const W = c.width;
      const H = c.height;
      const flip = alliance === 'red' ? -1 : 1; // driver's own wall at the bottom of the map
      // Map field (x along length, z across) to canvas: length vertical, own alliance at the bottom.
      const px = (z: number) => W / 2 + flip * (z / FIELD.width) * (W - 8);
      const py = (x: number) => H / 2 - flip * (x / FIELD.length) * (H - 8);
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(12,14,18,0.82)';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 1;
      g.strokeRect(4, 4, W - 8, H - 8);
      g.beginPath();
      g.moveTo(4, H / 2);
      g.lineTo(W - 4, H / 2);
      g.stroke();
      for (const a of ['blue', 'red'] as const) {
        const hub = game.field.hubs[a].center;
        const lit = game.field.isHubLit(a);
        const s = (HUB.footprint / FIELD.width) * (W - 8);
        g.fillStyle = lit ? (a === 'blue' ? '#3a7bff' : '#ff3b3b') : '#3a3d44';
        g.fillRect(px(hub.z) - s / 2, py(hub.x) - s / 2, s, s);
        const zl = (a === 'blue' ? -1 : 1) * (FIELD.length / 2 - FIELD.allianceZoneDepth);
        g.strokeStyle = a === 'blue' ? 'rgba(58,123,255,0.7)' : 'rgba(255,59,59,0.7)';
        g.beginPath();
        g.moveTo(4, py(zl));
        g.lineTo(W - 4, py(zl));
        g.stroke();
      }
      const f = game.field.fuel;
      g.fillStyle = '#f2c418';
      for (let i = 0; i < f.capacity; i++) {
        if (f.state[i] !== 'field') continue;
        const p = f.position(i);
        g.fillRect(px(p.z) - 1, py(p.x) - 1, 2, 2);
      }
      for (const pl of game.players) {
        const r = pl.robot;
        const p = r.position;
        const yaw = r.yaw;
        const cx = px(p.z);
        const cy = py(p.x);
        // Heading in canvas space: robot forward (cos yaw, -sin yaw) in (x, z).
        const hx = -Math.sin(yaw) * flip;
        const hy = -Math.cos(yaw) * flip;
        const sz = 6;
        g.fillStyle = r.alliance === 'blue' ? '#5b93ff' : '#ff5b5b';
        g.strokeStyle = '#fff';
        g.beginPath();
        g.moveTo(cx + hx * sz * 1.4, cy + hy * sz * 1.4);
        g.lineTo(cx - hy * sz - hx * sz, cy + hx * sz - hy * sz);
        g.lineTo(cx + hy * sz - hx * sz, cy - hx * sz - hy * sz);
        g.closePath();
        g.fill();
        g.stroke();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [game, alliance]);
  return <canvas ref={ref} className="minimap" width={150} height={280} />;
}

/** Collapsible control reference. */
export function ControlsHelp({ kb }: { kb: KeyboardBindings }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyH' && !(e.target instanceof HTMLInputElement)) setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const k = (codes: string[]) => (codes[0] ? keyLabel(codes[0]) : '—');
  if (!open)
    return (
      <div className="help-min">
        <kbd>H</kbd> controls
      </div>
    );
  const rows: [string, string][] = [
    ['Drive', `${k(kb.axes.forward)} ${k(kb.axes.left)} ${k(kb.axes.back)} ${k(kb.axes.right)}`],
    ['Rotate', `${k(kb.axes.rotLeft)} / ${k(kb.axes.rotRight)}`],
    ['Intake', k(kb.actions.intake)],
    ['Shoot', k(kb.actions.shoot)],
    ['Eject', k(kb.actions.eject)],
    ...(FEATURES.climbing ? [['Climb', k(kb.actions.climb)] as [string, string]] : []),
    ['Human player', k(kb.actions.feed)],
    ['Camera', k(kb.actions.camera)],
    ['Aim assist', k(kb.actions.assist)],
    ['Reset robot', k(kb.actions.reset)],
    ['Pause', 'Esc'],
  ];
  return (
    <div className="help-panel">
      {rows.map(([a, b]) => (
        <div key={a}>
          <span>{a}</span>
          <kbd>{b}</kbd>
        </div>
      ))}
      <div className="help-foot">
        <kbd>H</kbd> hide
      </div>
    </div>
  );
}
