import { useEffect, useRef } from 'react';
import { useStore, type GameMode } from './store';
import { MenuShowcase } from '../render/preview';

interface Item {
  title: string;
  desc: string;
  go: () => void;
}

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
  const items: Item[] = [
    { title: 'Match', desc: '2:40 with AUTO, four HUB shifts, END GAME and ranking points', go: () => play('match') },
    { title: 'Practice', desc: 'No clock and both HUBs live. Learn a robot.', go: () => play('practice') },
    { title: 'Multiplayer', desc: 'Local split screen: keyboard + keyboard, or gamepads', go: () => play('twoPlayer') },
    { title: 'Garage', desc: 'Robots, .frcbot packages, export a robot as a template', go: () => setScreen('garage') },
    {
      title: 'Robot Editor',
      desc: 'Import STEP / GLB / STL / OBJ and rig it into a working robot',
      go: () => {
        setEditingRobot(null);
        setScreen('editor');
      },
    },
    { title: 'Settings', desc: 'Controls, rotation feel, camera, graphics', go: () => setScreen('settings') },
  ];
  return (
    <div className="screen menu">
      <div className="menu-left">
        <div className="logo">
          FRC <span>Sim</span>
        </div>
        <div className="logo-sub">
          <span className="tag">REBUILT 2026</span>
          <span className="muted">Driving simulator</span>
        </div>
        <div className="menu-list">
          {items.map((it, i) => (
            <button key={it.title} className="mi" onClick={it.go}>
              <span className="mi-n">0{i + 1}</span>
              <span className="mi-t">{it.title}</span>
              <span className="mi-d">{it.desc}</span>
            </button>
          ))}
        </div>
        <div className="menu-foot">
          Field from the 2026 Game Manual and the WPILib AprilTag layout. Robots are modeled from team binders, released code and CAD.
          <br />
          Not affiliated with FIRST® or MoSim.
        </div>
      </div>
      <div className="menu-right">
        <canvas ref={canvas} />
        <div className="menu-caption">
          <div className="small">Featured robots</div>
          <div className="big">4414 · 971 · 2910 · 1690 · 254 · 1678</div>
        </div>
      </div>
    </div>
  );
}
