// =============================================================================
// EnergyFlow — the live energy-flow diagram for the Elektrárna area.
//
// This component owns ZERO animation logic. It is a pure ADAPTER: it takes the
// live Victron snapshot (from useVictron) and translates it into the generic
// `nodes` / `pipes` props that the shared <FlowScene> engine renders + animates.
//
// Layout (viewBox 0 0 600 400), mirroring the v1 Overview diamond:
//
//                       ☀ Solár  (top-center, 300,72)
//                          │
//        Síť ──────── (central junction 300,200) ──────── Dům
//      (90,260)                  │                      (510,200)
//                          🔋 Baterie (300,330)
//
// FLOW DIRECTION LOGIC — ported 1:1 from v1's updateFlows():
//   threshold = 10 W (ignore noise around zero)
//   · solar→home    : solar producing AND home consuming
//   · solar→battery : solar producing AND solar > home (surplus charges battery)
//   · battery→home  : battery discharging (W < −thr) AND home consuming
//   · grid→home     : grid importing  (W > +thr)            → pipe dir +1
//     home→grid     : grid exporting  (W < −thr)            → pipe dir −1 (reversed)
//   · grid→battery  : grid importing AND battery charging
//
// `dir` on a pipe tells FlowScene which way the droplets travel along the path
// `d` (1 = from path start to end, −1 = reversed). We author each path so its
// start is the SOURCE node for the natural/positive direction, then flip `dir`
// for the grid-export case (where the home is exporting back to the grid).
//
// Each active pipe carries a small kW/W label placed near its midpoint, matching
// the v1 power labels on the flow paths.
// =============================================================================
import FlowScene from '../../components/FlowScene/FlowScene.jsx';

// ---- Node centres (viewBox units) — keep pipe paths in sync with these. -----
const POS = {
  solar: { x: 300, y: 72 },
  junction: { x: 300, y: 200 }, // invisible meeting point of the pipes
  grid: { x: 90, y: 260 },
  home: { x: 510, y: 200 },
  battery: { x: 300, y: 330 },
};

const THRESHOLD_W = 10; // below this (abs) we treat power as "no flow"

// Format a wattage for a node value: kW with 1 decimal once ≥ 1 kW context.
// Energy nodes always show kW (e.g. "1.2"), so the caller pairs this with unit.
function toKw(watts) {
  return (Math.abs(watts) / 1000).toFixed(1);
}

// Format a wattage for a pipe LABEL: "850 W" under 1 kW, "1.2 kW" above.
function fmtPower(watts) {
  const w = Math.abs(watts);
  if (w >= 1000) return `${(w / 1000).toFixed(1)} kW`;
  return `${Math.round(w)} W`;
}

export default function EnergyFlow({ data }) {
  const {
    solarW = 0,
    homeW = 0,
    gridW = null, // null = no grid meter on this (off-grid) site
    batterySoc = null,
    batteryW = 0,
  } = data || {};

  // ---- Derive boolean flow states (mirrors v1 updateFlows). -----------------
  const hasGrid = typeof gridW === 'number';
  const solarProducing = solarW > THRESHOLD_W;
  const batteryCharging = batteryW > THRESHOLD_W;
  const batteryDischarging = batteryW < -THRESHOLD_W;
  const homeConsuming = homeW > THRESHOLD_W;
  const gridImporting = hasGrid && gridW > THRESHOLD_W;
  const gridExporting = hasGrid && gridW < -THRESHOLD_W;

  const solarToHome = solarProducing && homeConsuming;
  const solarToBattery = solarProducing && solarW > homeW; // surplus → battery
  const batteryToHome = batteryDischarging && homeConsuming;
  const gridActive = gridImporting || gridExporting;
  const gridToBattery = gridImporting && batteryCharging;

  // ---- Battery sub-label (charging / discharging / idle). -------------------
  let batterySub = 'klid';
  if (batteryCharging) batterySub = 'nabíjí';
  else if (batteryDischarging) batterySub = 'vybíjí';

  // ---- NODES ----------------------------------------------------------------
  // value is a PRE-FORMATTED string; FlowScene appends `unit`. `active` pulses
  // a node when it's participating in any live flow (mirrors v1 circle pulse).
  const nodes = [
    {
      id: 'solar',
      label: 'Solár',
      value: toKw(solarW),
      unit: 'kW',
      x: POS.solar.x,
      y: POS.solar.y,
      color: 'var(--solar-color)',
      icon: '☀',
      active: solarToHome || solarToBattery,
    },
    {
      id: 'home',
      label: 'Dům',
      value: toKw(homeW),
      unit: 'kW',
      x: POS.home.x,
      y: POS.home.y,
      color: 'var(--home-color)',
      icon: '🏠',
      active: solarToHome || batteryToHome || gridImporting,
    },
    {
      id: 'battery',
      label: 'Baterie',
      value: batterySoc != null ? String(Math.round(batterySoc)) : '—',
      unit: batterySoc != null ? '%' : '',
      sub: batterySub,
      x: POS.battery.x,
      y: POS.battery.y,
      color: 'var(--battery-color)',
      icon: '🔋',
      active: solarToBattery || batteryToHome || gridToBattery,
    },
    {
      id: 'grid',
      label: 'Síť',
      // Off-grid site → show an em dash instead of a fake 0.
      value: hasGrid ? toKw(gridW) : '—',
      unit: hasGrid ? 'kW' : '',
      sub: hasGrid ? (gridImporting ? 'odběr' : gridExporting ? 'dodávka' : 'klid') : 'odpojeno',
      x: POS.grid.x,
      y: POS.grid.y,
      color: 'var(--grid-color)',
      icon: '⚡',
      active: gridActive,
    },
  ];

  // ---- PIPES ----------------------------------------------------------------
  // Each path is authored so its START is the natural source. We compute the
  // power magnitude carried by each active pipe for its label.
  const solarHomePower = Math.min(solarW, homeW); // solar can't feed home more than home draws
  const pipes = [
    // Solár → junction → Dům (solar feeds the house).
    {
      id: 'solar-home',
      d: `M ${POS.solar.x} 118 L ${POS.solar.x} ${POS.junction.y} L ${POS.home.x - 46} ${POS.home.y}`,
      color: 'var(--solar-color)',
      active: solarToHome,
      dir: 1,
      label: solarToHome ? fmtPower(solarHomePower) : null,
      labelXY: [410, 188],
    },
    // Solár → junction → Baterie (surplus charges battery).
    {
      id: 'solar-battery',
      d: `M ${POS.solar.x} 118 L ${POS.battery.x} ${POS.battery.y - 46}`,
      color: 'var(--solar-color)',
      active: solarToBattery,
      dir: 1,
      label: solarToBattery ? fmtPower(batteryCharging ? batteryW : solarW - homeW) : null,
      labelXY: [318, 200],
    },
    // Baterie → junction → Dům (battery discharges to the house).
    {
      id: 'battery-home',
      d: `M ${POS.battery.x} ${POS.battery.y - 46} L ${POS.battery.x} ${POS.junction.y} L ${POS.home.x - 46} ${POS.home.y}`,
      color: 'var(--battery-color)',
      active: batteryToHome,
      dir: 1,
      label: batteryToHome ? fmtPower(batteryW) : null,
      labelXY: [410, 268],
    },
    // Síť ↔ Dům. Path runs grid → home; for EXPORT we flip dir to −1 so droplets
    // travel home → grid (the house pushes power back to the grid).
    {
      id: 'grid-home',
      d: `M ${POS.grid.x + 46} ${POS.grid.y} L ${POS.junction.x} ${POS.junction.y} L ${POS.home.x - 46} ${POS.home.y}`,
      color: 'var(--grid-color)',
      active: gridActive,
      dir: gridExporting ? -1 : 1,
      label: gridActive ? fmtPower(gridW) : null,
      labelXY: [190, 240],
    },
    // Síť → Baterie (grid charges battery while importing).
    {
      id: 'grid-battery',
      d: `M ${POS.grid.x + 46} ${POS.grid.y} L ${POS.battery.x - 46} ${POS.battery.y}`,
      color: 'var(--grid-color)',
      active: gridToBattery,
      dir: 1,
      label: gridToBattery ? fmtPower(batteryW) : null,
      labelXY: [185, 305],
    },
  ];

  return <FlowScene viewBox="0 0 600 400" nodes={nodes} pipes={pipes} />;
}
