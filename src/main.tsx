import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/themeMode';
import App from './App';
import './styles.css';
import './pages/pages.css';
import './theme/theme.css';
import './theme/pastel.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
