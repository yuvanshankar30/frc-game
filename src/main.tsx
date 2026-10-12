import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { loadPersisted } from './ui/store';
import './ui/styles.css';

void loadPersisted().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
