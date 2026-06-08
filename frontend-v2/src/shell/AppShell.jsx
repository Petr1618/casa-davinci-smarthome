import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AREAS, areaById } from './areas.js';
import { useTheme } from '../lib/theme.jsx';
import { socket } from '../lib/socket.js';

// ---- Connection status dot (driven by the shared socket) ----
function useConnected() {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const up = () => setConnected(true);
    const down = () => setConnected(false);
    socket.on('connect', up);
    socket.on('disconnect', down);
    return () => { socket.off('connect', up); socket.off('disconnect', down); };
  }, []);
  return connected;
}

// ---- Theme switcher (dark / light / spacex) ----
const THEME_ICON = { dark: '🌙', light: '☀️', spacex: '🚀' };
function ThemeSwitcher() {
  const { theme, setTheme, themes } = useTheme();
  return (
    <div className="theme-switch">
      {themes.map((t) => (
        <button
          key={t}
          className={'theme-btn' + (theme === t ? ' active' : '')}
          onClick={() => setTheme(t)}
          title={t}
          aria-label={'Téma ' + t}
        >
          {THEME_ICON[t]}
        </button>
      ))}
    </div>
  );
}

// ---- A single nav item, shared by the sidebar and the bottom bar ----
function AreaLink({ area, variant }) {
  return (
    <NavLink
      to={`/${area.id}`}
      className={({ isActive }) => `nav-item nav-item--${variant}` + (isActive ? ' is-active' : '')}
      style={{ '--area-accent': area.accent }}
    >
      <span className="nav-icon" aria-hidden>{area.icon}</span>
      <span className="nav-label">{area.label}</span>
    </NavLink>
  );
}

export default function AppShell({ children }) {
  const connected = useConnected();
  const location = useLocation();
  const activeId = location.pathname.replace('/', '') || 'domov';
  const active = areaById(activeId);

  return (
    <div className="shell">
      {/* Top header — logo, active area, theme switcher, connection */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▲</span>
          <span className="brand-name">Casa DaVinci</span>
          {active && <span className="brand-area" style={{ color: active.accent }}>· {active.label}</span>}
        </div>
        <div className="topbar-right">
          <ThemeSwitcher />
          <div className={'conn' + (connected ? ' conn--up' : '')}>
            <span className="conn-dot" />
            {connected ? 'Online' : 'Offline'}
          </div>
        </div>
      </header>

      {/* Desktop sidebar rail */}
      <nav className="sidenav" aria-label="Hlavní navigace">
        {AREAS.map((a) => <AreaLink key={a.id} area={a} variant="rail" />)}
      </nav>

      {/* Main content */}
      <main className="content">{children}</main>

      {/* Mobile bottom bar */}
      <nav className="bottomnav" aria-label="Hlavní navigace">
        {AREAS.map((a) => <AreaLink key={a.id} area={a} variant="bar" />)}
      </nav>
    </div>
  );
}
