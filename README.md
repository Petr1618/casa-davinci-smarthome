# Casa DaVinci Smart Home 🏠☀️

Real-time energy monitoring and analytics platform for off-grid solar systems with Victron equipment and Seplos BMS battery storage.

**Live Dashboard:** [casa.jetpartner.cz](http://casa.jetpartner.cz)

## Overview

Casa DaVinci monitors a 48V solar installation (Victron MultiPlus-II 5000 + 2× MPPT + 3× Seplos Mason-280 / 840 Ah) via MQTT and provides:

- **Real-time energy flow visualization** — animated SVG showing power flow between solar, grid, battery, and home
- **Battery management** — per-cell voltage/temperature from Seplos BMS via RS485
- **Historical data** — InfluxDB time-series with Grafana dashboards
- **Python analytics** — anomaly detection, solar prediction, alerting, automated reports

## Architecture

```
┌─────────────┐     MQTT      ┌──────────────┐    VPN (WireGuard)    ┌──────────────┐
│  Victron    │──────────────▶│  Raspberry   │─────────────────────▶│   Hetzner    │
│  Cerbo GX   │               │   Pi 4       │                      │   Cloud      │
└─────────────┘               │              │                      │              │
                              │  • server.js │                      │  • InfluxDB  │
┌─────────────┐     MQTT      │  • bridge    │                      │  • Grafana   │
│   ESP32     │──────────────▶│  • Seplos    │                      │  • Dashboard │
│  DHT22      │               │    RS485     │                      │    (Nginx)   │
└─────────────┘               └──────────────┘                      └──────────────┘
```

**Data Flow:**
1. Victron Cerbo GX publishes telemetry via MQTT (local broker)
2. Raspberry Pi aggregates MQTT + Seplos BMS (RS485) + ESP32 sensors
3. Bridge service forwards to Hetzner via WireGuard VPN (MQTT + Telegraf HTTP)
4. InfluxDB stores time-series data; Grafana provides dashboards
5. Cloud dashboard (Node.js + WebSocket) serves real-time visualization

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express, Socket.io, MQTT.js |
| **Frontend** | Vanilla HTML/CSS/JS, SVG animations |
| **Database** | InfluxDB 2.7 (Flux queries, 5-year retention) |
| **Dashboards** | Grafana 10.3 (Battery Detail, Overview, System Health) |
| **Analytics** | Python 3 (NumPy, Pandas, Scikit-learn, Matplotlib) |
| **Hardware** | Raspberry Pi 4, Victron Cerbo GX, ESP32 + DHT22, Seplos BMS V2 |
| **Infrastructure** | Hetzner AX41, WireGuard VPN, Nginx, Docker |

## Python Analytics (`python/`)

Purpose-built analytics scripts for battery health monitoring and solar energy optimization. Designed with satellite telemetry parallels in mind — the same techniques apply to spacecraft battery housekeeping and energy budget management.

### Scripts

| Script | Description |
|--------|------------|
| `analyze_battery_health.py` | Z-score anomaly detection on cell voltages, IQR temperature outlier detection, degradation trend analysis |
| `telemetry_alerting.py` | Real-time out-of-limits monitoring with configurable thresholds (daemon or single-shot mode) |
| `predict_solar_yield.py` | Ridge regression solar yield prediction using historical irradiance patterns |
| `export_report.py` | Automated PDF report generation with charts and statistics |

### Setup

```bash
cd python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Configure InfluxDB connection
```

### Usage

```bash
# Battery health analysis (last 7 days)
python analyze_battery_health.py --days 7

# Real-time alerting (daemon mode)
python telemetry_alerting.py --daemon

# Solar yield prediction
python predict_solar_yield.py --days 30

# Generate PDF report
python export_report.py --output report.pdf
```

> **Note:** Scripts connect to InfluxDB via SSH tunnel: `ssh -L 8086:localhost:8086 root@<server-ip>`

## Hardware Setup

- **Inverter:** Victron MultiPlus-II 48/5000/70-50
- **Solar Chargers:** 2× Victron SmartSolar MPPT (IDs 278, 279)
- **Battery:** 3× Seplos Mason-280 (16S LiFePO4, 840 Ah total)
- **Gateway:** Victron Cerbo GX (MQTT + Modbus)
- **Sensors:** ESP32 + DHT22 (temperature/humidity)
- **Edge Computer:** Raspberry Pi 4

## Grafana Dashboards

Three dashboards available at `/grafana/`:

- **Battery Detail** — per-cell voltages, temperatures, charge/discharge curves
- **Overview** — solar yield, grid exchange, self-sufficiency metrics
- **System Health** — inverter state, communication status, alerts

## Local Development

```bash
# Backend
cd backend
npm install
export INFLUXDB_TOKEN=your_token
node server.js

# Access dashboard at http://localhost:3000
```

## Deployment

```bash
./deploy.sh  # Syncs to Raspberry Pi via rsync
```

## License

MIT
