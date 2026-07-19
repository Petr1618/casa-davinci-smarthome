// =============================================================================
// useTopics — generic Victron topic subscription for detail sections.
//
// Pass a { key: '/topic/suffix' } map; get back { key: number|null }. Values
// prime from `initial-data` and update from `victron-data` (matched by
// endsWith, same convention as useVictron). Incoming patches are batched and
// flushed every 250 ms so the heavy MQTT stream doesn't cause render storms
// on topic-dense screens (Měnič, Baterie).
// =============================================================================
import { useState, useEffect, useRef } from 'react';
import { on, getSnapshot } from '../lib/socket.js';

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export default function useTopics(map) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(Object.keys(map).map((k) => [k, null]))
  );
  const pendingRef = useRef({});
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    const entries = Object.entries(mapRef.current);

    const applyTopic = (topic, value) => {
      if (typeof topic !== 'string') return;
      for (const [key, suffix] of entries) {
        if (topic.endsWith(suffix)) {
          pendingRef.current[key] = num(value);
          return;
        }
      }
    };

    const primeFrom = (data) => {
      const victron = data && data.victron;
      if (!victron || typeof victron !== 'object') return;
      for (const [topic, value] of Object.entries(victron)) applyTopic(topic, value);
    };
    // Prime from the cached snapshot — `initial-data` fired before we mounted.
    primeFrom(getSnapshot());
    const offInitial = on('initial-data', primeFrom);
    const offLive = on('victron-data', (d) => d && applyTopic(d.topic, d.value));

    const flush = setInterval(() => {
      const patch = pendingRef.current;
      if (Object.keys(patch).length === 0) return;
      pendingRef.current = {};
      setValues((prev) => ({ ...prev, ...patch }));
    }, 250);

    return () => { offInitial(); offLive(); clearInterval(flush); };
    // The map is expected to be a static literal per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return values;
}

// ---- Victron enum → Czech labels (shared by the detail sections). -----------
export const MPPT_STATE = {
  0: 'Vypnuto', 2: 'Porucha', 3: 'Bulk', 4: 'Absorpce', 5: 'Float',
  6: 'Storage', 7: 'Vyrovnávání', 252: 'Externí řízení',
};
export const VEBUS_STATE = {
  0: 'Vypnuto', 1: 'Nízký výkon', 2: 'Porucha', 3: 'Bulk', 4: 'Absorpce',
  5: 'Float', 6: 'Storage', 7: 'Vyrovnávání', 8: 'Passthru', 9: 'Invertuje',
  10: 'Power assist', 11: 'Zdroj', 252: 'Externí řízení',
};
export const VEBUS_MODE = { 1: 'Jen nabíječ', 2: 'Jen měnič', 3: 'Zapnuto', 4: 'Vypnuto' };

export const enumLabel = (table, v) =>
  v == null ? '—' : (table[Math.round(v)] ?? `stav ${Math.round(v)}`);
