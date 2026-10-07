import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/fonts.css';
import '@fontsource/bebas-neue/latin-400.css';
import './styles/app.css';
import App from './App';
const root = document.getElementById('root');
if (!root) throw new Error('Missing app root');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
