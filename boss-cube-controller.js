/**
 * Boss Cube II Web Bluetooth Controller
 * Handles two separate Bluetooth connections:
 * 1. Boss Cube II - for sending SysEx commands
 * 2. EV-1-WL Pedal - for receiving MIDI input
 */

class BossCubeController {
    constructor() {
        // Boss Cube connection
        this.cubeDevice = null;
        this.cubeServer = null;
        this.cubeCharacteristic = null;
        this.isCubeConnected = false;
        
        // EV-1-WL Pedal connection
        this.pedalDevice = null;
        this.pedalServer = null;
        this.pedalCharacteristic = null;
        this.isPedalConnected = false;
        this.lastPedalValue = -1;
        this.pedalCallbacks = [];
        
        // Pedal throttling and debouncing for smooth performance
        this.pedalThrottle = {
            lastSentTime: 0,
            lastSentValue: -1,
            sendInterval: 30, // Send to Boss Cube max every 30ms (33 FPS)
            finalValueTimer: null,
            finalValueDelay: 150, // Send final value 150ms after movement stops
            isSending: false,
            pendingValue: null
        };
        
        // Boss Cube constants from Python script
        this.BOSS_CUBE_HEADER = [0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, 0x12];
        this.DEVICE_ADDRESS = "fb:b7:d0:2d:4a:2d"; // For reference only
        
        // BLE MIDI Service UUID (standard)
        this.BLE_MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
        this.BLE_MIDI_CHARACTERISTIC = '7772e5db-3868-4112-a1a9-f2669d106bf3';
        
        // SysEx buffer for multi-packet responses
        this.sysexBuffer = [];
        this.bufferingActive = false;
        this.lastBufferTime = 0;
        this.bufferTimeout = 1000; // 1 second timeout for incomplete messages
        
        // Physical knob change detection
        this.pendingReadRequests = new Map(); // Track pending read requests
        this.lastReadRequestTime = 0;
        this.readRequestTimeout = 2000; // 2 seconds to consider a read request expired
        
        // Parameters from Python script - complete set
        this.parameters = {
            // Mixer volumes
            masterVolume: { 
                name: 'Master Volume', 
                address: [0x20, 0x00, 0x00, 0x04], 
                min: 0, max: 100, current: 50,
                category: 'mixer'
            },
            micInstrumentVolume: { 
                name: 'Mic/Instrument Volume', 
                address: [0x20, 0x00, 0x00, 0x00], 
                min: 0, max: 100, current: 50,
                category: 'mixer'
            },
            guitarMicVolume: { 
                name: 'Guitar/Mic Volume', 
                address: [0x20, 0x00, 0x00, 0x01], 
                min: 0, max: 100, current: 50,
                category: 'mixer'
            },
            iCubeLinkVolume: { 
                name: 'iCube Link/Aux/BT Volume', 
                address: [0x20, 0x00, 0x00, 0x02], 
                min: 0, max: 100, current: 50,
                category: 'mixer'
            },
            iCubeLinkOutVolume: { 
                name: 'iCube Link Out Volume', 
                address: [0x20, 0x00, 0x00, 0x03], 
                min: 0, max: 100, current: 50,
                category: 'mixer'
            },
            
            // Additional mixer addresses (experimental)
            mixerAddress05: { 
                name: 'Mixer Address 05', 
                address: [0x20, 0x00, 0x00, 0x05], 
                min: 0, max: 100, current: 50,
                category: 'mixer'
            },
            mixerAddress06: { 
                name: 'Mixer Address 06', 
                address: [0x20, 0x00, 0x00, 0x06], 
                min: 0, max: 100, current: 50,
                category: 'mixer'
            },
            mixerAddress07: { 
                name: 'Mixer Address 07', 
                address: [0x20, 0x00, 0x00, 0x07], 
                min: 0, max: 100, current: 50,
                category: 'mixer'
            },
            mixerAddress08: { 
                name: 'Mixer Address 08', 
                address: [0x20, 0x00, 0x00, 0x08], 
                min: 0, max: 100, current: 50,
                category: 'mixer'
            },
            mixerAddress09: { 
                name: 'Mixer Address 09', 
                address: [0x20, 0x00, 0x00, 0x09], 
                min: 0, max: 100, current: 50,
                category: 'mixer'
            },
            mixerAddress0A: { 
                name: 'Mixer Address 0A', 
                address: [0x20, 0x00, 0x00, 0x0a], 
                min: 0, max: 100, current: 50,
                category: 'mixer'
            },
            
            // Guitar effects and reverb
            guitarReverbTime: { 
                name: 'Guitar Reverb Time', 
                address: [0x10, 0x00, 0x00, 0x2e], 
                min: 0, max: 49, current: 10,
                category: 'effects',
                unit: 'sec'
            },
            guitarReverbLevel: { 
                name: 'Guitar Reverb Level', 
                address: [0x10, 0x00, 0x00, 0x67], 
                min: 0, max: 100, current: 30,
                category: 'effects'
            },
            guitarPhaserLevel: { 
                name: 'Guitar Phaser Level', 
                address: [0x10, 0x00, 0x00, 0x4b], 
                min: 0, max: 100, current: 25,
                category: 'effects',
                effectSwitchCommands: [
                    [0x10, 0x00, 0x00, 0x39, 0x01],  // Switch to phaser
                    [0x7f, 0x01, 0x02, 0x04, 0x7f, 0x7f, 0x7c]  // Effect activation
                ]
            },
            guitarChorusLevel: { 
                name: 'Guitar Chorus Level', 
                address: [0x10, 0x00, 0x00, 0x43], 
                min: 0, max: 100, current: 25,
                category: 'effects',
                effectSwitchCommands: [
                    [0x10, 0x00, 0x00, 0x39, 0x00],  // Switch to chorus
                    [0x7f, 0x01, 0x02, 0x04, 0x7f, 0x7f, 0x7c]  // Effect activation
                ]
            },
            guitarTremoloLevel: { 
                name: 'Guitar Tremolo Level', 
                address: [0x10, 0x00, 0x00, 0x57], 
                min: 0, max: 100, current: 25,
                category: 'effects',
                effectSwitchCommands: [
                    [0x10, 0x00, 0x00, 0x39, 0x03],  // Switch to tremolo
                    [0x7f, 0x01, 0x02, 0x04, 0x7f, 0x7f, 0x7c]  // Effect activation
                ]
            },
            guitarTWahLevel: { 
                name: 'Guitar T.WAH Level', 
                address: [0x10, 0x00, 0x00, 0x5e], 
                min: 0, max: 100, current: 25,
                category: 'effects',
                effectSwitchCommands: [
                    [0x10, 0x00, 0x00, 0x39, 0x04],  // Switch to T.WAH
                    [0x7f, 0x01, 0x02, 0x04, 0x7f, 0x7f, 0x7c]  // Effect activation
                ]
            }
        };
        
        // Current parameter selection for pedal control
        this.currentParameterKey = 'masterVolume';
        this.parameterKeys = Object.keys(this.parameters);

        // Event callbacks
        this.onLog = null;
        this.onStatusChange = null;
        this.onParameterUpdate = null; // Callback for when Boss Cube sends parameter updates
        this.onPhysicalKnobChange = null; // Callback specifically for physical knob changes
    }

    /**
     * Log message with timestamp
     */
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${message}`;
        console.log(logMessage);
        
        if (this.onLog) {
            this.onLog(logMessage, type);
        }
    }

    /**
     * Update connection status
     */
    updateStatus(status) {
        this.log(`Status: ${status}`, 'info');
        if (this.onStatusChange) {
            this.onStatusChange(status);
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
     * Check if Web Bluetooth is supported
     */
    static isSupported() {
        const userAgent = navigator.userAgent || '';
        const isHTTPS = window.location.protocol === 'https:';
        const isLocalhost = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1';
        const isSecureContext = window.isSecureContext;
        const hasNavigatorBluetooth = 'bluetooth' in navigator;
        
        // Enhanced debugging
        console.log('=== WEB BLUETOOTH DEBUG INFO ===');
        console.log('User Agent:', userAgent);
        console.log('Location:', window.location.href);
        console.log('Is HTTPS?', isHTTPS);
        console.log('Is localhost?', isLocalhost);
        console.log('');
        console.log('navigator object exists?', 'navigator' in window);
        console.log('navigator.bluetooth exists?', hasNavigatorBluetooth);
        console.log('navigator.bluetooth value:', navigator.bluetooth);
        console.log('');
        console.log('Is secure context?', isSecureContext);
        console.log('');
        // Browser detection
        const isChrome = /Chrome/.test(userAgent) && !/Edge/.test(userAgent);
        const isEdge = /Edge/.test(userAgent);
        const isOpera = /OPR/.test(userAgent);
        
        console.log('Is Chrome?', isChrome);
        console.log('Is Edge?', isEdge);
        console.log('Is Opera?', isOpera);
        console.log('');
        console.log('Document domain:', document.domain);
        console.log('Window.crypto exists?', 'crypto' in window);
        console.log('');
        console.log('=== END DEBUG INFO ===');
        
        return hasNavigatorBluetooth && isSecureContext && (isChrome || isEdge || isOpera);
    }

    /**
     * Handle pedal volume change (CC 127, value 0-127) with smart throttling
     */
    handlePedalVolumeChange(pedalValue) {
        if (pedalValue === this.lastPedalValue) return;
        
        this.lastPedalValue = pedalValue;
        
        // Get current parameter and convert pedal value to parameter range
        const param = this.getCurrentParameter();
        const paramValue = Math.round((pedalValue / 127) * param.max);
        
        // Update internal parameter immediately (no lag in UI)
        param.current = paramValue;
        
        // Store pending value for hardware transmission
        this.pedalThrottle.pendingValue = { paramKey: this.currentParameterKey, value: paramValue };
        
        // Always notify callbacks immediately for responsive UI
        this.pedalCallbacks.forEach(callback => {
            try {
                callback({ 
                    type: 'volume', 
                    value: paramValue, 
                    pedalValue,
                    parameter: param,
                    parameterKey: this.currentParameterKey
                });
            } catch (error) {
                console.error('Error in pedal callback:', error);
            }
        });
        
        // Handle hardware transmission with throttling
        this.throttledSendToHardware();
    }

    /**
     * Throttled sending to prevent BLE overflow and ensure final values
     */
    throttledSendToHardware() {
        const now = Date.now();
        const timeSinceLastSend = now - this.pedalThrottle.lastSentTime;
        
        // Clear any existing final value timer
        if (this.pedalThrottle.finalValueTimer) {
            clearTimeout(this.pedalThrottle.finalValueTimer);
        }
        
        // If we can send now (throttle interval passed and not currently sending)
        if (timeSinceLastSend >= this.pedalThrottle.sendInterval && 
            !this.pedalThrottle.isSending &&
            this.pedalThrottle.pendingValue) {
            
            this.sendPendingValueToHardware();
        }
        
        // Always set up final value timer to ensure the last value is sent
        this.pedalThrottle.finalValueTimer = setTimeout(() => {
            if (this.pedalThrottle.pendingValue && !this.pedalThrottle.isSending) {
                this.sendPendingValueToHardware();
            }
        }, this.pedalThrottle.finalValueDelay);
    }

    /**
     * Send pending value to hardware
     */
    async sendPendingValueToHardware() {
        if (!this.pedalThrottle.pendingValue || this.pedalThrottle.isSending) {
            return;
        }
        
        const { paramKey, value } = this.pedalThrottle.pendingValue;
        
        // Skip if this value was already sent
        if (value === this.pedalThrottle.lastSentValue) {
            this.pedalThrottle.pendingValue = null;
            return;
        }
        
        this.pedalThrottle.isSending = true;
        
        try {
            // Only send to Boss Cube if connected
            if (this.isCubeConnected) {
                await this.setParameter(paramKey, value);
                this.pedalThrottle.lastSentValue = value;
                this.pedalThrottle.lastSentTime = Date.now();
            }
        } catch (error) {
            console.error('Error sending parameter to hardware:', error);
        } finally {
            this.pedalThrottle.isSending = false;
            this.pedalThrottle.pendingValue = null;
        }
    }

    /**
     * Handle pedal button press
     */
    handlePedalButton(button) {
        console.log(`Pedal button pressed: ${button}`);
        
        if (button === 'right') {
            this.nextParameter();
        } else if (button === 'left') {
            this.previousParameter();
        }
        
        // Notify callbacks
        this.pedalCallbacks.forEach(callback => {
            try {
                callback({ type: 'button', button, currentParameter: this.getCurrentParameter() });
            } catch (error) {
                console.error('Error in pedal callback:', error);
            }
        });
    }

    /**
     * Switch to next parameter for pedal control
     */
    nextParameter() {
        const currentIndex = this.parameterKeys.indexOf(this.currentParameterKey);
        const nextIndex = (currentIndex + 1) % this.parameterKeys.length;
        this.currentParameterKey = this.parameterKeys[nextIndex];
        
        const param = this.getCurrentParameter();
        console.log(`Pedal switched to: ${param.name}`);
        
        // Send effect switch commands if this parameter has them
        if (param.effectSwitchCommands) {
            this.sendEffectSwitchCommands(param.effectSwitchCommands);
        }
        
        // Notify callbacks about parameter change
        this.pedalCallbacks.forEach(callback => {
            try {
                callback({ type: 'parameterChange', parameter: param });
            } catch (error) {
                console.error('Error in parameter change callback:', error);
            }
        });
    }

    /**
     * Switch to previous parameter for pedal control
     */
    previousParameter() {
        const currentIndex = this.parameterKeys.indexOf(this.currentParameterKey);
        const prevIndex = currentIndex === 0 ? this.parameterKeys.length - 1 : currentIndex - 1;
        this.currentParameterKey = this.parameterKeys[prevIndex];
        
        const param = this.getCurrentParameter();
        console.log(`Pedal switched to: ${param.name}`);
        
        // Send effect switch commands if this parameter has them
        if (param.effectSwitchCommands) {
            this.sendEffectSwitchCommands(param.effectSwitchCommands);
        }
        
        // Notify callbacks about parameter change
        this.pedalCallbacks.forEach(callback => {
            try {
                callback({ type: 'parameterChange', parameter: param });
            } catch (error) {
                console.error('Error in parameter change callback:', error);
            }
        });
    }

    /**
     * Get current parameter for pedal control
     */
    getCurrentParameter() {
        return this.parameters[this.currentParameterKey];
    }

    /**
     * Set current parameter for pedal control
     */
    setCurrentParameter(paramKey) {
        if (this.parameters[paramKey]) {
            this.currentParameterKey = paramKey;
            const param = this.getCurrentParameter();
            
            // Send effect switch commands if this parameter has them
            if (param.effectSwitchCommands) {
                this.sendEffectSwitchCommands(param.effectSwitchCommands);
            }
        }
    }

    /**
     * Add callback for pedal events
     */
    onPedalEvent(callback) {
        this.pedalCallbacks.push(callback);
    }

    /**
     * Remove pedal event callback
     */
    removePedalEventCallback(callback) {
        const index = this.pedalCallbacks.indexOf(callback);
        if (index > -1) {
            this.pedalCallbacks.splice(index, 1);
        }
    }

    /**
     * Notify about pedal status change
     */
    notifyPedalStatusChange() {
        this.pedalCallbacks.forEach(callback => {
            try {
                callback({ 
                    type: 'status', 
                    connected: this.isPedalConnected,
                    pedalName: this.pedalInput?.name || null
                });
            } catch (error) {
                console.error('Error in pedal status callback:', error);
            }
        });
    }

    /**
     * Connect to Boss Cube via Web Bluetooth
     */
    async connectToBossCube() {
        if (!BossCubeController.isSupported()) {
            throw new Error('Web Bluetooth not supported');
        }

        try {
            console.log('Requesting Boss Cube device...');
            
            // Request Boss Cube device with BLE MIDI service
            this.cubeDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'CUBE' },
                    { services: [this.BLE_MIDI_SERVICE] }
                ],
                optionalServices: [this.BLE_MIDI_SERVICE]
            });

            console.log('Boss Cube selected:', this.cubeDevice.name);
            
            // Connect to GATT server
            console.log('Connecting to Boss Cube GATT server...');
            this.cubeServer = await this.cubeDevice.gatt.connect();
            
            console.log('Getting Boss Cube BLE MIDI service...');
            const service = await this.cubeServer.getPrimaryService(this.BLE_MIDI_SERVICE);
            
            console.log('Getting Boss Cube BLE MIDI characteristic...');
            this.cubeCharacteristic = await service.getCharacteristic(this.BLE_MIDI_CHARACTERISTIC);
            
            // Set up notifications for reading values from Boss Cube
            console.log('Enabling Boss Cube notifications...');
            await this.cubeCharacteristic.startNotifications();
            
            // Set up event listener for incoming data from Boss Cube
            this.cubeCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                this.handleBossCubeMIDIData(event.target.value);
            });
            
            this.isCubeConnected = true;
            console.log('✓ Boss Cube connected successfully with notifications enabled!');
            
            return true;
            
        } catch (error) {
            console.error('Boss Cube connection failed:', error);
            this.isCubeConnected = false;
            throw error;
        }
    }

    /**
     * Connect to EV-1-WL Pedal via Web Bluetooth
     */
    async connectToPedal() {
        if (!BossCubeController.isSupported()) {
            console.log('Web Bluetooth not supported for pedal connection');
            return false;
        }

        try {
            console.log('Requesting EV-1-WL pedal device...');
            
            // Request EV-1-WL pedal device
            this.pedalDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'EV-1' },
                    { namePrefix: 'EV-1-WL' },
                    { services: [this.BLE_MIDI_SERVICE] }
                ],
                optionalServices: [this.BLE_MIDI_SERVICE]
            });

            console.log('EV-1-WL pedal selected:', this.pedalDevice.name);
            
            // Connect to pedal GATT server
            console.log('Connecting to pedal GATT server...');
            this.pedalServer = await this.pedalDevice.gatt.connect();
            
            console.log('Getting pedal BLE MIDI service...');
            const service = await this.pedalServer.getPrimaryService(this.BLE_MIDI_SERVICE);
            
            console.log('Getting pedal BLE MIDI characteristic...');
            this.pedalCharacteristic = await service.getCharacteristic(this.BLE_MIDI_CHARACTERISTIC);
            
            // Enable notifications for incoming MIDI data
            console.log('Enabling pedal MIDI notifications...');
            await this.pedalCharacteristic.startNotifications();
            
            // Set up event listener for pedal input
            this.pedalCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                this.handlePedalMIDIData(event.target.value);
            });
            
            this.isPedalConnected = true;
            console.log('✓ EV-1-WL pedal connected successfully!');
            
            // Notify about pedal connection
            this.notifyPedalStatusChange();
            
            return true;
            
        } catch (error) {
            console.error('Pedal connection failed:', error);
            this.isPedalConnected = false;
            return false;
        }
    }

    /**
     * Handle incoming MIDI data from pedal
     */
    handlePedalMIDIData(value) {
        const data = new Uint8Array(value.buffer);
        console.log('Received pedal MIDI data:', Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        // Parse BLE MIDI format properly
        // BLE MIDI: [header(0x80+), timestamp_low(0x80+), status, data1, data2, ...]
        // Header/timestamps: 0x80-0xFF (high bit set)
        // MIDI status bytes: 0x80-0xFF (but these are actual MIDI, not timestamps)
        // MIDI data bytes: 0x00-0x7F (high bit clear)
        
        let i = 0;
        while (i < data.length) {
            // Skip initial header/timestamp bytes (0x80+ that aren't MIDI status)
            // We know timestamps come first, so skip until we find a potential MIDI status
            while (i < data.length && data[i] >= 0x80 && (data[i] < 0xB0 || data[i] > 0xBF)) {
                i++;
            }
            
            // Check if we have enough bytes for a complete MIDI message
            if (i + 2 >= data.length) break;
            
            const status = data[i];
            const data1 = data[i + 1];
            const data2 = data[i + 2];
            
            // Verify data bytes are valid (high bit clear)
            if (data1 >= 0x80 || data2 >= 0x80) {
                i++; // Invalid MIDI message, try next byte
                continue;
            }
            
            // Check if this is a Control Change message (0xB0-0xBF)
            if ((status & 0xF0) === 0xB0) {
                console.log(`Pedal MIDI CC: control=${data1}, value=${data2}`);
                
                // Volume control (CC 127 from EV-1-WL pedal)
                if (data1 === 127) {
                    this.handlePedalVolumeChange(data2);
                }
                // Footswitch controls (CC 80 and 81)
                else if (data1 === 80 && data2 === 127) {
                    this.handlePedalButton('right');
                }
                else if (data1 === 81 && data2 === 127) {
                    this.handlePedalButton('left');
                }
                
                i += 3; // Move past this MIDI message
            } else {
                i++; // Skip unknown byte
            }
        }
    }

    /**
     * Connect to both Boss Cube and optionally try to connect to pedal
     */
    async connect() {
        // First connect to Boss Cube (required)
        await this.connectToBossCube();
        
        // Then try to connect to pedal (optional)
        try {
            await this.connectToPedal();
        } catch (error) {
            console.log('Pedal connection failed, continuing with Boss Cube only:', error.message);
        }
        
        return true;
    }

    /**
     * Connect specifically to pedal (separate button)
     */
    async connectPedal() {
        return await this.connectToPedal();
    }

    /**
     * Disconnect from Boss Cube only
     */
    async disconnectBossCube() {
        try {
            console.log('Disconnecting from Boss Cube...');
            
            // Disconnect from Boss Cube
            if (this.cubeServer) {
                await this.cubeServer.disconnect();
            }
            
            // Reset Boss Cube connection state
            this.cubeDevice = null;
            this.cubeServer = null;
            this.cubeCharacteristic = null;
            this.isCubeConnected = false;
            
            console.log('✓ Disconnected from Boss Cube');
            
        } catch (error) {
            console.error('Error disconnecting from Boss Cube:', error);
            throw error;
        }
    }

    /**
     * Disconnect from Pedal only
     */
    async disconnectPedal() {
        try {
            console.log('Disconnecting from pedal...');
            
            // Clear any pending pedal timers
            if (this.pedalThrottle.finalValueTimer) {
                clearTimeout(this.pedalThrottle.finalValueTimer);
                this.pedalThrottle.finalValueTimer = null;
            }
            
            // Reset pedal throttle state
            this.pedalThrottle.pendingValue = null;
            this.pedalThrottle.isSending = false;
            this.pedalThrottle.lastSentValue = -1;
            
            // Disconnect from Pedal
            if (this.pedalServer) {
                if (this.pedalCharacteristic) {
                    try {
                        await this.pedalCharacteristic.stopNotifications();
                    } catch (error) {
                        console.log('Error stopping pedal notifications:', error);
                    }
                }
                await this.pedalServer.disconnect();
            }
            
            // Reset pedal connection state
            this.pedalDevice = null;
            this.pedalServer = null;
            this.pedalCharacteristic = null;
            this.isPedalConnected = false;
            
            console.log('✓ Disconnected from pedal');
            
            // Notify about pedal disconnection
            this.notifyPedalStatusChange();
            
        } catch (error) {
            console.error('Error disconnecting from pedal:', error);
            throw error;
        }
    }

    /**
     * Disconnect from both devices
     */
    async disconnect() {
        try {
            console.log('Disconnecting from all devices...');
            
            // Disconnect both devices in parallel
            const promises = [];
            
            if (this.isCubeConnected) {
                promises.push(this.disconnectBossCube());
            }
            
            if (this.isPedalConnected) {
                promises.push(this.disconnectPedal());
            }
            
            await Promise.all(promises);
            
            console.log('✓ Disconnected from all devices');
            
        } catch (error) {
            console.error('Error during disconnect:', error);
            throw error;
        }
    }

    /**
     * Calculate Roland checksum
     */
    calculateChecksum(data) {
        const total = data.reduce((sum, byte) => sum + byte, 0);
        const remainder = total % 128;
        return (128 - remainder) % 128;
    }

    /**
     * Create BLE MIDI command from SysEx data
     */
    createBLEMIDICommand(sysexData) {
        // BLE MIDI format: [0x90, timestamp, 0xF0, ...sysex..., timestamp, 0xF7]
        const timestamp = 0xB7; // Common timestamp value
        const command = [0x90, timestamp, 0xF0, ...sysexData, timestamp, 0xF7];
        
        return new Uint8Array(command);
    }

    /**
     * Handle incoming MIDI data from Boss Cube (read responses and notifications)
     * Boss Cube responses are often split across multiple BLE MIDI packets
     */
    handleBossCubeMIDIData(value) {
        const data = new Uint8Array(value.buffer);
        const timestamp = new Date().toISOString().substr(11, 8); // HH:MM:SS
        console.log(`🔔 [${timestamp}] Received Boss Cube MIDI data:`, Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        const now = Date.now();
        
        // Check for buffer timeout (incomplete SysEx message)
        if (this.bufferingActive && (now - this.lastBufferTime) > this.bufferTimeout) {
            console.log('⚠️ SysEx buffer timeout, clearing buffer');
            this.clearSysExBuffer();
        }
        
        // Parse BLE MIDI format - extract MIDI data bytes (skip timestamps)
        let i = 0;
        while (i < data.length) {
            const byte = data[i];
            
            // Skip BLE MIDI timestamps (0x80+) unless it's 0xF0 (SysEx start) or 0xF7 (SysEx end)
            if (byte >= 0x80 && byte !== 0xF0 && byte !== 0xF7) {
                i++;
                continue;
            }
            
            // Handle SysEx start
            if (byte === 0xF0) {
                console.log(`📥 [${timestamp}] SysEx start detected, beginning buffer`);
                this.clearSysExBuffer();
                this.bufferingActive = true;
                this.lastBufferTime = now;
                i++;
                continue;
            }
            
            // Handle SysEx end
            if (byte === 0xF7) {
                if (this.bufferingActive) {
                    console.log(`📥 [${timestamp}] SysEx end detected, processing complete message`);
                    this.processSysExBuffer();
                    this.clearSysExBuffer();
                } else {
                    console.log('⚠️ SysEx end without start, ignoring');
                }
                i++;
                continue;
            }
            
            // Regular MIDI data byte
            if (this.bufferingActive) {
                this.sysexBuffer.push(byte);
                this.lastBufferTime = now;
            }
            
            i++;
        }
    }

    /**
     * Clear the SysEx buffer
     */
    clearSysExBuffer() {
        this.sysexBuffer = [];
        this.bufferingActive = false;
        this.lastBufferTime = 0;
    }

    /**
     * Process the complete SysEx message from buffer
     */
    processSysExBuffer() {
        if (this.sysexBuffer.length === 0) {
            console.log('⚠️ Empty SysEx buffer, nothing to process');
            return;
        }
        
        console.log('📥 Processing SysEx buffer:', this.sysexBuffer.map(b => b.toString(16).padStart(2, '0')).join(' '));
        this.parseBossCubeSysEx(this.sysexBuffer);
    }

    /**
     * Parse Boss Cube SysEx response
     */
    parseBossCubeSysEx(sysexData) {
        const timestamp = new Date().toISOString().substr(11, 8); // HH:MM:SS
        console.log(`📥 [${timestamp}] Parsing Boss Cube SysEx:`, sysexData.map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        // Check minimum length for a Boss Cube response
        if (sysexData.length < 10) {
            console.log('SysEx too short, ignoring');
            return;
        }
        
        // Check if this is a Boss Cube response (starts with our header)
        const expectedHeader = [0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09];
        
        // Check header
        for (let i = 0; i < expectedHeader.length; i++) {
            if (sysexData[i] !== expectedHeader[i]) {
                console.log('Not a Boss Cube SysEx, ignoring');
                return;
            }
        }
        
        const command = sysexData[7]; // 0x12 for response to read request
        
        if (command === 0x12) {
            // This is a data response - extract address and value
            const addressBytes = sysexData.slice(8, 12); // 4 bytes for address
            
            // The response format appears to be:
            // HEADER(7) + COMMAND(1) + ADDRESS(4) + [LENGTH(1)] + VALUE(1) + CHECKSUM(1)
            // Based on tshark captures, there may be a length byte between address and value
            
            let valueIndex = 12;
            let value = sysexData[valueIndex];
            
            // If the value at position 12 is 0x00, it might be a length byte
            // and the actual value is at position 13
            if (value === 0x00 && sysexData.length > 13) {
                valueIndex = 13;
                value = sysexData[valueIndex];
                console.log('📖 Found length byte, value at position 13');
            }
            
            const checksum = sysexData[valueIndex + 1];
            
            // Determine if this is a response to our read request or a spontaneous notification
            const isPhysicalKnobChange = this.detectPhysicalKnobChange(addressBytes, value);
            const notificationType = isPhysicalKnobChange ? '🎛️ PHYSICAL KNOB' : '📖 READ RESPONSE';
            
            console.log(`${notificationType} [${timestamp}] Boss Cube value - Address: [${addressBytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}], Value: ${value}, Checksum: 0x${checksum.toString(16).padStart(2, '0')}`);
            
            // Find which parameter this corresponds to
            this.updateParameterFromCube(addressBytes, value, isPhysicalKnobChange);
        } else {
            console.log(`Unknown Boss Cube command: 0x${command.toString(16)}`);
        }
    }

    /**
     * Update parameter value from Boss Cube response
     */
    updateParameterFromCube(addressBytes, value, isPhysicalKnobChange = false) {
        console.log(`🔍 Looking for parameter with address: [${addressBytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
        
        // Find parameter by address
        for (const [key, param] of Object.entries(this.parameters)) {
            console.log(`🔍 Checking ${param.name} with address: [${param.address.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
            
            if (param.address.length === addressBytes.length &&
                param.address.every((byte, index) => byte === addressBytes[index])) {
                
                const updateType = isPhysicalKnobChange ? '🎛️ PHYSICAL' : '📖 READ';
                console.log(`🔄 MATCH! ${updateType} - Updating ${param.name} from Boss Cube: ${value}/${param.max}`);
                
                // Update parameter value
                param.current = value;
                
                // Notify callbacks about the update with additional context
                if (this.onParameterUpdate) {
                    this.onParameterUpdate(key, value, isPhysicalKnobChange);
                }
                
                // If this is a physical knob change, also notify about it specifically
                if (isPhysicalKnobChange && this.onPhysicalKnobChange) {
                    this.onPhysicalKnobChange(key, param.name, value);
                }
                
                return;
            }
        }
        
        console.log(`⚠️ Unknown parameter address: [${addressBytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
        console.log(`Available parameters:`);
        for (const [key, param] of Object.entries(this.parameters)) {
            console.log(`  ${key}: ${param.name} - [${param.address.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
        }
    }

    /**
     * Send parameter command to Boss Cube
     */
    async sendParameterCommand(address, value) {
        if (!this.isCubeConnected || !this.cubeCharacteristic) {
            throw new Error('Not connected to Boss Cube');
        }

        try {
            // Create SysEx message
            const data = [...this.BOSS_CUBE_HEADER, ...address, value];
            const checksum = this.calculateChecksum([...address, value]);
            const sysexData = [...data, checksum];
            
            // Create BLE MIDI command
            const command = this.createBLEMIDICommand(sysexData);
            
            console.log('Sending command to Boss Cube:', Array.from(command).map(b => b.toString(16).padStart(2, '0')).join(' '));
            
            // Send via Web Bluetooth
            await this.cubeCharacteristic.writeValueWithoutResponse(command);
            
            return true;
            
        } catch (error) {
            console.error('Failed to send command to Boss Cube:', error);
            throw error;
        }
    }

    /**
     * Send read request to Boss Cube to get current parameter value
     */
    async sendParameterReadRequest(address) {
        if (!this.isCubeConnected || !this.cubeCharacteristic) {
            throw new Error('Not connected to Boss Cube');
        }

        try {
            // Track this read request for physical knob detection
            this.trackReadRequest(address);
            
            // Create read request header (0x11 instead of 0x12)
            const readHeader = [...this.BOSS_CUBE_HEADER];
            readHeader[7] = 0x11; // Change command to read request
            
            // Create SysEx message for read request
            const data = [...readHeader, ...address, 0x00, 0x00, 0x00, 0x01]; // Request 1 byte
            const checksum = this.calculateChecksum([...address, 0x00, 0x00, 0x00, 0x01]);
            const sysexData = [...data, checksum];
            
            // Create BLE MIDI command
            const command = this.createBLEMIDICommand(sysexData);
            
            console.log('📤 Sending read request to Boss Cube:', Array.from(command).map(b => b.toString(16).padStart(2, '0')).join(' '));
            
            // Send via Web Bluetooth
            await this.cubeCharacteristic.writeValueWithoutResponse(command);
            
            return true;
            
        } catch (error) {
            console.error('Failed to send read request to Boss Cube:', error);
            throw error;
        }
    }

    /**
     * Read current value of a parameter from Boss Cube
     */
    async readParameter(paramKey) {
        const param = this.parameters[paramKey];
        if (!param) {
            throw new Error(`Unknown parameter: ${paramKey}`);
        }
        
        console.log(`📖 Reading ${param.name} from Boss Cube...`);
        return await this.sendParameterReadRequest(param.address);
    }

    /**
     * Read all mixer parameter values from Boss Cube
     */
    async readAllMixerValues() {
        if (!this.isCubeConnected) {
            throw new Error('Not connected to Boss Cube');
        }
        
        console.log('📖 Reading all mixer values from Boss Cube...');
        
        const mixerParams = this.getParametersByCategory('mixer');
        
        for (const [key, param] of Object.entries(mixerParams)) {
            try {
                await this.readParameter(key);
                // Small delay between requests to avoid overwhelming the cube
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Failed to read ${param.name}:`, error);
            }
        }
    }

    /**
     * Read all effects parameter values from Boss Cube
     */
    async readAllEffectsValues() {
        if (!this.isCubeConnected) {
            throw new Error('Not connected to Boss Cube');
        }
        
        console.log('📖 Reading all effects values from Boss Cube...');
        
        const effectsParams = this.getParametersByCategory('effects');
        
        for (const [key, param] of Object.entries(effectsParams)) {
            try {
                await this.readParameter(key);
                // Small delay between requests to avoid overwhelming the cube
                await new Promise(resolve => setTimeout(resolve, 150));
            } catch (error) {
                console.error(`Failed to read ${param.name}:`, error);
            }
        }
    }

    /**
     * Read all parameter values from Boss Cube (mixer + effects)
     */
    async readAllValues() {
        if (!this.isCubeConnected) {
            throw new Error('Not connected to Boss Cube');
        }
        
        console.log('📖 Reading all parameter values from Boss Cube...');
        
        // Read mixer values first
        await this.readAllMixerValues();
        
        // Small delay between categories
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Then read effects values
        await this.readAllEffectsValues();
        
        console.log('✅ All parameter read requests sent');
    }

    /**
     * Set any parameter by key
     */
    async setParameter(paramKey, value) {
        const param = this.parameters[paramKey];
        if (!param) {
            throw new Error(`Unknown parameter: ${paramKey}`);
        }
        
        const clampedValue = Math.max(param.min, Math.min(param.max, Math.round(value)));
        param.current = clampedValue;
        
        try {
            await this.sendParameterCommand(param.address, clampedValue);
            console.log(`${param.name} set to ${clampedValue}${param.unit ? ' ' + param.unit : ''}`);
            return true;
        } catch (error) {
            console.error(`Failed to set ${param.name}:`, error);
            return false;
        }
    }

    /**
     * Set master volume (0-100) - legacy method
     */
    async setMasterVolume(volume) {
        return await this.setParameter('masterVolume', volume);
    }

    /**
     * Send effect switch commands for effects that require mode switching
     */
    async sendEffectSwitchCommands(commands) {
        if (!this.isCubeConnected || !this.cubeCharacteristic) {
            console.log('Cannot send effect switch commands: not connected to Boss Cube');
            return false;
        }

        try {
            for (const command of commands) {
                // Add checksum to switch command
                const checksum = this.calculateChecksum(command);
                const sysexData = [...this.BOSS_CUBE_HEADER, ...command, checksum];
                
                // Create BLE MIDI command
                const bleMidiCommand = this.createBLEMIDICommand(sysexData);
                
                console.log('Sending effect switch command:', Array.from(bleMidiCommand).map(b => b.toString(16).padStart(2, '0')).join(' '));
                
                // Send via Web Bluetooth (use writeValue for effect switching to ensure it's processed)
                await this.cubeCharacteristic.writeValue(bleMidiCommand);
                
                // Small delay between commands for effect switching
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            console.log('Effect switch commands sent successfully');
            return true;
            
        } catch (error) {
            console.error('Failed to send effect switch commands:', error);
            return false;
        }
    }

    /**
     * Mute master volume
     */
    async muteMasterVolume() {
        return await this.setMasterVolume(0);
    }

    /**
     * Unmute master volume (restore to 50%)
     */
    async unmuteMasterVolume() {
        return await this.setMasterVolume(50);
    }

    /**
     * Test connection with a simple command
     */
    async testConnection() {
        try {
            // Test with a volume command
            await this.setMasterVolume(this.parameters.masterVolume.current);
            return true;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }

    /**
     * Get current connection status
     */
    getStatus() {
        return {
            bluetooth: this.isCubeConnected,
            pedal: this.isPedalConnected,
            pedalName: this.pedalDevice?.name || null,
            currentParameter: this.getCurrentParameter(),
            currentParameterKey: this.currentParameterKey,
            parameters: this.parameters
        };
    }

    /**
     * Get parameters by category
     */
    getParametersByCategory(category) {
        return Object.entries(this.parameters)
            .filter(([key, param]) => param.category === category)
            .reduce((obj, [key, param]) => {
                obj[key] = param;
                return obj;
            }, {});
    }

    /**
     * Send special command for testing notifications
     */
    async sendSpecialCommand(address, data) {
        if (!this.isCubeConnected || !this.cubeCharacteristic) {
            throw new Error('Not connected to Boss Cube');
        }

        try {
            // Create SysEx message with special command
            const sysexData = [...this.BOSS_CUBE_HEADER, ...address, ...data];
            const checksum = this.calculateChecksum([...address, ...data]);
            const completeSysex = [...sysexData, checksum];
            
            // Create BLE MIDI command
            const command = this.createBLEMIDICommand(completeSysex);
            
            console.log('📡 Sending special command to Boss Cube:', Array.from(command).map(b => b.toString(16).padStart(2, '0')).join(' '));
            console.log('📋 SysEx breakdown - Address:', address.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '), 'Data:', data.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            
            // Send via Web Bluetooth
            await this.cubeCharacteristic.writeValueWithoutResponse(command);
            
            return true;
            
        } catch (error) {
            console.error('Failed to send special command to Boss Cube:', error);
            throw error;
        }
    }

    /**
     * Legacy getter for backward compatibility
     */
    get isConnected() {
        return this.isCubeConnected;
    }

    /**
     * Detect if this is a physical knob change vs response to our read request
     */
    detectPhysicalKnobChange(addressBytes, value) {
        const now = Date.now();
        const addressKey = addressBytes.join(',');
        
        // Clean up expired read requests
        for (const [key, timestamp] of this.pendingReadRequests.entries()) {
            if (now - timestamp > this.readRequestTimeout) {
                this.pendingReadRequests.delete(key);
            }
        }
        
        // Check if we recently sent a read request for this address
        if (this.pendingReadRequests.has(addressKey)) {
            // This is likely a response to our read request
            this.pendingReadRequests.delete(addressKey);
            return false;
        }
        
        // If we haven't sent a read request recently, this is likely a physical knob change
        // Also check if it's been a while since any read request (spontaneous notification)
        const timeSinceLastRead = now - this.lastReadRequestTime;
        return timeSinceLastRead > 1000; // If more than 1 second since last read, consider it physical
    }

    /**
     * Track a read request for physical knob detection
     */
    trackReadRequest(addressBytes) {
        const now = Date.now();
        const addressKey = addressBytes.join(',');
        this.pendingReadRequests.set(addressKey, now);
        this.lastReadRequestTime = now;
        console.log(`📋 Tracking read request for address: [${addressBytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
    }

    // Send initialization read command (0x11) to system addresses
    async sendInitReadCommand(address, name) {
        if (!this.isCubeConnected || !this.cubeCharacteristic) {
            throw new Error('Boss Cube not connected');
        }
        
        try {
            // Roland SysEx with READ command (0x11) instead of SET command (0x12)
            const sysex = [
                0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, // Roland header
                0x11, // READ command (key difference!)
                ...address, // System address (like 0x7F, 0x00, 0x00, 0x00)
                0x00, 0x00, 0x00, 0x01 // Read length (1 byte)
            ];
            
            // Add checksum
            const checksum = this.calculateChecksum([...address, 0x00, 0x00, 0x00, 0x01]);
            sysex.push(checksum);
            
            console.log(`📖 Sending init read to ${name} [${address.map(b => b.toString(16).padStart(2, '0')).join(' ')}]:`, 
                       sysex.map(b => b.toString(16).padStart(2, '0')).join(' '));
            
            // Create BLE MIDI command and send
            const command = this.createBLEMIDICommand(sysex);
            await this.cubeCharacteristic.writeValueWithoutResponse(command);
            
        } catch (error) {
            console.error(`Failed to send init read command to ${name}:`, error);
            throw error;
        }
    }
    
    // Enable GATT-level notifications
    async enableGATTNotifications() {
        if (!this.isCubeConnected || !this.cubeCharacteristic) {
            throw new Error('Boss Cube not connected');
        }
        
        try {
            // Try to enable notifications on the MIDI characteristic
            // This writes 0x0001 to the Client Characteristic Configuration Descriptor
            const characteristic = this.cubeCharacteristic;
            
            console.log('🔔 Attempting to enable GATT notifications...');
            
            // First, try the standard notification enable
            await characteristic.startNotifications();
            console.log('✅ Standard notification enable successful');
            
            // Also try manual CCCD write if available
            if (characteristic.service && characteristic.service.device) {
                console.log('🔧 Attempting manual CCCD write...');
                // This is a more advanced approach - may not work in all browsers
                try {
                    const cccdUuid = '00002902-0000-1000-8000-00805f9b34fb';
                    // Note: This approach may not work in all browsers
                    console.log('📝 Manual CCCD write not supported in this browser');
                } catch (e) {
                    console.log('📝 Manual CCCD write not available:', e.message);
                }
            }
            
        } catch (error) {
            console.error('Failed to enable GATT notifications:', error);
            throw error;
        }
    }
} 