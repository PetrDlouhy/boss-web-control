/**
 * EV-1-WL Pedal Bluetooth Communication Module
 * Handles all MIDI communication with EV-1-WL wireless expression pedal via Web Bluetooth
 */

import {
    BLE_MIDI_SERVICE,
    BLE_MIDI_CHARACTERISTIC,
    EV1WL_HEADER,
    EV1WL_BLOCK_READS,
    DEFAULT_PEDAL_CC_CODES,
    FOOTSWITCH_POLARITIES,
    SYSEX_CONFIG
} from './constants.js';

export class PedalCommunication {
    constructor() {
        // EV-1-WL Pedal connection state
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.isConnected = false;
        this.lastPedalValue = -1;

        // Pedal configuration
        this.pedalCCCodes = {
            previousParameter: DEFAULT_PEDAL_CC_CODES.PREVIOUS_PARAMETER,
            nextParameter: DEFAULT_PEDAL_CC_CODES.NEXT_PARAMETER,
            pedalControl: DEFAULT_PEDAL_CC_CODES.PEDAL_CONTROL
        };
        this.footswitchPolarity = 'normally_open';

        // SysEx state
        this.sysexBuffer = [];
        this.bufferingActive = false;
        this._gattQueue = Promise.resolve();
        this.pedalParams = {};
        this.onPedalParamUpdate = null;

        // Event callbacks
        this.onLog = null;
        this.onVolumeChange = null;
        this.onButtonPress = null;
        this.onConnectionStatusChange = null;
    }

    /**
     * Log message with optional callback
     */
    log(message, type = 'info') {
        console.log(message);
        if (this.onLog) {
            this.onLog(message, type);
        }
    }

    /**
     * Try to auto-reconnect to a previously paired pedal.
     * Uses watchAdvertisements() to detect the device, then connects.
     */
    async tryAutoReconnect() {
        if (!navigator.bluetooth || !navigator.bluetooth.getDevices) return false;

        try {
            const devices = await navigator.bluetooth.getDevices();
            const pedalDevice = devices.find(d => d.name && (d.name.startsWith('EV-1') || d.name.startsWith('EV-1-WL')));
            if (!pedalDevice) return false;

            this.log('🔄 Scanning for pedal...', 'info');
            await this.waitForDevice(pedalDevice, 8000);
            this.log('📡 Pedal detected, connecting...', 'info');
            return await this.connectToDevice(pedalDevice);
        } catch (error) {
            this.log(`Pedal auto-reconnect: ${error.message}`, 'info');
            return false;
        }
    }

    waitForDevice(device, timeoutMs) {
        return new Promise((resolve, reject) => {
            const abortCtrl = new AbortController();

            const timer = setTimeout(() => {
                device.removeEventListener('advertisementreceived', onAdvert);
                abortCtrl.abort();
                reject(new Error('Pedal not found nearby (timeout)'));
            }, timeoutMs);

            const onAdvert = () => {
                clearTimeout(timer);
                device.removeEventListener('advertisementreceived', onAdvert);
                abortCtrl.abort();
                resolve();
            };

            device.addEventListener('advertisementreceived', onAdvert);
            device.watchAdvertisements({ signal: abortCtrl.signal }).catch(() => {
                clearTimeout(timer);
                reject(new Error('watchAdvertisements not supported'));
            });
        });
    }

    /**
     * Connect to EV-1-WL Pedal via Web Bluetooth (shows device picker)
     */
    async connect() {
        try {
            this.log('🔍 Requesting EV-1-WL pedal device...', 'info');

            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'EV-1' },
                    { namePrefix: 'EV-1-WL' },
                    { services: [BLE_MIDI_SERVICE] }
                ],
                optionalServices: [BLE_MIDI_SERVICE]
            });

            return await this.connectToDevice(device);

        } catch (error) {
            this.log(`❌ Pedal connection failed: ${error.message}`, 'error');
            this.isConnected = false;
            this.notifyConnectionStatusChange(false);
            throw error;
        }
    }

    async connectToDevice(device) {
        this.device = device;
        this.log(`🦶 Selected device: ${this.device.name}`, 'info');

        if (!this._boundDisconnectHandler) {
            this._boundDisconnectHandler = () => this.handleDisconnection();
        }
        this.device.removeEventListener('gattserverdisconnected', this._boundDisconnectHandler);
        this.device.addEventListener('gattserverdisconnected', this._boundDisconnectHandler);

        try {
            this.log('🔌 Connecting to pedal GATT server...', 'info');
            this.server = await this.device.gatt.connect();

            this.log('🎵 Getting pedal MIDI service...', 'info');
            const service = await this.server.getPrimaryService(BLE_MIDI_SERVICE);

            this.log('📡 Getting pedal MIDI characteristic...', 'info');
            this.characteristic = await service.getCharacteristic(BLE_MIDI_CHARACTERISTIC);

            this.log('🔔 Starting pedal notifications...', 'info');
            await this.characteristic.startNotifications();
        } catch (error) {
            if (this.server && this.server.connected) {
                this.server.disconnect();
            }
            this.cleanup();
            throw error;
        }

        this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
            this.handleMIDIData(event.target.value);
        });

        this.isConnected = true;
        this.notifyConnectionStatusChange(true);

        this.log('✅ EV-1-WL pedal connected successfully!', 'success');

        return true;
    }

    /**
     * Disconnect from EV-1-WL Pedal
     */
    async disconnect() {
        try {
            if (this.characteristic) {
                try {
                    await this.characteristic.stopNotifications();
                    this.log('🔕 Stopped pedal notifications', 'info');
                } catch (error) {
                    this.log(`⚠️ Error stopping pedal notifications: ${error.message}`, 'warning');
                }
            }

            if (this.server && this.server.connected) {
                await this.server.disconnect();
                this.log('🔌 Pedal GATT server disconnected', 'info');
            }

        } catch (error) {
            this.log(`⚠️ Error during pedal disconnection: ${error.message}`, 'warning');
        } finally {
            this.cleanup();
        }
    }

    /**
     * Handle disconnection event
     */
    handleDisconnection() {
        this.log('🔌 EV-1-WL pedal disconnected', 'warning');
        this.cleanup();
    }

    /**
     * Cleanup connection state
     */
    cleanup() {
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.isConnected = false;
        this.lastPedalValue = -1;
        this.sysexBuffer = [];
        this.bufferingActive = false;
        this.notifyConnectionStatusChange(false);
    }

    // ===== SysEx infrastructure =====

    rolandChecksum(dataBytes) {
        const total = dataBytes.reduce((sum, byte) => sum + byte, 0);
        return (128 - (total % 128)) % 128;
    }

    createBLEMidiCommand(sysexData) {
        const timestamp = 0xb7;
        return new Uint8Array([
            0x90, timestamp, 0xf0,
            ...sysexData,
            timestamp, 0xf7
        ]);
    }

    _enqueueGattWrite(operation) {
        let resolve, reject;
        const result = new Promise((res, rej) => { resolve = res; reject = rej; });
        this._gattQueue = this._gattQueue.then(async () => {
            try { resolve(await operation()); }
            catch (err) { reject(err); }
        });
        return result;
    }

    async sendReadRequest(address, size) {
        if (!this.isConnected || !this.characteristic) {
            throw new Error('Pedal not connected');
        }
        return this._enqueueGattWrite(async () => {
            const header = [...EV1WL_HEADER];
            header[7] = 0x11; // RQ1
            const checksumData = [...address, ...size];
            const dataBytes = [...header, ...checksumData];
            const checksum = this.rolandChecksum(checksumData);
            const command = this.createBLEMidiCommand([...dataBytes, checksum]);
            await this.characteristic.writeValue(command);
            await new Promise(resolve => setTimeout(resolve, SYSEX_CONFIG.READ_DELAY));
        });
    }

    async sendWriteRequest(address, value) {
        if (!this.isConnected || !this.characteristic) {
            throw new Error('Pedal not connected');
        }
        const addrHex = address.map(b => b.toString(16).padStart(2, '0')).join(' ');
        this.log(`📝 Pedal write: [${addrHex}] = ${value}`, 'info');
        return this._enqueueGattWrite(async () => {
            const checksumData = [...address, value];
            const dataBytes = [...EV1WL_HEADER, ...checksumData];
            const checksum = this.rolandChecksum(checksumData);
            const command = this.createBLEMidiCommand([...dataBytes, checksum]);
            await this.characteristic.writeValue(command);
            await new Promise(resolve => setTimeout(resolve, SYSEX_CONFIG.COMMAND_DELAY));
        });
    }

    async readAllPedalParams() {
        for (const block of EV1WL_BLOCK_READS) {
            await this.sendReadRequest(block.address, block.size);
        }
    }

    parsePedalSysEx(sysexData) {
        if (sysexData.length < 10) return;

        const expectedHeader = [0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x10];
        for (let i = 0; i < expectedHeader.length; i++) {
            if (sysexData[i] !== expectedHeader[i]) return;
        }

        if (sysexData[7] !== 0x12) return; // DT1 only

        const addressBytes = sysexData.slice(8, 12);
        const dataStart = 12;
        const dataEnd = sysexData.length - 1; // exclude checksum
        const dataByteCount = dataEnd - dataStart;

        if (dataByteCount <= 0) return;

        // Block response: consecutive single-byte parameters
        const addr = [...addressBytes];
        for (let i = 0; i < dataByteCount; i++) {
            const addrKey = addr.map(b => b.toString(16).padStart(2, '0')).join('');
            const value = sysexData[dataStart + i];

            // Store in local param cache
            this.pedalParams[addrKey] = value;

            if (this.onPedalParamUpdate) {
                this.onPedalParamUpdate([...addr], value);
            }

            // Advance address (7-bit per byte)
            addr[3]++;
            if (addr[3] > 0x7F) { addr[3] = 0; addr[2]++; }
            if (addr[2] > 0x7F) { addr[2] = 0; addr[1]++; }
        }
    }

    clearSysExBuffer() {
        this.sysexBuffer = [];
        this.bufferingActive = false;
    }

    // ===== MIDI data handling =====

    handleMIDIData(value) {
        const data = new Uint8Array(value.buffer);

        // First pass: extract SysEx if present
        let sysexData = [];
        let foundStart = false;
        let foundEnd = false;

        for (let i = 0; i < data.length; i++) {
            if (data[i] === 0xF0) {
                foundStart = true;
                this.clearSysExBuffer();
                this.bufferingActive = true;
                continue;
            } else if (data[i] === 0xF7) {
                foundEnd = true;
                break;
            } else if (this.bufferingActive && data[i] < 0x80) {
                sysexData.push(data[i]);
            }
        }

        if (foundStart || this.bufferingActive) {
            if (sysexData.length > 0) {
                this.sysexBuffer.push(...sysexData);
            }
            if (foundEnd) {
                this.parsePedalSysEx(this.sysexBuffer);
                this.clearSysExBuffer();
            }
            if (foundStart || foundEnd) return; // SysEx packet, don't parse as CC
        }

        // Second pass: CC messages (only if no SysEx)
        for (let i = 0; i < data.length - 2; i++) {
            const status = data[i];
            const control = data[i + 1];
            const ccValue = data[i + 2];

            if ((status & 0xF0) === 0xB0 && control < 0x80 && ccValue < 0x80) {
                this.handleMIDICC(control, ccValue);
                i += 2;
            }
        }
    }

    /**
     * Handle MIDI CC message from pedal
     */
    handleMIDICC(ccNumber, ccValue) {
        if (ccNumber === this.pedalCCCodes.pedalControl) {
            this.handleVolumeChange(ccValue);
        } else if (ccNumber === this.pedalCCCodes.previousParameter) {
            this.handleButtonCC(ccValue, 'previous');
        } else if (ccNumber === this.pedalCCCodes.nextParameter) {
            this.handleButtonCC(ccValue, 'next');
        } else if (this.pedalCCCodes.expSw && ccNumber === this.pedalCCCodes.expSw) {
            this.handleButtonCC(ccValue, 'expSw');
        }
    }

    /**
     * Handle pedal volume change
     */
    handleVolumeChange(pedalValue) {
        // Validate value range first
        if (pedalValue < 0 || pedalValue > 127) {
            this.log(`⚠️ Invalid pedal value: ${pedalValue}`, 'warning');
            return;
        }

        // Skip duplicate values
        if (pedalValue === this.lastPedalValue) return;

        this.lastPedalValue = pedalValue;

        // Notify volume change
        if (this.onVolumeChange) {
            this.onVolumeChange({
                type: 'volume',
                value: pedalValue,
                normalized: pedalValue / 127 // Normalized 0-1 value
            });
        }
    }

    /**
     * Handle pedal button CC messages
     */
    handleButtonCC(ccValue, direction) {
        // Apply footswitch polarity
        const isPressed = this.footswitchPolarity === 'normally_open' ? ccValue === 127 : ccValue === 0;

        if (isPressed) {
            this.handleButtonPress(direction);
        }
    }

    /**
     * Handle pedal button press
     */
    handleButtonPress(button) {
        if (this.onButtonPress) {
            const directionMap = { next: 'right', previous: 'left', expSw: 'expSw' };
            this.onButtonPress({
                type: 'button',
                button,
                direction: directionMap[button] || button
            });
        }
    }

    /**
     * Set pedal CC codes configuration
     */
    setPedalCCCodes(previousParameter, nextParameter, pedalControl, expSw) {
        this.pedalCCCodes = {
            previousParameter: previousParameter || DEFAULT_PEDAL_CC_CODES.PREVIOUS_PARAMETER,
            nextParameter: nextParameter || DEFAULT_PEDAL_CC_CODES.NEXT_PARAMETER,
            pedalControl: pedalControl || DEFAULT_PEDAL_CC_CODES.PEDAL_CONTROL,
            expSw: expSw || null,
        };

        this.log(`🎛️ Updated pedal CC codes: Previous=${this.pedalCCCodes.previousParameter}, Next=${this.pedalCCCodes.nextParameter}, Control=${this.pedalCCCodes.pedalControl}, ExpSw=${this.pedalCCCodes.expSw ?? 'none'}`, 'info');
    }

    /**
     * Set footswitch polarity
     */
    setFootswitchPolarity(polarity) {
        if (polarity === 'normally_open' || polarity === 'normally_closed') {
            this.footswitchPolarity = polarity;
            this.log(`🦶 Updated footswitch polarity: ${polarity}`, 'info');
        } else {
            this.log(`⚠️ Invalid footswitch polarity: ${polarity}. Use 'normally_open' or 'normally_closed'`, 'warning');
        }
    }

    /**
     * Get current pedal configuration
     */
    getConfiguration() {
        return {
            pedalCCCodes: { ...this.pedalCCCodes },
            footswitchPolarity: this.footswitchPolarity,
            lastPedalValue: this.lastPedalValue
        };
    }

    /**
     * Notify connection status change
     */
    notifyConnectionStatusChange(connected) {
        if (this.onConnectionStatusChange) {
            this.onConnectionStatusChange({
                type: 'status',
                connected: connected,
                deviceName: this.device?.name || null
            });
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            deviceName: this.device?.name || null,
            hasCharacteristic: !!this.characteristic,
            lastPedalValue: this.lastPedalValue
        };
    }

    /**
     * Check if Web Bluetooth is supported for pedal connection
     */
    static isSupported() {
        const userAgent = navigator.userAgent || '';
        const isHTTPS = window.location.protocol === 'https:';
        const isLocalhost = window.location.hostname === 'localhost' ||
                           window.location.hostname === '127.0.0.1';
        const isSecureContext = window.isSecureContext;
        const hasNavigatorBluetooth = 'bluetooth' in navigator;

        // Browser detection
        const isChrome = /Chrome/.test(userAgent) && !/Edge/.test(userAgent);
        const isEdge = /Edge/.test(userAgent);
        const isOpera = /OPR/.test(userAgent);

        return hasNavigatorBluetooth && isSecureContext && (isChrome || isEdge || isOpera);
    }
}