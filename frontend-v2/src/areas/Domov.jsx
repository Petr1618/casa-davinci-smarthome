// =============================================================================
// Domů — the cross-domain landing screen (DESIGN.md §5, approved sketch):
//
//   ┌ AKTIVNÍ ALARMY (thin green "vše v pořádku" row when quiet) ┐
//   ├ ⚡ Energie teď (mini-flow + 3 čísla) │ 🌿 Zahrada · voda   ┤
//   ├ 🏡 Klima domu (pokoje z ESP32)      │ 📊 Dnešní bilance   ┤
//   └ ⚙ Rychlé akce (Vrata garáže · Spustit čerpadlo — obě s potvrzením) ┘
//
// Resident-first: only outcomes here, details live in the areas — every card
// links through to its area. Built from the shared Precision library; the
// mini energy-flow reuses the fl-/fx- ribbon language at postcard size.
// =============================================================================
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useVictron from '../hooks/useVictron.js';
import usePump from '../hooks/usePump.js';
import useGarage from '../hooks/useGarage.js';
import useSensors from '../hooks/useSensors.js';
import { useHealth, fmtClock } from '../lib/health.jsx';
import { fmtNum, fmtW, fmt1, czStr } from '../lib/format.js';
import Dq from '../components/Dq.jsx';
import GaragePulseButton from '../components/GaragePulseButton.jsx';
import './domov/domov.css';

const ROOM_LABELS = { living_room: 'Obývák', bedroom: 'Ložnice', kitchen: 'Kuchyň' };

// ---- Postcard-size energy mini-flow (Precision ribbon language). ------------
function MiniFlow({ solarW, homeW, batterySoc, batteryW }) {
  const solarOn = solarW > 10;
  const charging = batteryW > 10;
  const discharging = batteryW < -10;
  const socPct = batterySoc != null ? Math.round(batterySoc) : null;
  const socW = socPct != null ? (86 * socPct) / 100 : 0;

  return (
    <svg viewBox="0 0 520 150" role="img" aria-label="Mini diagram: solár, dům, baterie">
      {/* ribbons: solár → dům, dům ↔ baterie */}
      {solarOn ? (
        <g>
          <path className="fl-base" d="M 96 62 C 160 62 190 62 246 62" />
          <path className="fl-core" d="M 96 62 C 160 62 190 62 246 62" />
          <path className="fl-pulse" d="M 96 62 C 160 62 190 62 246 62" pathLength="100" style={{ '--dur': '3.2s' }} />
        </g>
      ) : (
        <path className="fl-idle" d="M 96 62 C 160 62 190 62 246 62" />
      )}
      {charging || discharging ? (
        <g>
          <path className="fl-base" d="M 316 62 C 372 62 400 62 424 62" />
          <path className="fl-core" d="M 316 62 C 372 62 400 62 424 62" />
          <path
            className="fl-pulse" d="M 316 62 C 372 62 400 62 424 62" pathLength="100"
            style={{ '--dur': '4.1s', animationDirection: discharging ? 'reverse' : 'normal' }}
          />
        </g>
      ) : (
        <path className="fl-idle" d="M 316 62 C 372 62 400 62 424 62" />
      )}

      {/* Solár */}
      <g className="v">
        <circle className="node-ring" cx="66" cy="62" r="26" />
        <g className="node-ico" transform="translate(66 62)">
          <circle r="5.5" />
          <path d="M0 -9.5v-2.5M0 9.5v2.5M9.5 0h2.5M-9.5 0h-2.5M6.7 -6.7l1.8-1.8M-6.7 6.7l-1.8 1.8M6.7 6.7l1.8 1.8M-6.7 -6.7l-1.8-1.8" />
        </g>
        <text className="fx-value" x="66" y="116" textAnchor="middle" style={{ fontSize: 17 }}>{fmtW(solarW)}</text>
        <text className="fx-label" x="66" y="136" textAnchor="middle">Solár</text>
      </g>

      {/* Dům */}
      <g className="v">
        <circle className="node-ring hub" cx="281" cy="62" r="34" />
        <path className="node-ico" d="M267 64l14-11 14 11M270.5 61.5V75h21V61.5" />
        <text className="fx-value" x="281" y="116" textAnchor="middle" style={{ fontSize: 17 }}>{fmtW(homeW)}</text>
        <text className="fx-label" x="281" y="136" textAnchor="middle">Dům</text>
      </g>

      {/* Baterie (mini SOC tank) */}
      <g className="v">
        <rect className="node-ring" x="424" y="44" width="94" height="36" rx="8" />
        <rect x="520" y="55" width="5" height="14" rx="2" fill="none" stroke="var(--line2)" />
        {socPct != null && <rect x="428" y="48" width={socW.toFixed(1)} height="28" rx="5" fill="var(--amber)" opacity=".6" />}
        <text x="471" y="66" textAnchor="middle" style={{ fontFamily: 'var(--f-body)', fontSize: 13, fontWeight: 600 }}
          fill={socPct != null && socPct > 45 ? '#0a0c0f' : 'var(--tx)'}>
          {socPct != null ? `${socPct} %` : '—'}
        </text>
        <text className="fx-value" x="471" y="116" textAnchor="middle" style={{ fontSize: 17 }}>
          {batteryW > 10 ? 'nabíjí' : batteryW < -10 ? 'vybíjí' : 'klid'}
        </text>
        <text className="fx-label" x="471" y="136" textAnchor="middle">Baterie</text>
      </g>
    </svg>
  );
}

export default function Domov({ area }) {
  const victron = useVictron();
  const { pump, setPump } = usePump();
  const { garage } = useGarage();
  const rooms = useSensors();
  const { stale, lastDataAt, silentTopics } = useHealth();
  const navigate = useNavigate();

  // 1 Hz tick for the pump countdown in the Zahrada card.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ---- Quick action: two-step confirm, auto-cancel after 5 s. ---------------
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef(null);
  useEffect(() => () => clearTimeout(confirmTimer.current), []);
  const quickPump = () => {
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = setTimeout(() => setConfirming(false), 5000);
      return;
    }
    clearTimeout(confirmTimer.current);
    setConfirming(false);
    setPump(true);
    navigate('/zahrada');   // show the run where the detail lives
  };

  const { solarW = 0, homeW = 0, batterySoc = null, batteryW = 0,
    solar1YieldKwh = null, solar2YieldKwh = null, daily = null } = victron;

  const pumpOnline = pump?.online === true;
  const pumpOn = pump?.on === true;
  const pumpEnabled = pump?.enabled === true;
  const nextMs = pumpEnabled && pump?.nextRunAt ? pump.nextRunAt - Date.now() : null;
  const nextTxt = nextMs != null && nextMs > 0
    ? `${Math.floor(nextMs / 60000)} min ${Math.floor((nextMs % 60000) / 1000)} s`
    : null;

  const yieldTotal = solar1YieldKwh != null && solar2YieldKwh != null
    ? solar1YieldKwh + solar2YieldKwh : null;

  // ---- Alarm summary (surface outcomes only; detail belongs to Systém). -----
  const alarms = [];
  if (stale) alarms.push({ sev: 'bad', text: 'Ztráta spojení s domem — viz banner a Doporučení výše.' });
  silentTopics.forEach((t) => alarms.push({ sev: 'warn', text: `Victron topik ztichl: ${t.label} (${Math.round(t.ageSeconds / 60)} min)` }));
  if (!stale && pump && !pumpOnline) alarms.push({ sev: 'warn', text: 'Čerpadlo (Shelly) je offline.' });
  if (!stale && garage && garage.online === false) alarms.push({ sev: 'warn', text: 'Garážová vrata (Shelly) jsou offline.' });

  return (
    <div style={{ '--acc': area?.accent || '#d9dee3', '--acc-soft': area?.accentSoft, '--acc-glow': 'rgba(217,222,227,.2)' }}>
      <div className="sc-head">
        <div>
          <div className="sc-eyebrow">Přehled celého domu</div>
          <h1 className="sc-title">Domů</h1>
        </div>
        <div className="sc-meta">
          Casa DaVinci · {new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {/* AKTIVNÍ ALARMY — thin quiet row when everything is fine. */}
      {alarms.length === 0 ? (
        <div className="dm-ok">
          <span className="dm-ok-dot" />
          Vše v pořádku — žádné aktivní alarmy
          <span className="dm-ok-time">poslední data {fmtClock(lastDataAt)}</span>
        </div>
      ) : (
        <div className="card dm-alarms">
          <div className="card-h"><span className="t">Aktivní alarmy</span><span className="spacer"></span><span className="pill bad">{alarms.length}</span></div>
          <div className="card-b">
            <div className="rows">
              {alarms.map((a, i) => (
                <div className="rw" key={i}>
                  <span className="k" style={{ color: a.sev === 'bad' ? 'var(--red)' : 'var(--warn)' }}>●</span>
                  <span className="val" style={{ textAlign: 'left', flex: 1, fontWeight: 400 }}>{a.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="dm-grid">
        {/* ENERGIE TEĎ */}
        <Link to="/elektrarna" className="card dm-link" style={{ '--acc': '#ffb547', '--acc-glow': 'rgba(255,181,71,.45)' }}>
          <div className="card-h"><span className="t">Energie teď</span><span className="spacer"></span><Dq /></div>
          <div className="card-b scene">
            <MiniFlow solarW={solarW} homeW={homeW} batterySoc={batterySoc} batteryW={batteryW} />
          </div>
          <div className="card-foot"><span>výroba {fmtW(solarW)} · spotřeba {fmtW(homeW)}</span><span className="dm-more">Elektrárna →</span></div>
        </Link>

        {/* ZAHRADA · VODA */}
        <Link to="/zahrada" className="card dm-link" style={{ '--acc': '#3bd6c6', '--acc-glow': 'rgba(59,214,198,.45)' }}>
          <div className="card-h">
            <span className="t">Zahrada · Voda</span>
            <span className={'pill ' + (pumpOn ? 'run' : !pumpEnabled ? 'warn' : 'idle')}>
              {pumpOn ? 'Běží' : !pumpEnabled ? 'Automatika vyp.' : 'Stojí'}
            </span>
            <span className="spacer"></span><Dq />
          </div>
          <div className="card-b">
            <div className="rows v">
              <div className="rw"><span className="k">Čerpadlo studna → jímka</span><span className="val" style={{ color: pumpOnline ? 'var(--ok)' : 'var(--red)' }}>{pumpOnline ? 'Online' : 'Offline'}</span></div>
              <div className="rw"><span className="k">Teplota Shelly</span><span className="val">{typeof pump?.temperature === 'number' ? `${fmt1(pump.temperature)} °C` : '—'}</span></div>
              <div className="rw"><span className="k">Další cyklus</span><span className="val">{nextTxt ? `za ${nextTxt}` : pumpEnabled ? '—' : 'automatika vypnutá'}</span></div>
            </div>
          </div>
          <div className="card-foot"><span>plán běží lokálně v Shelly</span><span className="dm-more">Zahrada →</span></div>
        </Link>

        {/* KLIMA DOMU */}
        <Link to="/dum" className="card dm-link" style={{ '--acc': '#6ea8e8', '--acc-glow': 'rgba(110,168,232,.4)' }}>
          <div className="card-h"><span className="t">Klima domu</span><span className="spacer"></span><Dq /></div>
          <div className="card-b">
            {Object.keys(rooms).length === 0 ? (
              <div className="dm-empty v">Žádná čidla nehlásí — ESP32 senzor obýváku je offline.</div>
            ) : (
              <div className="dm-rooms v">
                {Object.entries(rooms).map(([loc, r]) => (
                  <div className="dm-room" key={loc}>
                    <div className="dm-room-name">{ROOM_LABELS[loc] || loc}</div>
                    <div className="dm-room-temp">{typeof r.temperature === 'number' ? fmt1(r.temperature) : '—'}<small> °C</small></div>
                    <div className="dm-room-hum">{typeof r.humidity === 'number' ? Math.round(r.humidity) : '—'} % vlhkost</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card-foot">
            <span>
              {(() => {
                const n = Object.keys(rooms).length;
                return `${n} ${n === 1 ? 'pokoj' : n >= 2 && n <= 4 ? 'pokoje' : 'pokojů'} s čidlem`;
              })()}
            </span>
            <span className="dm-more">Dům →</span>
          </div>
        </Link>

        {/* DNEŠNÍ BILANCE */}
        <Link to="/energie" className="card dm-link" style={{ '--acc': '#b48ee0', '--acc-glow': 'rgba(180,142,224,.3)' }}>
          <div className="card-h"><span className="t">Dnešní bilance</span><span className="spacer"></span><Dq /></div>
          <div className="card-b">
            <div className="rows v">
              <div className="rw"><span className="k">Vyrobeno</span><span className="val">{yieldTotal != null ? `${fmt1(yieldTotal)} kWh` : '—'}</span></div>
              <div className="rw"><span className="k">Spotřebováno</span><span className="val">{czStr(daily?.homeConsumedKwh)} kWh</span></div>
              <div className="rw"><span className="k">Soběstačnost</span><span className="val" style={{ color: 'var(--ok)' }}>{daily?.selfSufficiency ?? '—'} %</span></div>
              <div className="rw"><span className="k">Síť · odběr / dodávka</span><span className="val">{czStr(daily?.gridImportKwh)} / {czStr(daily?.gridExportKwh)} kWh</span></div>
            </div>
          </div>
          <div className="card-foot"><span>grafy a historie připravujeme</span><span className="dm-more">Energie →</span></div>
        </Link>
      </div>

      {/* RYCHLÉ AKCE */}
      <div className="card dm-actions">
        <div className="card-h"><span className="t">Rychlé akce</span></div>
        <div className="card-b dm-actions-row">
          <GaragePulseButton variant="full" />
          <button
            className={'btn ctl' + (confirming ? '' : ' acc')}
            style={confirming ? { borderColor: 'var(--warn)', color: 'var(--warn)' } : undefined}
            disabled={!pumpOnline}
            onClick={quickPump}
          >
            {confirming ? `Potvrdit spuštění (${pump?.runSeconds ?? 60} s)?` : `Spustit čerpadlo (${pump?.runSeconds ?? 60} s)`}
          </button>
          <span className="kpi-sub">Obě akce chtějí druhé kliknutí pro potvrzení. Světla přibudou s novými zařízeními.</span>
        </div>
      </div>
    </div>
  );
}
