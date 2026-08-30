# Casa DaVinci Smart Home System Manual

## Overview

Casa DaVinci is a smart home energy monitoring system that provides real-time visualization of energy flow from solar panels, battery storage, grid connection, and home consumption. The system is built around a Raspberry Pi 4 as the central hub, connecting to Victron energy equipment via MQTT and Seplos batteries via CAN bus.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              ENERGY SOURCES                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐   │
│   │   Solar     │     │    Grid     │     │    Seplos Batteries     │   │
│   │   Panels    │     │  Connection │     │    (3x Mason-280)       │   │
│   └──────┬──────┘     └──────┬──────┘     └───────────┬─────────────┘   │
│          │                   │                        │                  │
│          └───────────────────┼────────────────────────┘                  │
│                              │                                           │
│                              ▼                                           │
│                    ┌─────────────────┐                                   │
│                    │  Victron Cerbo  │                                   │
│                    │       GX        │                                   │
│                    │  192.168.1.210  │                                   │
│                    └────────┬────────┘                                   │
│                             │                                            │
│               MQTT (port 1883)                                           │
│                             │                                            │
│                             ▼                                            │
│                    ┌─────────────────┐      ┌─────────────────┐         │
│                    │  Raspberry Pi 4 │◄─────│  ESP32 Sensors  │         │
│                    │   (Node.js)     │ MQTT │  (DHT22/OLED)   │         │
│                    │ casa-davinci    │      └─────────────────┘         │
│                    └────────┬────────┘                                   │
│                             │                                            │
│                    WebSocket (port 3000)                                 │
│                             │                                            │
│                             ▼                                            │
│                    ┌─────────────────┐                                   │
│                    │   Web Browser   │                                   │
│                    │   (Dashboard)   │                                   │
│                    └─────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Hardware Components

### Victron Cerbo GX
- **IP Address:** 192.168.1.210
- **MQTT Port:** 1883
- **Function:** Central energy management unit that collects data from all Victron components and batteries via CAN bus
- **Data Provided:** Solar production, grid power, battery state, home consumption

### Seplos Mason-280 Batteries (BMS V2)
- **Configuration:** 3 packs in parallel
- **Capacity:** 280Ah per pack (840Ah total)
- **Voltage:** 51.2V nominal (LiFePO4)
- **Communication:** CAN bus to Victron Cerbo GX

#### Battery DIP Switch Configuration (3-Pack Setup)

| Pack | Role | DIP Switch Setting |
|------|------|-------------------|
| Pack 1 | CAN Master | Switch 7 = ON |
| Pack 2 | Slave 1 | Switch 1 = ON |
| Pack 3 | Slave 2 | Switch 2 = ON |

**DIP Switch Reference:**
- Switches 1-4: RS485 address configuration
- Switches 5-8: CAN bus configuration

**Known Limitation:** Seplos BMS V2 cannot respond to both CAN and RS485 simultaneously on the master pack. RS485 is available for single-pack diagnostics only (connect one pack at a time).

### Raspberry Pi 4
- **Hostname:** casa-davinci.local
- **User:** pi
- **Production Path:** /opt/casa-davinci (flat layout — see Deployment)
- **Legacy dev copy:** /home/pi/casa-davinci (not used by the service)
- **Service:** systemd (casa-davinci.service)

### Solar Chargers (2× MPPT)
| Instance | Name | Model | Link | String |
|---|---|---|---|---|
| `solarcharger/278` | Roof_top_4.8Kw | SmartSolar MPPT VE.Can 250/85 | VE.Can | Roof |
| `solarcharger/279` | Terrace_Roof_2.4Kw | SmartSolar MPPT 150/45 | VE.Direct | Terrace |

> ⚠️ See **Troubleshooting → Solar string shows 0 W** for a known failure mode
> where a charger silently disappears from the Cerbo's MQTT export.

### ESP32 Sensors (Optional)
- **Sensor:** DHT22 (temperature/humidity)
- **Display:** SSD1306 OLED
- **MQTT Topic:** `home/living_room/sensor`
- **Data Format:** `{"temperature": 23.5, "humidity": 45.2}`

### Shelly Plus 1 — Well Pump (studna → jímka)
- **IP:** `192.168.1.237` (DHCP), MAC `78:EE:4C:CF:81:30`, on WiFi "Petr's Wi-Fi"
- **Function:** drives a contactor (IDEAL KMC 20-20) switching a 1.5 kW / 230 V borehole pump
- **Cycle:** 1 minute every hour (Shelly local schedule + 60 s auto-off)
- **MQTT:** publishes to the Cerbo broker under prefix `casa/pump`
- **Full docs:** see [`WATER-PUMP.md`](WATER-PUMP.md); wiring in [`schema/`](schema/)
- **Device name:** `WellPump` (was `GarageDoor` from its previous life as the garage switch — renamed 2026-08-30)

### Shelly 1 Gen3 — Garage Door
- **Device:** S3SW-001X16EU, name `GarageDoor`, IP `192.168.1.61` (DHCP, WiFi CasaDaVinciStar), mDNS `shelly1g3-54320457e4c8.local`, FW 2.0.0, AP `Shelly1G3-54320457E4C8`
- **Function:** relay closes for **1 s** (auto-off on the device) = one press of the opener's button → open / stop / close
- **MQTT:** publishes to the Cerbo broker under prefix `casa/garage`
- **SW input:** reserved for a magnetic door-position contact (not wired yet → dashboard shows "bez čidla")
- **Setup:** `scripts/garage-shelly-setup.sh provision "<SSID>" "<pass>"` (from the Mac, joins the Shelly AP temporarily)
- **Full docs:** see [`GARAGE-DOOR.md`](GARAGE-DOOR.md)

---

## Software Components

### Backend (server.js)

Node.js server providing:
- **Express:** HTTP server for static files and REST API
- **Socket.io:** Real-time WebSocket communication to dashboard
- **MQTT Client:** Connects to Victron Cerbo GX for energy data
- **InfluxDB Client:** Time-series data storage (optional)
- **Seplos Service:** RS485 communication for battery diagnostics

#### Configuration (server.js)

```javascript
const CONFIG = {
  server: { port: 3000 },
  mqtt: {
    host: '192.168.1.210',
    port: 1883,
    clientId: 'casa-davinci-server'
  },
  seplos: {
    enabled: true,
    portPath: '/dev/ttyUSB0',
    autoScan: true,           // Single-pack diagnostic mode
    maxPackAddress: 0x0F,
    pollInterval: 10000
  }
};
```

### Frontend (index.html)

Tesla Powerwall-inspired dashboard featuring:
- SVG house visualization with animated energy flow lines
- Real-time updates via WebSocket
- Battery tab with detailed cell monitoring
- Module status display (3 packs)
- Alarm history and status indicators

---

## Data Flow

### Victron MQTT Topics

| Topic Pattern | Description |
|---------------|-------------|
| `/battery/512/Soc` | Battery state of charge (%) |
| `/battery/512/Dc/0/Power` | Battery power (W) - positive=charging, negative=discharging |
| `/battery/512/Dc/0/Voltage` | Battery voltage (V) |
| `/battery/512/Dc/0/Current` | Battery current (A) |
| `/solarcharger/278/Yield/Power` | Solar charger 1 power (W) |
| `/solarcharger/279/Yield/Power` | Solar charger 2 power (W) |
| `/grid/30/Ac/Power` | Grid power (W) - positive=import, negative=export |
| `/vebus/276/Ac/Out/P` | Home consumption (W) |
| `/battery/512/System/NrOfModulesOnline` | Number of battery modules online |
| `/battery/512/System/NrOfModulesOffline` | Number of battery modules offline |

### WebSocket Events

| Event | Direction | Data |
|-------|-----------|------|
| `energyData` | Server → Client | Real-time energy metrics |
| `batteryData` | Server → Client | Detailed battery information |
| `sensorData` | Server → Client | ESP32 sensor readings |

---

## Deployment

### Production layout on the Pi (what systemd actually runs)

`casa-davinci.service` runs `node server.js` with `WorkingDirectory=/opt/casa-davinci`, and that
directory is **flat** (not a copy of the repo):

```
/opt/casa-davinci/
├── server.js               ← backend/server.js
├── seplos-service.js       ← backend/seplos-service.js
├── frontend/index.html     ← frontend/index.html  (v1 dashboard at /)
├── v2/                     ← frontend-v2/dist/    (React app at /v2/)
├── node_modules/, package.json
└── server.js.bak.<ts>, frontend/index.html.bak.<ts>, v2.bak/   (backups from deploys)
```

`/home/pi/casa-davinci` (target of `deploy.sh`) is an **old dev copy** — production does not run from it.

### Deploy from the Mac (targeted, with backups)

```bash
cd ~/clawd/projekty/casa-davinci-smarthome
TS=$(date +%Y%m%d%H%M%S)
ssh pi@casa-davinci.local "cp /opt/casa-davinci/server.js /opt/casa-davinci/server.js.bak.$TS; \
  cp /opt/casa-davinci/frontend/index.html /opt/casa-davinci/frontend/index.html.bak.$TS; \
  rm -rf /opt/casa-davinci/v2.bak && cp -r /opt/casa-davinci/v2 /opt/casa-davinci/v2.bak"

scp backend/server.js    pi@casa-davinci.local:/opt/casa-davinci/server.js
scp frontend/index.html  pi@casa-davinci.local:/opt/casa-davinci/frontend/index.html
(cd frontend-v2 && npm run build) && \
  ssh pi@casa-davinci.local "rm -rf /opt/casa-davinci/v2/assets" && \
  scp -r frontend-v2/dist/. pi@casa-davinci.local:/opt/casa-davinci/v2/

ssh pi@casa-davinci.local "sudo systemctl restart casa-davinci"   # passwordless sudo works for pi
```

Before deploying, check that production still matches git (nobody edited on the Pi):
`ssh pi@casa-davinci.local md5sum /opt/casa-davinci/server.js` vs `md5 -q backend/server.js`.

> The Pi never builds anything — the v2 bundle is built on the Mac (`frontend-v2/dist` is gitignored).
> Rollback = copy the `.bak` file back and restart the service.

### Service Management

```bash
# Check service status
sudo systemctl status casa-davinci

# Restart service
sudo systemctl restart casa-davinci

# View logs
sudo journalctl -u casa-davinci -f
```

### Access Dashboard

Open in browser: http://casa-davinci.local:3000

---

## Directory Structure

```
casa-davinci-smarthome/
├── frontend/
│   └── index.html              # v1 energy dashboard (single-page app, served at /)
├── frontend-v2/                # v2 whole-home React app (Vite) — served at /v2/ from its dist/
│   ├── src/areas/              # Domov, Elektrarna, Zahrada, Garaz (+ ComingSoon)
│   ├── src/hooks/              # useVictron, usePump, useGarage, useSensors, useTopics
│   └── README.md
├── backend/
│   ├── server.js               # Main Node.js server (MQTT + WebSocket + InfluxDB + Shelly)
│   ├── seplos-service.js       # RS485 battery communication
│   └── package.json
├── scripts/
│   └── garage-shelly-setup.sh  # Provision / configure / status of the garage Shelly
├── schema/                     # Pump panel wiring (draw.io SVG, mermaid)
├── esp32/                      # ESP32 sensor firmware + docs
├── python/                     # Analytics scripts (InfluxDB)
├── grafana/                    # Dashboards
├── wireguard/                  # Pi ↔ Hetzner VPN config
├── docs/                       # Credentials (NOT in git)
├── deploy.sh                   # Legacy rsync to /home/pi (see Deployment)
├── CLAUDE.md                   # Development guidelines
├── SYSTEM-MANUAL.md            # System manual (hardware, deploy, troubleshooting)
├── WATER-PUMP.md               # Well-pump subsystem (Shelly Plus 1)
├── GARAGE-DOOR.md              # Garage-door subsystem (Shelly 1 Gen3)
├── DESIGN.md                   # v2 product/architecture rationale
└── .gitignore
```

---

## Troubleshooting

### No Data on Dashboard
1. Check if service is running: `sudo systemctl status casa-davinci`
2. Verify MQTT connection to Victron: Check logs for connection messages
3. Ensure Victron Cerbo GX is accessible at 192.168.1.210

### Solar string shows 0 W (MPPT missing from MQTT)
**Symptom:** one MPPT (e.g. Roof / `solarcharger/278`) shows 0 W on the dashboard,
but the charger is alive and producing in the Cerbo console and VRM.

**Root cause (seen 2026-05-29):** the Cerbo's dbus→MQTT export silently dropped the
VE.Can charger (and `system/0`) and never re-published it — for 8 days. The device
kept charging; only the local MQTT was missing it.

**Diagnosis:**
```bash
mosquitto_pub -h 192.168.1.210 -t "R/<serial>/keepalive" -m ""
mosquitto_sub -h 192.168.1.210 -t "N/<serial>/solarcharger/+/Yield/Power" -v -W 8
# Both 278 and 279 should appear. If one is missing while the Cerbo console shows it...
```
**Fix:** restarting the MQTT broker service is **not** enough — do a **full Cerbo reboot**
(Settings → General → Reboot). The MPPT reappears on MQTT and the dashboard recovers.

**Prevention:** the **MQTT Watchdog** in `server.js` now alerts when a previously-seen
critical topic goes silent > 10 min (instead of a silent 0). See `GET /api/mqtt/watchdog`.

### Well pump not responding / wrong state
1. `curl http://casa-davinci.local:3000/api/pump` — check `online`, `on`, `offAt`
2. `curl http://192.168.1.237/rpc/Switch.GetStatus?id=0` — check the Shelly directly
3. Verify Shelly MQTT: `mosquitto_sub -h 192.168.1.210 -t "casa/pump/#" -v`
4. WiFi signal at the pump panel is weak (~−80 dBm) — reposition / add a repeater. See `WATER-PUMP.md`.

### Garage door not responding
1. `curl http://casa-davinci.local:3000/api/garage` — check `online`; `curl .../api/garage/pulse` returns `409` while offline
2. `./scripts/garage-shelly-setup.sh status` — MQTT section must say `"connected":true`
3. `mosquitto_sub -h 192.168.1.210 -t "casa/garage/#" -v` — a pulse must show `output:true` then `false` ~1 s later
4. Shelly falls back to AP mode (`Shelly1G3-…`) after a failed WiFi join → re-run `provision`. See `GARAGE-DOOR.md`.

### Battery Modules Showing Offline
1. Verify DIP switch configuration on each pack
2. Check CAN bus cable connections between packs
3. Confirm Victron can see batteries in its own interface

### RS485 Diagnostics Not Working
1. RS485 only works for single-pack diagnostics (disconnect other packs)
2. Check USB-RS485 adapter is connected to /dev/ttyUSB0
3. Verify the connected pack has correct RS485 DIP switch setting

### Dashboard Not Loading
1. Check if port 3000 is accessible: `curl http://casa-davinci.local:3000`
2. Verify frontend files exist in /opt/casa-davinci/frontend/
3. Check for JavaScript errors in browser console

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-23 | 1.0 | Initial documentation |
| 2026-01-23 | 1.1 | Added 3-pack battery configuration |
| 2026-06-07 | 1.2 | Fixed Roof MPPT (278) missing from MQTT (Cerbo reboot); added MQTT Watchdog |
| 2026-06-07 | 1.3 | Added Shelly well-pump control (studna → jímka) over MQTT + dashboard tile; see WATER-PUMP.md |
| 2026-08-30 | 1.4 | Added Shelly 1 Gen3 garage-door pulse control over MQTT (v1 tile + v2 Garáž area + API); pump Shelly renamed WellPump; see GARAGE-DOOR.md |

---

## Future Enhancements

- [ ] Multi-pack RS485 communication (currently limited by Seplos V2 BMS)
- [ ] Historical data charts from InfluxDB
- [ ] Mobile-responsive dashboard improvements
- [ ] Additional room sensors
