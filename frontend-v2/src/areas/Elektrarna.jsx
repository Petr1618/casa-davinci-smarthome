// =============================================================================
// Elektrárna (Power plant) — area page. The real-time energy dashboard, ported
// from the v1 "Overview" tab.
//
// Composition:
//   · header        — ⚡ icon + "Elektrárna" + short blurb
//   · <EnergyFlow>  — the animated energy-flow diagram (shared <FlowScene>)
//   · cards grid    — Solár · Síť · Dům · Baterie · Dnešní souhrn · alarmy
//
// All live values come from ONE hook, useVictron(), which owns every socket
// listener (initial-data / victron-data / daily-energy). The optional
// system-notification stream is subscribed to HERE (it's page-scoped: it feeds
// the alarms card) and kept as a small newest-first feed.
//
// Receives `{ area }` (id/label/icon/accent/blurb) from App's route map so the
// header matches the rest of the navigation.
//
// SCOPE: this is the OVERVIEW only. The deep sub-tabs from v1 (Solar / Inverter
// / Battery / BMS detail) are a FUTURE phase and intentionally not built here.
// =============================================================================
import { useState, useEffect } from 'react';
import useVictron from '../hooks/useVictron.js';
import { on } from '../lib/socket.js';
import EnergyFlow from './elektrarna/EnergyFlow.jsx';
import {
  SolarCard,
  GridCard,
  HomeCard,
  BatteryCard,
  SummaryCard,
  AlarmsCard,
} from './elektrarna/cards.jsx';
import './elektrarna/elektrarna.css';

const MAX_ALARMS = 6; // keep the alarms feed short (newest first)

export default function Elektrarna({ area }) {
  // Single source of truth for all live energy values.
  const data = useVictron();

  // Page-scoped alarms feed from the optional system-notification stream.
  const [alarms, setAlarms] = useState([]);
  useEffect(() => {
    const off = on('system-notification', (n) => {
      if (!n) return;
      // Prepend newest, de-dupe nothing fancy, cap the list length.
      setAlarms((prev) =>
        [{ ...n, id: n.id ?? Date.now() }, ...prev].slice(0, MAX_ALARMS)
      );
    });
    return off; // unsubscribe on unmount
  }, []);

  return (
    <div className="ek-area">
      {/* Area header — icon + title + short blurb. */}
      <header className="ek-header">
        <div className="ek-icon" aria-hidden>{area?.icon || '⚡'}</div>
        <div>
          <h1 className="ek-title">{area?.label || 'Elektrárna'}</h1>
          <p className="ek-blurb">
            {area?.blurb ||
              'Tok energie v reálném čase — solár, baterie, síť a spotřeba domu.'}
          </p>
        </div>
      </header>

      {/* The animated energy-flow showpiece (shared FlowScene engine). */}
      <div className="ek-flow">
        <div className="ek-flow-stage">
          <EnergyFlow data={data} />
        </div>
      </div>

      {/* Metric cards grid — mirrors the v1 Overview tiles. */}
      <div className="ek-grid">
        <SolarCard data={data} />
        <GridCard data={data} />
        <HomeCard data={data} />
        <BatteryCard data={data} />
        <SummaryCard data={data} />
        <AlarmsCard alarms={alarms} />
      </div>

      {/* Honest scope note: deep sub-tabs are a future phase. */}
      <p className="ek-note">
        Detailní pohledy (Solár · Měnič · Baterie · BMS) připravujeme
        v další fázi.
      </p>
    </div>
  );
}
