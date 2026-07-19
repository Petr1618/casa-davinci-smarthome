// =============================================================================
// Elektrárna · Solár — per-string MPPT detail (ported from the v1 Solar tab).
// One card per string: power + utilisation meter, PV voltage, DC current,
// MPPT state, today's yield & peak, lifetime yield. Topics match v1 exactly.
// =============================================================================
import useTopics, { MPPT_STATE, enumLabel } from '../../hooks/useTopics.js';
import { fmtW, fmt1 } from '../../lib/format.js';
import Dq from '../../components/Dq.jsx';

const TOPICS = {
  s1Power: '/solarcharger/278/Yield/Power',
  s1PvV: '/solarcharger/278/Pv/V',
  s1DcI: '/solarcharger/278/Dc/0/Current',
  s1State: '/solarcharger/278/State',
  s1Yield: '/solarcharger/278/History/Daily/0/Yield',
  s1Max: '/solarcharger/278/History/Daily/0/MaxPower',
  s1User: '/solarcharger/278/Yield/User',
  s2Power: '/solarcharger/279/Yield/Power',
  s2PvV: '/solarcharger/279/Pv/V',
  s2DcI: '/solarcharger/279/Dc/0/Current',
  s2State: '/solarcharger/279/State',
  s2Yield: '/solarcharger/279/History/Daily/0/Yield',
  s2Max: '/solarcharger/279/History/Daily/0/MaxPower',
  s2User: '/solarcharger/279/Yield/User',
};

function StringCard({ title, sub, wp, power, pvV, dcI, state, yieldKwh, maxW, userKwh }) {
  const pct = power != null ? Math.min(100, Math.round((power / wp) * 100)) : 0;
  const running = state != null && Math.round(state) !== 0;
  return (
    <div className="card">
      <div className="card-h">
        <span className="t">{title}</span>
        <span className={'pill ' + (running ? 'run' : 'idle')}>{enumLabel(MPPT_STATE, state)}</span>
        <span className="spacer"></span>
        <Dq />
      </div>
      <div className="card-b">
        <div className="kpi-v v" style={{ marginBottom: 6 }}>{power != null ? Math.round(power).toLocaleString('cs-CZ') : '—'}<small>W</small></div>
        <div className="kpi-sub">{pct} % z {fmt1(wp / 1000)} kWp</div>
        <div className="meter" style={{ margin: '12px 0 6px' }}><i style={{ width: `${pct}%` }}></i></div>
        <div className="rows v" style={{ marginTop: 10 }}>
          <div className="rw"><span className="k">Napětí stringu</span><span className="val">{pvV != null ? `${fmt1(pvV)} V` : '—'}</span></div>
          <div className="rw"><span className="k">Proud do baterie</span><span className="val">{dcI != null ? `${fmt1(dcI)} A` : '—'}</span></div>
          <div className="rw"><span className="k">Dnešní výroba</span><span className="val">{yieldKwh != null ? `${fmt1(yieldKwh)} kWh` : '—'}</span></div>
          <div className="rw"><span className="k">Dnešní špička</span><span className="val">{maxW != null ? fmtW(maxW) : '—'}</span></div>
          <div className="rw"><span className="k">Celkem od instalace</span><span className="val">{userKwh != null ? `${Math.round(userKwh).toLocaleString('cs-CZ')} kWh` : '—'}</span></div>
        </div>
      </div>
      <div className="card-foot"><span>{sub}</span></div>
    </div>
  );
}

export default function SolarSection() {
  const t = useTopics(TOPICS);
  const total = (t.s1Power ?? 0) + (t.s2Power ?? 0);
  const totalYield = t.s1Yield != null && t.s2Yield != null ? t.s1Yield + t.s2Yield : null;

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="card kpi">
          <div className="kpi-top"><span className="kpi-l">Výroba teď · oba stringy</span><Dq /></div>
          <div className="kpi-v v">{Math.round(total).toLocaleString('cs-CZ')}<small>W</small></div>
          <div className="kpi-sub">{Math.round((total / 7200) * 100)} % instalovaného výkonu 7,2 kWp</div>
        </div>
        <div className="card kpi">
          <div className="kpi-top"><span className="kpi-l">Dnešní výroba celkem</span><Dq /></div>
          <div className="kpi-v v">{totalYield != null ? fmt1(totalYield) : '—'}<small>kWh</small></div>
          <div className="kpi-sub">součet obou MPPT regulátorů</div>
        </div>
      </div>

      <div className="grid-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 0 }}>
        <StringCard
          title="Střecha · 4,8 kWp" sub="SmartSolar MPPT VE.Can 250/85 · instance 278" wp={4800}
          power={t.s1Power} pvV={t.s1PvV} dcI={t.s1DcI} state={t.s1State}
          yieldKwh={t.s1Yield} maxW={t.s1Max} userKwh={t.s1User}
        />
        <StringCard
          title="Terasa · 2,4 kWp" sub="SmartSolar MPPT 150/45 · instance 279" wp={2400}
          power={t.s2Power} pvV={t.s2PvV} dcI={t.s2DcI} state={t.s2State}
          yieldKwh={t.s2Yield} maxW={t.s2Max} userKwh={t.s2User}
        />
      </div>
    </>
  );
}
