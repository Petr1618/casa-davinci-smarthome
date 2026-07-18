// =============================================================================
// Zahrada — area page, a 1:1 port of the design-B mockup screen:
//   sc-head → scene-card (WaterScene, `.wscene is-on` drives animation)
//           → grid-4: Stav čerpadla · Další cyklus · Automatika · Ovládání.
// Structure, classes and copy follow the mockup verbatim; values are live from
// usePump(). The mockup's Automatika card is read-only — here its two config
// rows (Délka běhu / Interval) are editable in place so the v1 functionality
// survives, with Uložit + feedback in the card foot.
// =============================================================================
import { useState, useEffect, useRef } from 'react';
import usePump from '../hooks/usePump.js';
import WaterScene from './zahrada/WaterScene.jsx';
import { fmt1 } from '../lib/format.js';
import Dq from '../components/Dq.jsx';
import FreezeTag from '../components/FreezeTag.jsx';
import './zahrada/zahrada.css';

// Interval options — exact set from the backend contract / v1 select.
const INTERVALS = [
  { key: '15m', label: '15 minut', s: 900 },
  { key: '20m', label: '20 minut', s: 1200 },
  { key: '30m', label: '30 minut', s: 1800 },
  { key: '1h', label: '1 hodina', s: 3600 },
  { key: '2h', label: '2 hodiny', s: 7200 },
  { key: '3h', label: '3 hodiny', s: 10800 },
  { key: '4h', label: '4 hodiny', s: 14400 },
  { key: '6h', label: '6 hodin', s: 21600 },
  { key: '8h', label: '8 hodin', s: 28800 },
  { key: '12h', label: '12 hodin', s: 43200 },
  { key: '24h', label: '24 hodin', s: 86400 },
];

// "42:17" (mm:ss) or "1:02:17" above an hour — the mockup's countdown format.
function fmtCount(ms) {
  if (ms == null || ms < 0) return '—:—';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function Zahrada({ area }) {
  const { pump, setPump, setConfig, lastResult } = usePump();

  // 1 Hz ticker so countdowns stay live between socket pushes.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ---- Config inputs (synced from pump-status unless being edited). ---------
  const [runSeconds, setRunSeconds] = useState('60');
  const [intervalKey, setIntervalKey] = useState('1h');
  const runFocused = useRef(false);
  const ivFocused = useRef(false);
  const [msg, setMsg] = useState({ text: '', kind: '' });

  useEffect(() => {
    if (!pump) return;
    if (!runFocused.current && typeof pump.runSeconds === 'number') {
      setRunSeconds(String(pump.runSeconds));
    }
    if (!ivFocused.current && pump.intervalKey) {
      setIntervalKey(pump.intervalKey);
    }
  }, [pump]);

  useEffect(() => {
    if (!lastResult) return;
    if (lastResult.ok) setMsg({ text: 'Uloženo ✓', kind: 'ok' });
    else setMsg({ text: `Chyba: ${lastResult.error || 'neznámá'}`, kind: 'error' });
  }, [lastResult]);

  const save = () => {
    setMsg({ text: 'Ukládám…', kind: '' });
    setConfig({ runSeconds: Number(runSeconds), intervalKey });
  };

  // ---- Derived live state ---------------------------------------------------
  const online = pump?.online === true;
  const isOn = pump?.on === true;
  const enabled = pump?.enabled === true;
  const temp = typeof pump?.temperature === 'number' ? pump.temperature : null;

  const pillClass = isOn ? 'run' : !enabled ? 'warn' : 'idle';
  const pillText = isOn ? 'Běží' : !enabled ? 'Automatika vypnutá' : 'Stojí';

  // Countdown to next auto cycle + progress across the interval.
  const nextMs = enabled && pump?.nextRunAt ? pump.nextRunAt - Date.now() : null;
  const ivSeconds = (INTERVALS.find((i) => i.key === (pump?.intervalKey || intervalKey)) || {}).s || 3600;
  const cycleFrac = nextMs != null ? Math.max(0, Math.min(1, 1 - nextMs / (ivSeconds * 1000))) : 0;
  const offMs = isOn && pump?.offAt ? pump.offAt - Date.now() : null;

  const caption = isOn ? (
    <span><b style={{ color: 'var(--teal)' }}>Běží.</b>&ensp;Voda proudí ze studny do jímky{offMs != null ? ` · auto-off za ${Math.max(0, Math.round(offMs / 1000))} s` : ''}.</span>
  ) : !enabled ? (
    <span><b style={{ color: 'var(--warn)' }}>Automatika vypnutá.</b>&ensp;Čerpadlo se spouští jen ručně — plán v Shelly je pozastavený.</span>
  ) : (
    <span><b style={{ color: 'var(--tx2)' }}>Stojí.</b>&ensp;Další automatický cyklus proběhne podle plánu v Shelly — nezávisle na Raspberry Pi.</span>
  );

  return (
    <div style={{ '--acc': area?.accent || 'var(--teal)', '--acc-soft': area?.accentSoft, '--acc-glow': 'rgba(59,214,198,.45)' }}>
      <div className="sc-head">
        <div>
          <div className="sc-eyebrow">Studna · Čerpadlo · Jímka</div>
          <h1 className="sc-title">Zahrada</h1>
        </div>
        <div className="sc-meta">
          Shelly Plus 1 · kontaktor KMC 20-20 · 1,5 kW<br />
          <span className="upd">{online ? 'zařízení online' : 'zařízení offline'}</span>
        </div>
      </div>

      {/* WATER FLOW */}
      <div className={'card scene-card wscene' + (isOn ? ' is-on' : '')}>
        <FreezeTag />
        <div className="card-h">
          <span className="t">Čerpání vody</span>
          <span className={`pill ${pillClass}`}>{pillText}</span>
          <span className="spacer"></span>
          <Dq />
        </div>
        <div className="card-b scene">
          <WaterScene pump={pump} />
        </div>
        <div className="card-foot">
          {caption}
        </div>
      </div>

      <div className="grid-4">
        <div className="card">
          <div className="card-h"><span className="t">Stav čerpadla</span><span className="spacer"></span><Dq /></div>
          <div className="card-b">
            <div className="rows v">
              <div className="rw"><span className="k">Shelly Plus 1</span><span className="val" style={{ color: online ? 'var(--ok)' : 'var(--red)' }}>{online ? 'Online' : 'Offline'}</span></div>
              <div className="rw"><span className="k">Relé</span><span className="val">{isOn ? 'Sepnuto' : 'Vypnuto'}</span></div>
              <div className="rw"><span className="k">Teplota Shelly</span><span className="val">{temp != null ? fmt1(temp) : '—'} °C <small>· limit 70 °C</small></span></div>
              <div className="rw"><span className="k">Zdroj stavu</span><span className="val">{pump?.source || '—'}</span></div>
            </div>
            <div className="meter"><i style={{ width: `${temp != null ? Math.min(100, Math.round((temp / 70) * 100)) : 0}%` }}></i></div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><span className="t">Další cyklus</span><span className="spacer"></span><Dq nodata /></div>
          <div className="card-b">
            <div className="count v">{enabled ? fmtCount(nextMs) : '—:—'}</div>
            <div className="kpi-sub" style={{ marginTop: 12 }}>
              {enabled
                ? <>automatický plán · interval {pump?.intervalLabel || '—'}</>
                : 'automatika vypnutá'}
            </div>
            <div className="meter" style={{ marginTop: 16 }}><i style={{ width: `${Math.round(cycleFrac * 100)}%` }}></i></div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><span className="t">Automatika</span><span className="spacer"></span><span className="dq"><b>Konfigurace</b></span></div>
          <div className="card-b">
            <div className="rows">
              <div className="rw">
                <span className="k">Master</span>
                <button
                  className={`pill ${enabled ? 'run' : 'warn'} zh-toggle`}
                  onClick={() => setConfig({ enabled: !enabled })}
                >
                  {enabled ? 'Zapnutá' : 'Vypnutá'}
                </button>
              </div>
              <div className="rw">
                <span className="k">Délka běhu</span>
                <span className="val">
                  <input
                    className="zh-input zh-num"
                    type="number" min="5" max="600" step="5"
                    value={runSeconds}
                    onChange={(e) => setRunSeconds(e.target.value)}
                    onFocus={() => { runFocused.current = true; }}
                    onBlur={() => { runFocused.current = false; }}
                  /> s
                </span>
              </div>
              <div className="rw">
                <span className="k">Interval</span>
                <select
                  className="zh-input zh-select"
                  value={intervalKey}
                  onChange={(e) => setIntervalKey(e.target.value)}
                  onFocus={() => { ivFocused.current = true; }}
                  onBlur={() => { ivFocused.current = false; }}
                >
                  {INTERVALS.map((iv) => (
                    <option key={iv.key} value={iv.key}>{iv.label}</option>
                  ))}
                </select>
              </div>
              <div className="rw"><span className="k">Zdroj plánu</span><span className="val">Shelly <small>· lokální</small></span></div>
            </div>
          </div>
          <div className="card-foot">
            <button className="btn zh-save" onClick={save}>Uložit</button>
            <span className={'zh-msg' + (msg.kind ? ` is-${msg.kind}` : '')}>{msg.text}</span>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><span className="t">Ovládání</span></div>
          <div className="card-b">
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn acc ctl" style={{ flex: 1 }} disabled={!online} onClick={() => setPump(true)}>Zapnout</button>
              <button className="btn ctl" style={{ flex: 1 }} disabled={!online} onClick={() => setPump(false)}>Vypnout</button>
            </div>
            <div className="kpi-sub" style={{ marginTop: 16, lineHeight: 1.7 }}>
              Ruční sepnutí respektuje auto-off <b>{pump?.runSeconds ?? 60} s</b>. Plán v Shelly běží i bez spojení s mostem.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
