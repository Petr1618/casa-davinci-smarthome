// Single shared Socket.io connection to the existing Casa DaVinci backend.
//
// In production the React bundle is served BY the backend, so same-origin
// `io()` connects straight to it. In `npm run dev` the Vite proxy forwards
// /socket.io to the backend (see vite.config.js). VITE_BACKEND can override
// the URL (e.g. for a headless screenshot build pointing at the live Pi).
import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_BACKEND || undefined; // undefined = same origin

export const socket = io(URL, {
  transports: ['websocket', 'polling'],
  reconnection: true
});

// Small helper: subscribe to an event and get an automatic unsubscribe back,
// so React effects can clean up easily.
export function on(event, handler) {
  socket.on(event, handler);
  return () => socket.off(event, handler);
}

// The server sends `initial-data` ONCE per connection. Components that mount
// later (e.g. a detail section opened after navigation) would miss it and
// rarely-changing topics (State, Mode, AC voltage…) would stay empty until
// their next MQTT change. Cache the latest snapshot so hooks can prime from
// it on mount.
let lastSnapshot = null;
socket.on('initial-data', (d) => { lastSnapshot = d; });
export const getSnapshot = () => lastSnapshot;
