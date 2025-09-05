/**
 * Live Performance Mode
 * 
 * Optimized interface for live performance with smooth controls and advanced pedal integration.
 * 
 * Key Features:
 * - Streamlined control interaction with long-hold pedal selection
 * - Automatic pickup mode for seamless parameter transitions  
 * - Drag & drop preset management with mobile touch support
 * - Real-time parameter synchronization with Boss Cube hardware
 * 
 * Architecture:
 * - Utility methods for common operations (pickup mode, DOM queries)
 * - Modular event handling split into focused methods
 * - Constants for better maintainability
 * - Simplified state management with clear ownership
 */

import { PedalUtils } from './pedal-utils.js';

// Constants for better maintainability
const LIVE_PERFORMANCE_CONSTANTS = {
    THROTTLE_INTERVAL: 50,              // 20 FPS for parameter updates
    HOLD_DURATION: 800,                 // 800ms hold to select for pedal control
    MOVEMENT_THRESHOLD: 10,             // pixels of movement allowed during hold
    PEDAL_POSITION_TIMEOUT: 3000,      // 3 seconds to show pedal position indicator
    VIBRATION_DURATION: 50              // vibration feedback duration
};

export class LivePerformance {
    constructor(bossCubeController, templateLoader, logger) {
        this.bossCubeController = bossCubeController;
        this.templateLoader = templateLoader;
        this.log = logger;
        
        // State management
        this.isActive = false;
        this.overlay = null;
        
        // Performance optimization for throttled updates
        this.throttle = {
            pending: new Map(),
            isProcessing: false,
            updateInterval: LIVE_PERFORMANCE_CONSTANTS.THROTTLE_INTERVAL
        };
        
        // User-created presets (start empty)
        this.presets = {};
        
        // Current configuration
        this.currentPreset = null;
        this.config = null;
        
        // Editing state for preset modal
        this.editingPresetId = null;
        this.configBackup = null;
        
        // Pedal control state for Live Performance mode
        this.pedalControlState = {
            originalPedalCallbacks: [],
            currentParameterIndex: -1,
            pedalControllableKeys: []
        };
        
        // Pickup mode state for Live Performance mode
        this.pickupModeState = PedalUtils.createPickupModeState();
        
        // Timeout for temporary pedal position indicator
        this.pedalPositionTimeout = null;
    }

    // ===== UTILITY METHODS =====
    
    /**
     * Activate pickup mode for a parameter
     */
    activatePickupMode(parameterKey, targetValue, reason = '') {
        this.pickupModeState.active = true;
        this.pickupModeState.targetControlValue = targetValue;
        this.pickupModeState.activeParameter = parameterKey;
        
        // Clear temporary pedal position indicators
        this.clearPedalPositionTimeout();
        const control = this.getControlElement(parameterKey);
        if (control) {
            control.classList.remove('show-pedal-position');
        }
        
        // Update visuals and enable in controller
        PedalUtils.updatePickupModeVisuals(parameterKey, true, '.live-performance-control');
        this.bossCubeController.enablePickupMode();
        
        const logMessage = reason ? `🎯 Pickup mode activated ${reason}` : '🎯 Pickup mode activated';
        this.log(logMessage, 'info');
    }
    
    /**
     * Deactivate pickup mode
     */
    deactivatePickupMode(parameterKey) {
        this.pickupModeState.active = false;
        this.pickupModeState.targetControlValue = null;
        this.pickupModeState.activeParameter = null;
        
        // Update visuals and disable in controller
        PedalUtils.updatePickupModeVisuals(parameterKey, false, '.live-performance-control');
        this.bossCubeController.disablePickupMode();
        
        // Hide pedal position indicator
        const control = this.getControlElement(parameterKey);
        if (control) {
            control.classList.remove('show-pedal-position');
        }
        
        this.log('✅ Pickup mode deactivated', 'success');
    }
    
    /**
     * Check if pickup mode should be activated and activate if needed
     */
    checkAndActivatePickupMode(parameterKey, value) {
        if (this.pickupModeState.active || parameterKey !== this.bossCubeController.currentParameterKey) {
            return false;
        }
        
        const param = this.bossCubeController.parameters[parameterKey];
        const globalPedalPosition = this.bossCubeController.getGlobalPedalPosition(param);
        
        if (globalPedalPosition !== null) {
            const valueDifference = Math.abs(globalPedalPosition - value);
            if (valueDifference > this.pickupModeState.threshold) {
                this.activatePickupMode(parameterKey, value, `(control set to ${value})`);
                return true;
            }
        }
        return false;
    }
    
    /**
     * Get control element by parameter key
     */
    getControlElement(parameterKey) {
        return document.querySelector(`.live-performance-control[data-param-key="${parameterKey}"]`);
    }
    
    /**
     * Clear pedal position timeout
     */
    clearPedalPositionTimeout() {
        if (this.pedalPositionTimeout) {
            clearTimeout(this.pedalPositionTimeout);
            this.pedalPositionTimeout = null;
        }
    }
    
    /**
     * Show temporary pedal position indicator
     */
    showTemporaryPedalPosition(parameterKey, globalPedalPosition, param) {
        const control = this.getControlElement(parameterKey);
        if (control && globalPedalPosition !== null) {
            control.classList.add('show-pedal-position');
            PedalUtils.updatePedalPositionIndicator(parameterKey, globalPedalPosition, param, '.live-performance-control');
            
            this.clearPedalPositionTimeout();
            this.pedalPositionTimeout = setTimeout(() => {
                if (!this.pickupModeState.active) {
                    control.classList.remove('show-pedal-position');
                }
            }, LIVE_PERFORMANCE_CONSTANTS.PEDAL_POSITION_TIMEOUT);
        }
    }

    // ===== CORE METHODS =====
    
    /**
     * Initialize live performance mode
     */
    initialize(overlayElement) {
        this.overlay = overlayElement;
        
        // Load saved presets from localStorage
        this.loadPresetsFromStorage();
        
        // Load current preset selection
        this.loadCurrentPresetFromStorage();
    }
    
    /**
     * Toggle live performance mode on/off
     */
    async toggle() {
        if (this.isActive) {
            await this.close();
        } else {
            await this.open();
        }
    }
    
    /**
     * Open live performance mode
     */
    async open() {
        try {
            // Load and insert the template
            const html = await this.templateLoader.loadTemplate('templates/live-performance.html');
            this.overlay.innerHTML = html;
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Set up preset selection UI
            this.setupPresetSelection();
            
            // Create controls
            await this.createControls();
            
            // Setup pedal control override
            this.setupPedalControlOverride();
            
            // Show the overlay
            this.overlay.classList.add('active');
            this.isActive = true;
            
            // Enter fullscreen mode for immersive experience
            await this.enterFullscreen();
            
            if (this.bossCubeController.isCubeConnected) {
                this.log('🎭 Live performance mode activated (press F11 for manual fullscreen)', 'success');
            } else {
                this.log('🎭 Live performance mode activated (demo mode - press F11 for manual fullscreen)', 'info');
            }
            
        } catch (error) {
            this.log(`Failed to open live performance mode: ${error.message}`, 'error');
            console.error('Live performance error:', error);
        }
    }
    
    /**
     * Close live performance mode
     */
    async close() {
        this.overlay.classList.remove('active');
        this.isActive = false;
        
        // Restore original pedal control
        this.restorePedalControl();
        
        // Exit fullscreen mode
        await this.exitFullscreen();
        
        // Clear the overlay content after animation
        setTimeout(() => {
            this.overlay.innerHTML = '';
        }, 300);
        
        this.log('🎭 Live performance mode deactivated', 'info');
    }
    
    /**
     * Set up event listeners for live performance mode
     */
    setupEventListeners() {
        // Close button
        const closeBtn = document.getElementById('livePerformanceClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        
        // Close on overlay click (but not on container click)
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });
        
        // Settings button
        const settingsBtn = document.getElementById('livePerformanceSettingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.openSettings();
            });
        }
        
        // Escape key to close
        const handleEscape = (e) => {
            if (e.key === 'Escape' && this.isActive) {
                this.close();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // Handle fullscreen changes (when user manually exits fullscreen)
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement && this.isActive) {
                // User manually exited fullscreen, close Live Performance
                this.close();
                document.removeEventListener('fullscreenchange', handleFullscreenChange);
            }
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
    }
    
    /**
     * Set up preset selection UI
     */
    setupPresetSelection() {
        this.updatePresetDropdown();
        
        // Set up dropdown change handler
        const presetSelect = document.getElementById('presetSelect');
        if (presetSelect) {
            presetSelect.addEventListener('change', (e) => {
                const presetId = e.target.value;
                if (presetId) {
                    this.switchPreset(presetId);
                } else {
                    // Deselect current preset
                    this.currentPreset = null;
                    this.config = null;
                    this.createControls();
                    this.saveCurrentPresetToStorage();
                }
            });
        }
    }
    
    /**
     * Switch to a different preset
     */
    async switchPreset(presetId) {
        if (!this.presets[presetId]) {
            return;
        }
        
        this.currentPreset = presetId;
        this.config = this.presets[presetId];
        
        // Update UI
        this.updatePresetDropdown();
        
        // Save to localStorage
        this.saveCurrentPresetToStorage();
        
        // Recreate controls
        await this.createControls();
        
        if (this.bossCubeController.isCubeConnected) {
            this.log(`🎭 Switched to preset: ${this.config.name}`, 'info');
        } else {
            this.log(`🎭 Demo: Switched to preset: ${this.config.name}`, 'info');
        }
    }
    
    /**
     * Update the preset dropdown in the main UI
     */
    updatePresetDropdown() {
        const presetSelect = document.getElementById('presetSelect');
        if (!presetSelect) return;
        
        // Clear existing options except the first one
        presetSelect.innerHTML = '<option value="">🎛️ Select preset...</option>';
        
        const presetIds = Object.keys(this.presets);
        
        if (presetIds.length > 0) {
            presetIds.forEach(presetId => {
                const preset = this.presets[presetId];
                const option = document.createElement('option');
                option.value = presetId;
                const icon = this.getPresetIcon(preset);
                option.textContent = `${icon} ${preset.name}`;
                if (presetId === this.currentPreset) {
                    option.selected = true;
                }
                presetSelect.appendChild(option);
            });
        }
    }
    
    /**
     * Get the icon for a preset (user-selected or fallback)
     */
    getPresetIcon(preset) {
        // Use user-selected icon if available
        if (preset.icon) {
            return preset.icon;
        }
        
        // Fallback to default icon if no icon is set
        return '🎭';
    }

    /**
     * Update the full preset list in the settings modal
     */
    updatePresetListFull() {
        const presetList = document.getElementById('livePerformancePresetListFull');
        if (!presetList) return;
        
        // Clear existing content
        presetList.innerHTML = '';
        
        const presetIds = Object.keys(this.presets);
        
        if (presetIds.length === 0) {
            // Show empty message
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-presets';
            emptyDiv.innerHTML = '<p>No presets created yet. Click "New Preset" to get started!</p>';
            presetList.appendChild(emptyDiv);
        } else {
            // Show preset items
            presetIds.forEach(presetId => {
                const preset = this.presets[presetId];
                const presetItem = this.createPresetItem(presetId, preset, true);
                presetList.appendChild(presetItem);
            });
        }
    }
    
    /**
     * Create a preset item element
     */
    createPresetItem(presetId, preset, showActions = false) {
        const item = document.createElement('div');
        item.className = 'preset-item';
        if (presetId === this.currentPreset) {
            item.classList.add('active');
        }
        
        if (showActions) {
            // Full version with edit/delete actions (for settings modal)
            const icon = this.getPresetIcon(preset);
            item.innerHTML = `
                <div class="preset-item-info">
                    <div class="preset-item-name">${icon} ${preset.name}</div>
                    <div class="preset-item-controls">${preset.controls.length} controls</div>
                </div>
                <div class="preset-item-actions">
                    <button class="preset-edit-btn" data-preset-id="${presetId}" title="Edit Preset">✏️</button>
                    <button class="preset-delete-btn" data-preset-id="${presetId}" title="Delete Preset">🗑️</button>
                </div>
            `;
            
            // Add click handler for preset selection
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('preset-edit-btn') && 
                    !e.target.classList.contains('preset-delete-btn')) {
                    this.switchPreset(presetId);
                    this.closeSettings(); // Close settings when selecting a preset
                }
            });
            
            // Add edit handler
            const editBtn = item.querySelector('.preset-edit-btn');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editPreset(presetId);
            });
            
            // Add delete handler
            const deleteBtn = item.querySelector('.preset-delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deletePreset(presetId);
            });
        } else {
            // Simple version (for other contexts if needed)
            const icon = this.getPresetIcon(preset);
            item.innerHTML = `
                <div class="preset-item-info">
                    <div class="preset-item-name">${icon} ${preset.name}</div>
                    <div class="preset-item-controls">${preset.controls.length} controls</div>
                </div>
            `;
            
            // Add click handler for preset selection
            item.addEventListener('click', () => {
                this.switchPreset(presetId);
            });
        }
        
        return item;
    }
    
    /**
     * Create a new preset
     */
    createNewPreset(name, controls, icon = '🎭') {
        const presetId = `preset_${Date.now()}`;
        this.presets[presetId] = {
            name: name,
            controls: controls || [],
            icon: icon
        };
        
        // Auto-switch to new preset
        this.currentPreset = presetId;
        this.config = this.presets[presetId];
        
        // Save and update UI
        this.savePresetsToStorage();
        this.saveCurrentPresetToStorage();
        this.updatePresetDropdown();
        this.updatePresetListFull();
        
        return presetId;
    }
    
    /**
     * Edit an existing preset
     */
    editPreset(presetId) {
        this.editingPresetId = presetId;
        this.openPresetConfiguration(presetId);
    }
    
    /**
     * Delete a preset
     */
    deletePreset(presetId) {
        if (confirm(`Are you sure you want to delete "${this.presets[presetId].name}"?`)) {
            delete this.presets[presetId];
            
            // If this was the current preset, clear selection
            if (this.currentPreset === presetId) {
                this.currentPreset = null;
                this.config = null;
                this.createControls(); // Clear controls
            }
            
            // Save and update UI
            this.savePresetsToStorage();
            this.saveCurrentPresetToStorage();
            this.updatePresetDropdown();
            this.updatePresetListFull();
            
            this.log(`🗑️ Deleted preset`, 'info');
        }
    }
    
    /**
     * Save current preset selection to localStorage
     */
    saveCurrentPresetToStorage() {
        try {
            localStorage.setItem('live-performance-current-preset', this.currentPreset || '');
        } catch (error) {
            console.warn('Failed to save current preset to localStorage:', error);
        }
    }
    
    /**
     * Load current preset selection from localStorage
     */
    loadCurrentPresetFromStorage() {
        try {
            const savedPreset = localStorage.getItem('live-performance-current-preset');
            if (savedPreset && this.presets[savedPreset]) {
                this.currentPreset = savedPreset;
                this.config = this.presets[savedPreset];
            }
        } catch (error) {
            console.warn('Failed to load current preset from localStorage:', error);
        }
    }
    
    /**
     * Create controls based on current configuration
     */
    async createControls() {
        const controlsContainer = document.getElementById('livePerformanceControls');
        if (!controlsContainer) return;
        
        // Clear existing controls
        controlsContainer.innerHTML = '';
        
        // Check if we have a valid configuration
        if (!this.config || !this.config.controls) {
            controlsContainer.innerHTML = '<div style="text-align: center; color: #666; padding: 40px;"><h3>No Preset Selected</h3><p>Choose a preset from the list above or create a new one to get started!</p></div>';
            return;
        }
        
        // Create controls from configuration
        for (const controlConfig of this.config.controls) {
            const param = this.bossCubeController.parameters[controlConfig.key];
            if (param) {
                const control = await this.createControl(param, controlConfig.key, controlConfig.label, controlConfig);
                controlsContainer.appendChild(control);
            } else {
                // Log warning for missing parameters but don't fail
                console.warn(`Live Performance: Parameter "${controlConfig.key}" not found in controller`);
            }
        }
        
        // If no controls were created, show a message
        if (controlsContainer.children.length === 0) {
            controlsContainer.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">This preset has no controls. Edit the preset to add some!</div>';
        }
        
        // Update pedal control override when controls change
        if (this.isActive) {
            this.setupPedalControlOverride();
        }
    }
    
    /**
     * Create individual control element
     */
    async createControl(param, key, label, controlConfig) {
        const control = document.createElement('div');
        control.className = 'live-performance-control';
        control.setAttribute('data-param-key', key);
        
        // Special handling for button-based controls
        if (key === 'looperControl') {
            return await this.createLooperControl(param, key, label, controlConfig);
        }
        if (key === 'guitarAmpType') {
            return await this.createAmpTypeControl(param, key, label, controlConfig);
        }
        
        // Get current display value
        let displayValue = this.getDisplayValue(param, param.current);
        
        // Check if this control is pedal controllable
        const isPedalControl = controlConfig && controlConfig.pedalControl;
        const pedalIndicator = isPedalControl ? '<div class="pedal-indicator">🦶</div>' : '';
        
        // Create control HTML
        control.innerHTML = `
            <div class="parameter-fill"></div>
            <div class="parameter-pedal-position"></div>
            <div class="parameter-label">${label}</div>
            <div class="parameter-value">${displayValue}</div>
            ${pedalIndicator}
            <input type="range" class="parameter-slider" 
                   min="${param.min}" max="${param.max}" value="${param.current}"
                   data-param-key="${key}">
        `;
        
        // Update visual fill
        const fill = control.querySelector('.parameter-fill');
        const percentage = ((param.current - param.min) / (param.max - param.min)) * 100;
        fill.style.width = `${percentage}%`;
        
        // Add interaction handling
        this.addControlInteraction(control, key, param, isPedalControl);
        
        return control;
    }
    
    /**
     * Create looper control with buttons (similar to main app)
     */
    async createLooperControl(param, key, label, controlConfig) {
        const control = document.createElement('div');
        control.className = 'live-performance-control looper-control';
        control.setAttribute('data-param-key', key);
        
        // Check if this control is pedal controllable
        const isPedalControl = controlConfig && controlConfig.pedalControl;
        const pedalIndicator = isPedalControl ? '<div class="pedal-indicator">🦶</div>' : '';
        
        // Looper button definitions (same as main app)
        const looperButtons = [
            { icon: '🗑️', title: 'Erase Loop', label: 'Erase' },      // 0
            { icon: '⏸️', title: 'Paused', label: 'Paused' },          // 1
            { icon: '🔴', title: 'Recording', label: 'Record' },       // 2
            { icon: '▶️', title: 'Playing', label: 'Play' },           // 3
            { icon: '🔄', title: 'Overdub', label: 'Overdub' },        // 4
            { icon: '⏯️', title: 'Standby', label: 'Standby' }         // 5
        ];
        
        // Create buttons HTML
        const buttonsHTML = looperButtons.map((btn, index) => `
            <button class="looper-btn-live ${param.current === index ? 'active' : ''}" 
                    data-value="${index}" 
                    title="${btn.title}">
                <div class="looper-icon">${btn.icon}</div>
                <div class="looper-label">${btn.label}</div>
            </button>
        `).join('');
        
        // Create control HTML (no label to fit buttons on one line)
        control.innerHTML = `
            ${pedalIndicator}
            <div class="looper-buttons-live">
                ${buttonsHTML}
            </div>
        `;
        
        // Add click handlers for buttons
        const buttons = control.querySelectorAll('.looper-btn-live');
        buttons.forEach(button => {
            button.addEventListener('click', async (e) => {
                const value = parseInt(button.getAttribute('data-value'));
                
                // Update button states
                buttons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Update parameter via main app logic
                if (window.updateParameterValue) {
                    window.updateParameterValue(key, value);
                }
            });
        });
        
        // Add pedal selection if enabled
        if (isPedalControl) {
            this.setupPedalSelection(control, key, param);
        }
        
        return control;
    }
    
    /**
     * Create amp type control with buttons (similar to looper control)
     */
    async createAmpTypeControl(param, key, label, controlConfig) {
        const control = document.createElement('div');
        control.className = 'live-performance-control amp-type-control';
        control.setAttribute('data-param-key', key);
        
        // Check if this control is pedal controllable
        const isPedalControl = controlConfig && controlConfig.pedalControl;
        const pedalIndicator = isPedalControl ? '<div class="pedal-indicator">🦶</div>' : '';
        
        // Amp type button definitions
        const ampTypeButtons = param.valueLabels.map((ampLabel, index) => ({
            value: index,
            label: ampLabel,
            shortLabel: ampLabel.length > 8 ? ampLabel.substring(0, 8) + '...' : ampLabel
        }));
        
        // Create buttons HTML
        const buttonsHTML = ampTypeButtons.map((btn) => `
            <button class="amp-type-btn-live ${param.current === btn.value ? 'active' : ''}" 
                    data-value="${btn.value}" 
                    title="${btn.label}">
                ${btn.shortLabel}
            </button>
        `).join('');
        
        // Create control HTML (no labels, just buttons like effect controls)
        control.innerHTML = `
            ${pedalIndicator}
            <div class="amp-type-buttons-live">
                ${buttonsHTML}
            </div>
        `;
        
        // Add click handlers for buttons
        const buttons = control.querySelectorAll('.amp-type-btn-live');
        buttons.forEach(button => {
            button.addEventListener('click', async (e) => {
                const value = parseInt(button.getAttribute('data-value'));
                
                // Update button states
                buttons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Update parameter via main app logic
                if (window.updateParameterValue) {
                    window.updateParameterValue(key, value);
                }
            });
        });
        
        // Add pedal selection if enabled
        if (isPedalControl) {
            this.setupPedalSelection(control, key, param);
        }
        
        return control;
    }
    
    /**
     * Add interaction handling to a control
     */
    addControlInteraction(control, key, param, isPedalControl = false) {
        const slider = control.querySelector('.parameter-slider');
        const cachedElements = {
            control,
            slider,
            fill: control.querySelector('.parameter-fill'),
            valueDisplay: control.querySelector('.parameter-value'),
            param
        };
        
        // Set up touch/mouse interaction for direct control manipulation
        this.setupDirectInteraction(control, key, param, cachedElements);
        
        // Set up slider interaction for accessibility
        this.setupSliderInteraction(slider, key, param, cachedElements);
        
        // Set up click selection for pedal-enabled controls
        if (isPedalControl) {
            this.setupPedalSelection(control, key, param);
        }
    }
    
    /**
     * Set up direct touch/mouse interaction with long hold support
     */
    setupDirectInteraction(control, key, param, cachedElements) {
        const interactionState = {
            isDragging: false,
            holdTimer: null,
            hasMovedDuringHold: false,
            startPosition: null
        };
        
        // Mouse events
        control.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.startInteraction(e, control, key, param, cachedElements, interactionState);
            this.setupMouseMoveEnd(key, param, cachedElements, interactionState);
        });
        
        // Touch events
        control.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startInteraction(e.touches[0], control, key, param, cachedElements, interactionState);
        });
        
        control.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (interactionState.isDragging) {
                this.handleInteractionMove(e.touches[0], control, key, param, cachedElements, interactionState);
            }
        });
        
        control.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.endInteraction(interactionState);
        });
        
        control.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    /**
     * Start interaction (mouse/touch down)
     */
    startInteraction(event, control, key, param, cachedElements, interactionState) {
        interactionState.isDragging = true;
        interactionState.hasMovedDuringHold = false;
        interactionState.startPosition = { x: event.clientX, y: event.clientY };
        
        // Update parameter value immediately
        this.updateParameterFromPosition(event, control, key, param, cachedElements);
        
        // Start hold timer for pedal selection
        this.startHoldTimer(key, param, interactionState);
    }
    
    /**
     * Handle interaction movement
     */
    handleInteractionMove(event, control, key, param, cachedElements, interactionState) {
        this.checkMovement(event, interactionState);
        if (interactionState.hasMovedDuringHold) {
            this.updateParameterFromPosition(event, control, key, param, cachedElements);
        }
    }
    
    /**
     * Update parameter value based on touch/mouse position
     */
    updateParameterFromPosition(event, control, key, param, cachedElements) {
        const rect = control.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        const value = Math.round(param.min + (param.max - param.min) * percentage);
        
        // Update parameter
        param.current = value;
        
        // Check for pickup mode activation
        this.checkAndActivatePickupMode(key, value);
        
        // Update display and hardware
        this.updateControlDisplayFast(cachedElements, value);
        this.updateParameter(key, value);
        cachedElements.slider.value = value;
    }
    
    /**
     * Start hold timer for pedal selection
     */
    startHoldTimer(key, param, interactionState) {
        interactionState.holdTimer = setTimeout(() => {
            if (!interactionState.hasMovedDuringHold && interactionState.isDragging) {
                this.selectParameter(key, param);
                this.log(`🔘 Selected for pedal control: ${param.name}`, 'info');
                
                if (navigator.vibrate) {
                    navigator.vibrate(LIVE_PERFORMANCE_CONSTANTS.VIBRATION_DURATION);
                }
            }
        }, LIVE_PERFORMANCE_CONSTANTS.HOLD_DURATION);
    }
    
    /**
     * Check if movement exceeds threshold
     */
    checkMovement(event, interactionState) {
        if (interactionState.startPosition) {
            const deltaX = Math.abs(event.clientX - interactionState.startPosition.x);
            const deltaY = Math.abs(event.clientY - interactionState.startPosition.y);
            
            if (deltaX > LIVE_PERFORMANCE_CONSTANTS.MOVEMENT_THRESHOLD || 
                deltaY > LIVE_PERFORMANCE_CONSTANTS.MOVEMENT_THRESHOLD) {
                interactionState.hasMovedDuringHold = true;
                this.clearHoldTimer(interactionState);
            }
        }
    }
    
    /**
     * Set up mouse move and end listeners
     */
    setupMouseMoveEnd(key, param, cachedElements, interactionState) {
        const handleMouseMove = (e) => {
            if (interactionState.isDragging) {
                this.handleInteractionMove(e, null, key, param, cachedElements, interactionState);
            }
        };
        
        const handleMouseUp = () => {
            this.endInteraction(interactionState);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    /**
     * End interaction and cleanup
     */
    endInteraction(interactionState) {
        this.clearHoldTimer(interactionState);
        interactionState.isDragging = false;
        interactionState.hasMovedDuringHold = false;
        interactionState.startPosition = null;
    }
    
    /**
     * Clear hold timer
     */
    clearHoldTimer(interactionState) {
        if (interactionState.holdTimer) {
            clearTimeout(interactionState.holdTimer);
            interactionState.holdTimer = null;
        }
    }
    
    /**
     * Set up slider interaction for accessibility
     */
    setupSliderInteraction(slider, key, param, cachedElements) {
        slider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            param.current = value;
            
            // Check for pickup mode activation
            this.checkAndActivatePickupMode(key, value);
            
            // Update display and hardware
            this.updateControlDisplayFast(cachedElements, value);
            this.updateParameter(key, value);
        });
    }
    
    /**
     * Set up pedal selection for pedal-enabled controls
     */
    setupPedalSelection(control, key, param) {
        control.addEventListener('click', (e) => {
            // Only handle click if not part of drag operation
            if (!e.defaultPrevented) {
                this.selectParameter(key, param);
                this.updateParameterSelectionUI();
            }
        });
    }
    
    /**
     * Update parameter selection UI
     */
    updateParameterSelectionUI() {
        const allControls = document.querySelectorAll('.live-performance-control');
        allControls.forEach(c => c.classList.remove('current'));
        // Current control will be marked by selectParameter method
    }
    
    /**
     * Fast display update for controls (using requestAnimationFrame)
     */
    updateControlDisplayFast(cachedElements, value) {
        const { fill, valueDisplay, slider, param } = cachedElements;
        
        // Use the same batching system as main controls
        const paramKey = cachedElements.control.getAttribute('data-param-key');
        
        // Add to pending animation updates (assumes access to global pendingAnimationUpdates)
        if (window.pendingAnimationUpdates) {
            window.pendingAnimationUpdates.set(paramKey, { 
                control: cachedElements.control, 
                value, 
                min: param.min, 
                max: param.max 
            });
            
            if (window.pendingAnimationUpdates.size === 1) {
                requestAnimationFrame(window.processPendingAnimationUpdates);
            }
        } else {
            // Fallback direct update
            const percentage = ((value - param.min) / (param.max - param.min)) * 100;
            fill.style.width = `${percentage}%`;
        }
        
        // Fast value display update
        const displayValue = this.getDisplayValue(param, value);
        if (valueDisplay.textContent !== displayValue) {
            valueDisplay.textContent = displayValue;
        }
        
        // Update slider value
        slider.value = value;
    }
    
    /**
     * Get formatted display value for parameter
     */
    getDisplayValue(param, value) {
        if (param.valueLabels && param.valueLabels[value] !== undefined) {
            return param.valueLabels[value];
        } else if (param.displayValue && typeof param.displayValue === 'function') {
            return param.displayValue(value);
        } else {
            return `${value}/${param.max}`;
        }
    }
    
    /**
     * Throttled parameter update (prevents hardware overflow)
     */
    updateParameter(key, value) {
        // Store pending update
        this.throttle.pending.set(key, value);
        
        // Process throttled if not already processing
        if (!this.throttle.isProcessing) {
            this.throttle.isProcessing = true;
            
            setTimeout(async () => {
                // Process all pending updates
                const updates = new Map(this.throttle.pending);
                this.throttle.pending.clear();
                
                for (const [paramKey, paramValue] of updates) {
                    try {
                        // Use main app's parameter update function to ensure all logic (including looper volume) is triggered
                        if (window.updateParameterValue) {
                            window.updateParameterValue(paramKey, paramValue);
                        } else {
                            // Fallback to direct method if main app function not available
                            if (this.bossCubeController.isCubeConnected) {
                                await this.bossCubeController.setParameter(paramKey, paramValue);
                            }
                            
                            // Always update main interface
                            if (window.updateParameterDisplay) {
                                window.updateParameterDisplay(paramKey, paramValue);
                            }
                        }
                    } catch (error) {
                        this.log(`Failed to update ${paramKey}: ${error.message}`, 'error');
                    }
                }
                
                this.throttle.isProcessing = false;
            }, this.throttle.updateInterval);
        }
    }
    
    /**
     * Select parameter for pedal control in Live Performance mode
     */
    selectParameter(key, param) {
        // Find the index of this parameter in our pedal controllable list
        const paramIndex = this.pedalControlState.pedalControllableKeys.findIndex(
            controlKey => controlKey === key
        );
        
        if (paramIndex !== -1) {
            this.pedalControlState.currentParameterIndex = paramIndex;
            
            // Update visual selection in Live Performance mode
            this.updateLivePerformanceParameterSelection(key);
            
            // Set the parameter in the controller (for pickup mode and hardware updates)
            this.bossCubeController.setCurrentParameter(key);
            
            // Show temporary pedal position indicator
            const globalPedalPosition = this.bossCubeController.getGlobalPedalPosition(param);
            this.showTemporaryPedalPosition(key, globalPedalPosition, param);
            
            const connectionStatus = this.bossCubeController.isCubeConnected ? 'Live performance' : 'Demo';
            this.log(`🎭 ${connectionStatus}: Selected ${param.name} for pedal control`, 'info');
        }
    }
    
    /**
     * Update configuration (for future customization)
     */
    setConfiguration(config) {
        // If a preset is specified, switch to it
        if (config.preset && this.presets[config.preset]) {
            this.switchPreset(config.preset);
            return;
        }
        
        // Otherwise, update the current configuration
        this.config = { ...this.config, ...config };
        
        // Recreate controls if currently active
        if (this.isActive) {
            this.createControls();
        }
    }
    
    /**
     * Get current configuration
     */
    getConfiguration() {
        return { 
            ...this.config, 
            preset: this.currentPreset,
            presets: this.presets
        };
    }
    
    /**
     * Open preset configuration modal
     */
    openPresetConfiguration(presetId = null) {
        const modal = document.getElementById('presetConfigModal');
        if (!modal) {
            return;
        }
        
        // Store current state for cancellation
        this.configBackup = JSON.parse(JSON.stringify(this.presets));
        
        // Set editing mode
        this.editingPresetId = presetId;
        
        // Set up the modal
        this.setupPresetConfigModal();
        
        // Show the modal
        modal.classList.add('active');
        
        // Load preset or start with empty
        if (presetId && this.presets[presetId]) {
            this.loadPresetConfig(presetId);
        } else {
            this.loadPresetConfig(null); // New preset
        }
    }
    
    /**
     * Set up preset configuration modal
     */
    setupPresetConfigModal() {
        // Update modal title
        const modalTitle = document.getElementById('configModalTitle');
        const saveBtn = document.getElementById('saveConfigBtn');
        const deleteBtn = document.getElementById('deletePresetBtn');
        
        if (this.editingPresetId) {
            // Editing existing preset
            if (modalTitle) modalTitle.textContent = 'Edit Preset';
            if (saveBtn) saveBtn.textContent = 'Save Changes';
            if (deleteBtn) {
                deleteBtn.style.display = 'inline-block';
                deleteBtn.replaceWith(deleteBtn.cloneNode(true));
                const newDeleteBtn = document.getElementById('deletePresetBtn');
                newDeleteBtn.addEventListener('click', () => {
                    this.closePresetConfiguration();
                    this.deletePreset(this.editingPresetId);
                });
            }
        } else {
            // Creating new preset
            if (modalTitle) modalTitle.textContent = 'Create New Preset';
            if (saveBtn) saveBtn.textContent = 'Create Preset';
            if (deleteBtn) deleteBtn.style.display = 'none';
        }
        
        // Close button
        const closeBtn = document.getElementById('presetConfigClose');
        if (closeBtn) {
            closeBtn.replaceWith(closeBtn.cloneNode(true));
            const newCloseBtn = document.getElementById('presetConfigClose');
            newCloseBtn.addEventListener('click', () => this.closePresetConfiguration());
        }
        
        // Cancel button
        const cancelBtn = document.getElementById('cancelConfigBtn');
        if (cancelBtn) {
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            const newCancelBtn = document.getElementById('cancelConfigBtn');
            newCancelBtn.addEventListener('click', () => this.cancelPresetConfiguration());
        }
        
        // Save button
        if (saveBtn) {
            saveBtn.replaceWith(saveBtn.cloneNode(true));
            const newSaveBtn = document.getElementById('saveConfigBtn');
            newSaveBtn.addEventListener('click', () => this.savePresetConfiguration());
        }
        
        // Populate available controls
        this.populateAvailableControls();
    }
    
    /**
     * Populate available controls from BossCubeController
     */
    populateAvailableControls() {
        if (!this.bossCubeController) {
            return;
        }
        
        const parameters = this.bossCubeController.parameters;
        if (!parameters) {
            return;
        }
        
        // Define the categories in the same order as the main app
        const categoryDefinitions = [
            {
                name: 'mixer',
                filter: (key, param) => param.category === 'mixer'
            },
            {
                name: 'looperControl',
                filter: (key, param) => key === 'looperControl'
            },
            {
                name: 'looperSettings', 
                filter: (key, param) => param.category === 'looper' && key !== 'looperControl'
            },
            {
                name: 'guitarEQ',
                filter: (key, param) => param.category === 'guitarEQ'
            },
            {
                name: 'guitarAmp',
                filter: (key, param) => param.category === 'guitarAmp'
            },
            {
                name: 'guitarEffect',
                filter: (key, param) => param.category === 'guitarEffects'
            },
            {
                name: 'guitarDelay',
                filter: (key, param) => param.category === 'guitarDelay'
            },
            {
                name: 'reverb',
                filter: (key, param) => param.category === 'reverb'
            },
            {
                name: 'reverbLevels',
                filter: (key, param) => param.category === 'reverbLevels'
            },
            {
                name: 'micInstEQ',
                filter: (key, param) => param.category === 'micInstEQ'
            },
            {
                name: 'micInstEffect',
                filter: (key, param) => param.category === 'micInstEffects'
            },
            {
                name: 'tuner',
                filter: (key, param) => param.category === 'tuner'
            }
        ];
        
        // Categorize parameters
        const categories = {};
        categoryDefinitions.forEach(def => {
            categories[def.name] = [];
        });
        
        // Group parameters by category
        Object.entries(parameters).forEach(([key, param]) => {
            categoryDefinitions.forEach(def => {
                if (def.filter(key, param)) {
                    categories[def.name].push(key);
                }
            });
        });
        
        // Populate each category in order
        categoryDefinitions.forEach(def => {
            const paramKeys = categories[def.name];
            const containerName = `modal${def.name.charAt(0).toUpperCase() + def.name.slice(1)}Controls`;
            const container = document.getElementById(containerName);
            
            if (container) {
                container.className = 'control-options';
                container.innerHTML = '';
                
                if (paramKeys.length > 0) {
                    // Sort parameters by name for better UX
                    paramKeys.sort((a, b) => parameters[a].name.localeCompare(parameters[b].name));
                    
                    paramKeys.forEach((key) => {
                        const param = parameters[key];
                        const option = this.createControlOption(key, param);
                        container.appendChild(option);
                    });
                } else {
                    // Add a note if no parameters in this category
                    container.innerHTML = '<div style="color: #999; font-style: italic; padding: 8px;">No parameters available in this category</div>';
                }
            }
        });
    }
    
    /**
     * Create a control option checkbox
     */
    createControlOption(key, param) {
        const option = document.createElement('div');
        option.className = 'control-option';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `control-${key}`;
        checkbox.value = key;
        checkbox.addEventListener('change', (e) => {
            this.handleControlSelectionChange(key, e.target.checked);
        });
        
        const label = document.createElement('label');
        label.htmlFor = `control-${key}`;
        label.textContent = param.name;
        
        option.appendChild(checkbox);
        option.appendChild(label);
        
        return option;
    }
    
    /**
     * Handle control selection change
     */
    handleControlSelectionChange(key, isChecked) {
        // Create temporary config if we're creating a new preset
        if (!this.editingPresetId) {
            if (!this.tempPresetConfig) {
                this.tempPresetConfig = { name: '', controls: [], icon: '🎭' };
            }
            const currentConfig = this.tempPresetConfig;
            
            if (isChecked) {
                // Add control if not already present
                if (!currentConfig.controls.find(c => c.key === key)) {
                    const param = this.bossCubeController.parameters[key];
                    currentConfig.controls.push({
                        key: key,
                        label: param.name,
                        pedalControl: false
                    });
                }
            } else {
                // Remove control
                currentConfig.controls = currentConfig.controls.filter(c => c.key !== key);
            }
        } else {
            // Editing existing preset
            const currentConfig = this.presets[this.editingPresetId];
            
            if (isChecked) {
                // Add control if not already present
                if (!currentConfig.controls.find(c => c.key === key)) {
                    const param = this.bossCubeController.parameters[key];
                    currentConfig.controls.push({
                        key: key,
                        label: param.name,
                        pedalControl: false
                    });
                }
            } else {
                // Remove control
                currentConfig.controls = currentConfig.controls.filter(c => c.key !== key);
            }
        }
        
        // Update the selected controls list
        this.updateSelectedControlsList();
    }
    
    /**
     * Load preset configuration into the UI
     */
    loadPresetConfig(presetId) {
        const nameInput = document.getElementById('presetNameInput');
        const iconSelect = document.getElementById('presetIconSelect');
        let config;
        
        if (presetId && this.presets[presetId]) {
            // Loading existing preset
            config = this.presets[presetId];
            if (nameInput) {
                nameInput.value = config.name;
            }
            if (iconSelect) {
                iconSelect.value = config.icon || '🎭';
            }
        } else {
            // Creating new preset
            this.tempPresetConfig = { name: '', controls: [], icon: '🎭' };
            config = this.tempPresetConfig;
            if (nameInput) {
                nameInput.value = '';
                nameInput.focus();
            }
            if (iconSelect) {
                iconSelect.value = '🎭';
            }
        }
        
        // Update checkboxes
        const checkboxes = document.querySelectorAll('.control-option input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            const key = checkbox.value;
            const isSelected = config.controls.some(c => c.key === key);
            checkbox.checked = isSelected;
        });
        
        // Update selected controls list
        this.updateSelectedControlsList();
    }
    
    /**
     * Update the selected controls list with drag and drop
     */
    updateSelectedControlsList() {
        const container = document.getElementById('selectedControlsList');
        if (!container) return;
        
        // Get current config (either editing existing or temp for new)
        const currentConfig = this.editingPresetId ? 
            this.presets[this.editingPresetId] : 
            this.tempPresetConfig;
        
        if (!currentConfig || currentConfig.controls.length === 0) {
            container.innerHTML = '<div class="empty">No controls selected. Use the checkboxes above to add controls.</div>';
            container.classList.add('empty');
            return;
        }
        
        container.classList.remove('empty');
        container.innerHTML = '';
        
        currentConfig.controls.forEach((control, index) => {
            const item = this.createSelectedControlItem(control, index);
            container.appendChild(item);
        });
    }
    
    /**
     * Create a selected control item with drag and drop
     */
    createSelectedControlItem(control, index) {
        const item = document.createElement('div');
        item.className = 'selected-control-item';
        item.draggable = true;
        item.dataset.index = index;
        
        item.innerHTML = `
            <div class="drag-handle">⋮⋮</div>
            <div class="selected-control-label">${control.label}</div>
            <div class="selected-control-key">${control.key}</div>
            <div class="pedal-control-checkbox ${control.pedalControl ? 'checked' : ''}" title="Pedal Control">🦶</div>
            <button class="remove-control">×</button>
        `;
        
        const dragHandle = item.querySelector('.drag-handle');
        
        // Touch-based drag implementation for mobile
        let isDragging = false;
        let dragStartY = 0;
        let draggedElement = null;
        let placeholder = null;
        
        dragHandle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = true;
            dragStartY = e.touches[0].clientY;
            draggedElement = item;
            
            // Add visual feedback
            item.classList.add('dragging');
            
            // Create placeholder
            placeholder = document.createElement('div');
            placeholder.className = 'selected-control-item drag-placeholder';
            placeholder.style.height = item.offsetHeight + 'px';
            placeholder.style.backgroundColor = '#f0f0f0';
            placeholder.style.border = '2px dashed #ccc';
            
        }, { passive: false });
        
        dragHandle.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const touch = e.touches[0];
            const container = document.getElementById('selectedControlsList');
            const items = Array.from(container.children).filter(child => 
                child !== draggedElement && !child.classList.contains('drag-placeholder')
            );
            
            // Find the element we're hovering over
            let targetElement = null;
            let insertBefore = true;
            
            for (const otherItem of items) {
                const rect = otherItem.getBoundingClientRect();
                const centerY = rect.top + rect.height / 2;
                
                if (touch.clientY > rect.top && touch.clientY < rect.bottom) {
                    targetElement = otherItem;
                    insertBefore = touch.clientY < centerY;
                    break;
                }
            }
            
            // Update placeholder position
            if (targetElement) {
                if (insertBefore) {
                    container.insertBefore(placeholder, targetElement);
                } else {
                    container.insertBefore(placeholder, targetElement.nextSibling);
                }
            } else {
                // If not over any item, put at end
                container.appendChild(placeholder);
            }
            
        }, { passive: false });
        
        dragHandle.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = false;
            item.classList.remove('dragging');
            
            if (placeholder && placeholder.parentNode) {
                // Calculate new position
                const container = document.getElementById('selectedControlsList');
                const allItems = Array.from(container.children);
                const placeholderIndex = allItems.indexOf(placeholder);
                const originalIndex = parseInt(item.dataset.index);
                
                // Remove placeholder
                placeholder.remove();
                
                // Perform reorder if position changed
                if (placeholderIndex !== -1 && placeholderIndex !== originalIndex) {
                    // Adjust for placeholder removal
                    let newIndex = placeholderIndex;
                    if (originalIndex < placeholderIndex) {
                        newIndex--; // Account for the original item being removed
                    }
                    
                    this.reorderControls(originalIndex, newIndex);
                }
            }
            
            // Clean up
            draggedElement = null;
            placeholder = null;
            
        }, { passive: false });
        
        // Add drag event listeners for desktop
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', index);
            item.classList.add('dragging');
        });
        
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });
        
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const targetIndex = parseInt(item.dataset.index);
            
            if (draggedIndex !== targetIndex) {
                this.reorderControls(draggedIndex, targetIndex);
            }
        });
        
        // Pedal control checkbox
        const pedalCheckbox = item.querySelector('.pedal-control-checkbox');
        pedalCheckbox.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePedalControl(index);
        });
        
        // Remove button
        const removeBtn = item.querySelector('.remove-control');
        removeBtn.addEventListener('click', () => {
            this.removeControl(index);
        });
        
        return item;
    }
    
    /**
     * Reorder controls via drag and drop
     */
    reorderControls(fromIndex, toIndex) {
        // Get current config (either editing existing or temp for new)
        const currentConfig = this.editingPresetId ? 
            this.presets[this.editingPresetId] : 
            this.tempPresetConfig;
        
        if (!currentConfig) return;
        
        // Move the control
        const [movedControl] = currentConfig.controls.splice(fromIndex, 1);
        currentConfig.controls.splice(toIndex, 0, movedControl);
        
        // Update the UI
        this.updateSelectedControlsList();
    }
    
    /**
     * Remove a control from the current preset
     */
    removeControl(index) {
        // Get current config (either editing existing or temp for new)
        const currentConfig = this.editingPresetId ? 
            this.presets[this.editingPresetId] : 
            this.tempPresetConfig;
        
        if (!currentConfig) return;
        
        // Remove from array
        const removedControl = currentConfig.controls.splice(index, 1)[0];
        
        // Update checkbox
        const checkbox = document.querySelector(`input[value="${removedControl.key}"]`);
        if (checkbox) {
            checkbox.checked = false;
        }
        
        // Update the UI
        this.updateSelectedControlsList();
    }

    /**
     * Toggle pedal control for a specific control
     */
    togglePedalControl(index) {
        // Get current config (either editing existing or temp for new)
        const currentConfig = this.editingPresetId ? 
            this.presets[this.editingPresetId] : 
            this.tempPresetConfig;
        
        if (!currentConfig || !currentConfig.controls[index]) return;
        
        // Toggle pedal control
        currentConfig.controls[index].pedalControl = !currentConfig.controls[index].pedalControl;
        
        // Update the UI
        this.updateSelectedControlsList();
    }
    

    
    /**
     * Save preset configuration
     */
    savePresetConfiguration() {
        const nameInput = document.getElementById('presetNameInput');
        const iconSelect = document.getElementById('presetIconSelect');
        const presetName = nameInput ? nameInput.value.trim() : '';
        const presetIcon = iconSelect ? iconSelect.value : '🎭';
        
        if (!presetName) {
            alert('Please enter a preset name.');
            if (nameInput) nameInput.focus();
            return;
        }
        
        if (this.editingPresetId) {
            // Editing existing preset
            this.presets[this.editingPresetId].name = presetName;
            this.presets[this.editingPresetId].icon = presetIcon;
            this.log(`✏️ Updated preset: ${presetName}`, 'success');
        } else {
            // Creating new preset
            if (!this.tempPresetConfig) {
                this.tempPresetConfig = { name: presetName, controls: [], icon: presetIcon };
            } else {
                this.tempPresetConfig.name = presetName;
                this.tempPresetConfig.icon = presetIcon;
            }
            const newPresetId = this.createNewPreset(this.tempPresetConfig.name, this.tempPresetConfig.controls, this.tempPresetConfig.icon);
            this.log(`✨ Created new preset: ${presetName}`, 'success');
        }
        
        // Save to localStorage
        this.savePresetsToStorage();
        this.saveCurrentPresetToStorage();
        
        // Update main UI
        this.updatePresetDropdown();
        this.updatePresetListFull();
        
        // If currently active preset was changed, recreate controls
        if (this.isActive) {
            this.createControls();
        }
        
        // Clean up and close modal
        this.tempPresetConfig = null;
        this.editingPresetId = null;
        this.closePresetConfiguration();
    }
    
    /**
     * Cancel preset configuration
     */
    cancelPresetConfiguration() {
        // Restore from backup
        this.presets = this.configBackup;
        this.config = this.presets[this.currentPreset];
        
        // Clean up
        this.tempPresetConfig = null;
        this.editingPresetId = null;
        
        // Close modal
        this.closePresetConfiguration();
        
        this.log('❌ Preset configuration cancelled', 'info');
    }
    
    /**
     * Close preset configuration modal
     */
    closePresetConfiguration() {
        const modal = document.getElementById('presetConfigModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }
    

    
    /**
     * Save presets to localStorage
     */
    savePresetsToStorage() {
        try {
            localStorage.setItem('live-performance-presets', JSON.stringify(this.presets));
        } catch (error) {
            console.warn('Failed to save presets to localStorage:', error);
        }
    }
    
    /**
     * Load presets from localStorage
     */
    loadPresetsFromStorage() {
        try {
            const savedPresets = localStorage.getItem('live-performance-presets');
            if (savedPresets) {
                this.presets = JSON.parse(savedPresets);
                
                // Backward compatibility: add pedalControl field to existing controls
                Object.values(this.presets).forEach(preset => {
                    if (preset.controls) {
                        preset.controls.forEach(control => {
                            if (control.pedalControl === undefined) {
                                control.pedalControl = false;
                            }
                        });
                    }
                });
            } else {
                this.presets = {}; // Start with empty presets
            }
        } catch (error) {
            console.warn('Failed to load presets from localStorage:', error);
            this.presets = {}; // Fallback to empty
        }
    }
    
    /**
     * Open settings modal
     */
    openSettings() {
        const modal = document.getElementById('livePerformanceSettingsModal');
        if (!modal) return;
        
        // Set up the modal
        this.setupSettingsModal();
        
        // Show the modal
        modal.classList.add('active');
        
        // Update the preset list
        this.updatePresetListFull();
    }
    
    /**
     * Close settings modal
     */
    closeSettings() {
        const modal = document.getElementById('livePerformanceSettingsModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    /**
     * Enter fullscreen mode for immersive live performance
     */
    async enterFullscreen() {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
                this.log('📺 Entered fullscreen mode', 'info');
            }
        } catch (error) {
            // Fullscreen might be denied by user or browser policy
            console.warn('Could not enter fullscreen:', error);
            this.log('📺 Fullscreen not available (browser restriction)', 'info');
        }
    }

    /**
     * Exit fullscreen mode
     */
    async exitFullscreen() {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
                this.log('📺 Exited fullscreen mode', 'info');
            }
        } catch (error) {
            console.warn('Could not exit fullscreen:', error);
        }
    }
    
    /**
     * Setup pedal control override for Live Performance mode
     */
    setupPedalControlOverride() {
        if (!this.config || !this.config.controls) {
            return;
        }
        
        // Build list of pedal-controllable parameters from current preset
        this.pedalControlState.pedalControllableKeys = this.config.controls
            .filter(control => control.pedalControl)
            .map(control => control.key);
        
        if (this.pedalControlState.pedalControllableKeys.length === 0) {
            this.log('🦶 No pedal-controllable parameters in this preset', 'info');
            return;
        }
        
        // Only store original callbacks if we haven't already done so
        if (this.pedalControlState.originalPedalCallbacks.length === 0) {
            this.pedalControlState.originalPedalCallbacks = [...this.bossCubeController.pedalCallbacks];
            
            // Replace all callbacks with our Live Performance handler
            this.bossCubeController.pedalCallbacks = [(event) => this.handleLivePerformancePedalEvent(event)];
        }
        
        // Reset parameter selection when the list of pedal-controllable parameters changes
        this.pedalControlState.currentParameterIndex = -1;
        
        // Initialize with first pedal-controllable parameter
        if (this.pedalControlState.pedalControllableKeys.length > 0) {
            const firstKey = this.pedalControlState.pedalControllableKeys[0];
            const firstParam = this.bossCubeController.parameters[firstKey];
            this.selectParameter(firstKey, firstParam);
        }
        
        this.log(`🦶 Live Performance pedal control active (${this.pedalControlState.pedalControllableKeys.length} parameters)`, 'success');
    }

    /**
     * Handle pedal events in Live Performance mode
     */
    handleLivePerformancePedalEvent(event) {
        if (event.type === 'button') {
            this.handleLivePerformancePedalButton(event.button);
        } else if (event.type === 'volume') {
            this.handleLivePerformanceVolumeChange(event);
        }
    }

    /**
     * Handle pedal volume changes with automatic pickup mode activation
     * 
     * Live Performance mode automatically activates pickup mode when pedal position
     * doesn't match control value, ensuring smooth parameter transitions.
     * 
     * @param {Object} event - Pedal event object
     * @param {number} event.value - Converted parameter value
     * @param {Object} event.parameter - Parameter object
     * @param {string} event.parameterKey - Parameter identifier
     * @param {number} event.originalControlValue - Control value before pedal change
     */
    handleLivePerformanceVolumeChange(event) {
        const { value, parameter, parameterKey, originalControlValue } = event;
        
        // Store previous pedal value for crossing detection
        const previousPedalValue = this.lastPedalValue || value;
        this.lastPedalValue = value;
        
        // Check for pickup mode activation (skip for looper volume to prevent conflicts)
        if (!this.pickupModeState.active && parameterKey !== 'looperVolume') {
            const valueDifference = Math.abs(value - originalControlValue);
            if (valueDifference > this.pickupModeState.threshold) {
                this.activatePickupMode(parameterKey, originalControlValue, `(pedal: ${value}, target: ${originalControlValue})`);
            }
        }
        
        // Check for pickup mode exit
        if (this.pickupModeState.active) {
            const targetValue = this.pickupModeState.targetControlValue;
            const valueDifference = Math.abs(value - targetValue);
            const shouldExit = valueDifference <= this.pickupModeState.threshold || 
                              PedalUtils.hasCrossedTarget(previousPedalValue, value, targetValue);
            
            if (shouldExit) {
                this.deactivatePickupMode(parameterKey);
            }
        }

        // Update display based on pickup mode state
        if (this.pickupModeState.active) {
            // In pickup mode - show pedal position indicator only
            PedalUtils.updatePedalPositionIndicator(parameterKey, value, parameter, '.live-performance-control');
        } else {
            // Normal mode - trigger main app logic first, then update Live Performance display
            // Also trigger main app parameter update logic (including looper volume)
            if (window.updateParameterValue) {
                window.updateParameterValue(parameterKey, value);
            }
            
            // Update the Live Performance display (this will be updated again by looper volume logic if needed)
            this.updateLivePerformanceDisplay(parameterKey, value);
        }
    }

    /**
     * Handle pedal button presses in Live Performance mode
     */
    handleLivePerformancePedalButton(button) {
        if (this.pedalControlState.pedalControllableKeys.length === 0) {
            return;
        }
        
        let newIndex = this.pedalControlState.currentParameterIndex;
        
        if (button === 'right') {
            newIndex = (newIndex + 1) % this.pedalControlState.pedalControllableKeys.length;
        } else if (button === 'left') {
            newIndex = newIndex <= 0 ? this.pedalControlState.pedalControllableKeys.length - 1 : newIndex - 1;
        }
        
        if (newIndex !== this.pedalControlState.currentParameterIndex) {
            const oldKey = this.pedalControlState.pedalControllableKeys[this.pedalControlState.currentParameterIndex];
            const newKey = this.pedalControlState.pedalControllableKeys[newIndex];
            const newParam = this.bossCubeController.parameters[newKey];
            
            // Get global pedal position for the new parameter
            const globalPedalPosition = this.bossCubeController.getGlobalPedalPosition(newParam);
            
            // Handle pickup mode parameter switching
            const needsPickupMode = PedalUtils.handleParameterSwitch(
                this.pickupModeState,
                oldKey,
                newParam,
                globalPedalPosition,
                '.live-performance-control'
            );
            
            this.selectParameter(newKey, newParam);
            
            // Activate pickup mode if needed for new parameter
            if (needsPickupMode) {
                this.activatePickupMode(newKey, newParam.current, 'after parameter switch');
            }
        }
    }

    /**
     * Update visual selection for Live Performance parameter
     */
    updateLivePerformanceParameterSelection(selectedKey) {
        const allControls = document.querySelectorAll('.live-performance-control');
        allControls.forEach(control => {
            const controlKey = control.getAttribute('data-param-key');
            if (controlKey === selectedKey) {
                control.classList.add('current');
            } else {
                control.classList.remove('current');
                // Clear temporary pedal position indicator from non-selected controls
                control.classList.remove('show-pedal-position');
            }
        });
        
        // Update pedal position indicator for the newly selected parameter
        const selectedParam = this.bossCubeController.parameters[selectedKey];
        if (selectedParam) {
            const globalPedalPosition = this.bossCubeController.getGlobalPedalPosition(selectedParam);
            if (globalPedalPosition !== null) {
                PedalUtils.updatePedalPositionIndicator(selectedKey, globalPedalPosition, selectedParam, '.live-performance-control');
            }
        }
        
        // Auto-scroll to show the selected parameter
        PedalUtils.scrollToParameter(selectedKey, '.live-performance-content', '.live-performance-control');
    }

    /**
     * Update Live Performance control display when value changes
     */
    updateLivePerformanceDisplay(parameterKey, value) {
        const control = document.querySelector(`.live-performance-control[data-param-key="${parameterKey}"]`);
        if (!control) {
            return;
        }

        const param = this.bossCubeController.parameters[parameterKey];
        if (!param) {
            return;
        }

        // Update the parameter value in the controller
        param.current = value;

        // Special handling for button-based controls
        if (parameterKey === 'looperControl') {
            // Update looper button states
            const buttons = control.querySelectorAll('.looper-btn-live');
            buttons.forEach(btn => {
                const btnValue = parseInt(btn.getAttribute('data-value'));
                if (btnValue === value) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            return; // Skip slider update for looper control
        }
        
        if (parameterKey === 'guitarAmpType') {
            // Update amp type button states
            const buttons = control.querySelectorAll('.amp-type-btn-live');
            buttons.forEach(btn => {
                const btnValue = parseInt(btn.getAttribute('data-value'));
                if (btnValue === value) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            return; // Skip slider update for amp type
        }

        // Update visual elements for regular slider controls
        const fill = control.querySelector('.parameter-fill');
        const valueDisplay = control.querySelector('.parameter-value');
        const slider = control.querySelector('.parameter-slider');

        if (fill && valueDisplay && slider) {
            // Update fill percentage
            const percentage = ((value - param.min) / (param.max - param.min)) * 100;
            fill.style.width = `${percentage}%`;

            // Update value display
            const displayValue = this.getDisplayValue(param, value);
            valueDisplay.textContent = displayValue;

            // Update slider
            slider.value = value;
        }
    }

    /**
     * Handle physical knob changes from Boss Cube in Live Performance mode
     */
    handlePhysicalKnobChange(parameterKey, value) {
        // Reset pickup mode if this parameter is currently in pickup mode
        if (this.pickupModeState.active && this.pickupModeState.activeParameter === parameterKey) {
            this.deactivatePickupMode(parameterKey);
        }
    }

    /**
     * Restore original pedal control when closing Live Performance mode
     */
    restorePedalControl() {
        // Disable pickup mode if active
        if (this.pickupModeState.active) {
            this.bossCubeController.disablePickupMode();
        }
        
        // Clear any pending timeouts and reset state
        this.clearPedalPositionTimeout();
        this.pickupModeState = PedalUtils.createPickupModeState();
        
        // Restore original pedal callbacks
        this.bossCubeController.pedalCallbacks = [...this.pedalControlState.originalPedalCallbacks];
        
        // Reset pedal control state
        this.pedalControlState = {
            originalPedalCallbacks: [],
            currentParameterIndex: -1,
            pedalControllableKeys: []
        };
        
        this.log('🦶 Restored main app pedal control', 'info');
    }

    /**
     * Set up settings modal
     */
    setupSettingsModal() {
        // Close button
        const closeBtn = document.getElementById('livePerformanceSettingsClose');
        if (closeBtn) {
            closeBtn.replaceWith(closeBtn.cloneNode(true));
            const newCloseBtn = document.getElementById('livePerformanceSettingsClose');
            newCloseBtn.addEventListener('click', () => this.closeSettings());
        }
        
        // Close button (footer)
        const closeSettingsBtn = document.getElementById('livePerformanceCloseSettingsBtn');
        if (closeSettingsBtn) {
            closeSettingsBtn.replaceWith(closeSettingsBtn.cloneNode(true));
            const newCloseSettingsBtn = document.getElementById('livePerformanceCloseSettingsBtn');
            newCloseSettingsBtn.addEventListener('click', () => this.closeSettings());
        }
        
        // Add new preset button
        const addNewPresetBtn = document.getElementById('livePerformanceAddNewPresetBtn');
        if (addNewPresetBtn) {
            addNewPresetBtn.replaceWith(addNewPresetBtn.cloneNode(true));
            const newAddBtn = document.getElementById('livePerformanceAddNewPresetBtn');
            newAddBtn.addEventListener('click', () => {
                this.closeSettings();
                this.openPresetConfiguration();
            });
        }
    }
} 