// =============================================================================
// useGarage — React hook that owns ALL communication with the garage-door
// backend (Shelly 1 Gen3, one-shot 1 s pulse to the opener's button input).
//
// Backend contract (socket.io, shared connection):
//   · emits  `garage-status`       → live state object (shape below)
//   · emits  `garage-pulse-result` → { ok, error?, at? } after a pulse request
//   · listens `garage-pulse`       → (no payload) send ONE button pulse
//
// REST prime on mount so the card isn't empty before the first socket push:
//   GET /api/garage → same shape as garage-status
//
// garage-status shape:
//   { online, relayOn, doorOpen, sensorPresent, temperature, lastPulseAt, lastUpdate }
//   · relayOn   — true only while the relay is closed (~1 s)
//   · doorOpen  — true/false from the SW contact, null while no sensor is wired
//
// Returns { garage, pulse(), lastResult }.
// =============================================================================
import { useState, useEffect, useCallback } from 'react';
import { socket, on } from '../lib/socket.js';

export function useGarage() {
  const [garage, setGarage] = useState(null);
  // { ok, error?, at } — `at` changes on every pulse so repeat clicks re-trigger UI.
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/garage')
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => {
        if (cancelled || !g) return;
        setGarage((prev) => (prev ? prev : { ...g })); // never overwrite fresher socket data
      })
      .catch(() => { /* endpoint missing / offline — socket will fill in */ });

    const offStatus = on('garage-status', (g) => {
      if (g && typeof g === 'object') setGarage(g);
    });
    const offResult = on('garage-pulse-result', (r) => {
      setLastResult({ ok: !!(r && r.ok), error: r && r.error, at: Date.now() });
    });

    return () => { cancelled = true; offStatus(); offResult(); };
  }, []);

  // One button press on the opener (open / stop / close — like the remote).
  const pulse = useCallback(() => {
    socket.emit('garage-pulse');
  }, []);

  return { garage, pulse, lastResult };
}

export default useGarage;
