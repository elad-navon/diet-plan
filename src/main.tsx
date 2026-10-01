import '@fontsource-variable/heebo';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ServerApp } from './ServerApp';
import { listenForInstallPrompt, registerServiceWorker } from './app/pwa';
import { applyTheme, getTheme } from './app/theme';
import { readServerConfig } from './data';
import './index.css';

// Apply the saved light/dark choice before the first paint.
applyTheme(getTheme());

// Offline shell, update banner and the install offer (production builds only).
registerServiceWorker();
listenForInstallPrompt();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

// With a server configured (see .env.example) data lives in a signed-in account; without one the app
// keeps everything on this device.
const serverConfig = readServerConfig(import.meta.env);

createRoot(container).render(
  <StrictMode>{serverConfig ? <ServerApp config={serverConfig} /> : <App />}</StrictMode>,
);
