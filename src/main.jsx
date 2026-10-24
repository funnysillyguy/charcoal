import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/chat.css';
import './styles/modals.css';
import './styles/layout.css';
import './styles/motion.css';
import './styles/discover.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
