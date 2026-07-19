// =============================================================================
// Elektrárna · Měnič — MultiPlus-II detail (ported from the v1 Inverter tab).
// AC výstup (L1), AC vstup (síť), DC strana, stav/režim + aktivní alarmy.
// =============================================================================
import useTopics, { VEBUS_STATE, VEBUS_MODE, enumLabel } from '../../hooks/useTopics.js';
import { fmtW, fmt1 } from '../../lib/format.js';
import Dq from '../../components/Dq.jsx';

const TOPICS = {
  state: '/vebus/276/State',
  mode: '/vebus/276/Mode',
  outP: '/vebus/276/Ac/Out/P',
  outL1P: '/vebus/276/Ac/Out/L1/P',
  outL1V: '/vebus/276/Ac/Out/L1/V',
  outL1I: '/vebus/276/Ac/Out/L1/I',
  inL1P: '/vebus/276/Ac/ActiveIn/L1/P',
  inL1V: '/vebus/276/Ac/ActiveIn/L1/V',
  inL1I: '/vebus/276/Ac/ActiveIn/L1/I',
  inL1F: '/vebus/276/Ac/ActiveIn/L1/F',
  dcV: '/vebus/276/Dc/0/Voltage',
  dcI: '/vebus/276/Dc/0/Current',
  dcP: '/vebus/276/Dc/0/Power',
  almGridLost: '/vebus/276/Alarms/GridLost',
  almHighTemp: '/vebus/276/Alarms/HighTemperature',
  almOverload: '/vebus/276/Alarms/Overload',
  almLowBatt: '/vebus/276/Alarms/LowBattery',
  almLowSoc: '/vebus/276/Alarms/LowSoc',
  almRipple: '/vebus/276/Alarms/Ripple',
};

const ALARM_LABELS = {
  almGridLost: 'Výpadek sítě', almHighTemp: 'Vysoká teplota', almOverload: 'Přetížení',
  almLowBatt: 'Nízké napětí baterie', almLowSoc: 'Nízké SOC', almRipple: 'Zvlnění DC',
};

export default function MenicSection() {
  const t = useTopics(TOPICS);

  // Victron alarm values: 0 OK, 1 warning, 2 alarm.
  const active = Object.keys(ALARM_LABELS)
    .map((k) => ({ key: k, level: t[k] }))
    .filter((a) => a.level != null && a.level >= 1);

  const running = t.state != null && [3, 4, 5, 8, 9, 10].includes(Math.round(t.state));

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="card kpi">
          <div className="kpi-top"><span className="kpi-l">Výstupní výkon</span><Dq /></div>
          <div className="kpi-v v">{t.outP != null ? Math.round(t.outP).toLocaleString('cs-CZ') : '—'}<small>W</small></div>
          <div className="kpi-sub">MultiPlus-II 48/5000 · L1</div>
        </div>
        <div className="card kpi">
          <div className="kpi-top"><span className="kpi-l">Stav</span><Dq /></div>
          <div className="kpi-v v" style={{ fontSize: 28 }}>{enumLabel(VEBUS_STATE, t.state)}</div>
          <div className="kpi-sub">režim <b>{enumLabel(VEBUS_MODE, t.mode)}</b></div>
        </div>
        <div className="card kpi">
          <div className="kpi-top"><span className="kpi-l">Alarmy měniče</span><Dq /></div>
          <div className="kpi-v v" style={{ color: active.length ? 'var(--red)' : undefined }}>{active.length}</div>
          <div className="kpi-sub">{active.length === 0 ? 'žádný aktivní alarm' : active.map((a) => ALARM_LABELS[a.key]).join(' · ')}</div>
        </div>
      </div>

      <div className="grid-3" style={{ marginTop: 0 }}>
        <div className="card">
          <div className="card-h"><span className="t">AC výstup · dům</span><span className="spacer"></span><Dq /></div>
          <div className="card-b">
            <div className="rows v">
              <div className="rw"><span className="k">Výkon L1</span><span className="val">{t.outL1P != null ? fmtW(t.outL1P) : '—'}</span></div>
              <div className="rw"><span className="k">Napětí</span><span className="val">{t.outL1V != null ? `${fmt1(t.outL1V)} V` : '—'}</span></div>
              <div className="rw"><span className="k">Proud</span><span className="val">{t.outL1I != null ? `${fmt1(t.outL1I)} A` : '—'}</span></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><span className="t">AC vstup · síť</span><span className="spacer"></span><Dq /></div>
          <div className="card-b">
            <div className="rows v">
              <div className="rw"><span className="k">Výkon L1</span><span className="val">{t.inL1P != null ? fmtW(t.inL1P) : '—'}</span></div>
              <div className="rw"><span className="k">Napětí</span><span className="val">{t.inL1V != null ? `${fmt1(t.inL1V)} V` : '—'}</span></div>
              <div className="rw"><span className="k">Proud</span><span className="val">{t.inL1I != null ? `${fmt1(t.inL1I)} A` : '—'}</span></div>
              <div className="rw"><span className="k">Frekvence</span><span className="val">{t.inL1F != null ? `${fmt1(t.inL1F)} Hz` : '—'}</span></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><span className="t">DC strana · baterie</span><span className="spacer"></span><Dq /></div>
          <div className="card-b">
            <div className="rows v">
              <div className="rw"><span className="k">Napětí</span><span className="val">{t.dcV != null ? `${fmt1(t.dcV)} V` : '—'}</span></div>
              <div className="rw"><span className="k">Proud</span><span className="val">{t.dcI != null ? `${fmt1(t.dcI)} A` : '—'}</span></div>
              <div className="rw"><span className="k">Výkon</span><span className="val">{t.dcP != null ? fmtW(t.dcP) : '—'}</span></div>
              <div className="rw"><span className="k">Chod</span><span className="val" style={{ color: running ? 'var(--ok)' : 'var(--tx2)' }}>{running ? 'V provozu' : 'Mimo provoz'}</span></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
