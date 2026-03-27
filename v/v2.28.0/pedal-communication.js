/**
 * EV-1-WL Pedal Bluetooth Communication Module
 * Handles all MIDI communication with EV-1-WL wireless expression pedal via Web Bluetooth
 */

import { 
    BLE_MIDI_SERVICE, 
    BLE_MIDI_CHARACTERISTIC,
    DEFAULT_PEDAL_CC_CODES,
    FOOTSWITCH_POLARITIES
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
        this.footswitchPolarity = 'normally_open'; // Default to normally open
        
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

        this.log('🔌 Connecting to pedal GATT server...', 'info');
        this.server = await this.device.gatt.connect();
        
        this.log('🎵 Getting pedal MIDI service...', 'info');
        const service = await this.server.getPrimaryService(BLE_MIDI_SERVICE);
        
        this.log('📡 Getting pedal MIDI characteristic...', 'info');
        this.characteristic = await service.getCharacteristic(BLE_MIDI_CHARACTERISTIC);
        
        this.log('🔔 Starting pedal notifications...', 'info');
        await this.characteristic.startNotifications();
        
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
        this.notifyConnectionStatusChange(false);
    }

    /**
     * Handle MIDI data from EV-1-WL pedal
     */
    handleMIDIData(value) {
        const data = new Uint8Array(value.buffer);
        
        // Parse BLE MIDI format - look for Control Change messages
        // BLE MIDI format includes timestamps (bytes >= 0x80) that need to be skipped
        for (let i = 0; i < data.length - 2; i++) {
            const status = data[i];
            const control = data[i + 1];
            const ccValue = data[i + 2];
            
            // Check if this is a Control Change message (0xB0-0xBF)
            // and that control and value are valid MIDI data bytes (< 0x80)
            if ((status & 0xF0) === 0xB0 && control < 0x80 && ccValue < 0x80) {
                this.handleMIDICC(control, ccValue);
                // Don't break - there might be multiple CC messages in one packet
                i += 2; // Skip the processed bytes
            }
        }
    }

    /**
     * Handle MIDI CC message from pedal
     */
    handleMIDICC(ccNumber, ccValue) {
        // Filter out unexpected CC codes
        if (ccNumber !== this.pedalCCCodes.pedalControl && 
            ccNumber !== this.pedalCCCodes.previousParameter && 
            ccNumber !== this.pedalCCCodes.nextParameter) {
            return;
        }
        
        if (ccNumber === this.pedalCCCodes.pedalControl) {
            // Expression pedal volume change (CC 127, value 0-127)
            this.handleVolumeChange(ccValue);
        } else if (ccNumber === this.pedalCCCodes.previousParameter) {
            // Previous parameter button (left footswitch)
            this.handleButtonCC(ccValue, 'previous');
        } else if (ccNumber === this.pedalCCCodes.nextParameter) {
            // Next parameter button (right footswitch)
            this.handleButtonCC(ccValue, 'next');
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
        // Notify button press
        if (this.onButtonPress) {
            this.onButtonPress({
                type: 'button',
                button: button, // 'previous' or 'next'
                direction: button === 'next' ? 'right' : 'left'
            });
        }
    }

    /**
     * Set pedal CC codes configuration
     */
    setPedalCCCodes(previousParameter, nextParameter, pedalControl) {
        this.pedalCCCodes = {
            previousParameter: previousParameter || DEFAULT_PEDAL_CC_CODES.PREVIOUS_PARAMETER,
            nextParameter: nextParameter || DEFAULT_PEDAL_CC_CODES.NEXT_PARAMETER,
            pedalControl: pedalControl || DEFAULT_PEDAL_CC_CODES.PEDAL_CONTROL
        };
        
        this.log(`🎛️ Updated pedal CC codes: Previous=${this.pedalCCCodes.previousParameter}, Next=${this.pedalCCCodes.nextParameter}, Control=${this.pedalCCCodes.pedalControl}`, 'info');
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