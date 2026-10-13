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
    { title: 'Play a match', desc: 'Full 2:40 match: AUTO, four HUB shifts and END GAME', go: () => play('match') },
    { title: 'Practice', desc: 'No clock, both HUBs on', go: () => play('practice') },
    { title: 'Two players', desc: 'Split screen on one computer (keyboard or gamepads)', go: () => play('twoPlayer') },
    { title: 'Garage', desc: 'Your robots and .frcbot packages', go: () => setScreen('garage') },
    {
      title: 'Robot Editor',
      desc: 'Turn your team\'s CAD into a drivable robot',
      go: () => {
        setEditingRobot(null);
        setScreen('editor');
      },
    },
    { title: 'Settings', desc: 'Controls, camera, graphics, sound', go: () => setScreen('settings') },
  ];
  return (
    <div className="screen menu">
      <div className="menu-left">
        <div className="logo">FRC Sim</div>
        <div className="logo-sub">REBUILT (2026) driving simulator</div>
        <div className="menu-list">
          {items.map((it) => (
            <button key={it.title} className="mi" onClick={it.go}>
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
        <div className="menu-caption">Robots: 4414, 971, 2910, 1690, 254 and 1678</div>
      </div>
    </div>
  );
}
