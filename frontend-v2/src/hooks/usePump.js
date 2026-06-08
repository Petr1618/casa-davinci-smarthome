// =============================================================================
// usePump — React hook that owns ALL communication with the well-pump backend.
//
// The backend (unchanged) speaks over the shared socket.io connection:
//   · emits  `pump-status`        → the live pump state object (see shape below)
//   · emits  `pump-config-result` → { ok, error? } after a config write
//   · listens `pump-control`      → { on: true|false }  (manual run / stop)
//   · listens `pump-config-set`   → { enabled?, runSeconds?, intervalKey? }
//
// There is also an OPTIONAL REST endpoint used purely to prime the UI on mount
// so the controls show sane values before the first socket push arrives:
//   GET /api/pump/config → { enabled, runSeconds, intervalKey, intervalLabel,
//                            nextRunAt, intervals:[{key,label}] }
//
// pump-status shape:
//   { online, on, temperature, source, offAt, enabled,
//     runSeconds, intervalKey, intervalLabel, nextRunAt }
//
// The hook returns:
//   { pump, setPump(on), setConfig(cfg), lastResult }
// and cleans up every listener on unmount.
// =============================================================================
import { useState, useEffect, useCallback } from 'react';
import { socket, on } from '../lib/socket.js';

export function usePump() {
  // Latest pump-status snapshot (null until the first message / REST prime).
  const [pump, setPump] = useState(null);
  // Result of the most recent config write — drives the "Uloženo ✓" / error UI.
  // Shape: { ok, error?, at } where `at` is a timestamp so repeat saves re-trigger.
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    // ---- 1) Prime from REST so the controls aren't empty before socket data.
    // We only fill the fields the controls actually need; the socket push will
    // shortly replace this with the authoritative live state. Failure is silent
    // (the socket is the real source of truth — REST is just a head start).
    let cancelled = false;
    fetch('/api/pump/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cancelled || !cfg) return;
        // Merge under any socket data that may have already arrived: we never
        // overwrite a fresher live snapshot with the slower REST response.
        setPump((prev) => (prev ? prev : { ...cfg }));
      })
      .catch(() => { /* offline / endpoint missing — ignore, socket will fill in */ });

    // ---- 2) Live status stream. `on()` returns its own unsubscribe fn.
    const offStatus = on('pump-status', (p) => {
      if (p && typeof p === 'object') setPump(p);
    });

    // ---- 3) Config-write acknowledgements.
    const offResult = on('pump-config-result', (r) => {
      setLastResult({ ok: !!(r && r.ok), error: r && r.error, at: Date.now() });
    });

    // Clean up both socket listeners (and block a late REST resolve) on unmount.
    return () => {
      cancelled = true;
      offStatus();
      offResult();
    };
  }, []);

  // ---- Imperative actions ---------------------------------------------------
  // Manual relay control: run (true) or stop (false) the pump now.
  const setPumpOn = useCallback((onState) => {
    socket.emit('pump-control', { on: !!onState });
  }, []);

  // Automation config write. `cfg` may carry any subset of
  // { enabled, runSeconds, intervalKey }. The backend answers with
  // `pump-config-result`, surfaced via `lastResult`.
  const setConfig = useCallback((cfg) => {
    socket.emit('pump-config-set', cfg || {});
  }, []);

  return { pump, setPump: setPumpOn, setConfig, lastResult };
}

export default usePump;
