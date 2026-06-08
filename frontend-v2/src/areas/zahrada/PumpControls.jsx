// =============================================================================
// PumpControls — React port of the v1 well-pump tile (Shelly Plus 1).
//
// Two sections, divided by a rule:
//   1) Stav & ruční ovládání — live state + temperature + manual Zapnout/Vypnout
//      buttons, plus two live countdown lines:
//         ⏱ Vypne za …                  (auto-off while running)
//         ↻ Příští spuštění v HH:MM (za …)  (next scheduled automation start)
//   2) Automatika — a real toggle SWITCH (automation master), a "Doba běhu (s)"
//      number input (5–600), an "Interval mezi cykly" <select>, and "Uložit".
//
// Behaviour faithfully ported from index.html (updatePumpCard / savePumpConfig /
// togglePumpAuto / renderPumpTiming):
//   · Inputs are controlled locally so the user can type freely, but they are
//     RE-SYNCED from incoming pump-status ONLY when the field isn't focused —
//     so a live push never clobbers a value mid-edit.
//   · Countdowns re-render every second via a local 1 Hz ticker.
//   · Save / toggle show "Ukládám…", then pump-config-result flips it to
//     "Uloženo ✓" or an error (surfaced via the `lastResult` prop).
// =============================================================================
import { useEffect, useRef, useState } from 'react';
import './pump-controls.css';

// Interval options — exact set from the backend contract / v1 select.
const INTERVALS = [
  { key: '15m', label: '15 minut' },
  { key: '20m', label: '20 minut' },
  { key: '30m', label: '30 minut' },
  { key: '1h', label: '1 hodina' },
  { key: '2h', label: '2 hodiny' },
  { key: '3h', label: '3 hodiny' },
  { key: '4h', label: '4 hodiny' },
  { key: '6h', label: '6 hodin' },
  { key: '8h', label: '8 hodin' },
  { key: '12h', label: '12 hodin' },
  { key: '24h', label: '24 hodin' },
];

// Format a millisecond duration as "M min S s" (ported fmtPumpDur).
function fmtDur(ms) {
  if (ms < 0) ms = 0;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return (m > 0 ? `${m} min ` : '') + `${s} s`;
}

export default function PumpControls({ pump, setPump, setConfig, lastResult }) {
  // ---- Locally-controlled config inputs (synced from pump when not focused).
  const [runSeconds, setRunSeconds] = useState('60');
  const [intervalKey, setIntervalKey] = useState('1h');
  const runFocused = useRef(false);
  const ivFocused = useRef(false);

  // ---- Inline save feedback ("Ukládám…" → result). `kind`: '', 'ok', 'error'.
  const [msg, setMsg] = useState({ text: '', kind: '' });

  // ---- 1 Hz ticker so the countdown lines stay live without socket pushes.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ---- Re-sync inputs from incoming pump-status, but never while editing
  //      (mirrors the `document.activeElement !== input` guard in v1).
  useEffect(() => {
    if (!pump) return;
    if (!runFocused.current && typeof pump.runSeconds === 'number') {
      setRunSeconds(String(pump.runSeconds));
    }
    if (!ivFocused.current && pump.intervalKey) {
      setIntervalKey(pump.intervalKey);
    }
  }, [pump]);

  // ---- Reflect config-write results into the inline feedback message.
  useEffect(() => {
    if (!lastResult) return;
    if (lastResult.ok) setMsg({ text: 'Uloženo ✓', kind: 'ok' });
    else setMsg({ text: `Chyba: ${lastResult.error || 'neznámá'}`, kind: 'error' });
  }, [lastResult]);

  // ---- Derived live state -----------------------------------------------------
  const online = pump?.online === true;
  const isOn = pump?.on === true;
  const isStopped = pump?.on === false;
  const enabled = pump?.enabled === true;   // strict: undefined → treated as off-ish

  // Status metric text + colour.
  let stateText = '—';
  let stateColor = 'var(--text-secondary)';
  if (isOn) { stateText = 'BĚŽÍ'; stateColor = 'var(--battery-color)'; }
  else if (isStopped) { stateText = 'STOJÍ'; stateColor = 'var(--text-secondary)'; }

  const tempText =
    typeof pump?.temperature === 'number' ? `${pump.temperature.toFixed(1)} °C` : '— °C';

  // ---- Countdown lines (recomputed every render → updated by the ticker). -----
  let offLine = null;
  if (isOn && pump?.offAt) {
    offLine = `⏱ Vypne za ${fmtDur(pump.offAt - Date.now())}`;
  }
  let nextLine, nextIsOff;
  if (enabled && pump?.nextRunAt) {
    const next = new Date(pump.nextRunAt);
    const hhmm = next.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    nextLine = `↻ Příští spuštění v ${hhmm} (za ${fmtDur(pump.nextRunAt - Date.now())})`;
    nextIsOff = false;
  } else {
    nextLine = '⏸ Automatika vypnutá';
    nextIsOff = true;
  }

  // ---- Actions ----------------------------------------------------------------
  const onManual = (on) => setPump(on);   // emit pump-control

  const onToggleAuto = () => {
    if (!pump) return;
    setConfig({ enabled: !enabled });     // flip the automation master
    setMsg({ text: 'Ukládám…', kind: '' });
  };

  const onSave = () => {
    // Clamp run seconds to the safe 5–600 range (dry-run protection), like v1.
    const secs = Math.max(5, Math.min(600, parseInt(runSeconds, 10) || 60));
    setRunSeconds(String(secs));          // reflect the clamp back into the field
    setConfig({ runSeconds: secs, intervalKey });
    setMsg({ text: 'Ukládám…', kind: '' });
  };

  return (
    <div className="pc-card">
      {/* ---- Tile header: title + subtitle + online indicator ---- */}
      <div className="pc-header">
        <div>
          <div className="pc-title">💧 Čerpadlo · studna → jímka</div>
          <div className="pc-subtitle">Shelly Plus 1 · ovládání přes MQTT</div>
        </div>
        <div className={`pc-indicator ${online ? 'is-online' : ''}`}>
          <span className="pc-dot" />
          <span>{online ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      {/* ===================== 1) STAV & RUČNÍ OVLÁDÁNÍ ===================== */}
      <div className="pc-h">Stav &amp; ruční ovládání</div>
      <div className="pc-metrics">
        <div>
          <div className="pc-metric-label">Stav</div>
          <div className="pc-metric-val" style={{ color: stateColor }}>{stateText}</div>
        </div>
        <div>
          <div className="pc-metric-label">Teplota Shelly</div>
          <div className="pc-metric-val">{tempText}</div>
        </div>
        <div className="pc-actions">
          <button
            className="pc-btn primary"
            onClick={() => onManual(true)}
            disabled={!online}
          >
            Zapnout
          </button>
          <button
            className="pc-btn"
            onClick={() => onManual(false)}
            disabled={!online}
          >
            Vypnout
          </button>
        </div>
      </div>

      {/* Live countdowns — only render lines that apply. */}
      <div className="pc-timing">
        {offLine && <div className="pc-off-line">{offLine}</div>}
        <div className={`pc-next-line ${nextIsOff ? 'is-off' : ''}`}>{nextLine}</div>
      </div>

      <div className="pc-divider" />

      {/* ===================== 2) AUTOMATIKA ===================== */}
      <div className="pc-h">Automatika · zima / údržba</div>

      {/* Real toggle SWITCH for the automation master. */}
      <button
        type="button"
        className={`pc-switch ${enabled ? 'on' : ''}`}
        role="switch"
        aria-checked={enabled}
        onClick={onToggleAuto}
      >
        <span className="pc-switch-track"><span className="pc-switch-thumb" /></span>
        <span className={`pc-switch-label ${enabled ? 'on' : 'off'}`}>
          {enabled ? 'Zapnutá' : 'Vypnutá'}
        </span>
      </button>

      {/* Config fields: doba běhu (s) + interval + Uložit + feedback. */}
      <div className="pc-fields">
        <div className="pc-field">
          <span className="pc-field-label">Doba běhu</span>
          <div className="pc-unit">
            <input
              className="pc-input pc-num"
              type="number"
              min="5"
              max="600"
              step="5"
              value={runSeconds}
              onChange={(e) => setRunSeconds(e.target.value)}
              onFocus={() => { runFocused.current = true; }}
              onBlur={() => { runFocused.current = false; }}
            />
            <span>s</span>
          </div>
        </div>

        <div className="pc-field">
          <span className="pc-field-label">Interval mezi cykly</span>
          <select
            className="pc-input pc-select"
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

        <button className="pc-btn primary pc-save" onClick={onSave}>Uložit</button>
        <span className={`pc-msg ${msg.kind ? `is-${msg.kind}` : ''}`}>{msg.text}</span>
      </div>

      {/* Honest footer note about the Shelly-side behaviour. */}
      <div className="pc-note">
        Nastavení je uložené v&nbsp;Shelly — čerpadlo cykluje i&nbsp;bez Raspberry Pi ·
        po&nbsp;výpadku zůstává vyplé · doba běhu max&nbsp;600&nbsp;s (ochrana proti suchoběhu).
      </div>
    </div>
  );
}
