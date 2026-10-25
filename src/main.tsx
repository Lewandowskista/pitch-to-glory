import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/fonts.css';
import '@fontsource/bebas-neue/latin-400.css';
import './styles/app.css';
import App from './App';
import { startAnalytics } from './analytics';
import { installDiagnostics } from './diagnostics';
// Before the first render, so a failure while starting is in the local diagnostics log too.
installDiagnostics();
const root = document.getElementById('root');
if (!root) throw new Error('Missing app root');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
// Analytics loads itself once the browser is idle; without a project key it does nothing.
startAnalytics();
