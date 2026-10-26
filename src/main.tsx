import './app/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

// StrictMode runs every effect twice in dev, so every effect (canvas, loop,
// listeners) must clean up after itself on unmount.
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
