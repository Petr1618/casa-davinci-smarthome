// =============================================================================
// Elektrárna — area page with v1-style sub-sections in the Precision language:
//   Přehled (KPI + flow scene + cards) · Solár · Měnič · Baterie
// Sub-navigation is hash-routed (#/elektrarna/solar …) so every section is
// linkable; the shared screen header stays, the tab strip switches content.
// =============================================================================
import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import useVictron from '../hooks/useVictron.js';
import Prehled from './elektrarna/Prehled.jsx';
import SolarSection from './elektrarna/SolarSection.jsx';
import MenicSection from './elektrarna/MenicSection.jsx';
import BaterieSection from './elektrarna/BaterieSection.jsx';
import './elektrarna/ek-tabs.css';

const SECTIONS = [
  { id: '', label: 'Přehled' },
  { id: 'solar', label: 'Solár' },
  { id: 'menic', label: 'Měnič' },
  { id: 'baterie', label: 'Baterie' },
];

// "aktualizace před X s" ticker — remembers when the last live value arrived.
function useUpdatedAgo(data) {
  const lastRef = useRef(Date.now());
  const [ago, setAgo] = useState(0);
  useEffect(() => { lastRef.current = Date.now(); }, [data]);
  useEffect(() => {
    const t = setInterval(() => setAgo(Math.round((Date.now() - lastRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return ago;
}

export default function Elektrarna({ area }) {
  const data = useVictron();
  const ago = useUpdatedAgo(data);

  // #/elektrarna/<section> — '' = Přehled.
  const section = useLocation().pathname.split('/')[2] || '';

  return (
    <div style={{ '--acc': area?.accent || 'var(--amber)', '--acc-soft': area?.accentSoft, '--acc-glow': 'rgba(255,181,71,.45)' }}>
      <div className="sc-head">
        <div>
          <div className="sc-eyebrow">Výroba · Baterie · Síť</div>
          <h1 className="sc-title">Elektrárna</h1>
        </div>
        <div className="sc-meta">
          MultiPlus-II 48/5000 · 2× MPPT<br />
          <span className="upd">aktualizace před {ago} s</span>
        </div>
      </div>

      {/* Sub-section tab strip (v1 tabs, Precision styling). */}
      <nav className="ek-tabs" aria-label="Sekce Elektrárny">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.id}
            to={`/elektrarna${s.id ? `/${s.id}` : ''}`}
            end={s.id === ''}
            className={({ isActive }) => 'ek-tab' + (isActive ? ' is-active' : '')}
          >
            {s.label}
          </NavLink>
        ))}
      </nav>

      {section === 'solar' ? <SolarSection />
        : section === 'menic' ? <MenicSection />
        : section === 'baterie' ? <BaterieSection />
        : <Prehled data={data} />}
    </div>
  );
}
