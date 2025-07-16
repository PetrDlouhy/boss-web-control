/**
 * Boss Cube II Bluetooth Communication Module
 * Handles all SysEx communication with Boss Cube II via Web Bluetooth
 */

import { 
    BOSS_CUBE_HEADER, 
    BLE_MIDI_SERVICE, 
    BLE_MIDI_CHARACTERISTIC,
    DEVICE_ADDRESS,
    SYSTEM_ADDRESSES,
    SYSEX_CONFIG
} from './constants.js';

export class BossCubeCommunication {
    constructor() {
        // Boss Cube connection state
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.isConnected = false;
        
        // SysEx buffer for multi-packet responses
        this.sysexBuffer = [];
        this.bufferingActive = false;
        this.lastBufferTime = 0;
        this.bufferTimeout = SYSEX_CONFIG.BUFFER_TIMEOUT;
        
        // Physical knob change detection
        this.pendingReadRequests = new Map();
        this.lastReadRequestTime = 0;
        this.readRequestTimeout = SYSEX_CONFIG.READ_REQUEST_TIMEOUT;
        
        // Notification maintenance
        this.notificationMaintenanceTimer = null;
        
        // Event callbacks
        this.onLog = null;
        this.onParameterUpdate = null;
        this.onPhysicalKnobChange = null;
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
     * Calculate Roland checksum (from Python script)
     */
    rolandChecksum(dataBytes) {
        const total = dataBytes.reduce((sum, byte) => sum + byte, 0);
        const remainder = total % 128;
        return (128 - remainder) % 128;
    }

    /**
     * Create BLE MIDI command (from Python script)
     */
    createBLEMidiCommand(sysexData) {
        // BLE MIDI format: [0x90, timestamp, 0xf0, ...sysex, timestamp, 0xf7]
        const timestamp = 0xb7; // Use same timestamp as Python script
        return new Uint8Array([
            0x90, timestamp, 0xf0,
            ...sysexData,
            timestamp, 0xf7
        ]);
    }

    /**
     * Connect to Boss Cube via Web Bluetooth
     */
    async connect() {
        try {
            this.log('🔍 Requesting Boss Cube device...', 'info');
            
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'CUBE' },
                    { services: [BLE_MIDI_SERVICE] }
                ],
                optionalServices: [BLE_MIDI_SERVICE]
            });

            this.log(`📱 Selected device: ${this.device.name}`, 'info');

            this.device.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnection();
            });

            this.log('🔌 Connecting to GATT server...', 'info');
            this.server = await this.device.gatt.connect();
            
            this.log('🎵 Getting MIDI service...', 'info');
            const service = await this.server.getPrimaryService(BLE_MIDI_SERVICE);
            
            this.log('📡 Getting MIDI characteristic...', 'info');
            this.characteristic = await service.getCharacteristic(BLE_MIDI_CHARACTERISTIC);
            
            this.log('🔔 Starting notifications...', 'info');
            await this.characteristic.startNotifications();
            
            this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
                this.handleMIDIData(event.target.value);
            });

            this.isConnected = true;
            this.notifyConnectionStatusChange(true);
            
            // Test connection
            await this.testConnection();
            
            // Enable continuous notifications
            await this.enableContinuousNotifications();
            
            // Start notification maintenance
            this.startNotificationMaintenance();
            
            this.log('✅ Boss Cube connected successfully!', 'success');
            
            return true;
            
        } catch (error) {
            this.log(`❌ Boss Cube connection failed: ${error.message}`, 'error');
            this.isConnected = false;
            this.notifyConnectionStatusChange(false);
            throw error;
        }
    }

    /**
     * Disconnect from Boss Cube
     */
    async disconnect() {
        try {
            this.stopNotificationMaintenance();
            
            if (this.characteristic) {
                try {
                    await this.characteristic.stopNotifications();
                    this.log('🔕 Stopped Boss Cube notifications', 'info');
                } catch (error) {
                    this.log(`⚠️ Error stopping notifications: ${error.message}`, 'warning');
                }
            }
            
            if (this.server && this.server.connected) {
                await this.server.disconnect();
                this.log('🔌 Boss Cube GATT server disconnected', 'info');
            }
            
        } catch (error) {
            this.log(`⚠️ Error during Boss Cube disconnection: ${error.message}`, 'warning');
        } finally {
            this.cleanup();
        }
    }

    /**
     * Handle disconnection event
     */
    handleDisconnection() {
        this.log('🔌 Boss Cube disconnected', 'warning');
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
        this.stopNotificationMaintenance();
        this.clearSysExBuffer();
        this.pendingReadRequests.clear();
        this.notifyConnectionStatusChange(false);
    }

    /**
     * Handle MIDI data from Boss Cube
     */
    handleMIDIData(value) {
        const data = new Uint8Array(value.buffer);
        
        // Extract SysEx data from BLE MIDI packet, handling multi-packet messages
        let sysexData = [];
        let foundStart = false;
        let foundEnd = false;
        
        for (let i = 0; i < data.length; i++) {
            if (data[i] === 0xF0) {
                // SysEx start - begin new message
                foundStart = true;
                this.clearSysExBuffer();
                this.bufferingActive = true;
                this.lastBufferTime = Date.now();
                continue; // Skip the F0 byte itself
            } else if (data[i] === 0xF7) {
                // SysEx end - complete the message
                foundEnd = true;
                break;
            } else if (data[i] < 0x80) {
                // Data byte (not timestamp) - collect it
                sysexData.push(data[i]);
            }
            // Skip BLE MIDI timestamp bytes (high bit set, >= 0x80)
        }
        
        // Handle the collected data
        if (foundStart || this.bufferingActive) {
            if (sysexData.length > 0) {
                this.sysexBuffer.push(...sysexData);
                this.lastBufferTime = Date.now();
            }
            
            if (foundEnd) {
                // Complete message - process it
                this.processSysExBuffer();
            } else if (!foundStart && this.bufferingActive) {
                // Continuation packet - schedule timeout processing
                setTimeout(() => {
                    if (this.bufferingActive && Date.now() - this.lastBufferTime > this.bufferTimeout) {
                        this.processSysExBuffer();
                    }
                }, this.bufferTimeout + 50);
            }
        }
    }



    /**
     * Clear SysEx buffer
     */
    clearSysExBuffer() {
        this.sysexBuffer = [];
        this.bufferingActive = false;
        this.lastBufferTime = 0;
    }

    /**
     * Process accumulated SysEx buffer
     */
    processSysExBuffer() {
        if (this.sysexBuffer.length > 0) {
            this.parseBossCubeSysEx(this.sysexBuffer);
            this.clearSysExBuffer();
        }
    }

    /**
     * Decode 6-byte Boss Cube tuner data into musical pitch information
     * @param {Array} valueBytes - 6 bytes of tuner data
     * @returns {Object|null} Decoded tuner information or null if invalid
     */
    decodeTunerData(valueBytes) {
        if (valueBytes.length < 2) {
            return null; // Need at least 2 bytes for basic tuner data
        }
        
        // Pad with zeros if we have less than 6 bytes
        const paddedBytes = [...valueBytes];
        while (paddedBytes.length < 6) {
            paddedBytes.push(0);
        }
        
        // Check for "no signal" condition
        if (paddedBytes.every(b => b === 0)) {
            const hexBytes = paddedBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
            this.log(`🎵 Tuner: No Signal [${hexBytes}]`, 'info');
            return {
                hasSignal: false,
                frequency: 0,
                note: '--',
                octave: 0,
                centsDeviation: 0,
                signalStrength: 0,
                status: 'No Signal',
                rawBytes: paddedBytes
            };
        }
        
        // Extract data from bytes
        const midiNote = paddedBytes[0];           // MIDI note number (e.g., 64 = E4)
        const tunerHigh = paddedBytes[1];          // Tuning data high bits (0-2)
        const tunerLow = paddedBytes[2];           // Tuning data low bits (0-15)
        const signalByte = paddedBytes[4];         // Signal strength
        
        // Calculate note name and octave
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const note = noteNames[midiNote % 12];
        const octave = Math.floor(midiNote / 12) - 1;
        
        // Calculate cents deviation from 6-bit tuning value
        const tunerValue = (tunerHigh << 4) | tunerLow;  // Combine to 6-bit value (0-47)
        const centsDeviation = (tunerValue - 18) * 3;    // Center=18, scale=3¢ per step
        
        // Calculate frequency from note + cents
        const baseFrequency = 440 * Math.pow(2, (midiNote - 69) / 12);  // A4=440Hz, MIDI 69
        const frequency = baseFrequency * Math.pow(2, centsDeviation / 1200);
        
        // Calculate signal strength and status
        const signalStrength = (signalByte / 127) * 100;
        const status = Math.abs(centsDeviation) < 3 ? 'In Tune' 
                     : centsDeviation > 0 ? 'Sharp' : 'Flat';
        
        // Log tuner data with raw bytes
        const hexBytes = paddedBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
        this.log(`🎵 Tuner: ${note}${octave} ${frequency.toFixed(1)}Hz ${centsDeviation > 0 ? '+' : ''}${centsDeviation}¢ (${status}) [${hexBytes}]`, 'info');
        
        return {
            hasSignal: true,
            frequency: Math.round(frequency * 10) / 10,
            note: note,
            octave: octave,
            centsDeviation: centsDeviation,
            signalStrength: Math.round(signalStrength),
            status: status,
            rawBytes: paddedBytes
        };
    }

    /**
     * Parse Boss Cube SysEx message (restored from working v2.22.1)
     */
    parseBossCubeSysEx(sysexData) {
        // Check minimum length for a Boss Cube response
        if (sysexData.length < 10) {
            return;
        }
        
        // Check if this is a Boss Cube response (starts with our header)
        const expectedHeader = [0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09];
        
        // Check header
        for (let i = 0; i < expectedHeader.length; i++) {
            if (sysexData[i] !== expectedHeader[i]) {
                return;
            }
        }
        
        const command = sysexData[7]; // 0x12 for response to read request
        
        if (command === 0x12) {
            // Data response - extract address and value
            const addressBytes = sysexData.slice(8, 12);
            const addressStr = addressBytes.map(b => b.toString(16).padStart(2, '0')).join('');
            const isTunerData = addressStr === '7f000300';
            
            // Calculate value size and position
            const valueBytes = sysexData.length - 13; // SysEx length minus header, command, address, and checksum
            const valueStart = 12;
            const valueEnd = sysexData.length - 1;
            
            if (valueBytes <= 0) {
                this.log(`⚠️ Invalid SysEx message: no value bytes detected (length=${sysexData.length})`, 'warning');
                return;
            }
            
            let value;
            if (isTunerData && valueBytes === 6) {
                // Decode 6-byte tuner data
                const tunerBytes = sysexData.slice(valueStart, valueEnd);
                value = this.decodeTunerData(tunerBytes) || 0;
            } else if (valueBytes === 1) {
                // Single-byte parameter
                value = sysexData[valueStart];
            } else {
                // Multi-byte parameter using Roland 7-bit format
                value = 0;
                for (let i = 0; i < valueBytes; i++) {
                    value = (value << 7) | sysexData[valueStart + i];
                }
            }
            
            // Update parameter
            this.updateParameterFromCube(addressBytes, value, false);
        }
    }

    /**
     * Update parameter from Boss Cube response
     */
    updateParameterFromCube(addressBytes, value, isPhysicalKnobChange = false) {
        // Find parameter by address
        const addressKey = addressBytes.map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Detect if this was a response to our read request
        const wasReadRequest = this.pendingReadRequests.has(addressKey);
        if (wasReadRequest) {
            this.pendingReadRequests.delete(addressKey);
        }
        
        // Detect physical knob changes (unsolicited updates)
        if (!wasReadRequest && !isPhysicalKnobChange) {
            isPhysicalKnobChange = this.detectPhysicalKnobChange(addressBytes, value);
        }
        
        // Notify parameter update
        if (this.onParameterUpdate) {
            this.onParameterUpdate(addressBytes, value, isPhysicalKnobChange);
        }
        
        // Notify physical knob change
        if (isPhysicalKnobChange && this.onPhysicalKnobChange) {
            this.onPhysicalKnobChange(addressBytes, value);
        }
    }

    /**
     * Detect if parameter change was from physical knob
     */
    detectPhysicalKnobChange(addressBytes, value) {
        const now = Date.now();
        const timeSinceLastRead = now - this.lastReadRequestTime;
        
        // If we haven't sent a read request recently, it's likely a physical change
        return timeSinceLastRead > this.readRequestTimeout;
    }

    /**
     * Send parameter command to Boss Cube
     */
    async sendParameterCommand(address, value) {
        if (!this.isConnected || !this.characteristic) {
            throw new Error('Boss Cube not connected');
        }
        
        const dataBytes = [...BOSS_CUBE_HEADER, ...address, value];
        const checksum = this.rolandChecksum(dataBytes.slice(5)); // Exclude header for checksum
        const sysexData = [...dataBytes, checksum];
        
        const command = this.createBLEMidiCommand(sysexData);
        
        try {
            await this.characteristic.writeValue(command);
            
            // Small delay to prevent overwhelming the device
            await new Promise(resolve => setTimeout(resolve, SYSEX_CONFIG.COMMAND_DELAY));
            
        } catch (error) {
            this.log(`❌ Failed to send parameter command: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Send parameter read request
     */
    async sendParameterReadRequest(address) {
        if (!this.isConnected || !this.characteristic) {
            throw new Error('Boss Cube not connected');
        }
        
        // Track this read request for physical knob detection
        const addressKey = address.map(b => b.toString(16).padStart(2, '0')).join('');
        this.pendingReadRequests.set(addressKey, Date.now());
        
        // Boss Cube specific read request (based on working v2.22.1)
        const readHeader = [...BOSS_CUBE_HEADER];
        readHeader[7] = 0x11; // Change command from 0x12 to 0x11 for read request
        const dataBytes = [...readHeader, ...address, 0x00, 0x00, 0x00, 0x01];
        const checksum = this.rolandChecksum([...address, 0x00, 0x00, 0x00, 0x01]);
        const sysexData = [...dataBytes, checksum];
        
        const command = this.createBLEMidiCommand(sysexData);
        
        try {
            await this.characteristic.writeValue(command);
            this.lastReadRequestTime = Date.now();
            
            // Small delay to prevent overwhelming the device
            await new Promise(resolve => setTimeout(resolve, SYSEX_CONFIG.READ_DELAY));
            
        } catch (error) {
            this.log(`❌ Failed to send read request: ${error.message}`, 'error');
            this.pendingReadRequests.delete(addressKey);
            throw error;
        }
    }



    /**
     * Send special command to Boss Cube
     */
    async sendSpecialCommand(address, data) {
        if (!this.isConnected || !this.characteristic) {
            throw new Error('Boss Cube not connected');
        }
        
        const dataBytes = [...BOSS_CUBE_HEADER, ...address, ...data];
        const checksum = this.rolandChecksum(dataBytes.slice(5));
        const sysexData = [...dataBytes, checksum];
        
        const command = this.createBLEMidiCommand(sysexData);
        
        try {
            await this.characteristic.writeValue(command);
            await new Promise(resolve => setTimeout(resolve, SYSEX_CONFIG.COMMAND_DELAY));
        } catch (error) {
            this.log(`❌ Failed to send special command: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Test connection with a simple read command
     */
    async testConnection() {
        try {
            // Test by reading master volume
            await this.sendParameterReadRequest([0x00, 0x00, 0x00, 0x00]);
            this.log('🔧 Connection test successful', 'info');
            return true;
        } catch (error) {
            this.log(`⚠️ Connection test failed: ${error.message}`, 'warning');
            return false;
        }
    }

    /**
     * Enable continuous notifications for better responsiveness
     */
    async enableContinuousNotifications() {
        try {
            // Send enable notifications command
            await this.sendSpecialCommand(SYSTEM_ADDRESSES.ENABLE_NOTIFICATIONS, [0x01]);
            this.log('🔔 Enabled continuous notifications', 'info');
        } catch (error) {
            this.log(`⚠️ Failed to enable continuous notifications: ${error.message}`, 'warning');
        }
    }

    /**
     * Start notification maintenance timer
     */
    startNotificationMaintenance() {
        this.stopNotificationMaintenance();
        
        this.notificationMaintenanceTimer = setInterval(async () => {
            if (this.isConnected) {
                try {
                    await this.sendSpecialCommand(SYSTEM_ADDRESSES.KEEP_ALIVE, [0x00]);
                } catch (error) {
                    this.log(`⚠️ Notification maintenance failed: ${error.message}`, 'warning');
                }
            }
        }, SYSEX_CONFIG.MAINTENANCE_INTERVAL);
    }

    /**
     * Stop notification maintenance timer
     */
    stopNotificationMaintenance() {
        if (this.notificationMaintenanceTimer) {
            clearInterval(this.notificationMaintenanceTimer);
            this.notificationMaintenanceTimer = null;
        }
    }

    /**
     * Notify connection status change
     */
    notifyConnectionStatusChange(connected) {
        if (this.onConnectionStatusChange) {
            this.onConnectionStatusChange(connected);
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            deviceName: this.device?.name || null,
            hasCharacteristic: !!this.characteristic
        };
    }
} 