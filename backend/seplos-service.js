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
    this.packAddresses = options.packAddresses || [0x00]; // Support multiple packs
    this.maxPackAddress = options.maxPackAddress || 0x0F; // Max address to scan (0x00-0x0F = 16 packs)
    this.autoScan = options.autoScan !== false; // Auto-scan for packs by default
    this.address = this.packAddresses[0]; // Current address for commands
    this.config = { ...DEFAULT_CONFIG, ...options.config };

    this.port = null;
    this.connected = false;
    this.buffer = '';
    this.lastTelemetry = null;
    this.lastAlarms = null;
    this.packTelemetry = {}; // Store telemetry per pack address
    this.packAlarms = {}; // Store alarms per pack address
    this.discoveredPacks = []; // Packs found during scan
    this.pollInterval = null;
    this.responseTimeout = null;
    this.pendingCallback = null;

    // Communication health tracking
    this.consecutiveFailures = 0;
    this.maxFailuresBeforeAlert = 3; // Alert after 3 consecutive failures
    this.communicationLost = false;
  }

  /**
   * Set pack addresses to poll
   */
  setPackAddresses(addresses) {
    this.packAddresses = addresses;
    console.log(`→ Seplos: Configured ${addresses.length} pack(s): ${addresses.map(a => '0x' + a.toString(16).padStart(2, '0')).join(', ')}`);
  }

  /**
   * Scan for connected packs by trying addresses 0x00 to maxPackAddress
   * Updates packAddresses with only responding packs
   */
  async scanForPacks() {
    console.log(`→ Seplos: Scanning for packs (addresses 0x00 to 0x${this.maxPackAddress.toString(16).padStart(2, '0')})...`);

    const foundPacks = [];

    for (let addr = 0x00; addr <= this.maxPackAddress; addr++) {
      try {
        // Try to get telemetry with short timeout
        const packNum = addr.toString(16).toUpperCase().padStart(2, '0');
        const result = await this.sendCommand(PROTOCOL.CMD.TELEMETRY, packNum, addr, 1500);

        if (result && result.packs && result.packs[0]) {
          foundPacks.push(addr);
          console.log(`  ✓ Pack found at address 0x${addr.toString(16).padStart(2, '0')}`);
        }
      } catch (err) {
        // No response at this address - that's fine, just not present
      }

      // Small delay between scans
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (foundPacks.length > 0) {
      this.discoveredPacks = foundPacks;
      this.packAddresses = foundPacks;
      this.address = foundPacks[0];
      console.log(`✓ Seplos: Found ${foundPacks.length} pack(s): ${foundPacks.map(a => '0x' + a.toString(16).padStart(2, '0')).join(', ')}`);
    } else {
      console.log('✗ Seplos: No packs found during scan');
    }

    this.emit('packs-discovered', foundPacks);
    return foundPacks;
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
   * @param {string} cid2 - Command code
   * @param {string} info - Info payload
   * @param {number} address - Pack address (optional, defaults to this.address)
   */
  buildCommand(cid2, info = '', address = null) {
    const adr = (address !== null ? address : this.address).toString(16).toUpperCase().padStart(2, '0');
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

      // Pack current (2 bytes, in 10mA units, no offset)
      // Positive = charging, negative = discharging (signed value)
      const rawCurrent = parseInt(info.slice(idx, idx + 4), 16);
      pack.current = rawCurrent / 100; // Convert to A
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

      // Skip remaining V2 fields - SOC field position is unreliable
      // Calculate SOC from remaining/full capacity instead (more accurate)
      idx += 16; // Skip 16 hex chars of remaining fields

      // Calculate SOC from capacity values (more reliable than parsed SOC field)
      if (pack.fullCapacity > 0) {
        pack.soc = Math.round((pack.remainingCapacity / pack.fullCapacity) * 100);
      } else {
        pack.soc = 0;
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

      this.port.on('open', async () => {
        console.log(`✓ Seplos: Connected to ${this.portPath}`);
        this.connected = true;
        this.buffer = '';
        this.emit('connected');

        // Auto-scan for packs if enabled
        if (this.autoScan) {
          // Small delay to let serial port stabilize
          await new Promise(r => setTimeout(r, 500));
          await this.scanForPacks();
        }

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
   * @param {string} cid2 - Command code
   * @param {string} info - Info payload
   * @param {number} address - Pack address
   * @param {number} timeout - Response timeout in ms
   */
  async sendCommand(cid2, info = '', address = null, timeout = 3000) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.port) {
        reject(new Error('Not connected'));
        return;
      }

      const targetAddress = address !== null ? address : this.address;
      const frame = this.buildCommand(cid2, info, targetAddress);

      // Store pending command type and address for response parsing
      this.pendingCommand = cid2;
      this.pendingAddress = targetAddress;

      // Set response timeout
      this.responseTimeout = setTimeout(() => {
        this.pendingCallback = null;
        this.pendingCommand = null;
        this.pendingAddress = null;
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
          this.pendingAddress = null;
          reject(err);
        }
      });
    });
  }

  /**
   * Request telemetry data for a specific pack
   * @param {number} address - Pack address (optional)
   */
  async getTelemetry(address = null) {
    const targetAddress = address !== null ? address : this.address;
    const packNum = targetAddress.toString(16).toUpperCase().padStart(2, '0');
    return this.sendCommand(PROTOCOL.CMD.TELEMETRY, packNum, targetAddress);
  }

  /**
   * Request alarm status for a specific pack
   * @param {number} address - Pack address (optional)
   */
  async getAlarms(address = null) {
    const targetAddress = address !== null ? address : this.address;
    const packNum = targetAddress.toString(16).toUpperCase().padStart(2, '0');
    return this.sendCommand(PROTOCOL.CMD.TELECONTROL, packNum, targetAddress);
  }

  /**
   * Get telemetry for all configured packs
   */
  async getAllTelemetry() {
    const results = [];
    for (const addr of this.packAddresses) {
      try {
        const result = await this.getTelemetry(addr);
        if (result && result.packs && result.packs[0]) {
          result.packs[0].address = addr;
          this.packTelemetry[addr] = result.packs[0];
          results.push(result.packs[0]);
        }
      } catch (err) {
        console.error(`✗ Seplos: Failed to get telemetry for pack 0x${addr.toString(16).padStart(2, '0')}:`, err.message);
      }
      // Small delay between pack queries
      if (this.packAddresses.indexOf(addr) < this.packAddresses.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Update combined telemetry
    this.lastTelemetry = {
      packCount: results.length,
      packs: results,
      timestamp: Date.now()
    };

    this.emit('telemetry', this.lastTelemetry);
    return this.lastTelemetry;
  }

  /**
   * Get alarms for all configured packs
   */
  async getAllAlarms() {
    const results = [];
    for (const addr of this.packAddresses) {
      try {
        const result = await this.getAlarms(addr);
        if (result && result.packs && result.packs[0]) {
          result.packs[0].address = addr;
          this.packAlarms[addr] = result.packs[0];
          results.push(result.packs[0]);
        }
      } catch (err) {
        console.error(`✗ Seplos: Failed to get alarms for pack 0x${addr.toString(16).padStart(2, '0')}:`, err.message);
      }
      // Small delay between pack queries
      if (this.packAddresses.indexOf(addr) < this.packAddresses.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Update combined alarms
    this.lastAlarms = {
      packCount: results.length,
      packs: results,
      timestamp: Date.now()
    };

    this.emit('alarms', this.lastAlarms);
    return this.lastAlarms;
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
   * Poll for telemetry and alarms from all packs
   */
  async poll() {
    if (!this.connected) return;

    let success = false;

    try {
      const telemetry = await this.getAllTelemetry();
      // Check if we got any data
      if (telemetry && telemetry.packs && telemetry.packs.length > 0) {
        success = true;
      }

      // Small delay between telemetry and alarms
      await new Promise(resolve => setTimeout(resolve, 200));
      await this.getAllAlarms();
    } catch (err) {
      console.error('✗ Seplos: Poll error:', err.message);
      this.emit('error', err);
    }

    // Track communication health
    if (success) {
      if (this.communicationLost) {
        // Communication restored
        this.communicationLost = false;
        console.log('✓ Seplos: Communication restored');
        this.emit('communication-restored');
      }
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.maxFailuresBeforeAlert && !this.communicationLost) {
        this.communicationLost = true;
        console.error('✗ Seplos: Communication lost - no response from BMS');
        this.emit('communication-lost', {
          failures: this.consecutiveFailures,
          message: 'No response from BMS - check RS485 connection'
        });
      }
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
    // Connected means: serial port open AND BMS responding
    const effectiveConnected = this.connected && !this.communicationLost;

    return {
      connected: effectiveConnected,
      portConnected: this.connected,
      communicationLost: this.communicationLost,
      portPath: this.portPath,
      packAddresses: this.packAddresses,
      discoveredPacks: this.discoveredPacks.length,
      packCount: this.discoveredPacks.length || this.packAddresses.length,
      polling: this.pollInterval !== null,
      lastTelemetry: this.lastTelemetry,
      lastAlarms: this.lastAlarms,
      error: this.communicationLost ? 'No response from BMS - check RS485 connection' : null
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
