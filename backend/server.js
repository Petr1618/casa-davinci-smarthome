const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');

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
  }
};

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
app.use(express.static('../frontend'));

// Store latest values for new client connections
const latestData = {
  victron: {},
  sensors: {}
};

// MQTT Client for Cerbo GX
const cerboClient = mqtt.connect(CONFIG.mqtt.cerboGx);

cerboClient.on('connect', () => {
  console.log('✓ Connected to Cerbo GX MQTT broker');

  // Subscribe to all Victron data
  cerboClient.subscribe('N/#');

  // Subscribe to ESP32 sensor data
  cerboClient.subscribe('home/#');

  // Send initial keepalive (must use actual serial, not wildcard)
  const keepaliveTopic = `R/${CONFIG.mqtt.cerboSerial}/keepalive`;
  cerboClient.publish(keepaliveTopic, '');
  console.log('✓ Sent initial keepalive to Cerbo GX');

  // Send keepalive every 25 seconds
  setInterval(() => {
    cerboClient.publish(keepaliveTopic, '');
  }, CONFIG.mqtt.keepaliveInterval);
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

  socket.on('disconnect', () => {
    console.log('← Web client disconnected:', socket.id);
  });
});

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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  writeApi.close().then(() => {
    cerboClient.end();
    server.close(() => {
      process.exit(0);
    });
  });
});

// Start server
server.listen(CONFIG.port, () => {
  console.log('=====================================');
  console.log('   Casa DaVinci Smart Home Server');
  console.log('=====================================');
  console.log(`Dashboard: http://casa-davinci.local:${CONFIG.port}`);
  console.log(`API Health: http://casa-davinci.local:${CONFIG.port}/api/health`);
  console.log('=====================================');
});
