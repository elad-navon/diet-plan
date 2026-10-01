import '@fontsource-variable/heebo';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, getTheme } from './app/theme';
import './index.css';

// Apply the saved light/dark choice before the first paint.
applyTheme(getTheme());

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
