import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { useFactory } from './store/useFactory';

// Handy for poking at the factory from the console during development.
if (import.meta.env.DEV) Object.assign(window, { factory: useFactory });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
