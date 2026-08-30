// =============================================================================
// Garáž — area page in the Precision language (same skeleton as Zahrada):
//   sc-head → scene-card (GarageScene, `.gscene is-pulse/is-open`)
//           → grid-4: Stav vrat · Poslední impuls · Ovládání · Zařízení.
// Values are live from useGarage(). One click = one 1 s button pulse on the
// opener (open / stop / close — exactly like the remote); the pulse length is
// enforced by the Shelly itself (auto-off), not by this UI.
// =============================================================================
import { useState, useEffect } from 'react';
import useGarage from '../hooks/useGarage.js';
import GarageScene from './garaz/GarageScene.jsx';
import { fmt1 } from '../lib/format.js';
import Dq from '../components/Dq.jsx';
import FreezeTag from '../components/FreezeTag.jsx';
import './garaz/garaz.css';

const PULSE_UI_MS = 1500; // button lock-out while a pulse is in flight

function fmtAgo(ms) {
  if (ms == null || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

function fmtClock(ts) {
  return ts ? new Date(ts).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—:—:—';
}

export default function Garaz({ area }) {
  const { garage, pulse, lastResult } = useGarage();

  // 1 Hz ticker so "před X s" stays live between socket pushes.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState({ text: '', kind: '' });

  useEffect(() => {
    if (!lastResult) return;
    if (lastResult.ok) setMsg({ text: 'Impuls odeslán ✓ · relé sepnuto 1 s', kind: 'ok' });
    else setMsg({ text: `Chyba: ${lastResult.error || 'neznámá'}`, kind: 'error' });
  }, [lastResult]);

  const doPulse = () => {
    if (sending) return;
    setSending(true);
    setMsg({ text: 'Posílám impuls…', kind: '' });
    pulse();
    setTimeout(() => setSending(false), PULSE_UI_MS);
  };

  // ---- Derived live state ---------------------------------------------------
  const online = garage?.online === true;
  const relayOn = garage?.relayOn === true;
  const doorOpen = garage?.doorOpen;           // true | false | null (no sensor)
  const hasSensor = garage?.sensorPresent === true && typeof doorOpen === 'boolean';
  const temp = typeof garage?.temperature === 'number' ? garage.temperature : null;
  const lastAt = garage?.lastPulseAt || null;

  const pillClass = relayOn ? 'run' : !online ? 'bad' : hasSensor ? (doorOpen ? 'warn' : 'idle') : 'idle';
  const pillText = relayOn ? 'Impuls' : !online ? 'Offline' : hasSensor ? (doorOpen ? 'Otevřená' : 'Zavřená') : 'Klid';

  const sceneClass = 'card scene-card gscene'
    + (relayOn ? ' is-pulse' : '')
    + (hasSensor && doorOpen ? ' is-open' : '')
    + (!hasSensor ? ' no-sensor' : '');

  const caption = relayOn ? (
    <span><b style={{ color: 'var(--ok)' }}>Impuls.</b>&ensp;Relé je sepnuté, pohon dostává povel tlačítka.</span>
  ) : !online ? (
    <span><b style={{ color: 'var(--red)' }}>Shelly offline.</b>&ensp;Zařízení není připojené k MQTT brokeru — vrata jdou ovládat jen dálkovým ovladačem.</span>
  ) : hasSensor ? (
    <span><b style={{ color: doorOpen ? 'var(--warn)' : 'var(--tx2)' }}>{doorOpen ? 'Vrata otevřená.' : 'Vrata zavřená.'}</b>&ensp;Poloha z magnetického kontaktu na vstupu SW.</span>
  ) : (
    <span><b style={{ color: 'var(--tx2)' }}>Připraveno.</b>&ensp;Poloha vrat není známá — na vstup SW zatím není zapojený magnetický kontakt.</span>
  );

  return (
    <div style={{ '--acc': area?.accent || 'var(--tx2)', '--acc-soft': area?.accentSoft, '--acc-glow': 'rgba(154,160,166,.35)' }}>
      <div className="sc-head">
        <div>
          <div className="sc-eyebrow">Vrata · Pohon · Shelly</div>
          <h1 className="sc-title">Garáž</h1>
        </div>
        <div className="sc-meta">
          Shelly 1 Gen3 · impuls 1 s · vstup tlačítka pohonu<br />
          <span className="upd">{online ? 'zařízení online' : 'zařízení offline'}</span>
        </div>
      </div>

      {/* GARAGE SCENE */}
      <div className={sceneClass}>
        <FreezeTag />
        <div className="card-h">
          <span className="t">Garážová vrata</span>
          <span className={`pill ${pillClass}`}>{pillText}</span>
          <span className="spacer"></span>
          <Dq />
        </div>
        <div className="card-b scene">
          <GarageScene garage={garage} />
        </div>
        <div className="card-foot">
          {caption}
        </div>
      </div>

      <div className="grid-4">
        <div className="card">
          <div className="card-h"><span className="t">Stav vrat</span><span className="spacer"></span><Dq /></div>
          <div className="card-b">
            <div className="rows v">
              <div className="rw"><span className="k">Shelly 1 Gen3</span><span className="val" style={{ color: online ? 'var(--ok)' : 'var(--red)' }}>{online ? 'Online' : 'Offline'}</span></div>
              <div className="rw"><span className="k">Relé</span><span className="val">{relayOn ? 'Sepnuto (impuls)' : 'Klid'}</span></div>
              <div className="rw"><span className="k">Poloha vrat</span><span className="val">{hasSensor ? (doorOpen ? 'Otevřená' : 'Zavřená') : <>— <small>· bez čidla</small></>}</span></div>
              <div className="rw"><span className="k">Teplota Shelly</span><span className="val">{temp != null ? fmt1(temp) : '—'} °C <small>· limit 70 °C</small></span></div>
            </div>
            <div className="meter"><i style={{ width: `${temp != null ? Math.min(100, Math.round((temp / 70) * 100)) : 0}%` }}></i></div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><span className="t">Poslední impuls</span><span className="spacer"></span><Dq nodata /></div>
          <div className="card-b">
            <div className="count v">{fmtClock(lastAt)}</div>
            <div className="kpi-sub" style={{ marginTop: 12 }}>
              {lastAt ? <>před <b>{fmtAgo(Date.now() - lastAt)}</b> · z dashboardu / API</> : 'zatím žádný impuls z dashboardu'}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><span className="t">Ovládání</span></div>
          <div className="card-b">
            <button
              className={'btn acc ctl gz-pulse' + (sending ? ' is-sent' : '')}
              disabled={!online || sending}
              onClick={doPulse}
            >
              {sending ? 'Impuls…' : '⏻ Otevřít / zavřít vrata'}
            </button>
            <div className={'gz-msg' + (msg.kind ? ` is-${msg.kind}` : '')}>{msg.text}</div>
            <div className="kpi-sub" style={{ marginTop: 10, lineHeight: 1.7 }}>
              Jeden impuls = jedno stisknutí tlačítka pohonu (<b>otevřít · stop · zavřít</b>). Délku impulsu hlídá Shelly (auto-off 1 s).
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><span className="t">Zařízení</span><span className="spacer"></span><span className="dq"><b>Konfigurace</b></span></div>
          <div className="card-b">
            <div className="rows">
              <div className="rw"><span className="k">Model</span><span className="val">Shelly 1 Gen3 <small>· S3SW-001X16EU</small></span></div>
              <div className="rw"><span className="k">Přenos</span><span className="val">MQTT <small>· casa/garage</small></span></div>
              <div className="rw"><span className="k">Impuls</span><span className="val">1 s <small>· auto-off v Shelly</small></span></div>
              <div className="rw"><span className="k">Čidlo polohy</span><span className="val">{hasSensor ? 'SW · magnet' : <>nepřipojeno <small>· plán</small></>}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
