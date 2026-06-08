import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Casa DaVinci v2 — Vite config
// - base: './' so the built bundle works when served from any path on the Pi
//   (e.g. /v2/ alongside the old dashboard, or root once it replaces it).
// - dev proxy: forwards Socket.io + REST to the existing backend so `npm run dev`
//   talks to the real Pi without CORS/config. In production the bundle is served
//   BY the backend, so same-origin works with no proxy.
const BACKEND = process.env.VITE_BACKEND || 'http://casa-davinci.local:3000';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: BACKEND, ws: true, changeOrigin: true },
      '/api': { target: BACKEND, changeOrigin: true }
    }
  },
  build: { outDir: 'dist', sourcemap: false }
});
