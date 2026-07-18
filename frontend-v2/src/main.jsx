import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ThemeProvider } from './lib/theme.jsx';
import { HealthProvider } from './lib/health.jsx';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/precision.css';
import './styles/shell.css';

// HashRouter (not BrowserRouter) so the static bundle works when served from
// any path on the Pi without server-side route config (#/zahrada etc.).
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <HealthProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </HealthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
