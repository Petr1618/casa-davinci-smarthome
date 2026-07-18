// =============================================================================
// useVictron — React hook that owns ALL Victron energy telemetry for the
// Elektrárna (power-plant) area.
//
// The backend (UNCHANGED — we only consume it) pushes raw Victron MQTT values
// over the shared socket.io connection, plus a derived daily-energy roll-up:
//
//   · `initial-data`  → { victron: { "<full topic>": value, ... }, ... }
//                       Sent once on (re)connect to PRIME every value so the UI
//                       isn't empty before the first live tick arrives.
//   · `victron-data`  → { topic, value }                    (one live update)
//   · `daily-energy`  → { gridImportKwh, gridExportKwh, homeConsumedKwh,
//                         selfSufficiency, selfConsumption } (all STRINGS)
//
// Victron topics look like  `N/<serial>/<service>/<id>/...`, so we never match
// the WHOLE topic — we match by SUFFIX with `endsWith(...)`, exactly mirroring
// the v1 dashboard's `topic.includes(...)` logic but stricter.
//
// Topic suffixes we care about (see CLAUDE.md / task contract):
//   Solar  : /solarcharger/278/Yield/Power  +  /solarcharger/279/Yield/Power (W)
//            → we SUM the two MPPT chargers into a single solar figure.
//   Home   : /vebus/276/Ac/Out/P                                            (W)
//   Grid   : /grid/30/Ac/Power   (+ import / − export, W) — MAY BE ABSENT on an
//            off-grid site; then gridW simply stays null and the UI shows "—".
//   Battery: /battery/512/Soc          (%)
//            /battery/512/Dc/0/Power    (+ charging / − discharging, W)
//            /battery/512/Dc/0/Voltage  (V)
//            /battery/512/Dc/0/Temperature (°C)
//
// The hook keeps the TWO solar MPPT readings in a ref (so we can re-sum whenever
// either one changes) and exposes a single derived snapshot object:
//
//   {
//     solarW, homeW, gridW, batterySoc, batteryW, batteryV, batteryTemp,
//     daily: { gridImportKwh, gridExportKwh, homeConsumedKwh,
//              selfSufficiency, selfConsumption } | null
//   }
//
// `gridW` is `null` (not 0) when the site has no grid meter, so the UI can tell
// "0 W flowing" apart from "no grid at all". Everything else defaults to 0 / null.
//
// Every socket listener is cleaned up on unmount via the unsubscribe fns that
// `on()` returns.
// =============================================================================
import { useState, useEffect, useRef } from 'react';
import { on } from '../lib/socket.js';

// ---- Topic suffixes (single source of truth, matched with endsWith). --------
const T = {
  SOLAR_1: '/solarcharger/278/Yield/Power',
  SOLAR_2: '/solarcharger/279/Yield/Power',
  SOLAR_1_YIELD: '/solarcharger/278/History/Daily/0/Yield',
  SOLAR_2_YIELD: '/solarcharger/279/History/Daily/0/Yield',
  HOME: '/vebus/276/Ac/Out/P',
  GRID: '/grid/30/Ac/Power',
  BATT_SOC: '/battery/512/Soc',
  BATT_POWER: '/battery/512/Dc/0/Power',
  BATT_VOLT: '/battery/512/Dc/0/Voltage',
  BATT_TEMP: '/battery/512/Dc/0/Temperature',
  BATT_CURR: '/battery/512/Dc/0/Current',
  BATT_MODULES: '/battery/512/System/NrOfModulesOnline',
};

// Coerce an incoming MQTT payload to a finite number, or null if it isn't one.
// Victron values arrive as numbers, but we stay defensive against strings/nulls.
function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export default function useVictron() {
  // The derived snapshot the UI renders. `gridW: null` = no grid meter present.
  const [state, setState] = useState({
    solarW: 0,
    solar1W: 0,           // Střecha · MPPT 278
    solar2W: 0,           // Terasa · MPPT 279
    solar1YieldKwh: null, // today's yield per string (kWh)
    solar2YieldKwh: null,
    homeW: 0,
    gridW: null,
    batterySoc: null,
    batteryW: 0,
    batteryV: null,
    batteryTemp: null,
    batteryA: null,
    modulesOnline: null,
    daily: null,
  });

  // The two MPPT solar readings live in a ref so a change in EITHER lets us
  // re-sum without needing the other one's value from React state (avoids
  // stale-closure bugs and extra renders).
  const solarRef = useRef({ s1: 0, s2: 0 });

  useEffect(() => {
    // ---- Apply ONE raw Victron (topic,value) pair into the snapshot. --------
    // Returns a partial state patch, or null if the topic isn't one we track.
    const applyTopic = (topic, rawValue) => {
      if (typeof topic !== 'string') return null;
      const value = num(rawValue);

      // Solar: keep both MPPTs in the ref, emit their SUM as solarW.
      if (topic.endsWith(T.SOLAR_1)) {
        solarRef.current.s1 = value ?? 0;
        return { solar1W: solarRef.current.s1, solarW: solarRef.current.s1 + solarRef.current.s2 };
      }
      if (topic.endsWith(T.SOLAR_2)) {
        solarRef.current.s2 = value ?? 0;
        return { solar2W: solarRef.current.s2, solarW: solarRef.current.s1 + solarRef.current.s2 };
      }

      // Per-string daily yield (kWh) — drives the "Dnešní výroba" KPI.
      if (topic.endsWith(T.SOLAR_1_YIELD)) return { solar1YieldKwh: value };
      if (topic.endsWith(T.SOLAR_2_YIELD)) return { solar2YieldKwh: value };

      // Home consumption (inverter AC out). Ignore the *Nominal* sibling topic.
      if (topic.endsWith(T.HOME) && !topic.includes('Nominal')) {
        return { homeW: value ?? 0 };
      }

      // Grid power (+ import / − export). Absent on off-grid sites.
      if (topic.endsWith(T.GRID)) {
        return { gridW: value };
      }

      // Battery cluster.
      if (topic.endsWith(T.BATT_SOC)) return { batterySoc: value };
      if (topic.endsWith(T.BATT_POWER)) return { batteryW: value ?? 0 };
      if (topic.endsWith(T.BATT_VOLT)) return { batteryV: value };
      if (topic.endsWith(T.BATT_TEMP)) return { batteryTemp: value };
      if (topic.endsWith(T.BATT_CURR)) return { batteryA: value };
      if (topic.endsWith(T.BATT_MODULES)) return { modulesOnline: value };

      return null;
    };

    // ---- 1) Prime EVERYTHING from the initial snapshot. ---------------------
    const offInitial = on('initial-data', (data) => {
      const victron = data && data.victron;
      if (!victron || typeof victron !== 'object') return;
      // Reset the solar ref so a fresh snapshot fully replaces the running sum.
      solarRef.current = { s1: 0, s2: 0 };
      // Fold every topic into one combined patch, then commit a single update.
      const patch = {};
      for (const [topic, value] of Object.entries(victron)) {
        const p = applyTopic(topic, value);
        if (p) Object.assign(patch, p);
      }
      if (Object.keys(patch).length) setState((prev) => ({ ...prev, ...patch }));
    });

    // ---- 2) Live single-topic updates. --------------------------------------
    const offLive = on('victron-data', (data) => {
      if (!data) return;
      const patch = applyTopic(data.topic, data.value);
      if (patch) setState((prev) => ({ ...prev, ...patch }));
    });

    // ---- 3) Daily energy roll-up (already-formatted string fields). ---------
    const offDaily = on('daily-energy', (d) => {
      if (!d || typeof d !== 'object') return;
      setState((prev) => ({
        ...prev,
        daily: {
          gridImportKwh: d.gridImportKwh,
          gridExportKwh: d.gridExportKwh,
          homeConsumedKwh: d.homeConsumedKwh,
          selfSufficiency: d.selfSufficiency,
          selfConsumption: d.selfConsumption,
        },
      }));
    });

    // Clean up all three listeners on unmount.
    return () => {
      offInitial();
      offLive();
      offDaily();
    };
  }, []);

  return state;
}
