// =============================================================================
// Elektrárna metric cards — the stat tiles below the energy-flow diagram.
//
// Ported from the v1 Overview tab's SOLAR / GRID / HOME / BATTERY stats-cards,
// the "TODAY'S SUMMARY" card and the "SYSTEM ALARMS" panel. UI is in Czech:
//   Solár · Síť · Dům · Baterie · Dnešní souhrn · Systémové alarmy
//
// Everything is driven by the live `data` snapshot from useVictron() plus an
// `alarms` feed (the optional system-notification stream, owned by the page).
// These are presentational components only — no socket I/O lives here.
//
// Styling reuses the v1 stats-card look (see elektrarna.css), built entirely on
// the shared design tokens so all three themes (dark / light / spacex) apply.
// =============================================================================
import './elektrarna.css';

// ---- Small formatting helpers ----------------------------------------------
// Whole watts with a unit, or "—" when the value is missing (null/undefined).
function fmtW(w) {
  return w == null ? '—' : `${Math.round(w)} W`;
}
// One-decimal value with a unit, or "—" when missing.
function fmt1(v, unit) {
  return v == null ? '—' : `${v.toFixed(1)} ${unit}`;
}
// A daily-energy string field (already formatted by the backend) + unit suffix.
function fmtKwh(s) {
  return s == null ? '—' : `${s} kWh`;
}

// One label/value row inside a card. `tone` colours the value (solar/home/…).
function Row({ label, value, tone }) {
  return (
    <div className="ek-row">
      <span className="ek-row-label">{label}</span>
      <span className={`ek-row-value${tone ? ` ${tone}` : ''}`}>{value}</span>
    </div>
  );
}

// A titled card shell. `tone` colours the title (matches the v1 stats-title.*).
function Card({ icon, title, tone, children }) {
  return (
    <div className="ek-card">
      <div className="ek-card-head">
        <span className="ek-card-icon" aria-hidden>{icon}</span>
        <span className={`ek-card-title${tone ? ` ${tone}` : ''}`}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ---- SOLÁR ------------------------------------------------------------------
export function SolarCard({ data }) {
  const { solarW = 0 } = data || {};
  return (
    <Card icon="☀" title="Solár" tone="solar">
      <Row label="Aktuální výkon" value={fmtW(solarW)} tone="solar" />
      {/* Dnešní výroba (today's yield) came from a separate MPPT history topic
          in v1 that isn't part of the v2 backend contract yet → shown as "—"
          until those topics are exposed in a future phase. */}
      <Row label="Dnešní výroba" value="—" />
    </Card>
  );
}

// ---- SÍŤ (Grid) -------------------------------------------------------------
export function GridCard({ data }) {
  const { gridW = null, daily } = data || {};
  const hasGrid = typeof gridW === 'number';
  // Sign convention: + import / − export. Direction word mirrors the diagram.
  const dirWord = !hasGrid ? 'Odpojeno' : gridW > 10 ? 'Odběr' : gridW < -10 ? 'Dodávka' : 'Klid';
  return (
    <Card icon="⚡" title="Síť" tone="grid">
      <Row label="Aktuální výkon" value={hasGrid ? fmtW(gridW) : '—'} tone="grid" />
      <Row label="Stav" value={dirWord} />
      <Row label="Dnes odebráno" value={fmtKwh(daily?.gridImportKwh)} />
      <Row label="Dnes dodáno" value={fmtKwh(daily?.gridExportKwh)} tone="positive" />
    </Card>
  );
}

// ---- DŮM (Home) -------------------------------------------------------------
export function HomeCard({ data }) {
  const { homeW = 0, daily } = data || {};
  return (
    <Card icon="🏠" title="Dům" tone="home">
      <Row label="Aktuální spotřeba" value={fmtW(homeW)} tone="home" />
      <Row label="Dnes spotřebováno" value={fmtKwh(daily?.homeConsumedKwh)} />
      <Row label="Soběstačnost" value={daily?.selfSufficiency != null ? `${daily.selfSufficiency} %` : '—'} tone="positive" />
      <Row label="Vlastní spotřeba" value={daily?.selfConsumption != null ? `${daily.selfConsumption} %` : '—'} />
    </Card>
  );
}

// ---- BATERIE (Battery) ------------------------------------------------------
export function BatteryCard({ data }) {
  const { batterySoc = null, batteryW = 0, batteryV = null, batteryTemp = null } = data || {};
  const status = batteryW > 50 ? 'Nabíjí' : batteryW < -50 ? 'Vybíjí' : 'Klid';
  return (
    <Card icon="🔋" title="Baterie" tone="battery">
      <Row label="Stav nabití" value={batterySoc != null ? `${Math.round(batterySoc)} %` : '—'} tone="battery" />
      <Row label="Výkon" value={fmtW(batteryW)} />
      <Row label="Napětí" value={fmt1(batteryV, 'V')} />
      <Row label="Teplota" value={batteryTemp != null ? `${Math.round(batteryTemp)} °C` : '—'} />
      <Row label="Stav" value={status} />
    </Card>
  );
}

// ---- DNEŠNÍ SOUHRN (Today's summary) ---------------------------------------
export function SummaryCard({ data }) {
  const daily = data?.daily;
  return (
    <Card icon="📊" title="Dnešní souhrn" tone="summary">
      <Row label="Spotřeba domu" value={fmtKwh(daily?.homeConsumedKwh)} tone="home" />
      <Row label="Odběr ze sítě" value={fmtKwh(daily?.gridImportKwh)} tone="grid" />
      <Row label="Dodávka do sítě" value={fmtKwh(daily?.gridExportKwh)} tone="positive" />
      <Row label="Soběstačnost" value={daily?.selfSufficiency != null ? `${daily.selfSufficiency} %` : '—'} tone="positive" />
    </Card>
  );
}

// ---- SYSTÉMOVÉ ALARMY (System alarms) --------------------------------------
// Driven by the optional `system-notification` feed (newest first). When the
// feed is empty we show a calm "all OK" placeholder, matching v1's default.
export function AlarmsCard({ alarms = [] }) {
  const hasAlarms = alarms.length > 0;
  return (
    <div className={`ek-card ek-alarms${hasAlarms ? ' has-alarms' : ''}`}>
      <div className="ek-card-head">
        <span className="ek-card-icon" aria-hidden>⚠️</span>
        <span className="ek-card-title">Systémové alarmy</span>
        <span className="ek-alarms-badge">{alarms.length}</span>
      </div>

      {!hasAlarms ? (
        <div className="ek-alarms-ok">
          <span className="ek-alarms-ok-dot" />
          Vše v pořádku — žádné aktivní alarmy.
        </div>
      ) : (
        <ul className="ek-alarms-list">
          {alarms.map((a, i) => (
            <li key={a.id ?? i} className={`ek-alarm sev-${a.severity || 'info'}`}>
              <span className="ek-alarm-dot" />
              <div className="ek-alarm-body">
                <div className="ek-alarm-title">{a.title || 'Upozornění'}</div>
                {a.message && <div className="ek-alarm-msg">{a.message}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
