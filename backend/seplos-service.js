/**
 * Seplos BMS V2 Service Module
 * Communicates with Seplos BMS via RS485 using Modbus ASCII protocol
 */

const { SerialPort } = require('serialport');
const { EventEmitter } = require('events');

// Protocol constants
const PROTOCOL = {
  SOI: 0x7E,        // '~' Start of frame
  EOI: 0x0D,        // '\r' End of frame
  VER: '20',        // Protocol version
  CID1: '46',       // Device type (LiFePO4)

  // Command codes (CID2)
  CMD: {
    TELEMETRY: '42',       // Cell voltages, temps, SOC, current
    TELECONTROL: '44',     // Alarm/protection status
    SYSTEM_PARAMS: '47',   // System configuration
    PROTOCOL_VER: '4F',    // Firmware/protocol version
    MANUFACTURER: '51'     // Device info
  }
};

// Default serial configuration
const DEFAULT_CONFIG = {
  baudRate: 19200,
  dataBits: 8,
  parity: 'none',
  stopBits: 1
};

class SeplosService extends EventEmitter {
  constructor(options = {}) {
    super();

    this.portPath = options.portPath || '/dev/ttyUSB0';
    this.address = options.address || 0x00;
    this.config = { ...DEFAULT_CONFIG, ...options.config };

    this.port = null;
    this.connected = false;
    this.buffer = '';
    this.lastTelemetry = null;
    this.lastAlarms = null;
    this.pollInterval = null;
    this.responseTimeout = null;
    this.pendingCallback = null;
  }

  /**
   * Calculate checksum for Seplos ASCII frame
   * Sum of all bytes (ASCII values) between SOI and CHKSUM, then modulo 65536, then invert+1
   */
  calculateChecksum(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data.charCodeAt(i);
    }
    const checksum = (~sum + 1) & 0xFFFF;
    return checksum.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * Calculate LENID (length with checksum)
   * Format: 4 hex chars where:
   * - First char is length checksum (D15-D12)
   * - Remaining 3 chars are the length value
   */
  calculateLenId(infoLength) {
    const lenValue = infoLength & 0xFFF;
    const lenSum = ((lenValue >> 8) + ((lenValue >> 4) & 0xF) + (lenValue & 0xF)) & 0xF;
    const lenChk = (~lenSum + 1) & 0xF;
    const lenId = (lenChk << 12) | lenValue;
    return lenId.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * Build a Seplos ASCII command frame
   */
  buildCommand(cid2, info = '') {
    const adr = this.address.toString(16).toUpperCase().padStart(2, '0');
    const lenId = this.calculateLenId(info.length);

    // Data portion (VER + ADR + CID1 + CID2 + LENID + INFO)
    const dataStr = PROTOCOL.VER + adr + PROTOCOL.CID1 + cid2 + lenId + info;

    // Calculate checksum
    const checksum = this.calculateChecksum(dataStr);

    // Build full frame
    const frame = String.fromCharCode(PROTOCOL.SOI) + dataStr + checksum + String.fromCharCode(PROTOCOL.EOI);

    return frame;
  }

  /**
   * Parse response frame
   * Response format: SOI + VER + ADR + CID1 + RTN + LENGTH + INFO + CHKSUM + EOI
   * Note: Response has RTN (return code) where request has CID2
   */
  parseResponse(frame) {
    // Validate frame markers
    if (frame.charCodeAt(0) !== PROTOCOL.SOI || frame.charCodeAt(frame.length - 1) !== PROTOCOL.EOI) {
      throw new Error('Invalid frame markers');
    }

    // Extract data (between SOI and EOI)
    const data = frame.slice(1, -1);

    // Extract checksum (last 4 chars)
    const receivedChecksum = data.slice(-4);
    const payload = data.slice(0, -4);

    // Verify checksum
    const calculatedChecksum = this.calculateChecksum(payload);
    if (receivedChecksum !== calculatedChecksum) {
      throw new Error(`Checksum mismatch: expected ${calculatedChecksum}, got ${receivedChecksum}`);
    }

    // Parse header fields
    // Response: VER(2) + ADR(2) + CID1(2) + RTN(2) + LENGTH(4) + INFO(variable)
    const ver = payload.slice(0, 2);
    const adr = parseInt(payload.slice(2, 4), 16);
    const cid1 = payload.slice(4, 6);
    const rtn = parseInt(payload.slice(6, 8), 16);  // RTN (return code), 0x00 = success
    const lenId = payload.slice(8, 12);
    const info = payload.slice(12);  // Data starts after LENGTH field

    // Extract length value (lower 12 bits)
    const lenValue = parseInt(lenId, 16) & 0xFFF;

    return {
      ver,
      adr,
      cid1,
      rtn,
      info,
      lenValue
    };
  }

  /**
   * Parse telemetry response (CID2 = 0x42)
   * INFO format: [INFOFLAG(1)] [PACK_ADDR(1)] [CELL_COUNT(1)] [CELL_DATA...] [TEMP_COUNT(1)] [TEMP_DATA...] ...
   */
  parseTelemetry(info) {
    if (!info || info.length < 10) {
      throw new Error('Telemetry data too short');
    }

    let idx = 0;

    // Skip INFOFLAG (command echo) and pack address
    const infoFlag = parseInt(info.slice(idx, idx + 2), 16);
    idx += 2;

    const packAddr = parseInt(info.slice(idx, idx + 2), 16);
    idx += 2;

    // We'll treat this as a single pack response
    const packCount = 1;

    const packs = [];

    for (let p = 0; p < packCount; p++) {
      const pack = {
        cells: [],
        temperatures: [],
        current: 0,
        voltage: 0,
        remainingCapacity: 0,
        customNumber: 0,
        fullCapacity: 0,
        cycleCount: 0,
        soc: 0,
        soh: 0,
        portVoltage: 0
      };

      // Number of cells
      const cellCount = parseInt(info.slice(idx, idx + 2), 16);
      idx += 2;

      // Cell voltages (2 bytes each, in mV)
      for (let c = 0; c < cellCount; c++) {
        const mv = parseInt(info.slice(idx, idx + 4), 16);
        pack.cells.push(mv / 1000); // Convert to V
        idx += 4;
      }

      // Number of temperature sensors
      const tempCount = parseInt(info.slice(idx, idx + 2), 16);
      idx += 2;

      // Temperatures (2 bytes each, value - 2731 = 0.1°C, Kelvin offset)
      for (let t = 0; t < tempCount; t++) {
        const raw = parseInt(info.slice(idx, idx + 4), 16);
        pack.temperatures.push((raw - 2731) / 10); // Convert to °C
        idx += 4;
      }

      // Pack current (2 bytes, offset 30000 = 0A)
      // V2 uses ~40mA per unit (not 10mA as documented)
      // Convention: positive = charging, negative = discharging
      const rawCurrent = parseInt(info.slice(idx, idx + 4), 16);
      pack.current = (30000 - rawCurrent) / 400; // Convert to A
      idx += 4;

      // Pack voltage (2 bytes, in 10mV)
      pack.voltage = parseInt(info.slice(idx, idx + 4), 16) / 100;
      idx += 4;

      // Remaining capacity (2 bytes, in 10mAh)
      pack.remainingCapacity = parseInt(info.slice(idx, idx + 4), 16) / 100;
      idx += 4;

      // Custom number (1 byte)
      pack.customNumber = parseInt(info.slice(idx, idx + 2), 16);
      idx += 2;

      // Full capacity (2 bytes, in 10mAh)
      pack.fullCapacity = parseInt(info.slice(idx, idx + 4), 16) / 100;
      idx += 4;

      // Cycle count (2 bytes)
      pack.cycleCount = parseInt(info.slice(idx, idx + 4), 16);
      idx += 4;

      // Design capacity / rated capacity (2 bytes, in 10mAh) - V2 specific
      pack.designCapacity = parseInt(info.slice(idx, idx + 4), 16) / 100;
      idx += 4;

      // Protection/warning status (2 bytes)
      pack.protectionStatus = parseInt(info.slice(idx, idx + 4), 16);
      idx += 4;

      // SOH (2 bytes, in 0.1%)
      pack.soh = parseInt(info.slice(idx, idx + 4), 16) / 10;
      idx += 4;

      // Port voltage (2 bytes, in 10mV)
      pack.portVoltage = parseInt(info.slice(idx, idx + 4), 16) / 100;
      idx += 4;

      // SOC (2 bytes, in 1% for V2) - after port voltage in V2 protocol
      pack.soc = parseInt(info.slice(idx, idx + 4), 16);
      idx += 4;

      // Skip remaining V2 fields (reserved/unknown - 12 hex chars)
      idx += 12;

      packs.push(pack);
    }

    return {
      packCount,
      packs,
      timestamp: Date.now()
    };
  }

  /**
   * Parse alarm/telecontrol response (CID2 = 0x44)
   */
  parseAlarms(info) {
    if (!info || info.length < 4) {
      throw new Error('Alarm data too short');
    }

    let idx = 0;

    // Number of packs
    const packCount = parseInt(info.slice(idx, idx + 2), 16);
    idx += 2;

    const packs = [];

    for (let p = 0; p < packCount; p++) {
      const pack = {
        cellAlarms: [],
        tempAlarms: [],
        currentAlarm: 0,
        voltageAlarm: 0,
        customAlarm: 0,
        alarmEvent1: 0,
        alarmEvent2: 0,
        onOffState: 0,
        equilibriumState1: 0,
        equilibriumState2: 0,
        systemState: 0,
        disconnectionState1: 0,
        disconnectionState2: 0
      };

      // Number of cells
      const cellCount = parseInt(info.slice(idx, idx + 2), 16);
      idx += 2;

      // Cell alarms (1 byte each)
      for (let c = 0; c < cellCount; c++) {
        const alarm = parseInt(info.slice(idx, idx + 2), 16);
        pack.cellAlarms.push({
          overvoltage: (alarm & 0x02) !== 0,
          undervoltage: (alarm & 0x01) !== 0,
          overvoltageProt: (alarm & 0x08) !== 0,
          undervoltageProt: (alarm & 0x04) !== 0
        });
        idx += 2;
      }

      // Number of temperature sensors
      const tempCount = parseInt(info.slice(idx, idx + 2), 16);
      idx += 2;

      // Temperature alarms (1 byte each)
      for (let t = 0; t < tempCount; t++) {
        const alarm = parseInt(info.slice(idx, idx + 2), 16);
        pack.tempAlarms.push({
          overtemp: (alarm & 0x02) !== 0,
          undertemp: (alarm & 0x01) !== 0,
          overtempProt: (alarm & 0x08) !== 0,
          undertempProt: (alarm & 0x04) !== 0
        });
        idx += 2;
      }

      // Current alarm
      pack.currentAlarm = parseInt(info.slice(idx, idx + 2), 16);
      idx += 2;

      // Voltage alarm
      pack.voltageAlarm = parseInt(info.slice(idx, idx + 2), 16);
      idx += 2;

      // Custom alarm
      pack.customAlarm = parseInt(info.slice(idx, idx + 2), 16);
      idx += 2;

      // Alarm event bytes
      pack.alarmEvent1 = parseInt(info.slice(idx, idx + 2), 16);
      idx += 2;
      pack.alarmEvent2 = parseInt(info.slice(idx, idx + 2), 16);
      idx += 2;

      // On/off state
      pack.onOffState = parseInt(info.slice(idx, idx + 2), 16);
      idx += 2;

      // Equilibrium state
      pack.equilibriumState1 = parseInt(info.slice(idx, idx + 4), 16);
      idx += 4;
      pack.equilibriumState2 = parseInt(info.slice(idx, idx + 4), 16);
      idx += 4;

      // System state
      pack.systemState = parseInt(info.slice(idx, idx + 2), 16);
      idx += 2;

      // Disconnection state
      if (idx + 8 <= info.length) {
        pack.disconnectionState1 = parseInt(info.slice(idx, idx + 4), 16);
        idx += 4;
        pack.disconnectionState2 = parseInt(info.slice(idx, idx + 4), 16);
        idx += 4;
      }

      // Decode system state flags
      pack.systemStateFlags = {
        discharge: (pack.systemState & 0x01) !== 0,
        charge: (pack.systemState & 0x02) !== 0,
        floatCharge: (pack.systemState & 0x04) !== 0,
        fullCharge: (pack.systemState & 0x08) !== 0,
        standby: (pack.systemState & 0x10) !== 0
      };

      // Decode on/off state flags
      pack.onOffStateFlags = {
        dischargeMos: (pack.onOffState & 0x01) !== 0,
        chargeMos: (pack.onOffState & 0x02) !== 0,
        currentLimit: (pack.onOffState & 0x04) !== 0,
        heater: (pack.onOffState & 0x08) !== 0
      };

      // Determine active alarms
      pack.activeAlarms = [];

      // Check cell alarms
      pack.cellAlarms.forEach((alarm, i) => {
        if (alarm.overvoltage) pack.activeAlarms.push(`Cell ${i + 1} overvoltage warning`);
        if (alarm.undervoltage) pack.activeAlarms.push(`Cell ${i + 1} undervoltage warning`);
        if (alarm.overvoltageProt) pack.activeAlarms.push(`Cell ${i + 1} overvoltage protection`);
        if (alarm.undervoltageProt) pack.activeAlarms.push(`Cell ${i + 1} undervoltage protection`);
      });

      // Check temp alarms
      pack.tempAlarms.forEach((alarm, i) => {
        if (alarm.overtemp) pack.activeAlarms.push(`Temp ${i + 1} overtemperature warning`);
        if (alarm.undertemp) pack.activeAlarms.push(`Temp ${i + 1} undertemperature warning`);
        if (alarm.overtempProt) pack.activeAlarms.push(`Temp ${i + 1} overtemperature protection`);
        if (alarm.undertempProt) pack.activeAlarms.push(`Temp ${i + 1} undertemperature protection`);
      });

      // Check current alarm
      if (pack.currentAlarm & 0x01) pack.activeAlarms.push('Discharge overcurrent warning');
      if (pack.currentAlarm & 0x02) pack.activeAlarms.push('Charge overcurrent warning');
      if (pack.currentAlarm & 0x04) pack.activeAlarms.push('Discharge overcurrent protection');
      if (pack.currentAlarm & 0x08) pack.activeAlarms.push('Charge overcurrent protection');

      // Check voltage alarm
      if (pack.voltageAlarm & 0x01) pack.activeAlarms.push('Pack undervoltage warning');
      if (pack.voltageAlarm & 0x02) pack.activeAlarms.push('Pack overvoltage warning');
      if (pack.voltageAlarm & 0x04) pack.activeAlarms.push('Pack undervoltage protection');
      if (pack.voltageAlarm & 0x08) pack.activeAlarms.push('Pack overvoltage protection');

      // Determine balancing cells
      pack.balancingCells = [];
      for (let i = 0; i < 16; i++) {
        if (pack.equilibriumState1 & (1 << i)) {
          pack.balancingCells.push(i + 1);
        }
      }
      for (let i = 0; i < 16; i++) {
        if (pack.equilibriumState2 & (1 << i)) {
          pack.balancingCells.push(i + 17);
        }
      }

      packs.push(pack);
    }

    return {
      packCount,
      packs,
      timestamp: Date.now()
    };
  }

  /**
   * Connect to serial port
   */
  async connect() {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        resolve();
        return;
      }

      this.port = new SerialPort({
        path: this.portPath,
        baudRate: this.config.baudRate,
        dataBits: this.config.dataBits,
        parity: this.config.parity,
        stopBits: this.config.stopBits
      });

      this.port.on('open', () => {
        console.log(`✓ Seplos: Connected to ${this.portPath}`);
        this.connected = true;
        this.buffer = '';
        this.emit('connected');
        resolve();
      });

      this.port.on('error', (err) => {
        console.error('✗ Seplos: Serial port error:', err.message);
        this.emit('error', err);
        if (!this.connected) {
          reject(err);
        }
      });

      this.port.on('close', () => {
        console.log('→ Seplos: Port closed');
        this.connected = false;
        this.emit('disconnected');
      });

      this.port.on('data', (data) => {
        this.buffer += data.toString('ascii');
        this.processBuffer();
      });
    });
  }

  /**
   * Process incoming data buffer
   */
  processBuffer() {
    // Look for complete frame (SOI ... EOI)
    const soiIndex = this.buffer.indexOf(String.fromCharCode(PROTOCOL.SOI));
    const eoiIndex = this.buffer.indexOf(String.fromCharCode(PROTOCOL.EOI));

    if (soiIndex !== -1 && eoiIndex !== -1 && eoiIndex > soiIndex) {
      const frame = this.buffer.slice(soiIndex, eoiIndex + 1);
      this.buffer = this.buffer.slice(eoiIndex + 1);

      // Clear timeout if waiting for response
      if (this.responseTimeout) {
        clearTimeout(this.responseTimeout);
        this.responseTimeout = null;
      }

      try {
        const parsed = this.parseResponse(frame);

        // Check return code (RTN) - position where CID2 would be in request is RTN in response
        // RTN of 0x00 means success
        if (parsed.rtn !== 0) {
          const error = new Error(`BMS returned error code: 0x${parsed.rtn.toString(16)}`);
          if (this.pendingCallback) {
            this.pendingCallback(error, null);
            this.pendingCallback = null;
            this.pendingCommand = null;
          }
          return;
        }

        // Route to appropriate parser based on the command we sent (not response CID2)
        let result;
        const cmd = this.pendingCommand;
        this.pendingCommand = null;

        switch (cmd) {
          case PROTOCOL.CMD.TELEMETRY:
            result = this.parseTelemetry(parsed.info);
            this.lastTelemetry = result;
            this.emit('telemetry', result);
            break;
          case PROTOCOL.CMD.TELECONTROL:
            result = this.parseAlarms(parsed.info);
            this.lastAlarms = result;
            this.emit('alarms', result);
            break;
          default:
            result = parsed;
        }

        if (this.pendingCallback) {
          this.pendingCallback(null, result);
          this.pendingCallback = null;
        }
      } catch (err) {
        console.error('✗ Seplos: Parse error:', err.message);
        if (this.pendingCallback) {
          this.pendingCallback(err, null);
          this.pendingCallback = null;
        }
      }
    }
  }

  /**
   * Send command and wait for response
   */
  async sendCommand(cid2, info = '', timeout = 3000) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.port) {
        reject(new Error('Not connected'));
        return;
      }

      const frame = this.buildCommand(cid2, info);

      // Store pending command type for response parsing
      this.pendingCommand = cid2;

      // Set response timeout
      this.responseTimeout = setTimeout(() => {
        this.pendingCallback = null;
        this.pendingCommand = null;
        reject(new Error('Response timeout'));
      }, timeout);

      // Set callback for response
      this.pendingCallback = (err, result) => {
        if (err) reject(err);
        else resolve(result);
      };

      // Send command
      this.port.write(frame, (err) => {
        if (err) {
          clearTimeout(this.responseTimeout);
          this.pendingCallback = null;
          this.pendingCommand = null;
          reject(err);
        }
      });
    });
  }

  /**
   * Request telemetry data
   */
  async getTelemetry() {
    const packNum = this.address.toString(16).toUpperCase().padStart(2, '0');
    return this.sendCommand(PROTOCOL.CMD.TELEMETRY, packNum);
  }

  /**
   * Request alarm status
   */
  async getAlarms() {
    const packNum = this.address.toString(16).toUpperCase().padStart(2, '0');
    return this.sendCommand(PROTOCOL.CMD.TELECONTROL, packNum);
  }

  /**
   * Start polling for data
   */
  startPolling(interval = 5000) {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    // Initial poll
    this.poll();

    // Set up interval
    this.pollInterval = setInterval(() => {
      this.poll();
    }, interval);

    console.log(`✓ Seplos: Polling started (${interval}ms interval)`);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('→ Seplos: Polling stopped');
    }
  }

  /**
   * Poll for telemetry and alarms
   */
  async poll() {
    if (!this.connected) return;

    try {
      await this.getTelemetry();
      // Small delay between commands
      await new Promise(resolve => setTimeout(resolve, 200));
      await this.getAlarms();
    } catch (err) {
      console.error('✗ Seplos: Poll error:', err.message);
      this.emit('error', err);
    }
  }

  /**
   * Disconnect from serial port
   */
  async disconnect() {
    this.stopPolling();

    return new Promise((resolve) => {
      if (!this.port || !this.connected) {
        resolve();
        return;
      }

      this.port.close((err) => {
        if (err) {
          console.error('✗ Seplos: Error closing port:', err.message);
        }
        this.connected = false;
        resolve();
      });
    });
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      connected: this.connected,
      portPath: this.portPath,
      address: this.address,
      polling: this.pollInterval !== null,
      lastTelemetry: this.lastTelemetry,
      lastAlarms: this.lastAlarms
    };
  }

  /**
   * List available serial ports
   */
  static async listPorts() {
    const { SerialPort } = require('serialport');
    const ports = await SerialPort.list();
    return ports.filter(p =>
      p.path.includes('ttyUSB') ||
      p.path.includes('ttyACM') ||
      p.path.includes('serial') ||
      p.path.includes('usbserial')
    );
  }
}

module.exports = SeplosService;
