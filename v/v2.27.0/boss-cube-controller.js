/**
 * Boss Cube II Web Bluetooth Controller
 * Orchestrates communication between Boss Cube II and EV-1-WL Pedal
 * using separate communication modules
 */

import { BOSS_CUBE_PARAMETERS } from './parameters.js';
import { EFFECT_SWITCH_COMMANDS } from './effect-definitions.js';
import { BossCubeCommunication } from './boss-cube-communication.js';
import { PedalCommunication } from './pedal-communication.js';

class BossCubeController {
    constructor() {
        // Communication modules
        this.bossCubeComm = new BossCubeCommunication();
        this.pedalComm = new PedalCommunication();
        
        // Connection status (delegated to modules)
        this.isCubeConnected = false;
        this.isPedalConnected = false;
        this.pedalCallbacks = [];
        
        // Pickup mode state
        this.pickupMode = {
            enabled: false,
            suppressHardwareUpdates: false
        };
        
        // Global pedal position (shared across all parameters)
        this.globalPedalState = {
            rawValue: 0, // 0-127 MIDI value from pedal
            lastUpdateTime: 0
        };
        

        
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
        
        // Parameters from imported definitions
        this.parameters = BOSS_CUBE_PARAMETERS;
        
        // Cube state for storing current values
        this.cubeState = {};
        
        // Current parameter selection for pedal control
        this.currentParameterKey = 'masterVolume';
        this.parameterKeys = Object.keys(this.parameters);

        // Effect state management
        this.currentGuitarEffect = 'phaser'; // phaser, chorus, tremolo, twah, flanger
        this.currentMicInstEffect = 'harmony'; // harmony, chorus, phaser, flanger, tremolo, twah
        
        // Use imported effect switching commands
        this.effectSwitchCommands = EFFECT_SWITCH_COMMANDS;

        // Event callbacks
        this.onLog = null;
        this.onStatusChange = null;
        this.onParameterUpdate = null; // Callback for when Boss Cube sends parameter updates
        this.onPhysicalKnobChange = null; // Callback specifically for physical knob changes
        
        // Master Out binding - callbacks
        this.checkMasterBindEnabled = null;
        
        // Setup communication module callbacks
        this.setupCommunicationCallbacks();
    }

    /**
     * Setup event callbacks for communication modules
     */
    setupCommunicationCallbacks() {
        // Boss Cube communication callbacks
        this.bossCubeComm.onLog = (message, type) => this.log(message, type);
        this.bossCubeComm.onConnectionStatusChange = (connected) => {
            this.isCubeConnected = connected;
            this.updateStatus(connected ? 'Connected to Boss Cube' : 'Disconnected from Boss Cube');
        };
        this.bossCubeComm.onParameterUpdate = (addressBytes, value, isPhysicalKnobChange) => {
            this.updateParameterFromCube(addressBytes, value, isPhysicalKnobChange);
        };
        this.bossCubeComm.onPhysicalKnobChange = (addressBytes, value) => {
            this.handlePhysicalKnobChange(addressBytes, value);
        };
        
        // Pedal communication callbacks
        this.pedalComm.onLog = (message, type) => this.log(message, type);
        this.pedalComm.onConnectionStatusChange = (event) => {
            this.isPedalConnected = event.connected;
            this.notifyPedalStatusChange();
        };
        this.pedalComm.onVolumeChange = (event) => {
            this.handlePedalVolumeChange(event.value);
        };
        this.pedalComm.onButtonPress = (event) => {
            this.handlePedalButton(event.direction);
        };
    }

    /**
     * Log message with timestamp
     */
    log(message, type = 'info') {
        console.log(message);
        
        if (this.onLog) {
            this.onLog(message, type);
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
     * Check if Web Bluetooth is supported
     */
    static isSupported() {
        // Guard against non-browser environments (e.g., Node.js testing)
        if (typeof window === 'undefined' || typeof navigator === 'undefined') {
            return false;
        }
        
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

    // ===== CONNECTION METHODS =====

    /**
     * Connect to Boss Cube via Web Bluetooth (delegated to communication module)
     */
    async connectToBossCube() {
        if (!BossCubeController.isSupported()) {
            throw new Error('Web Bluetooth not supported');
        }

        return await this.bossCubeComm.connect();
    }

    /**
     * Connect to EV-1-WL Pedal via Web Bluetooth (delegated to communication module)
     */
    async connectToPedal() {
        if (!BossCubeController.isSupported()) {
            this.log('Web Bluetooth not supported for pedal connection', 'warning');
            return false;
        }

        return await this.pedalComm.connect();
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
            this.log('Pedal connection failed, continuing with Boss Cube only: ' + error.message, 'warning');
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
        // Clear any pending pedal timers since they depend on Boss Cube
        if (this.pedalThrottle.finalValueTimer) {
            clearTimeout(this.pedalThrottle.finalValueTimer);
            this.pedalThrottle.finalValueTimer = null;
        }
        
        this.pedalThrottle.pendingValue = null;
        this.pedalThrottle.isSending = false;
        
        return await this.bossCubeComm.disconnect();
    }

    /**
     * Disconnect from Pedal only
     */
    async disconnectPedal() {
        // Clear any pending pedal timers
        if (this.pedalThrottle.finalValueTimer) {
            clearTimeout(this.pedalThrottle.finalValueTimer);
            this.pedalThrottle.finalValueTimer = null;
        }
        
        // Reset pedal throttle state
        this.pedalThrottle.pendingValue = null;
        this.pedalThrottle.isSending = false;
        this.pedalThrottle.lastSentValue = -1;
        
        return await this.pedalComm.disconnect();
    }

    /**
     * Disconnect from both devices
     */
    async disconnect() {
        try {
            this.log('Disconnecting from all devices...', 'info');
            
            // Disconnect both devices in parallel
            const promises = [];
            
            if (this.isCubeConnected) {
                promises.push(this.disconnectBossCube());
            }
            
            if (this.isPedalConnected) {
                promises.push(this.disconnectPedal());
            }
            
            await Promise.all(promises);
            
            this.log('✅ Disconnected from all devices', 'success');
            
        } catch (error) {
            this.log('Error during disconnect: ' + error.message, 'error');
            throw error;
        }
    }

    // ===== PEDAL HANDLING METHODS =====

    /**
     * Handle pedal volume change with pickup mode support
     * 
     * Processes expression pedal input (CC 127, 0-127) and manages pickup mode state.
     * Pickup mode prevents parameter jumps when pedal position doesn't match control value.
     * 
     * @param {number} pedalValue - Raw MIDI value from pedal (0-127)
     */
    handlePedalVolumeChange(pedalValue) {
        // Update global pedal position
        this.globalPedalState.rawValue = pedalValue;
        this.globalPedalState.lastUpdateTime = Date.now();
        
        // Get current parameter and convert pedal value to parameter range
        const param = this.getCurrentParameter();
        const paramValue = Math.round((pedalValue / 127) * param.max);
        
        // Store original control value for pickup mode detection
        const originalControlValue = param.current;
        
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
                    parameterKey: this.currentParameterKey,
                    originalControlValue: originalControlValue  // Always include for pickup mode
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
        // Don't send to hardware if pickup mode is suppressing updates
        if (this.pickupMode.suppressHardwareUpdates) {
            return;
        }
        
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
                console.error('Error in pedal button callback:', error);
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
        
        // Send effect switch commands if this parameter has them
        if (param.effectSwitchCommands) {
            this.sendEffectSwitchCommands(param.effectSwitchCommands);
        }
        
        // Notify callbacks about parameter change
        this.pedalCallbacks.forEach((callback, index) => {
            callback({ type: 'parameterChange', parameter: param });
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
        
        // Send effect switch commands if this parameter has them
        if (param.effectSwitchCommands) {
            this.sendEffectSwitchCommands(param.effectSwitchCommands);
        }
        
        // Notify callbacks about parameter change
        this.pedalCallbacks.forEach((callback, index) => {
            callback({ type: 'parameterChange', parameter: param });
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

    // ===== PICKUP MODE METHODS =====

    /**
     * Enable pickup mode - suppresses hardware updates from pedal
     */
    enablePickupMode() {
        this.pickupMode.enabled = true;
        this.pickupMode.suppressHardwareUpdates = true;
    }

    /**
     * Disable pickup mode - allows hardware updates from pedal
     */
    disablePickupMode() {
        this.pickupMode.enabled = false;
        this.pickupMode.suppressHardwareUpdates = false;
    }

    /**
     * Check if pickup mode is active
     */
    isPickupModeActive() {
        return this.pickupMode.enabled;
    }

    /**
     * Get global pedal position converted to specific parameter's scale
     */
    getGlobalPedalPosition(param) {
        if (this.globalPedalState.rawValue === 0) {
            return null; // No pedal position recorded yet
        }
        
        return Math.round((this.globalPedalState.rawValue / 127) * param.max);
    }

    /**
     * Get raw global pedal position (0-127)
     */
    getRawGlobalPedalPosition() {
        return this.globalPedalState.rawValue;
    }

    // ===== PEDAL EVENT MANAGEMENT =====

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
                const status = this.pedalComm.getConnectionStatus();
                callback({ 
                    type: 'status', 
                    connected: status.isConnected,
                    pedalName: status.deviceName
                });
            } catch (error) {
                console.error('Error in pedal status callback:', error);
            }
        });
    }

    // ===== BOSS CUBE COMMUNICATION METHODS =====

    /**
     * Send parameter command to Boss Cube (delegated to communication module)
     */
    async sendParameterCommand(address, value) {
        return await this.bossCubeComm.sendParameterCommand(address, value);
    }

    /**
     * Send parameter read request (delegated to communication module)
     */
    async sendParameterReadRequest(address) {
        return await this.bossCubeComm.sendParameterReadRequest(address);
    }

    /**
     * Read parameter value from Boss Cube
     */
    async readParameter(paramKey) {
        const param = this.parameters[paramKey];
        if (!param) {
            throw new Error(`Unknown parameter: ${paramKey}`);
        }
        
        // Skip reading virtual parameters from hardware
        if (param.isVirtual) {
            return param.current;
        }
        
        return await this.sendParameterReadRequest(param.address);
    }

    /**
     * Set parameter value on Boss Cube
     */
    async setParameter(paramKey, value) {
        const param = this.parameters[paramKey];
        if (!param) {
            throw new Error(`Unknown parameter: ${paramKey}`);
        }
        
        // Validate value range
        const clampedValue = Math.max(param.min, Math.min(param.max, Math.round(value)));
        
        // Update internal parameter value
        param.current = clampedValue;
        
        // Skip sending virtual parameters to hardware
        if (param.isVirtual) {
            return Promise.resolve();
        }
        
        // Send to Boss Cube
        return await this.sendParameterCommand(param.address, clampedValue);
    }

    /**
     * Send effect switch commands
     */
    async sendEffectSwitchCommands(commands) {
        if (!this.isCubeConnected) {
            throw new Error('Boss Cube not connected');
        }
        
        for (const command of commands) {
            try {
                await this.bossCubeComm.sendSpecialCommand(command.switch, []);
                
                if (command.activate) {
                    // Small delay between switch and activate commands
                    await new Promise(resolve => setTimeout(resolve, 50));
                    await this.bossCubeComm.sendSpecialCommand(command.activate, []);
                }
                
                // Delay between commands to prevent overwhelming the device
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                this.log(`❌ Failed to send effect switch command: ${error.message}`, 'error');
                throw error;
            }
        }
    }

    /**
     * Read all mixer parameter values from Boss Cube
     */
    async readAllMixerValues() {
        if (!this.isCubeConnected) {
            throw new Error('Not connected to Boss Cube');
        }
        
        this.log('📖 Reading all mixer values from Boss Cube...', 'info');
        
        const mixerParams = this.getParametersByCategory('mixer');
        
        for (const [key, param] of Object.entries(mixerParams)) {
            // Skip virtual parameters - they don't exist on hardware
            if (param.isVirtual) {
                this.log(`⏭️ Skipping virtual parameter: ${param.name}`, 'info');
                continue;
            }
            
            try {
                await this.readParameter(key);
            } catch (error) {
                this.log(`⚠️ Failed to read ${param.name}: ${error.message}`, 'warning');
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
        
        this.log('📖 Reading all effects values from Boss Cube...', 'info');
        
        const effectsParams = this.getParametersByCategory('effects');
        
        for (const [key, param] of Object.entries(effectsParams)) {
            try {
                await this.readParameter(key);
            } catch (error) {
                this.log(`⚠️ Failed to read ${param.name}: ${error.message}`, 'warning');
            }
        }
    }

    /**
     * Read all parameter values from Boss Cube (all categories)
     */
    async readAllValues() {
        if (!this.isCubeConnected) {
            throw new Error('Not connected to Boss Cube');
        }
        
        this.log('📖 Reading ALL parameter values from Boss Cube...', 'info');
        
        // Read all parameters regardless of category
        for (const [key, param] of Object.entries(this.parameters)) {
            try {
                await this.readParameter(key);
            } catch (error) {
                this.log(`⚠️ Failed to read ${param.name}: ${error.message}`, 'warning');
            }
        }
        
        this.log('✅ All parameter read requests sent', 'success');
    }

    /**
     * Test connection with Boss Cube
     */
    async testConnection() {
        return await this.bossCubeComm.testConnection();
    }

    // ===== PARAMETER MANAGEMENT =====

    /**
     * Update parameter in cube state from incoming cube data
     */
    updateParameterFromCube(addressBytes, value, isPhysicalKnobChange) {
        const cubeAddress = addressBytes.join(' ');
        const paramAddress = addressBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
        
        // Look up parameter definition
        const paramDef = this.findParameterByAddress(addressBytes);

        if (paramDef) {
            // Handle structured tuner data specially
            if (paramDef.name === 'Tuner Pitch Data' && typeof value === 'object' && value.hasSignal !== undefined) {
                // Store structured tuner data
                this.cubeState[paramDef.id] = value;
                
                // Update tuner display with structured data
                this.updateTunerDisplay(value);
                
                // Log structured tuner data (detailed logging already done in communication module)
                // Skipping additional logging to avoid duplication
            } else {
                // Handle normal numeric parameters
                this.cubeState[paramDef.id] = value;
                
                // Update UI for this parameter
                this.updateUIFromParameter(paramDef.id, value, isPhysicalKnobChange);
                
        
            }
        } else {
            // Log unknown parameter with improved formatting
            if (typeof value === 'object' && value.hasSignal !== undefined) {
                // Unknown tuner-like data
                this.log(`❓ Unknown tuner parameter at ${paramAddress} = [structured data]`, 'warning');
            } else {
                this.log(`❓ Unknown parameter address: ${paramAddress} = ${value}`, 'warning');
            }
        }
    }

    /**
     * Handle physical knob change detection
     */
    handlePhysicalKnobChange(addressBytes, value) {
        // Find parameter name for logging
        for (const [key, param] of Object.entries(this.parameters)) {
            if (param.address.length === addressBytes.length &&
                param.address.every((byte, index) => byte === addressBytes[index])) {
                
                if (this.onPhysicalKnobChange) {
                    this.onPhysicalKnobChange(key, param.name, value);
                }
                return;
            }
        }
    }

    /**
     * Get parameters by category
     */
    getParametersByCategory(category, effectType = null) {
        const result = {};
        
        for (const [key, param] of Object.entries(this.parameters)) {
            if (param.category === category) {
                if (!effectType || param.effectType === effectType) {
                    result[key] = param;
                }
            }
        }
        
        return result;
    }

    /**
     * Find parameter definition by address bytes
     */
    findParameterByAddress(addressBytes) {
        for (const [key, param] of Object.entries(this.parameters)) {
            if (param.address && param.address.length === addressBytes.length &&
                param.address.every((byte, index) => byte === addressBytes[index])) {
                return { id: key, ...param };
            }
        }
        return null;
    }

    /**
     * Update tuner display with structured tuner data
     */
    updateTunerDisplay(tunerData) {
        const tunerFrequencyDisplay = document.getElementById('tunerFrequencyDisplay');
        const tunerNoteDisplay = document.getElementById('tunerNoteDisplay');
        const tunerVisual = document.getElementById('tunerVisual');
        const tunerMeter = document.querySelector('.tuner-meter');
        
        if (!tunerFrequencyDisplay || !tunerNoteDisplay || !tunerVisual) {
            this.log(`🎵 TUNER UI: Missing elements`, 'warning');
            return;
        }
        
        if (!tunerData.hasSignal) {
            // No signal
            tunerFrequencyDisplay.textContent = '--Hz';
            tunerNoteDisplay.textContent = '--';
            tunerVisual.style.background = '#333';
            
            // Remove needle if present
            const tunerNeedle = document.querySelector('.tuner-needle');
            if (tunerNeedle) {
                tunerNeedle.remove();
            }
            return;
        }
        
        // Display structured tuner information
        const noteDisplay = `${tunerData.note}${tunerData.octave}`;
        tunerNoteDisplay.textContent = noteDisplay;
        
        // Show frequency and status info
        const centsDisplay = tunerData.centsDeviation > 0 ? `+${tunerData.centsDeviation}¢` : `${tunerData.centsDeviation}¢`;
        tunerFrequencyDisplay.textContent = `${tunerData.frequency}Hz (${centsDisplay})`;
        
        // Color coding based on tuning status
        let backgroundColor = '#333';
        if (tunerData.status === 'In Tune') {
            backgroundColor = '#2d5a2d';
        } else if (tunerData.status === 'Sharp') {
            backgroundColor = '#5a3d2d';
        } else if (tunerData.status === 'Flat') {
            backgroundColor = '#5a2d2d';
        }
        
        tunerVisual.style.background = backgroundColor;
        
        // Update tuner meter needle - always show with color feedback
        if (tunerMeter) {
            let tunerNeedle = document.querySelector('.tuner-needle');
            
            // Create needle if it doesn't exist
            if (!tunerNeedle) {
                tunerNeedle = document.createElement('div');
                tunerNeedle.className = 'tuner-needle';
                tunerNeedle.style.cssText = `
                    position: absolute;
                    top: 50%;
                    width: 3px;
                    height: 60%;
                    background: #e74c3c;
                    transform: translate(-50%, -50%);
                    transition: left 0.1s ease;
                    z-index: 3;
                    border-radius: 1px;
                    box-shadow: 0 0 4px rgba(231, 76, 60, 0.8);
                `;
                tunerMeter.appendChild(tunerNeedle);
            }
            
                        // Correct mathematical positioning based on scale layout
            // Scale has 7 marks with justify-content: space-between: ♭, -20, -10, 0, +10, +20, ♯
            // Positions: 0%, 16.67%, 33.33%, 50%, 66.67%, 83.33%, 100%
            const maxDisplayCents = 20;
            const normalizedCents = Math.max(-maxDisplayCents, Math.min(maxDisplayCents, tunerData.centsDeviation));
            
            // Map cents to scale positions:
            // -20¢ at 16.67%, -10¢ at 33.33%, 0¢ at 50%, +10¢ at 66.67%, +20¢ at 83.33%
            const needlePosition = 50 + (normalizedCents / 20) * 33.33;
            tunerNeedle.style.left = `${needlePosition}%`;
            
            // Change needle color based on tuning status - green when in tune for positive feedback
            if (tunerData.status === 'In Tune') {
                tunerNeedle.style.background = '#27ae60'; // Green when perfectly tuned
                tunerNeedle.style.boxShadow = '0 0 4px rgba(39, 174, 96, 0.8)';
            } else {
                tunerNeedle.style.background = '#e74c3c'; // Red when needs adjustment
                tunerNeedle.style.boxShadow = '0 0 4px rgba(231, 76, 60, 0.8)';
            }
        }
    }

    /**
     * Update UI from parameter value (for normal numeric parameters)
     */
    updateUIFromParameter(parameterId, value, isPhysicalKnobChange = false) {
        if (!this.parameters || !this.parameters[parameterId]) {
            // Parameter not found - still notify callback for test compatibility
            this.log(`🔍 Controller: parameter ${parameterId} not found, but notifying callback anyway`, 'warning');
            if (this.onParameterUpdate) {
                this.onParameterUpdate(parameterId, value, isPhysicalKnobChange);
            }
            return;
        }
        
        const param = this.parameters[parameterId];
        
        // Handle value conversion from Boss Cube (some parameters send 1-based values)
        let uiValue = value;
        
        // Parameters that need -1 for EQ (1-100 Boss Cube to 0-100 UI)
        const eqParams = ['micInstEQBass', 'micInstEQMiddle', 'micInstEQTreble', 
                         'guitarEQBass', 'guitarEQMiddle', 'guitarEQTreble', 'guitarGain'];
        if (eqParams.includes(parameterId)) {
            uiValue = Math.max(0, value - 1);
        }
        
        // Update parameter current value
        param.current = uiValue;
        
        // Notify parameter update callback
        if (this.onParameterUpdate) {
            this.onParameterUpdate(parameterId, uiValue, isPhysicalKnobChange);
        }
    }

    // ===== STATUS AND UTILITY METHODS =====

    /**
     * Get connection status
     */
    getStatus() {
        const cubeStatus = this.bossCubeComm.getConnectionStatus();
        const pedalStatus = this.pedalComm.getConnectionStatus();
        
        return {
            cube: cubeStatus,
            pedal: pedalStatus,
            isConnected: cubeStatus.isConnected,
            isPedalConnected: pedalStatus.isConnected
        };
    }

    /**
     * Get connection status (legacy compatibility)
     */
    get isConnected() {
        return this.isCubeConnected;
    }

    /**
     * Set pedal CC codes configuration
     */
    setPedalCCCodes(previousParameter, nextParameter, pedalControl) {
        this.pedalComm.setPedalCCCodes(previousParameter, nextParameter, pedalControl);
    }

    /**
     * Set footswitch polarity
     */
    setFootswitchPolarity(polarity) {
        this.pedalComm.setFootswitchPolarity(polarity);
    }

    // ===== EFFECT SWITCHING METHODS =====

    /**
     * Switch guitar effect
     */
    async switchGuitarEffect(effectType) {
        this.currentGuitarEffect = effectType;
        
        if (this.effectSwitchCommands.guitar[effectType]) {
            const commands = [this.effectSwitchCommands.guitar[effectType]];
            await this.sendEffectSwitchCommands(commands);
            this.log(`🎸 Switched to guitar ${effectType} effect`, 'info');
        }
    }

    /**
     * Switch mic/inst effect
     */
    async switchMicInstEffect(effectType) {
        this.currentMicInstEffect = effectType;
        
        if (this.effectSwitchCommands.micInst[effectType]) {
            const commands = [this.effectSwitchCommands.micInst[effectType]];
            await this.sendEffectSwitchCommands(commands);
            this.log(`🎤 Switched to mic/inst ${effectType} effect`, 'info');
        }
    }

    /**
     * Get current guitar effect parameters
     */
    getCurrentGuitarEffectParameters() {
        return this.getParametersByCategory('guitarEffects', this.currentGuitarEffect);
    }

    /**
     * Get current mic/inst effect parameters
     */
    getCurrentMicInstEffectParameters() {
        return this.getParametersByCategory('micInstEffects', this.currentMicInstEffect);
    }

    /**
     * Set tuner control (enable/disable tuner)
     * @param {boolean} enabled - True to enable tuner, false to disable
     */
    async setTunerControl(enabled) {
        if (!this.isCubeConnected) {
            throw new Error('Boss Cube not connected');
        }

        const value = enabled ? 0x01 : 0x00;
        
        try {
            await this.bossCubeComm.sendSpecialCommand(
                [0x7F, 0x00, 0x00, 0x02], // TUNER_CONTROL address
                [value]
            );
            
            this.log(`🎵 Tuner ${enabled ? 'enabled' : 'disabled'} via SysEx command`, 'info');
            
        } catch (error) {
            this.log(`❌ Failed to control tuner: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Enable continuous notifications from Boss Cube
     */
    async enableContinuousNotifications() {
        return await this.bossCubeComm.enableContinuousNotifications();
    }
}

// Export the class for use as a module
export default BossCubeController; 