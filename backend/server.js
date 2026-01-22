const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const SeplosService = require('./seplos-service');

// Configuration
const CONFIG = {
  port: 3000,
  mqtt: {
    cerboGx: 'mqtt://192.168.1.210',
    cerboSerial: 'c0619ab4be8e',  // Cerbo GX portal ID
    keepaliveInterval: 25000  // 25 seconds
  },
  influx: {
    url: 'http://localhost:8086',
    token: 'uo4-ieF7EucCPn_9kkTzb7FaCda6u9-a8M9PuGwnBy3QtRbhnHWqLspEPTQVIm9DkLdrwf8RXoMZsmHxsOKEew==',
    org: 'casa-davinci',
    bucket: 'energy-data'
  },
  seplos: {
    enabled: true,             // Set to true when USB-RS485 adapter is connected
    portPath: '/dev/ttyUSB0',  // Default RS485 adapter path
    autoScan: true,            // Auto-detect connected packs on startup
    maxPackAddress: 0x03,      // Max address to scan (0x00-0x03 = 4 packs max)
    pollInterval: 5000         // Poll every 5 seconds
  }
};

// Settings topics to subscribe to for read-only display
const SETTINGS_TOPICS = [
  '/vebus/276/Mode',
  '/settings/0/Settings/CGwacs/Hub4Mode',
  '/settings/0/Settings/CGwacs/BatteryLife/State',
  '/settings/0/Settings/CGwacs/AcPowerSetPoint',
  '/vebus/276/Ac/ActiveIn/CurrentLimit',
  '/settings/0/Settings/CGwacs/BatteryLife/MinimumSocLimit',
  '/settings/0/Settings/SystemSetup/MaxChargeCurrent'
];

// Essential metrics to store in InfluxDB (all other data still available real-time)
const ESSENTIAL_METRICS = [
  // Battery
  '/battery/512/Soc',
  '/battery/512/Dc/0/Power',
  '/battery/512/Dc/0/Voltage',
  '/battery/512/Dc/0/Temperature',
  // Solar chargers
  '/solarcharger/278/Yield/Power',
  '/solarcharger/279/Yield/Power',
  '/solarcharger/278/Pv/V',
  '/solarcharger/279/Pv/V',
  '/solarcharger/278/History/Daily/0/Yield',
  '/solarcharger/279/History/Daily/0/Yield',
  // Grid
  '/grid/30/Ac/Power',
  // Inverter
  '/vebus/276/Ac/Out/P',
  '/vebus/276/State'
];

// Initialize Express & Socket.io
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Initialize InfluxDB
const influxDB = new InfluxDB({
  url: CONFIG.influx.url,
  token: CONFIG.influx.token
});
const writeApi = influxDB.getWriteApi(CONFIG.influx.org, CONFIG.influx.bucket);

// Serve static files from frontend folder
// Support both /opt/casa-davinci (flat) and /home/pi/casa-davinci/backend (nested) structures
const frontendPath = fs.existsSync(path.join(__dirname, 'frontend'))
  ? path.join(__dirname, 'frontend')
  : path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Store latest values for new client connections
const latestData = {
  victron: {},
  sensors: {},
  seplos: {
    telemetry: null,
    alarms: null
  }
};

// Seplos BMS Service Mode
let seplosService = null;

async function initSeplosService() {
  if (!CONFIG.seplos.enabled) {
    console.log('→ Seplos Service Mode: Disabled (enable in config when RS485 adapter is connected)');
    return;
  }

  try {
    // List available ports
    const ports = await SeplosService.listPorts();
    console.log('→ Seplos: Available serial ports:', ports.map(p => p.path).join(', ') || 'none');

    seplosService = new SeplosService({
      portPath: CONFIG.seplos.portPath,
      autoScan: CONFIG.seplos.autoScan,
      maxPackAddress: CONFIG.seplos.maxPackAddress
    });

    // Event handlers
    seplosService.on('connected', () => {
      io.emit('seplos-status', { connected: true, portPath: CONFIG.seplos.portPath });
    });

    seplosService.on('disconnected', () => {
      io.emit('seplos-status', { connected: false });
    });

    seplosService.on('telemetry', (data) => {
      latestData.seplos.telemetry = data;
      io.emit('seplos-telemetry', data);
    });

    seplosService.on('alarms', (data) => {
      latestData.seplos.alarms = data;
      io.emit('seplos-alarms', data);
    });

    seplosService.on('error', (err) => {
      console.error('✗ Seplos error:', err.message);
      io.emit('seplos-error', { message: err.message });
    });

    seplosService.on('packs-discovered', (packs) => {
      console.log(`✓ Seplos: Discovered ${packs.length} pack(s)`);
      io.emit('seplos-packs-discovered', {
        packCount: packs.length,
        addresses: packs.map(a => '0x' + a.toString(16).padStart(2, '0'))
      });
    });

    seplosService.on('communication-lost', (data) => {
      console.error('✗ Seplos: Communication lost');
      io.emit('seplos-status', { connected: false, error: data.message });
      io.emit('system-notification', {
        type: 'error',
        title: 'Seplos BMS Disconnected',
        message: data.message,
        severity: 'warning'
      });
    });

    seplosService.on('communication-restored', () => {
      console.log('✓ Seplos: Communication restored');
      io.emit('seplos-status', { connected: true, portPath: CONFIG.seplos.portPath });
      io.emit('system-notification', {
        type: 'info',
        title: 'Seplos BMS Connected',
        message: 'Communication with BMS restored',
        severity: 'info'
      });
    });

    // Connect and start polling
    await seplosService.connect();
    seplosService.startPolling(CONFIG.seplos.pollInterval);

    console.log('✓ Seplos Service Mode: Initialized');
  } catch (err) {
    console.error('✗ Seplos Service Mode: Failed to initialize -', err.message);
    console.log('  Make sure USB-RS485 adapter is connected and path is correct');
  }
}

// Daily energy tracking (resets at midnight)
const dailyEnergy = {
  date: new Date().toDateString(),
  gridImport: 0,      // Wh imported from grid
  gridExport: 0,      // Wh exported to grid
  homeConsumed: 0,    // Wh consumed by home
  solarProduced: 0,   // Wh from solar (tracked separately for accuracy)
  lastGridPower: null,
  lastHomePower: null,
  lastSolarPower: null,
  lastTimestamp: null
};

// Integrate power over time using trapezoidal method
function updateDailyEnergy(gridPower, homePower, solarPower) {
  const now = Date.now();
  const today = new Date().toDateString();

  // Reset at midnight
  if (dailyEnergy.date !== today) {
    console.log(`[Daily Energy] New day detected, resetting counters`);
    dailyEnergy.date = today;
    dailyEnergy.gridImport = 0;
    dailyEnergy.gridExport = 0;
    dailyEnergy.homeConsumed = 0;
    dailyEnergy.solarProduced = 0;
    dailyEnergy.lastGridPower = null;
    dailyEnergy.lastHomePower = null;
    dailyEnergy.lastSolarPower = null;
    dailyEnergy.lastTimestamp = null;
  }

  // Need previous values to integrate
  if (dailyEnergy.lastTimestamp !== null) {
    const deltaHours = (now - dailyEnergy.lastTimestamp) / (1000 * 60 * 60); // Convert ms to hours

    // Only integrate if time delta is reasonable (< 5 minutes)
    if (deltaHours < 0.0833) {
      // Grid: positive = import, negative = export
      if (dailyEnergy.lastGridPower !== null && gridPower !== null) {
        const avgGridPower = (dailyEnergy.lastGridPower + gridPower) / 2;
        if (avgGridPower > 0) {
          dailyEnergy.gridImport += avgGridPower * deltaHours; // Wh
        } else {
          dailyEnergy.gridExport += Math.abs(avgGridPower) * deltaHours; // Wh
        }
      }

      // Home consumption
      if (dailyEnergy.lastHomePower !== null && homePower !== null) {
        const avgHomePower = (dailyEnergy.lastHomePower + homePower) / 2;
        dailyEnergy.homeConsumed += avgHomePower * deltaHours; // Wh
      }

      // Solar production
      if (dailyEnergy.lastSolarPower !== null && solarPower !== null) {
        const avgSolarPower = (dailyEnergy.lastSolarPower + solarPower) / 2;
        dailyEnergy.solarProduced += avgSolarPower * deltaHours; // Wh
      }
    }
  }

  // Update last values
  if (gridPower !== null) dailyEnergy.lastGridPower = gridPower;
  if (homePower !== null) dailyEnergy.lastHomePower = homePower;
  if (solarPower !== null) dailyEnergy.lastSolarPower = solarPower;
  dailyEnergy.lastTimestamp = now;
}

// Calculate derived daily metrics
function getDailyMetrics() {
  const gridImportKwh = dailyEnergy.gridImport / 1000;
  const gridExportKwh = dailyEnergy.gridExport / 1000;
  const homeConsumedKwh = dailyEnergy.homeConsumed / 1000;
  const solarProducedKwh = dailyEnergy.solarProduced / 1000;

  // Solar used directly = solar produced - exported to grid
  const solarUsedKwh = Math.max(0, solarProducedKwh - gridExportKwh);

  // Self-sufficiency: % of home consumption covered by solar
  const selfSufficiency = homeConsumedKwh > 0
    ? Math.min(100, (solarUsedKwh / homeConsumedKwh) * 100)
    : 0;

  // Self-consumption: % of solar production used locally
  const selfConsumption = solarProducedKwh > 0
    ? Math.min(100, (solarUsedKwh / solarProducedKwh) * 100)
    : 0;

  return {
    gridImportKwh: gridImportKwh.toFixed(2),
    gridExportKwh: gridExportKwh.toFixed(2),
    homeConsumedKwh: homeConsumedKwh.toFixed(2),
    selfSufficiency: selfSufficiency.toFixed(0),
    selfConsumption: selfConsumption.toFixed(0)
  };
}

// Current power values for integration tracking
let currentPower = {
  grid: null,
  home: null,
  solar1: 0,
  solar2: 0
};

// BMS protection state tracking
let bmsProtectionState = {
  maxDischargeCurrent: null,
  maxChargeCurrent: null,
  activeProtections: [], // Current active protections
  history: [] // Recent protection events (last 20)
};

// Add protection event to history
function addProtectionEvent(event) {
  bmsProtectionState.history.unshift({
    ...event,
    timestamp: Date.now()
  });
  // Keep only last 20 events
  if (bmsProtectionState.history.length > 20) {
    bmsProtectionState.history.pop();
  }
  // Emit updated protection status
  io.emit('bms-protection-status', {
    active: bmsProtectionState.activeProtections,
    history: bmsProtectionState.history
  });
}

// MQTT Client for Cerbo GX
const cerboClient = mqtt.connect(CONFIG.mqtt.cerboGx);

cerboClient.on('connect', () => {
  console.log('✓ Connected to Cerbo GX MQTT broker');

  // Subscribe to all Victron data
  cerboClient.subscribe('N/#');

  // Subscribe to ESP32 sensor data
  cerboClient.subscribe('home/#');

  // Subscribe to settings topics for control panel current values
  SETTINGS_TOPICS.forEach(topic => {
    const fullTopic = `N/${CONFIG.mqtt.cerboSerial}${topic}`;
    cerboClient.subscribe(fullTopic);
  });
  console.log('✓ Subscribed to settings topics for control panel');

  // Send initial keepalive (must use actual serial, not wildcard)
  const keepaliveTopic = `R/${CONFIG.mqtt.cerboSerial}/keepalive`;
  cerboClient.publish(keepaliveTopic, '');
  console.log('✓ Sent initial keepalive to Cerbo GX');

  // Request current settings values (read-only, for display)
  setTimeout(() => {
    SETTINGS_TOPICS.forEach(topic => {
      const readTopic = `R/${CONFIG.mqtt.cerboSerial}${topic}`;
      cerboClient.publish(readTopic, '');
    });
    console.log('✓ Requested current settings values');
  }, 2000);

  // Send keepalive every 25 seconds
  setInterval(() => {
    cerboClient.publish(keepaliveTopic, '');
  }, CONFIG.mqtt.keepaliveInterval);

  // Refresh settings values every 60 seconds
  setInterval(() => {
    SETTINGS_TOPICS.forEach(topic => {
      const readTopic = `R/${CONFIG.mqtt.cerboSerial}${topic}`;
      cerboClient.publish(readTopic, '');
    });
  }, 60000);
});

cerboClient.on('error', (error) => {
  console.error('✗ MQTT Error:', error.message);
});

cerboClient.on('message', (topic, message) => {
  const msgStr = message.toString();

  // Handle Victron data (N/... topics)
  if (topic.startsWith('N/')) {
    try {
      const data = JSON.parse(msgStr);

      // Store latest value
      latestData.victron[topic] = data.value;

      // Emit to connected web clients
      io.emit('victron-data', { topic, value: data.value });

      // Track power values for daily energy integration
      if (topic.endsWith('/grid/30/Ac/Power')) {
        currentPower.grid = data.value;
        updateDailyEnergy(currentPower.grid, currentPower.home, currentPower.solar1 + currentPower.solar2);
      }
      if (topic.endsWith('/vebus/276/Ac/Out/P')) {
        currentPower.home = data.value;
        updateDailyEnergy(currentPower.grid, currentPower.home, currentPower.solar1 + currentPower.solar2);
      }
      if (topic.endsWith('/solarcharger/278/Yield/Power')) {
        currentPower.solar1 = data.value;
        updateDailyEnergy(currentPower.grid, currentPower.home, currentPower.solar1 + currentPower.solar2);
      }
      if (topic.endsWith('/solarcharger/279/Yield/Power')) {
        currentPower.solar2 = data.value;
        updateDailyEnergy(currentPower.grid, currentPower.home, currentPower.solar1 + currentPower.solar2);
      }

      // BMS Protection Detection - MaxDischargeCurrent going to 0
      if (topic.endsWith('/battery/512/Info/MaxDischargeCurrent') ||
          topic.endsWith('/vebus/276/BatteryOperationalLimits/MaxDischargeCurrent')) {
        const prevValue = bmsProtectionState.maxDischargeCurrent;
        bmsProtectionState.maxDischargeCurrent = data.value;

        // Detect transition to 0 (protection activated)
        if (data.value === 0 && prevValue !== 0 && prevValue !== null) {
          // Add to active protections
          if (!bmsProtectionState.activeProtections.includes('discharge_disabled')) {
            bmsProtectionState.activeProtections.push('discharge_disabled');
          }
          const event = {
            type: 'discharge_disabled',
            severity: 'warning',
            title: 'Discharge Protection Active',
            message: 'Battery discharge disabled - low cell voltage'
          };
          addProtectionEvent(event);
          io.emit('system-notification', { ...event, timestamp: Date.now() });
          console.log('⚠️  BMS Protection: Discharge disabled (MaxDischargeCurrent = 0)');
        }
        // Detect transition from 0 (protection cleared)
        else if (data.value > 0 && prevValue === 0) {
          // Remove from active protections
          bmsProtectionState.activeProtections = bmsProtectionState.activeProtections.filter(p => p !== 'discharge_disabled');
          const event = {
            type: 'discharge_enabled',
            severity: 'info',
            title: 'Discharge Protection Cleared',
            message: `Battery discharge enabled (${data.value}A max)`
          };
          addProtectionEvent(event);
          io.emit('system-notification', { ...event, timestamp: Date.now() });
          console.log(`✓ BMS Protection cleared: MaxDischargeCurrent = ${data.value}A`);
        }
      }

      // BMS Protection Detection - MaxChargeCurrent going to 0
      if (topic.endsWith('/battery/512/Info/MaxChargeCurrent') ||
          topic.endsWith('/vebus/276/BatteryOperationalLimits/MaxChargeCurrent')) {
        const prevValue = bmsProtectionState.maxChargeCurrent;
        bmsProtectionState.maxChargeCurrent = data.value;

        if (data.value === 0 && prevValue !== 0 && prevValue !== null) {
          // Add to active protections
          if (!bmsProtectionState.activeProtections.includes('charge_disabled')) {
            bmsProtectionState.activeProtections.push('charge_disabled');
          }
          const event = {
            type: 'charge_disabled',
            severity: 'warning',
            title: 'Charge Protection Active',
            message: 'Battery charging disabled - high voltage or temperature'
          };
          addProtectionEvent(event);
          io.emit('system-notification', { ...event, timestamp: Date.now() });
          console.log('⚠️  BMS Protection: Charge disabled (MaxChargeCurrent = 0)');
        }
        else if (data.value > 0 && prevValue === 0) {
          // Remove from active protections
          bmsProtectionState.activeProtections = bmsProtectionState.activeProtections.filter(p => p !== 'charge_disabled');
          const event = {
            type: 'charge_enabled',
            severity: 'info',
            title: 'Charge Protection Cleared',
            message: `Battery charging enabled (${data.value}A max)`
          };
          addProtectionEvent(event);
          io.emit('system-notification', { ...event, timestamp: Date.now() });
          console.log(`✓ BMS Protection cleared: MaxChargeCurrent = ${data.value}A`);
        }
      }

      // Store in InfluxDB (only essential metrics + all alarms)
      if (typeof data.value === 'number') {
        const isEssential = ESSENTIAL_METRICS.some(metric => topic.endsWith(metric));
        const isAlarm = topic.includes('/Alarms/');
        if (isEssential || isAlarm) {
          const point = new Point('victron')
            .tag('topic', topic)
            .floatField('value', data.value);
          writeApi.writePoint(point);
        }
      }
    } catch (e) {
      // Non-JSON message, ignore
    }
  }

  // Handle ESP32 sensor data (home/... topics)
  if (topic.startsWith('home/')) {
    try {
      const data = JSON.parse(msgStr);
      const location = topic.split('/')[1];

      // Only process complete readings (both temperature and humidity present)
      if (typeof data.temperature === 'number' && typeof data.humidity === 'number') {
        // Store latest value
        latestData.sensors[location] = data;

        // Emit to web clients
        io.emit('sensor-data', { topic, location, ...data });

        console.log(`Sensor [${location}]: ${data.temperature}°C, ${data.humidity}%`);

        // Store in InfluxDB
        const point = new Point('sensor')
          .tag('location', location)
          .floatField('temperature', data.temperature)
          .floatField('humidity', data.humidity);
        writeApi.writePoint(point);
      }

    } catch (e) {
      // Handle non-JSON sensor data (individual temperature/humidity topics)
      const parts = topic.split('/');
      if (parts.length === 3) {
        const location = parts[1];
        const measurement = parts[2];
        const value = parseFloat(msgStr);

        if (!isNaN(value)) {
          io.emit('sensor-data', { topic, location, [measurement]: value });
        }
      }
    }
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('→ Web client connected:', socket.id);

  // Send latest data to newly connected client
  socket.emit('initial-data', latestData);

  // Send daily energy metrics immediately
  socket.emit('daily-energy', getDailyMetrics());

  // Send Seplos status and data if available
  if (seplosService) {
    socket.emit('seplos-status', seplosService.getStatus());
    if (latestData.seplos.telemetry) {
      socket.emit('seplos-telemetry', latestData.seplos.telemetry);
    }
    if (latestData.seplos.alarms) {
      socket.emit('seplos-alarms', latestData.seplos.alarms);
    }
  } else {
    socket.emit('seplos-status', { connected: false, enabled: CONFIG.seplos.enabled });
  }

  // Request fresh settings data for new client
  SETTINGS_TOPICS.forEach(topic => {
    const readTopic = `R/${CONFIG.mqtt.cerboSerial}${topic}`;
    cerboClient.publish(readTopic, '');
  });

  // Seplos Service Mode events
  socket.on('seplos-connect', async (data) => {
    if (seplosService && seplosService.connected) {
      socket.emit('seplos-status', seplosService.getStatus());
      return;
    }

    // Allow runtime configuration
    const portPath = data?.portPath || CONFIG.seplos.portPath;
    const autoScan = data?.autoScan !== undefined ? data.autoScan : CONFIG.seplos.autoScan;
    const maxPackAddress = data?.maxPackAddress || CONFIG.seplos.maxPackAddress;

    try {
      if (seplosService) {
        await seplosService.disconnect();
      }

      seplosService = new SeplosService({ portPath, autoScan, maxPackAddress });

      seplosService.on('connected', () => {
        io.emit('seplos-status', { connected: true, portPath });
      });

      seplosService.on('disconnected', () => {
        io.emit('seplos-status', { connected: false });
      });

      seplosService.on('telemetry', (telemetryData) => {
        latestData.seplos.telemetry = telemetryData;
        io.emit('seplos-telemetry', telemetryData);
      });

      seplosService.on('alarms', (alarmsData) => {
        latestData.seplos.alarms = alarmsData;
        io.emit('seplos-alarms', alarmsData);
      });

      seplosService.on('error', (err) => {
        io.emit('seplos-error', { message: err.message });
      });

      seplosService.on('packs-discovered', (packs) => {
        io.emit('seplos-packs-discovered', {
          packCount: packs.length,
          addresses: packs.map(a => '0x' + a.toString(16).padStart(2, '0'))
        });
      });

      await seplosService.connect();
      seplosService.startPolling(CONFIG.seplos.pollInterval);
      socket.emit('seplos-status', seplosService.getStatus());
    } catch (err) {
      socket.emit('seplos-error', { message: err.message });
    }
  });

  socket.on('seplos-disconnect', async () => {
    if (seplosService) {
      await seplosService.disconnect();
      socket.emit('seplos-status', { connected: false });
    }
  });

  socket.on('seplos-refresh', async () => {
    if (seplosService && seplosService.connected) {
      try {
        await seplosService.poll();
      } catch (err) {
        socket.emit('seplos-error', { message: err.message });
      }
    }
  });

  socket.on('seplos-list-ports', async () => {
    try {
      const ports = await SeplosService.listPorts();
      socket.emit('seplos-ports', ports);
    } catch (err) {
      socket.emit('seplos-error', { message: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('← Web client disconnected:', socket.id);
  });
});

// Broadcast daily energy metrics every 30 seconds
setInterval(() => {
  io.emit('daily-energy', getDailyMetrics());
}, 30000);

// API Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mqtt: cerboClient.connected,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/sensors', (req, res) => {
  res.json(latestData.sensors);
});

app.get('/api/victron', (req, res) => {
  res.json(latestData.victron);
});

// Seplos Service Mode API endpoints
app.get('/api/seplos/status', (req, res) => {
  if (seplosService) {
    res.json(seplosService.getStatus());
  } else {
    res.json({ connected: false, enabled: CONFIG.seplos.enabled });
  }
});

app.get('/api/seplos/telemetry', (req, res) => {
  res.json(latestData.seplos.telemetry || null);
});

app.get('/api/seplos/alarms', (req, res) => {
  res.json(latestData.seplos.alarms || null);
});

app.get('/api/seplos/ports', async (req, res) => {
  try {
    const ports = await SeplosService.listPorts();
    res.json(ports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BMS Protection Status API
app.get('/api/bms/protection', (req, res) => {
  res.json({
    active: bmsProtectionState.activeProtections,
    history: bmsProtectionState.history,
    maxDischargeCurrent: bmsProtectionState.maxDischargeCurrent,
    maxChargeCurrent: bmsProtectionState.maxChargeCurrent
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');

  // Disconnect Seplos if connected
  if (seplosService) {
    await seplosService.disconnect();
  }

  writeApi.close().then(() => {
    cerboClient.end();
    server.close(() => {
      process.exit(0);
    });
  });
});

// Start server
server.listen(CONFIG.port, async () => {
  console.log('=====================================');
  console.log('   Casa DaVinci Smart Home Server');
  console.log('=====================================');
  console.log(`Dashboard: http://casa-davinci.local:${CONFIG.port}`);
  console.log(`API Health: http://casa-davinci.local:${CONFIG.port}/api/health`);
  console.log('=====================================');

  // Initialize Seplos Service Mode
  await initSeplosService();
});
