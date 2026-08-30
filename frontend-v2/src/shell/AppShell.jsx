import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AREAS, areaById } from './areas.js';
import AreaIcon from './AreaIcon.jsx';
import { useTheme } from '../lib/theme.jsx';
import { useHealth } from '../lib/health.jsx';
import OutageBanner from '../components/OutageBanner.jsx';
import GaragePulseButton from '../components/GaragePulseButton.jsx';

// ---- Live clock (mono, tabular) ----
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---- Theme switcher (dark / light / spacex) ----
const THEME_LABEL = { dark: 'Dark', light: 'Light', spacex: 'Mono' };
function ThemeSwitcher() {
  const { theme, setTheme, themes } = useTheme();
  return (
    <div className="theme-switch" role="group" aria-label="Téma">
      {themes.map((t) => (
        <button
          key={t}
          className={'theme-btn' + (theme === t ? ' active' : '')}
          onClick={() => setTheme(t)}
          title={t}
        >
          {THEME_LABEL[t] || t}
        </button>
      ))}
    </div>
  );
}

// ---- A single nav item in the rail (mockup: rail turns horizontal on mobile).
function AreaLink({ area }) {
  return (
    <NavLink
      to={`/${area.id}`}
      className={({ isActive }) => 'nav-item' + (isActive ? ' is-active' : '')}
      style={{ '--area-accent': area.accent, '--area-soft': area.accentSoft }}
    >
      <span className="nav-icon" aria-hidden><AreaIcon id={area.id} /></span>
      <span className="nav-label">{area.label}</span>
      {area.comingSoon && <span className="nav-note">brzy</span>}
    </NavLink>
  );
}

export default function AppShell({ children }) {
  const { connected, stale, cause } = useHealth();
  const clock = useClock();
  const location = useLocation();
  const activeId = location.pathname.replace('/', '') || 'domov';
  const active = areaById(activeId);

  // Collapsible rail — persisted so a wall tablet stays the way it was left.
  const [railOpen, setRailOpen] = useState(() => {
    try { return localStorage.getItem('casa-rail-open') !== '0'; } catch { return true; }
  });
  const toggleRail = () => {
    setRailOpen((open) => {
      try { localStorage.setItem('casa-rail-open', open ? '0' : '1'); } catch { /* private mode */ }
      return !open;
    });
  };

  const chipText = !connected ? 'Spojení ztraceno' : stale ? 'Data zastaralá' : 'Spojení online';

  return (
    <div className={'shell' + (stale ? ' is-stale' : '') + (railOpen ? '' : ' rail-closed')}>
      {/* Desktop rail — brand + areas + foot */}
      <nav className="rail" aria-label="Hlavní navigace">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M12 3 L21 20 H3 Z" /><path d="M12 10 v5" />
            </svg>
          </span>
          <span className="brand-text">
            <span className="brand-name">Casa DaVinci</span>
            <span className="brand-sub">Řízení domu</span>
          </span>
        </div>
        <div className="rail-nav">
          {AREAS.map((a) => <AreaLink key={a.id} area={a} />)}
        </div>
        <div className="rail-foot">
          <b>v2 · Precision</b><br />
          Raspberry Pi · Cerbo GX
        </div>
      </nav>

      {/* Topbar — rail toggle + breadcrumb + garage shortcut + theme + connection + clock */}
      <header className="topbar">
        <button
          className="rail-toggle"
          onClick={toggleRail}
          aria-expanded={railOpen}
          aria-label={railOpen ? 'Skrýt menu' : 'Zobrazit menu'}
          title={railOpen ? 'Skrýt menu' : 'Zobrazit menu'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
            <path d="M9.5 4.5v15" />
            {railOpen
              ? <path d="M16 10l-2 2 2 2" />
              : <path d="M14 10l2 2-2 2" />}
          </svg>
        </button>
        <div className="crumb">
          <span className="crumb-path">
            Casa DaVinci / <b style={{ color: active?.accent }}>{active?.label || ''}</b>
          </span>
          {active && <span className="crumb-meta">{active.blurb}</span>}
        </div>
        <div className="topbar-right">
          <GaragePulseButton variant="compact" />
          <ThemeSwitcher />
          <div className={'chip' + (stale ? ' chip--bad' : ' chip--ok')}>
            <span className="chip-dot" />
            {chipText}
          </div>
          <div className="clock">{clock}</div>
        </div>
      </header>

      {/* Main content — the global outage banner sits above every screen. */}
      <main className="content">
        <OutageBanner />
        {children}
      </main>
    </div>
  );
}
