# Casa DaVinci — Frontend v2 (React + Vite)

Whole‑home dashboard rewritten as a **React + Vite** app, organized by **areas**
(Domů, Elektrárna, Energie & Historie, Dům, Zahrada, Garáž, Zabezpečení, Systém).
See [`../DESIGN.md`](../DESIGN.md) for the product/architecture rationale.

> **Backend is unchanged.** React runs in the browser; the same Node/Socket.io/MQTT
> backend serves the built bundle and provides data. The Pi never builds anything.

## Struktura

```
frontend-v2/
├── index.html              # app entry + anti-flash theme script
├── vite.config.js          # base './', dev proxy → backend, build → dist/
├── src/
│   ├── main.jsx            # React root + HashRouter + ThemeProvider
│   ├── App.jsx             # routes: area id → component (ComingSoon fallback)
│   ├── styles/
│   │   ├── tokens.css      # design tokens, 3 themes (ported 1:1 from v1)
│   │   └── shell.css       # topbar + sidebar (desktop) + bottom bar (mobile)
│   ├── lib/
│   │   ├── socket.js       # shared socket.io connection to backend
│   │   └── theme.jsx       # theme context (dark/light/spacex)
│   ├── shell/
│   │   ├── areas.js        # THE 8 areas (single source of truth)
│   │   └── AppShell.jsx    # layout + nav + theme switcher + connection dot
│   ├── hooks/
│   │   └── usePump.js      # pump state + actions (socket pump-status/control/config)
│   └── areas/
│       ├── ComingSoon.jsx  # placeholder for not-yet-ported areas
│       └── Zahrada.jsx     # Garden = WaterFlow scene + PumpControls
│           └── zahrada/    # WaterFlow.jsx, PumpControls.jsx + css
```

## Vývoj

```bash
npm install
npm run dev      # http://localhost:5173 — proxies socket/API to casa-davinci.local:3000
```
Point dev at another backend: `VITE_BACKEND=http://192.168.1.202:3000 npm run dev`

## Build & deploy

```bash
npm run build    # → dist/ (static bundle)
```
Deploy = copy `dist/` to the Pi and let the existing Express serve it (same
`express.static` as v1, just pointed at the built bundle). Same‑origin `io()`
then connects to the backend automatically — no build tooling on the Pi.

## Konvence
- **Areas** are defined once in `src/shell/areas.js`; the router + both navs render from it.
- A new area = add it there + (optionally) a component in `src/areas/` + a line in `App.jsx`'s `AREA_VIEWS`. Until ported it shows the `ComingSoon` placeholder.
- Components reference **only CSS variables** from `tokens.css`, so all 3 themes work for free.
- All backend I/O goes through `src/lib/socket.js` (and REST under `/api`). **The backend contract is unchanged.**
