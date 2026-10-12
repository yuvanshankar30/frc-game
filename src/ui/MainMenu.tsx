import { useEffect, useRef } from 'react';
import { useStore, type GameMode } from './store';
import { MenuShowcase } from '../render/preview';

export function MainMenu() {
  const { setScreen, setMode, setEditingRobot } = useStore();
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const s = new MenuShowcase(canvas.current);
    return () => s.dispose();
  }, []);
  const play = (m: GameMode) => {
    setMode(m);
    setScreen('select');
  };
  return (
    <div className="screen menu">
      <div className="menu-left">
        <div className="logo">
          FRC<span>SIM</span>
        </div>
        <div className="tagline">REBUILT 2026 · driving simulator with custom CAD robots</div>
        <button className="btn primary menu-btn" onClick={() => play('match')}>
          Play Match
          <small>2:40 match: AUTO, shifts, END GAME, scoring, ranking points</small>
        </button>
        <button className="btn menu-btn" onClick={() => play('practice')}>
          Free Practice
          <small>No timer, both HUBs always active</small>
        </button>
        <button className="btn menu-btn" onClick={() => play('twoPlayer')}>
          Local 2-Player
          <small>Split screen: keyboard + gamepad, or two gamepads</small>
        </button>
        <button className="btn menu-btn" onClick={() => setScreen('garage')}>
          Garage
          <small>Browse robots, import .frcbot packages, export templates</small>
        </button>
        <button
          className="btn menu-btn"
          onClick={() => {
            setEditingRobot(null);
            setScreen('editor');
          }}
        >
          Robot Editor
          <small>Import STEP / GLB / STL / OBJ and map CAD parts to mechanisms</small>
        </button>
        <button className="btn menu-btn" onClick={() => setScreen('settings')}>
          Settings
          <small>Controls, camera, assists, graphics</small>
        </button>
        <div className="menu-foot">
          Field geometry from the 2026 FRC Game Manual and the WPILib AprilTag layout. Robots are modeled from team binders, reveal
          threads and CAD releases.
          <br />
          Not affiliated with FIRST® or MoSim.
        </div>
      </div>
      <div className="menu-right">
        <canvas ref={canvas} />
      </div>
    </div>
  );
}
