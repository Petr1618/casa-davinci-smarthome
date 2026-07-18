// =============================================================================
// Elektrárna — area page, a 1:1 port of the design-B mockup screen:
//   sc-head → KPI strip (4) → scene-card (EnergyScene) → grid-3 detail cards.
// Structure, classes and copy follow the mockup verbatim; values are live from
// useVictron(). Fields the backend doesn't publish yet render as "—" in the
// exact same layout (no invented numbers).
// =============================================================================
import { useState, useEffect, useRef } from 'react';
import useVictron from '../hooks/useVictron.js';
import EnergyScene from './elektrarna/EnergyScene.jsx';
import { fmtNum, fmtW, fmt1, fmtSignedW, czStr } from '../lib/format.js';
import Dq from '../components/Dq.jsx';
import FreezeTag from '../components/FreezeTag.jsx';

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

  const {
    solar1W = 0, solar2W = 0, solarW = 0, homeW = 0, gridW = null,
    batterySoc = null, batteryW = 0, batteryV = null, batteryA = null,
    batteryTemp = null, modulesOnline = null,
    solar1YieldKwh = null, solar2YieldKwh = null, daily = null,
  } = data;

  const socPct = batterySoc != null ? Math.round(batterySoc) : null;
  const battCharging = batteryW > 10;
  const battDischarging = batteryW < -10;
  const battWord = battCharging ? 'nabíjení' : battDischarging ? 'vybíjení' : 'klid';
  const pillText = battCharging ? 'Nabíjení baterie' : battDischarging ? 'Vybíjení baterie' : 'Baterie v klidu';

  const yieldTotal = solar1YieldKwh != null && solar2YieldKwh != null
    ? solar1YieldKwh + solar2YieldKwh : null;
  const pvPct = Math.round((solarW / 7200) * 100);
  const surplus = solarW - homeW;

  const hasGrid = typeof gridW === 'number';
  const gridWord = !hasGrid ? '—' : gridW > 10 ? 'odběr' : gridW < -10 ? 'dodávka' : 'pohotovost';

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

      {/* KPI */}
      <div className="kpis">
        <div className="card kpi">
          <div className="kpi-top"><span className="kpi-l">Dnešní výroba</span><Dq /></div>
          <div className="kpi-v v">{yieldTotal != null ? fmt1(yieldTotal) : '—'}<small>kWh</small></div>
          <div className="kpi-sub">
            střecha {solar1YieldKwh != null ? fmt1(solar1YieldKwh) : '—'} · terasa {solar2YieldKwh != null ? fmt1(solar2YieldKwh) : '—'} kWh
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-top"><span className="kpi-l">Soběstačnost</span><Dq /></div>
          <div className="kpi-v v">{daily?.selfSufficiency ?? '—'}<small>%</small></div>
          <div className="kpi-sub">ze sítě dnes <b>{czStr(daily?.gridImportKwh)} kWh</b></div>
        </div>
        <div className="card kpi">
          <div className="kpi-top"><span className="kpi-l">Výroba teď</span><Dq /></div>
          <div className="kpi-v v">{fmtNum(solarW)}<small>W</small></div>
          <div className="kpi-sub">{pvPct} % instalovaného výkonu 7,2 kWp</div>
        </div>
        <div className="card kpi">
          <div className="kpi-top"><span className="kpi-l">Spotřeba domu</span><Dq /></div>
          <div className="kpi-v v">{fmtNum(homeW)}<small>W</small></div>
          <div className="kpi-sub">
            {surplus > 10
              ? <>přebytek <b>{fmtSignedW(surplus)}</b> → baterie</>
              : surplus < -10
                ? <>chybí <b>{fmtW(Math.abs(surplus))}</b> · kryje baterie</>
                : 'výroba kryje spotřebu'}
          </div>
        </div>
      </div>

      {/* ENERGY FLOW */}
      <div className="card scene-card">
        <FreezeTag />
        <div className="card-h">
          <span className="t">Tok energie</span>
          <span className={'pill ' + (battCharging || battDischarging ? 'acc' : 'idle')} style={{ marginLeft: 4 }}>{pillText}</span>
          <span className="spacer"></span>
          <Dq />
        </div>
        <div className="card-b scene">
          <EnergyScene data={data} />
        </div>
      </div>

      {/* Detailní karty */}
      <div className="grid-3">
        <div className="card">
          <div className="card-h"><span className="t">Baterie · BMS</span><span className="spacer"></span><Dq /></div>
          <div className="card-b">
            <div className="rows v">
              <div className="rw"><span className="k">Stav nabití</span><span className="val">{socPct != null ? `${socPct} %` : '—'}</span></div>
              <div className="rw"><span className="k">Výkon</span><span className="val">{fmtSignedW(batteryW)} <small>· {battWord}</small></span></div>
              <div className="rw"><span className="k">Napětí · proud</span><span className="val">{batteryV != null ? `${fmt1(batteryV)} V` : '—'} · {batteryA != null ? `${fmt1(batteryA)} A` : '—'}</span></div>
              <div className="rw"><span className="k">Teplota</span><span className="val">{batteryTemp != null ? `${Math.round(batteryTemp)} °C` : '—'}</span></div>
              <div className="rw"><span className="k">Packy online</span><span className="val">{modulesOnline != null ? `${modulesOnline} / 3` : '—'}</span></div>
            </div>
            <div className="meter"><i style={{ width: `${socPct ?? 0}%` }}></i></div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><span className="t">Solární stringy</span><span className="spacer"></span><Dq /></div>
          <div className="card-b">
            <div className="rows v">
              <div className="rw"><span className="k">Střecha · 4,8 kWp</span><span className="val">{fmtW(solar1W)} <small>· {Math.round((solar1W / 4800) * 100)} %</small></span></div>
            </div>
            <div className="meter" style={{ marginTop: 2 }}><i style={{ width: `${Math.min(100, Math.round((solar1W / 4800) * 100))}%` }}></i></div>
            <div className="rows v" style={{ marginTop: 14 }}>
              <div className="rw"><span className="k">Terasa · 2,4 kWp</span><span className="val">{fmtW(solar2W)} <small>· {Math.round((solar2W / 2400) * 100)} %</small></span></div>
            </div>
            <div className="meter" style={{ marginTop: 2 }}><i style={{ width: `${Math.min(100, Math.round((solar2W / 2400) * 100))}%` }}></i></div>
            <div className="rows v" style={{ marginTop: 14 }}>
              <div className="rw"><span className="k">Výroba celkem</span><span className="val">{fmtW(solarW)}</span></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><span className="t">Síť · Distribuce</span><span className="spacer"></span><Dq /></div>
          <div className="card-b">
            <div className="rows v">
              <div className="rw"><span className="k">Aktuální tok</span><span className="val">{hasGrid ? fmtW(Math.abs(gridW)) : '—'} <small>· {gridWord}</small></span></div>
              <div className="rw"><span className="k">Dnes odebráno</span><span className="val">{czStr(daily?.gridImportKwh)} kWh</span></div>
              <div className="rw"><span className="k">Dnes dodáno</span><span className="val">{czStr(daily?.gridExportKwh)} kWh</span></div>
              <div className="rw"><span className="k">Spotřeba domu dnes</span><span className="val">{czStr(daily?.homeConsumedKwh)} kWh</span></div>
              <div className="rw"><span className="k">Vlastní spotřeba</span><span className="val">{daily?.selfConsumption ?? '—'} %</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
