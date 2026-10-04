import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { RelaySessionGate } from './components/RelaySessionGate';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <RelaySessionGate />
  </StrictMode>
);

console.log('🏙️ Sim Agents frontend initialized');
