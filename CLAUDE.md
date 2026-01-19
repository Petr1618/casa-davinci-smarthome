# Casa DaVinci Smart Home

## Project Overview

Casa DaVinci is a smart home energy monitoring system that displays real-time energy flow from solar panels, battery storage, grid, and home consumption. The system uses a Raspberry Pi 4 as the central hub, connecting to a Victron Cerbo GX via MQTT and ESP32 sensors for environmental monitoring.

## Architecture

```
┌─────────────────┐     MQTT      ┌─────────────────┐
│  Victron Cerbo  │──────────────▶│                 │
│       GX        │               │                 │
└─────────────────┘               │   Raspberry Pi  │
                                  │    (Node.js)    │
┌─────────────────┐     MQTT      │                 │
│  ESP32 Sensors  │──────────────▶│                 │
│  (DHT22/OLED)   │               └────────┬────────┘
└─────────────────┘                        │
                                     WebSocket
                                           │
                                  ┌────────▼────────┐
                                  │   Web Browser   │
                                  │   (Dashboard)   │
                                  └─────────────────┘
```

## Directory Structure

```
casa-davinci-smarthome/
├── frontend/
│   └── index.html          # Tesla-inspired energy dashboard
├── backend/
│   ├── server.js           # Node.js server (MQTT + WebSocket + InfluxDB)
│   └── package.json        # Dependencies
├── esp32/
│   ├── living-room-sensor.ino    # ESP32 temperature/humidity sensor
│   └── ESP32-Sensor-Documentation.txt
├── docs/                   # Credentials (NOT in git)
│   ├── Casa-DaVinci-Credentials.txt
│   ├── Casa-DaVinci-Setup-Guide.txt
│   └── Casa-DaVinci-Technical-Specification.pdf
├── deploy.sh               # Deploy to Raspberry Pi
├── .gitignore
└── CLAUDE.md               # This file
```

## Key Components

### Backend (server.js)
- **Express** - HTTP server for static files and API
- **Socket.io** - Real-time WebSocket communication to dashboard
- **MQTT** - Connects to Victron Cerbo GX (192.168.1.210:1883)
- **InfluxDB** - Time-series data storage

### Frontend (index.html)
- Tesla Powerwall-inspired design
- SVG house visualization with animated energy flow lines
- Real-time updates via WebSocket
- Displays: Solar, Battery, Grid, Home consumption, Room sensors

### ESP32 Sensors
- DHT22 temperature/humidity sensor
- SSD1306 OLED display
- Publishes to MQTT topics: `home/living_room/sensor`

## Data Flow

### Victron MQTT Topics
| Topic Pattern | Data |
|---------------|------|
| `/battery/512/Soc` | Battery state of charge (%) |
| `/battery/512/Dc/0/Power` | Battery power (W) |
| `/solarcharger/278/Yield/Power` | Solar charger 1 power |
| `/solarcharger/279/Yield/Power` | Solar charger 2 power |
| `/grid/30/Ac/Power` | Grid power (+ = import, - = export) |
| `/vebus/276/Ac/Out/P` | Home consumption (W) |

### ESP32 MQTT Topics
| Topic | Data |
|-------|------|
| `home/living_room/sensor` | JSON: `{"temperature": 23.5, "humidity": 45.2}` |

## Development Workflow

### Local Development
Edit files on Mac, then deploy:
```bash
./deploy.sh
```

### Raspberry Pi
- **Host:** casa-davinci.local
- **User:** pi
- **Project path:** /home/pi/casa-davinci

### Start Server on Pi
```bash
ssh pi@casa-davinci.local
cd casa-davinci/backend
node server.js
```

### Access Dashboard
- http://casa-davinci.local:3000

## Working Principles

1. **Read before modifying** - Always understand existing code first
2. **Keep changes minimal** - Small, focused modifications
3. **Test on real hardware** - Verify with actual Victron/ESP32 data
4. **Don't commit credentials** - docs/ folder is gitignored

## Dependencies

### Pi (Backend)
- Node.js v20+
- npm packages: express, socket.io, mqtt, @influxdata/influxdb-client

### ESP32
- Arduino IDE with ESP32 board support
- Libraries: WiFi, PubSubClient, DHT, Adafruit_GFX, Adafruit_SSD1306

## Sensitive Files (NOT in Git)

The `docs/` folder contains credentials and is excluded from version control:
- InfluxDB API token
- WiFi credentials
- Pi password

Note: `server.js` currently has the InfluxDB token hardcoded. Consider using environment variables for production.
