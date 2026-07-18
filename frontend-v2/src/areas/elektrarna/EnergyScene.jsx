// =============================================================================
// EnergyScene — the Elektrárna flow diagram, a 1:1 port of the design-B mockup
// (design-b-precision.html, viewBox 0 0 1040 434). Geometry, classes and text
// placement are VERBATIM from the mockup; only the numbers are live:
//
//   Střecha (4,8 kWp · MPPT 278) ─┐
//                                 ├─→ Měnič (MultiPlus-II) ─→ Dům
//   Terasa  (2,4 kWp · MPPT 279) ─┘         │ ↕                └⋯ Síť (pohotovost)
//                                        Baterie (SOC tank)
//
// A ribbon is "live" (base + core + travelling pulse) when its flow exceeds
// the 10 W threshold, otherwise it renders as the mockup's quiet dotted idle
// line. The battery ribbon reverses its pulse when discharging; the grid
// branch lights up on import/export with matching direction.
// =============================================================================
import { fmtW, fmtSignedW, fmt1 } from '../../lib/format.js';

const THR = 10;              // W — below this a flow is considered idle
const ROOF_WP = 4800;        // installed peak, Střecha string
const TERR_WP = 2400;        // installed peak, Terasa string

// One ribbon = the mockup's stacked base/core/pulse trio on shared geometry.
function Ribbon({ d, dur, delay, reverse, active }) {
  if (!active) return <path className="fl-idle" d={d} />;
  return (
    <g>
      <path className="fl-base" d={d} />
      <path className="fl-core" d={d} />
      <path
        className="fl-pulse"
        d={d}
        pathLength="100"
        style={{
          '--dur': dur,
          animationDelay: delay,
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      />
    </g>
  );
}

// Sun rays icon group — verbatim path data from the mockup.
function SunIcon({ x, y }) {
  return (
    <g className="node-ico" transform={`translate(${x} ${y})`}>
      <circle r="6.5" />
      <path d="M0 -11v-3M0 11v3M11 0h3M-11 0h-3M7.8 -7.8l2.1-2.1M-7.8 7.8l-2.1 2.1M7.8 7.8l2.1 2.1M-7.8 -7.8l-2.1-2.1" />
    </g>
  );
}

export default function EnergyScene({ data }) {
  const {
    solar1W = 0, solar2W = 0, homeW = 0, gridW = null,
    batterySoc = null, batteryW = 0, batteryV = null, batteryA = null,
    batteryTemp = null, modulesOnline = null,
  } = data || {};

  const roofOn = solar1W > THR;
  const terrOn = solar2W > THR;
  const homeOn = homeW > THR;
  const battCharging = batteryW > THR;
  const battDischarging = batteryW < -THR;
  const battOn = battCharging || battDischarging;
  const hasGrid = typeof gridW === 'number';
  const gridImporting = hasGrid && gridW > THR;
  const gridExporting = hasGrid && gridW < -THR;
  const gridOn = gridImporting || gridExporting;

  const roofPct = solar1W > 0 ? Math.round((solar1W / ROOF_WP) * 100) : 0;
  const terrPct = solar2W > 0 ? Math.round((solar2W / TERR_WP) * 100) : 0;

  const socPct = batterySoc != null ? Math.round(batterySoc) : null;
  // SOC tank inner bar: full inner width is 122 (ring 130 − 2×4 inset).
  const socW = socPct != null ? (122 * socPct) / 100 : 0;

  const battWord = battCharging ? 'nabíjení' : battDischarging ? 'vybíjení' : 'klid';
  const battSub = [
    batteryV != null ? `${fmt1(batteryV)} V` : '—',
    batteryA != null ? `${batteryA > 0 ? '+' : batteryA < 0 ? '−' : ''}${fmt1(Math.abs(batteryA))} A` : '—',
    batteryTemp != null ? `${Math.round(batteryTemp)} °C` : '—',
    battWord,
  ].join(' · ');

  const gridLabel = !hasGrid ? 'Síť · Odpojeno'
    : gridImporting ? 'Síť · Odběr'
    : gridExporting ? 'Síť · Dodávka'
    : 'Síť · Pohotovost';
  const gridSub = !hasGrid ? 'bez měření sítě'
    : gridOn ? (gridImporting ? 'odběr ze sítě' : 'přetok do sítě')
    : 'žádný odběr ani přetok';

  return (
    <svg viewBox="0 0 1040 434" role="img" aria-label="Diagram toku energie: solární panely, měnič, dům, baterie a síť">
      <defs>
        <linearGradient id="socGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffb547" stopOpacity=".75" />
          <stop offset="1" stopColor="#ffb547" stopOpacity=".45" />
        </linearGradient>
      </defs>

      {/* ribbons */}
      <g>
        {/* Střecha → měnič */}
        <Ribbon d="M 186 95 C 330 95 365 200 478 200" dur="3.2s" active={roofOn} />
        {/* Terasa → měnič */}
        <Ribbon d="M 186 305 C 330 305 365 200 478 200" dur="4.6s" delay="-1.7s" active={terrOn} />
        {/* měnič → dům */}
        <Ribbon d="M 562 200 C 690 200 720 95 854 95" dur="3.9s" delay="-.9s" active={homeOn} />
        {/* měnič ↔ baterie (pulse reversed while discharging) */}
        <Ribbon d="M 520 242 L 520 334" dur="4.4s" delay="-2.6s" reverse={battDischarging} active={battOn} />
        {/* měnič ↔ síť — pohotovost = klidová tečkovaná linka */}
        <Ribbon d="M 562 200 C 690 200 720 305 854 305" dur="4.8s" delay="-1.2s" reverse={gridImporting} active={gridOn} />
      </g>

      {/* SOLÁR · STŘECHA */}
      <g className="v">
        <text className="fx-label" x="150" y="40" textAnchor="middle">Střecha · 4,8 kWp</text>
        <circle className="node-ring" cx="150" cy="95" r="30" />
        <SunIcon x={150} y={95} />
        <text className="fx-value" x="150" y="160" textAnchor="middle">{fmtW(solar1W)}</text>
        <text className="fx-sub" x="150" y="180" textAnchor="middle">{roofPct} % výkonu · MPPT 278</text>
      </g>

      {/* SOLÁR · TERASA */}
      <g className="v">
        <text className="fx-label" x="150" y="250" textAnchor="middle">Terasa · 2,4 kWp</text>
        <circle className="node-ring" cx="150" cy="305" r="30" />
        <SunIcon x={150} y={305} />
        <text className="fx-value" x="150" y="370" textAnchor="middle">{fmtW(solar2W)}</text>
        <text className="fx-sub" x="150" y="390" textAnchor="middle">{terrPct} % výkonu · MPPT 279</text>
      </g>

      {/* MĚNIČ (hub) */}
      <g className="v">
        <text className="fx-label" x="520" y="140" textAnchor="middle">Měnič · MultiPlus-II</text>
        <circle className="node-ring hub" cx="520" cy="200" r="40" />
        <path className="node-ico" d="M504 200 C509 187 515 187 520 200 C525 213 531 213 536 200" />
      </g>
      {battOn && (
        <text className="fx-sub on v" x="534" y="296" textAnchor="start">{fmtSignedW(batteryW)}</text>
      )}

      {/* DŮM */}
      <g className="v">
        <text className="fx-label" x="890" y="40" textAnchor="middle">Dům · Spotřeba</text>
        <circle className="node-ring" cx="890" cy="95" r="30" />
        <path className="node-ico" d="M879 96l11-8.5L901 96M881.5 94v10.5h17V94" />
        <text className="fx-value" x="890" y="160" textAnchor="middle">{fmtW(homeW)}</text>
        <text className="fx-sub" x="890" y="180" textAnchor="middle">L1 · vebus 276</text>
      </g>

      {/* SÍŤ */}
      <g className="v">
        <text className="fx-label" x="890" y="250" textAnchor="middle">{gridLabel}</text>
        <circle className="node-ring" cx="890" cy="305" r="30" />
        <g className={'node-ico' + (gridOn ? '' : ' mut')} transform="translate(890 305)">
          <path d="M-7 11 -2 -11h4L7 11M-7 11h14M-4.4 2h8.8M-2.9 -4.5h5.8" />
        </g>
        <text className="fx-value" x="890" y="370" textAnchor="middle" style={gridOn ? undefined : { fill: 'var(--tx2)' }}>
          {hasGrid ? fmtW(Math.abs(gridW)) : '—'}
        </text>
        <text className="fx-sub" x="890" y="390" textAnchor="middle">{gridSub}</text>
      </g>

      {/* BATERIE */}
      <g className="v">
        <rect className="node-ring" x="455" y="338" width="130" height="44" rx="9" />
        <rect x="587" y="352" width="6" height="16" rx="2" fill="none" stroke="var(--line2)" />
        {socPct != null && (
          <rect x="459" y="342" width={socW.toFixed(1)} height="36" rx="6" fill="url(#socGrad)" />
        )}
        <text
          x="520" y="366" textAnchor="middle"
          style={{ fontFamily: 'var(--f-body)', fontSize: 17, fontWeight: 600 }}
          fill={socPct != null && socPct > 45 ? '#0a0c0f' : 'var(--tx)'}
        >
          {socPct != null ? `${socPct} %` : '—'}
        </text>
        <text className="fx-label" x="520" y="406" textAnchor="middle">
          Baterie{modulesOnline != null ? ` · ${modulesOnline} packy online` : ''}
        </text>
        <text className="fx-sub" x="520" y="424" textAnchor="middle">{battSub}</text>
      </g>
    </svg>
  );
}
