import { useStore } from './store';
import { MainMenu } from './MainMenu';
import { RobotSelect } from './RobotSelect';
import { GameView } from './GameView';
import { SettingsScreen } from './Settings';
import { Garage } from './Garage';
import { RobotEditor } from '../editor/RobotEditor';
import { Toaster } from './toast';

export function App() {
  const screen = useStore((s) => s.screen);
  return (
    <>
      {screen === 'menu' && <MainMenu />}
      {screen === 'select' && <RobotSelect />}
      {screen === 'game' && <GameView />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'garage' && <Garage />}
      {screen === 'editor' && <RobotEditor />}
      <Toaster />
    </>
  );
}
