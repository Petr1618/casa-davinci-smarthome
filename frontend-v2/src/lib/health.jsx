// =============================================================================
// health — the Phase-2 connection/data-quality store (one per app).
//
// Watches three independent signals and derives ONE honest answer to
// "can the numbers on screen be trusted right now?":
//
//   1. socket     — socket.io connect/disconnect (server reachable?)
//   2. data flow  — timestamp of the LAST live payload (victron-data /
//                   initial-data / pump-status / sensor-data). The server can
//                   be up while the Pi↔Cerbo/MQTT side is silent — that's the
//                   June-21 failure mode this exists for.
//   3. watchdog   — GET /api/mqtt/watchdog polled every 60 s (per-topic ages;
//                   404 on backends without it → wdAvailable: false).
//
// Derived state:
//   stale        — socket down OR no live payload for > STALE_AFTER_MS
//   cause        — 'socket' | 'data' | null
//   outageSince  — when the current outage started (ms epoch)
//   lastDataAt   — when the last live payload arrived (ms epoch)
//
// The provider ticks once a second while degraded so durations stay live.
// UI consumption: `useHealth()` anywhere; the shell puts `.is-stale` on the
// app root, which drives every CSS treatment ported from the mockup (dq chips,
// dimmed .v values, freeze tags, stopped ribbons, disabled .ctl buttons).
// =============================================================================
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { socket, on } from './socket.js';

const STALE_AFTER_MS = 30_000;   // no live payload for 30 s → data is stale
const WATCHDOG_POLL_MS = 60_000;

const HealthContext = createContext(null);

export function HealthProvider({ children }) {
  const [connected, setConnected] = useState(socket.connected);
  const [lastDataAt, setLastDataAt] = useState(null);
  const [watchdog, setWatchdog] = useState({ available: null, topics: [], thresholdS: null });
  const [, forceTick] = useState(0);

  // outageSince survives re-renders; reset when healthy again.
  const outageRef = useRef(null);

  // ---- 1) Socket connection state. ----------------------------------------
  useEffect(() => {
    const up = () => setConnected(true);
    const down = () => setConnected(false);
    socket.on('connect', up);
    socket.on('disconnect', down);
    return () => { socket.off('connect', up); socket.off('disconnect', down); };
  }, []);

  // ---- 2) Any live payload bumps the freshness clock. ---------------------
  useEffect(() => {
    const bump = () => setLastDataAt(Date.now());
    const offs = ['initial-data', 'victron-data', 'daily-energy', 'pump-status', 'sensor-data']
      .map((ev) => on(ev, bump));
    return () => offs.forEach((off) => off());
  }, []);

  // ---- 3) Watchdog poll (absent on backends without the endpoint). --------
  useEffect(() => {
    let timer;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch('/api/mqtt/watchdog');
        if (cancelled) return;
        if (!r.ok) { setWatchdog({ available: false, topics: [], thresholdS: null }); return; }
        const j = await r.json();
        setWatchdog({
          available: true,
          topics: Array.isArray(j.topics) ? j.topics : [],
          thresholdS: j.staleThresholdSeconds ?? null,
        });
      } catch {
        if (!cancelled) setWatchdog({ available: false, topics: [], thresholdS: null });
      }
    };
    poll();
    timer = setInterval(poll, WATCHDOG_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // ---- 1 Hz tick so age/duration readouts stay live. ----------------------
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- Derive the verdict. --------------------------------------------------
  // Boot grace: a fresh page load takes ~a second to connect — that's
  // "connecting", not an outage, so don't flash the banner. After the socket
  // has connected once (or the grace window passes), a down socket is real.
  const mountAtRef = useRef(Date.now());
  const everConnectedRef = useRef(socket.connected);
  if (connected) everConnectedRef.current = true;
  const booting = !everConnectedRef.current && Date.now() - mountAtRef.current < 5000;

  const now = Date.now();
  const dataSilent = lastDataAt != null && now - lastDataAt > STALE_AFTER_MS;
  const stale = (!connected && !booting) || dataSilent;
  const cause = stale ? (!connected ? 'socket' : 'data') : null;

  if (stale && outageRef.current == null) outageRef.current = now;
  if (!stale) outageRef.current = null;

  const silentTopics = watchdog.topics.filter((t) => t.offline);

  const value = {
    connected,
    stale,
    cause,
    lastDataAt,
    outageSince: outageRef.current,
    watchdog,
    silentTopics,
  };

  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export function useHealth() {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error('useHealth must be used inside <HealthProvider>');
  return ctx;
}

// "HH:MM" for freeze tags / chip timestamps.
export function fmtClock(ms) {
  if (!ms) return '--:--';
  return new Date(ms).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

// "M:SS" / "H:MM:SS" outage duration.
export function fmtDuration(ms) {
  if (ms == null || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
