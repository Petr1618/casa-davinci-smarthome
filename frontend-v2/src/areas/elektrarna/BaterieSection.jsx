// =============================================================================
// Elektrárna · Baterie — Seplos bank detail (ported from the v1 Battery tab).
// SOC/SOH, DC měření, kapacita a energie, extrémy článků (min/max V + teploty
// s ID článku), limity BMS a packy online. 3× Mason-280 · 840 Ah LiFePO4.
// =============================================================================
import useTopics from '../../hooks/useTopics.js';
import { fmt1, fmtSignedW } from '../../lib/format.js';
import Dq from '../../components/Dq.jsx';

const TOPICS = {
  soc: '/battery/512/Soc',
  soh: '/battery/512/Soh',
  power: '/battery/512/Dc/0/Power',
  volt: '/battery/512/Dc/0/Voltage',
  curr: '/battery/512/Dc/0/Current',
  temp: '/battery/512/Dc/0/Temperature',
  capacity: '/battery/512/Capacity',
  installed: '/battery/512/InstalledCapacity',
  charged: '/battery/512/History/ChargedEnergy',
  discharged: '/battery/512/History/DischargedEnergy',
  minCellV: '/battery/512/System/MinCellVoltage',
  maxCellV: '/battery/512/System/MaxCellVoltage',
  minCellVId: '/battery/512/System/MinVoltageCellId',
  maxCellVId: '/battery/512/System/MaxVoltageCellId',
  minCellT: '/battery/512/System/MinCellTemperature',
  maxCellT: '/battery/512/System/MaxCellTemperature',
  online: '/battery/512/System/NrOfModulesOnline',
  offline: '/battery/512/System/NrOfModulesOffline',
  maxChargeI: '/battery/512/Info/MaxChargeCurrent',
  maxDischargeI: '/battery/512/Info/MaxDischargeCurrent',
  maxChargeV: '/battery/512/Info/MaxChargeVoltage',
};

// Victron cell ids arrive as numbers ("305" = pack 3, cell 5) or strings.
const cellId = (v) => (v == null ? '' : ` · čl. ${Math.round(v)}`);

export default function BaterieSection() {
  const t = useTopics(TOPICS);
  const socPct = t.soc != null ? Math.round(t.soc) : null;
  const word = t.power > 10 ? 'nabíjení' : t.power < -10 ? 'vybíjení' : 'klid';
  const spreadMv = t.minCellV != null && t.maxCellV != null
    ? Math.round((t.maxCellV - t.minCellV) * 1000) : null;

  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="card kpi">
          <div className="kpi-top"><span className="kpi-l">Stav nabití</span><Dq /></div>
          <div className="kpi-v v">{socPct ?? '—'}<small>%</small></div>
          <div className="meter" style={{ marginTop: 4 }}><i style={{ width: `${socPct ?? 0}%` }}></i></div>
        </div>
        <div className="card kpi">
          <div className="kpi-top"><span className="kpi-l">Výkon</span><Dq /></div>
          <div className="kpi-v v" style={{ fontSize: 30 }}>{fmtSignedW(t.power)}</div>
          <div className="kpi-sub">{word}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-top"><span className="kpi-l">Zdraví · SOH</span><Dq /></div>
          <div className="kpi-v v">{t.soh != null ? Math.round(t.soh) : '—'}<small>%</small></div>
          <div className="kpi-sub">3× Seplos Mason-280 · LiFePO4</div>
        </div>
        <div className="card kpi">
          <div className="kpi-top"><span className="kpi-l">Packy online</span><Dq /></div>
          <div className="kpi-v v">{t.online != null ? Math.round(t.online) : '—'}<small>/ 3</small></div>
          <div className="kpi-sub" style={t.offline > 0 ? { color: 'var(--red)' } : undefined}>
            {t.offline > 0 ? `${Math.round(t.offline)} offline!` : 'všechny packy komunikují'}
          </div>
        </div>
      </div>

      <div className="grid-3" style={{ marginTop: 0 }}>
        <div className="card">
          <div className="card-h"><span className="t">Měření DC</span><span className="spacer"></span><Dq /></div>
          <div className="card-b">
            <div className="rows v">
              <div className="rw"><span className="k">Napětí</span><span className="val">{t.volt != null ? `${fmt1(t.volt)} V` : '—'}</span></div>
              <div className="rw"><span className="k">Proud</span><span className="val">{t.curr != null ? `${fmt1(t.curr)} A` : '—'}</span></div>
              <div className="rw"><span className="k">Teplota</span><span className="val">{t.temp != null ? `${Math.round(t.temp)} °C` : '—'}</span></div>
              <div className="rw"><span className="k">Kapacita zbývající</span><span className="val">{t.capacity != null ? `${Math.round(t.capacity)} Ah` : '—'} <small>/ {t.installed != null ? `${Math.round(t.installed)} Ah` : '840 Ah'}</small></span></div>
              <div className="rw"><span className="k">Nabito · vybito celkem</span><span className="val">{t.charged != null ? `${Math.round(t.charged).toLocaleString('cs-CZ')}` : '—'} / {t.discharged != null ? `${Math.round(t.discharged).toLocaleString('cs-CZ')}` : '—'} <small>kWh</small></span></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><span className="t">Články · extrémy</span><span className="spacer"></span><Dq /></div>
          <div className="card-b">
            <div className="rows v">
              <div className="rw"><span className="k">Min. napětí článku</span><span className="val">{t.minCellV != null ? `${t.minCellV.toLocaleString('cs-CZ', {minimumFractionDigits: 3, maximumFractionDigits: 3})} V` : '—'}<small>{cellId(t.minCellVId)}</small></span></div>
              <div className="rw"><span className="k">Max. napětí článku</span><span className="val">{t.maxCellV != null ? `${t.maxCellV.toLocaleString('cs-CZ', {minimumFractionDigits: 3, maximumFractionDigits: 3})} V` : '—'}<small>{cellId(t.maxCellVId)}</small></span></div>
              <div className="rw"><span className="k">Rozvážení</span><span className="val" style={spreadMv > 50 ? { color: 'var(--warn)' } : undefined}>{spreadMv != null ? `${spreadMv} mV` : '—'}</span></div>
              <div className="rw"><span className="k">Teplota min · max</span><span className="val">{t.minCellT != null ? `${fmt1(t.minCellT)}` : '—'} · {t.maxCellT != null ? `${fmt1(t.maxCellT)}` : '—'} <small>°C</small></span></div>
            </div>
          </div>
          <div className="card-foot"><span>detail po článcích (RS485 diagnostika) připravujeme</span></div>
        </div>

        <div className="card">
          <div className="card-h"><span className="t">Limity BMS</span><span className="spacer"></span><Dq /></div>
          <div className="card-b">
            <div className="rows v">
              <div className="rw"><span className="k">Max. nabíjecí proud</span><span className="val">{t.maxChargeI != null ? `${Math.round(t.maxChargeI)} A` : '—'}</span></div>
              <div className="rw"><span className="k">Max. vybíjecí proud</span><span className="val">{t.maxDischargeI != null ? `${Math.round(t.maxDischargeI)} A` : '—'}</span></div>
              <div className="rw"><span className="k">Max. nabíjecí napětí</span><span className="val">{t.maxChargeV != null ? `${fmt1(t.maxChargeV)} V` : '—'}</span></div>
              <div className="rw"><span className="k">Ochrana nabíjení</span><span className="val" style={{ color: t.maxChargeI === 0 ? 'var(--red)' : 'var(--ok)' }}>{t.maxChargeI === 0 ? 'BMS blokuje nabíjení' : 'neaktivní'}</span></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
