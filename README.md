# Casa DaVinci Smart Home

A real-time energy monitoring dashboard for Victron solar systems, inspired by the Tesla Powerwall app.

## Features

- **Real-time Energy Flow Visualization** - Animated flows between Solar, Battery, Grid, and Home
- **Comprehensive Stats Panels** - Detailed metrics for all system components
- **Live MQTT Data** - Direct connection to Victron Cerbo GX
- **Room Sensors** - Temperature and humidity from ESP32 sensors
- **Responsive Design** - Works on desktop and mobile

## Dashboard

The dashboard displays:

### Energy Flow Diagram
- Solar panels (top)
- Grid connection (left)
- Home consumption (right)
- Battery storage (bottom)
- Animated flow dots showing power direction

### Stats Cards
- **Solar**: Current power, daily yield, peak power, panel voltage
- **Grid**: Import/export power, AC voltage, frequency
- **Home**: Consumption, self-sufficiency, self-consumption rates
- **Battery**: State of charge, power, voltage, temperature, status
- **Summary**: Daily production, savings estimate, CO2 avoided
- **System**: Inverter status and alarms

## Architecture

```
┌─────────────┐     MQTT      ┌─────────────┐     WebSocket    ┌─────────────┐
│  Victron    │──────────────▶│  Raspberry  │◀───────────────▶│   Browser   │
│  Cerbo GX   │               │     Pi      │                  │  Dashboard  │
└─────────────┘               └─────────────┘                  └─────────────┘
                                    │
┌─────────────┐     MQTT           │
│   ESP32     │────────────────────┘
│  Sensors    │
└─────────────┘
```

## Tech Stack

- **Backend**: Node.js, Express, Socket.io, MQTT
- **Frontend**: Vanilla HTML/CSS/JS, SVG animations
- **Hardware**: Raspberry Pi 4, Victron Cerbo GX, ESP32

## Setup

### Prerequisites
- Raspberry Pi with Node.js installed
- Victron Cerbo GX with MQTT enabled
- Network access to the Cerbo GX

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Petr1618/casa-davinci-smarthome.git
cd casa-davinci-smarthome
```

2. Install dependencies:
```bash
cd backend
npm install
```

3. Configure the server (edit `backend/server.js`):
```javascript
const CONFIG = {
  port: 3000,
  mqtt: {
    cerboGx: 'mqtt://YOUR_CERBO_IP',
    cerboSerial: 'YOUR_CERBO_SERIAL',
    keepaliveInterval: 25000
  }
};
```

4. Start the server:
```bash
node server.js
```

5. Access the dashboard at `http://YOUR_PI_IP:3000`

## Deployment

Use the included deploy script to sync to your Raspberry Pi:
```bash
./deploy.sh
```

## Victron MQTT Topics

The dashboard subscribes to these Victron topics:
- `/battery/512/Soc` - Battery state of charge
- `/battery/512/Dc/0/Power` - Battery power
- `/solarcharger/*/Yield/Power` - Solar charger power
- `/grid/30/Ac/Power` - Grid power
- `/vebus/276/Ac/Out/P` - Inverter output power

## License

MIT
