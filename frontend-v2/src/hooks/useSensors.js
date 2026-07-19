// =============================================================================
// useSensors — room climate readings from the ESP32 sensors.
//
// Backend contract:
//   · `initial-data`  → { sensors: { [location]: { temperature, humidity } } }
//   · `sensor-data`   → { topic, location, temperature?, humidity? }
//     (partial patches arrive for single-measurement topics)
//
// Returns { [location]: { temperature?, humidity?, at } } — `at` is when the
// last reading for that room arrived (drives per-room freshness).
// =============================================================================
import { useState, useEffect } from 'react';
import { on } from '../lib/socket.js';

export default function useSensors() {
  const [rooms, setRooms] = useState({});

  useEffect(() => {
    const offInitial = on('initial-data', (data) => {
      const sensors = data && data.sensors;
      if (!sensors || typeof sensors !== 'object') return;
      const now = Date.now();
      setRooms((prev) => {
        const next = { ...prev };
        for (const [location, reading] of Object.entries(sensors)) {
          if (reading && typeof reading === 'object') {
            next[location] = { ...next[location], ...reading, at: now };
          }
        }
        return next;
      });
    });

    const offLive = on('sensor-data', (d) => {
      if (!d || typeof d.location !== 'string') return;
      const { location, topic, ...reading } = d;
      setRooms((prev) => ({
        ...prev,
        [location]: { ...prev[location], ...reading, at: Date.now() },
      }));
    });

    return () => { offInitial(); offLive(); };
  }, []);

  return rooms;
}
