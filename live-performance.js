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
import { INTERACTION, LOOPER_BUTTONS } from './constants.js';
import { bus } from './event-bus.js';
import {
    createSliderControl, createButtonGroupControl, createToggleGroupControl,
    getDisplayValue, updateControlDisplay, updateButtonGroupDisplay,
} from './control-factory.js';
import { normalizeEffectKey, refreshEffectButtons } from './effect-definitions.js';
import { LooperTimeline } from './looper-timeline.js';

export class LivePerformance {
    constructor(bossCubeController, templateLoader, logger) {
        this.bossCubeController = bossCubeController;
        this.templateLoader = templateLoader;
        this.log = logger;
        
        // State management
        this.isActive = false;
        this.overlay = null;
        this.looperTimeline = null;
        
        // Performance optimization for throttled updates
        this.throttle = {
            pending: new Map(),
            isProcessing: false,
            updateInterval: INTERACTION.THROTTLE_INTERVAL
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
            }, INTERACTION.PEDAL_POSITION_TIMEOUT);
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
            refreshEffectButtons('guitar', this.bossCubeController);
            refreshEffectButtons('micInst', this.bossCubeController);
            
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
        
        // Clean up visibility listener
        if (this._cleanupVisibilityHandler) {
            this._cleanupVisibilityHandler();
            this._cleanupVisibilityHandler = null;
        }
        
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
        
        const tunerBtn = document.getElementById('liveTunerBtn');
        if (tunerBtn) {
            tunerBtn.addEventListener('click', async () => {
                if (this.bossCubeController.isCubeConnected) {
                    await this.bossCubeController.setTunerControl(true);
                }
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
        
        // Re-enter fullscreen when tab regains visibility (browsers exit fullscreen on tab switch)
        const handleVisibilityChange = () => {
            if (!document.hidden && this.isActive && !document.fullscreenElement) {
                this.enterFullscreen();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Effect state changes → refresh unified effect controls
        const handleEffectChanged = () => {
            if (this.isActive) this.refreshUnifiedEffectControls();
        };
        bus.on('effect:changed', handleEffectChanged);

        this._cleanupVisibilityHandler = () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            bus.off('effect:changed', handleEffectChanged);
        };
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
     * Create individual control element using shared control-factory.
     */
    async createControl(param, key, label, controlConfig) {
        const isPedalControl = controlConfig && controlConfig.pedalControl;

        // Looper buttons — uses shared LOOPER_BUTTONS definition
        if (key === 'looperControl') {
            const control = createButtonGroupControl(param, key, {
                buttons: LOOPER_BUTTONS,
                className: 'live-performance-control looper-control',
                buttonClass: 'btn-base btn-looper',
                groupClass: 'btn-group--grid btn-group--grid-6',
                showPedalIndicator: isPedalControl,
                onValueChange: (k, v) => {
                    if (this.looperTimeline) this.looperTimeline.onLooperStateChange(v, 'live-ui');
                    bus.emit('param:update', k, v);
                },
            });
            if (isPedalControl) this.setupPedalSelection(control, key, param);
            if (this.looperTimeline) {
                const timelineEl = LooperTimeline.createProgressElement();
                control.appendChild(timelineEl);
                this.looperTimeline.addProgressElement(timelineEl);
            }
            return control;
        }
    
        // Composite toggle row (looper assigns) — uses shared toggle group factory
        if (param.isComposite && param.childKeys) {
            const wrapper = document.createElement('div');
            wrapper.className = 'live-performance-control looper-assigns-control';
            wrapper.setAttribute('data-param-key', key);

            const toggleGroup = createToggleGroupControl(param, this.bossCubeController.parameters, {
                onToggle: (childKey, newVal) => {
                    bus.emit('param:update', childKey, newVal);
                },
            });
            wrapper.appendChild(toggleGroup);
            return wrapper;
        }

        // Button groups: amp type, guitar effect type, mic/inst effect type
        if (key === 'guitarAmpType' || key === 'guitarEffectType' || key === 'micInstEffectType') {
            const isEffectType = key === 'guitarEffectType' || key === 'micInstEffectType';
            const control = createButtonGroupControl(param, key, {
                className: `live-performance-control ${key.replace(/([A-Z])/g, '-$1').toLowerCase()}-control`,
                buttonClass: isEffectType ? 'btn-base btn-effect' : 'btn-base btn-effect btn-choice',
                showPedalIndicator: isPedalControl,
                allowDeselect: isEffectType,
                skipOptimisticActive: isEffectType,
                onValueChange: isEffectType ? undefined : (k, v) => bus.emit('param:update', k, v),
                onButtonClick: isEffectType ? async (k, v) => {
                    const channel = key === 'guitarEffectType' ? 'guitar' : 'micInst';
                    const effectKey = normalizeEffectKey(param.valueLabels[v].toLowerCase());
                    try {
                        await this.bossCubeController.toggleEffect(channel, effectKey);
                    } catch (err) { this.log(`❌ Failed to toggle effect: ${err.message}`, 'error'); }
                    this.refreshUnifiedEffectControls();
                } : undefined,
                onDeselect: isEffectType ? async (k, v) => {
                    const channel = key === 'guitarEffectType' ? 'guitar' : 'micInst';
                    const effectKey = normalizeEffectKey(param.valueLabels[v].toLowerCase());
                    try {
                        await this.bossCubeController.toggleEffect(channel, effectKey);
                    } catch (err) { this.log(`❌ Failed to deactivate effect: ${err.message}`, 'error'); }
                    this.refreshUnifiedEffectControls();
                } : undefined,
            });
            if (isPedalControl) this.setupPedalSelection(control, key, param);
            return control;
        }

        // Unified virtual effect controls (resolveKey)
        if (param.resolveKey) {
            const resolvedKey = this.resolveVirtualKey(param, controlConfig);
            const resolvedParam = resolvedKey ? this.bossCubeController.parameters[resolvedKey] : null;
            const displayParam = resolvedParam || param;
            const effectLabel = this.getActiveEffectLabel(param);

            const control = createSliderControl(displayParam, key, {
                className: 'live-performance-control unified-effect-control',
                label: effectLabel ? `${label} (${effectLabel})` : label,
                showPedalIndicator: isPedalControl,
                onValueChange: (k, v) => {
                    const cc = this.getControlConfig(key);
                    const allKeys = this.resolveAllVirtualKeys(param, cc);
                    for (const realKey of allKeys) {
                        const realParam = this.bossCubeController.parameters[realKey];
                        if (realParam) {
                            realParam.current = v;
                            this.checkAndActivatePickupMode(realKey, v);
                            this.updateParameter(realKey, v);
                        }
                    }
                },
                onSelect: (k) => { this.selectParameter(k, displayParam); this.log(`🔘 Selected for pedal control: ${param.name}`, 'info'); },
            });
            control.dataset.virtualKey = key;
            if (!resolvedKey) control.classList.add('unified-inactive');
            if (isPedalControl) this.setupPedalSelection(control, key, displayParam);
            return control;
        }

        // Default: slider control
        const control = createSliderControl(param, key, {
            className: 'live-performance-control',
            label,
            showPedalIndicator: isPedalControl,
            onValueChange: (k, v) => {
                param.current = v;
                this.checkAndActivatePickupMode(k, v);
                this.updateParameter(k, v);
            },
            onSelect: (k) => { this.selectParameter(k, param); this.log(`🔘 Selected for pedal control: ${param.name}`, 'info'); },
        });
        if (isPedalControl) this.setupPedalSelection(control, key, param);
        return control;
    }
    
    setupPedalSelection(control, key, param) {
        control.addEventListener('click', (e) => {
            if (!e.defaultPrevented) {
                this.selectParameter(key, param);
        const allControls = document.querySelectorAll('.live-performance-control');
        allControls.forEach(c => c.classList.remove('current'));
            }
        });
    }

    /**
     * Get formatted display value for parameter (delegates to shared factory)
     */
    getDisplayValue(param, value) {
        return getDisplayValue(param, value);
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
                        bus.emit('param:update', paramKey, paramValue);
                    } catch (error) {
                        this.log(`Failed to update ${paramKey}: ${error.message}`, 'error');
                    }
                }
                
                this.throttle.isProcessing = false;
            }, this.throttle.updateInterval);
        }
    }

    getControlConfig(key) {
        if (!this.config || !this.config.controls) return null;
        return this.config.controls.find(c => c.key === key) || null;
    }

    getEditingControlConfig(key) {
        const currentConfig = this.editingPresetId
            ? this.presets[this.editingPresetId]
            : this.tempPresetConfig;
        if (!currentConfig || !currentConfig.controls) return null;
        return currentConfig.controls.find(c => c.key === key) || null;
    }

    getParamsForEffectType(category, effectType) {
        const params = this.bossCubeController.parameters;
        const result = [];
        for (const [key, p] of Object.entries(params)) {
            if (p.category !== category || p.isVirtual) continue;
            const et = p.effectType;
            if (!et) continue;
            if (et !== effectType && !(effectType === 'twah' && et === 't.wah') && !(effectType === 't.wah' && et === 'twah')) continue;
            result.push({ key, name: p.name });
        }
        return result;
    }

    resolveVirtualKey(param, controlConfig) {
        if (!param.resolveKey || !param.resolveSource) return null;
        const currentEffect = this.bossCubeController[param.resolveSource];
        const normalized = normalizeEffectKey(currentEffect);
        const overrides = controlConfig?.resolveOverrides || {};
        const mapping = overrides[normalized] ?? overrides[currentEffect]
            ?? param.resolveKey[normalized] ?? param.resolveKey[currentEffect];
        if (!mapping) return null;
        return Array.isArray(mapping) ? mapping[0] : mapping;
    }

    resolveAllVirtualKeys(param, controlConfig) {
        if (!param.resolveKey || !param.resolveSource) return [];
        const currentEffect = this.bossCubeController[param.resolveSource];
        const normalized = normalizeEffectKey(currentEffect);
        const overrides = controlConfig?.resolveOverrides || {};
        const mapping = overrides[normalized] ?? overrides[currentEffect]
            ?? param.resolveKey[normalized] ?? param.resolveKey[currentEffect];
        if (!mapping) return [];
        return Array.isArray(mapping) ? mapping : [mapping];
    }

    getActiveEffectLabel(param) {
        if (!param.resolveSource) return null;
        const typeKey = param.resolveSource === 'currentGuitarEffect' ? 'guitarEffectType' : 'micInstEffectType';
        const typeParam = this.bossCubeController.parameters[typeKey];
        if (!typeParam || !typeParam.valueLabels) return null;
        const idx = typeParam.current;
        return typeParam.valueLabels[idx] || null;
    }

    refreshUnifiedEffectControls() {
        const controls = document.querySelectorAll('.unified-effect-control');
        for (const control of controls) {
            const virtualKey = control.dataset.virtualKey;
            if (!virtualKey) continue;
            const param = this.bossCubeController.parameters[virtualKey];
            if (!param || !param.resolveKey) continue;

            const cc = this.getControlConfig(virtualKey);
            const resolvedKey = this.resolveVirtualKey(param, cc);
            const resolvedParam = resolvedKey ? this.bossCubeController.parameters[resolvedKey] : null;

            control.classList.toggle('unified-inactive', !resolvedParam);

            const effectLabel = this.getActiveEffectLabel(param);
            const labelEl = control.querySelector('.parameter-label');
            if (labelEl) {
                const baseName = cc ? cc.label : param.name;
                labelEl.textContent = effectLabel ? `${baseName} (${effectLabel})` : baseName;
            }

            if (resolvedParam) {
                updateControlDisplay(control, resolvedParam, virtualKey, resolvedParam.current);
            }
        }
    }

    // refreshLiveEffectButtonStates removed — shared refreshEffectButtons() from
    // effect-definitions.js now handles all effect button state via bus 'effect:changed' event
    
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
            
            // Persist selection so it survives close/reopen
            try {
                localStorage.setItem('live-performance-pedal-selected-key', key);
            } catch (_) { /* localStorage unavailable */ }
            
            // Update visual selection in Live Performance mode
            this.updateLivePerformanceParameterSelection(key);
            
            // Set the parameter in the controller (for pickup mode and hardware updates)
            this.bossCubeController.setCurrentParameter(key);
            const controlConfig = this.getControlConfig(key);
            this.bossCubeController.setCurrentParameterOptions({
                resolveOverrides: controlConfig?.resolveOverrides || null
            });
            
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
                    paramKeys.sort((a, b) => {
                        const aParam = parameters[a];
                        const bParam = parameters[b];
                        const aIsEffectType = a === 'guitarEffectType' || a === 'micInstEffectType';
                        const bIsEffectType = b === 'guitarEffectType' || b === 'micInstEffectType';
                        const aIsUnified = !!(aParam.resolveKey);
                        const bIsUnified = !!(bParam.resolveKey);
                        
                        const aOrder = aIsEffectType ? 0 : aIsUnified ? 1 : 2;
                        const bOrder = bIsEffectType ? 0 : bIsUnified ? 1 : 2;
                        if (aOrder !== bOrder) return aOrder - bOrder;
                        return aParam.name.localeCompare(bParam.name);
                    });
                    
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
        
        const param = this.bossCubeController.parameters[control.key];
        const isUnified = param && param.resolveKey;
        
        item.innerHTML = `
            <div class="drag-handle">⋮⋮</div>
            <div class="selected-control-label">${control.label}</div>
            <div class="selected-control-key">${control.key}</div>
            ${isUnified ? '<button class="mapping-config-btn" title="Configure effect mappings">⚙️</button>' : ''}
            <div class="pedal-control-checkbox ${control.pedalControl ? 'checked' : ''}" title="Pedal Control">🦶</div>
            <button class="remove-control">×</button>
        `;

        if (isUnified) {
            const configBtn = item.querySelector('.mapping-config-btn');
            configBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const existing = item.querySelector('.mapping-config-panel');
                if (existing) {
                    existing.remove();
                    return;
                }
                const panel = this.createMappingConfigPanel(control, param);
                item.appendChild(panel);
            });
        }
        
        const dragHandle = item.querySelector('.drag-handle');
        
        // Touch-based drag implementation for mobile
        let isDragging = false;
        let dragStartY = 0;
        let itemStartY = 0;
        let placeholder = null;
        
        dragHandle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = true;
            dragStartY = e.touches[0].clientY;
            const rect = item.getBoundingClientRect();
            itemStartY = rect.top;
            
            // Create placeholder that takes the item's space
            placeholder = document.createElement('div');
            placeholder.className = 'drag-placeholder';
            placeholder.style.height = rect.height + 'px';
            item.parentNode.insertBefore(placeholder, item);
            
            // Float the item so it follows the finger
            item.classList.add('dragging-touch');
            item.style.position = 'fixed';
            item.style.top = rect.top + 'px';
            item.style.left = rect.left + 'px';
            item.style.width = rect.width + 'px';
            item.style.zIndex = '10000';
        }, { passive: false });
        
        dragHandle.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            e.stopPropagation();
            
            const touchY = e.touches[0].clientY;
            const dy = touchY - dragStartY;
            item.style.top = (itemStartY + dy) + 'px';
            
            // Find which sibling the touch is over and move the placeholder there
            const container = document.getElementById('selectedControlsList');
            const siblings = Array.from(container.children).filter(
                child => child !== item && child !== placeholder
            );
            
            let moved = false;
            for (const sib of siblings) {
                const rect = sib.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                if (touchY < mid) {
                    container.insertBefore(placeholder, sib);
                    moved = true;
                    break;
                }
            }
            if (!moved && siblings.length > 0) {
                container.appendChild(placeholder);
            }
        }, { passive: false });
        
        dragHandle.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            e.stopPropagation();
            isDragging = false;
            
            // Reset inline styles
            item.classList.remove('dragging-touch');
            item.style.position = '';
            item.style.top = '';
            item.style.left = '';
            item.style.width = '';
            item.style.zIndex = '';
            
            if (placeholder && placeholder.parentNode) {
                const container = document.getElementById('selectedControlsList');
                const allItems = Array.from(container.children);
                const placeholderIndex = allItems.indexOf(placeholder);
                const originalIndex = parseInt(item.dataset.index);
                placeholder.remove();
                
                if (placeholderIndex !== -1 && placeholderIndex !== originalIndex) {
                    let newIndex = placeholderIndex;
                    if (originalIndex < placeholderIndex) newIndex--;
                    this.reorderControls(originalIndex, newIndex);
                }
            }
            placeholder = null;
        }, { passive: false });
        
        // Desktop HTML5 drag and drop
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
    
    createMappingConfigPanel(control, param) {
        const panel = document.createElement('div');
        panel.className = 'mapping-config-panel';

        const category = param.category;
        const resolveSource = param.resolveSource;
        const typeKey = resolveSource === 'currentGuitarEffect' ? 'guitarEffectType' : 'micInstEffectType';
        const typeParam = this.bossCubeController.parameters[typeKey];
        if (!typeParam || !typeParam.valueLabels) return panel;

        const effectTypes = typeParam.valueLabels;
        const effectTypeKeys = effectTypes.map(l => l.toLowerCase().replace('.', ''));

        const overrides = control.resolveOverrides || {};

        for (let i = 0; i < effectTypes.length; i++) {
            const effectLabel = effectTypes[i];
            const effectKey = effectTypeKeys[i];

            const availableParams = this.getParamsForEffectType(category, effectKey);
            if (availableParams.length === 0) continue;

            const defaultMapping = param.resolveKey[effectKey] || param.resolveKey[effectLabel.toLowerCase()];
            const currentMapping = (effectKey in overrides) ? overrides[effectKey] : defaultMapping;
            const currentKeys = Array.isArray(currentMapping) ? currentMapping : currentMapping ? [currentMapping] : [];

            const row = document.createElement('div');
            row.className = 'mapping-row';

            const label = document.createElement('span');
            label.className = 'mapping-effect-label';
            label.textContent = effectLabel;
            row.appendChild(label);

            const checkboxes = document.createElement('div');
            checkboxes.className = 'mapping-checkboxes';

            for (const ap of availableParams) {
                const cb = document.createElement('label');
                cb.className = 'mapping-checkbox';
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.value = ap.key;
                input.checked = currentKeys.includes(ap.key);
                input.addEventListener('change', () => {
                    this.updateMappingOverride(control, param, effectKey, checkboxes);
                });
                cb.appendChild(input);
                const nameSpan = document.createElement('span');
                nameSpan.textContent = ap.name;
                cb.appendChild(nameSpan);
                checkboxes.appendChild(cb);
            }
            row.appendChild(checkboxes);
            panel.appendChild(row);
        }

        return panel;
    }

    updateMappingOverride(control, param, effectKey, checkboxesContainer) {
        const checked = Array.from(checkboxesContainer.querySelectorAll('input:checked')).map(i => i.value);

        if (!control.resolveOverrides) control.resolveOverrides = {};

        const defaultMapping = param.resolveKey[effectKey] || param.resolveKey[effectKey.replace('twah', 't.wah')];
        const defaultKeys = Array.isArray(defaultMapping) ? defaultMapping : defaultMapping ? [defaultMapping] : [];

        const isDefault = checked.length === defaultKeys.length && checked.every(k => defaultKeys.includes(k));

        if (isDefault) {
            delete control.resolveOverrides[effectKey];
            if (Object.keys(control.resolveOverrides).length === 0) {
                delete control.resolveOverrides;
            }
        } else {
            control.resolveOverrides[effectKey] = checked.length === 1 ? checked[0] : checked;
        }
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
        
        // Restore previously selected parameter, or fall back to first
        this.pedalControlState.currentParameterIndex = -1;
        
        if (this.pedalControlState.pedalControllableKeys.length > 0) {
            let restoreKey = null;
            try {
                restoreKey = localStorage.getItem('live-performance-pedal-selected-key');
            } catch (_) { /* localStorage unavailable */ }
            
            const keys = this.pedalControlState.pedalControllableKeys;
            const targetKey = (restoreKey && keys.includes(restoreKey)) ? restoreKey : keys[0];
            const targetParam = this.bossCubeController.parameters[targetKey];
            this.selectParameter(targetKey, targetParam);
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
     * Handle pedal volume changes in Live Performance mode.
     * Pickup mode activation only happens on parameter switch (handleLivePerformancePedalButton),
     * not during normal pedal movement.
     */
    handleLivePerformanceVolumeChange(event) {
        const { value, parameter, parameterKey } = event;

        const virtualParam = this.bossCubeController.parameters[parameterKey];
        const cc = (virtualParam && virtualParam.resolveKey) ? this.getControlConfig(parameterKey) : null;
        const isVirtual = virtualParam && virtualParam.resolveKey;

        // Check for pickup mode exit (activation only happens on parameter switch)
        if (this.pickupModeState.active) {
            const previousPedalValue = this.lastPedalValue ?? value;
            const targetValue = this.pickupModeState.targetControlValue;
            const shouldExit = Math.abs(value - targetValue) <= this.pickupModeState.threshold ||
                              PedalUtils.hasCrossedTarget(previousPedalValue, value, targetValue);
            if (shouldExit) {
                this.deactivatePickupMode(parameterKey);
            }
        }
        this.lastPedalValue = value;

        if (this.pickupModeState.active) {
            PedalUtils.updatePedalPositionIndicator(parameterKey, value, parameter, '.live-performance-control');
            return;
        }

        // Keep resolved params in sync for display, but let the controller's
        // shared pedal throttle perform the actual hardware writes.
        if (isVirtual) {
            const allKeys = this.resolveAllVirtualKeys(virtualParam, cc);
            for (const rk of allKeys) {
                const rp = this.bossCubeController.parameters[rk];
                if (rp) {
                    rp.current = value;
                }
            }
        }

        this.updateLivePerformanceDisplay(parameterKey, value);
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
        let control = document.querySelector(`.live-performance-control[data-param-key="${parameterKey}"]`);

        if (control) {
        const param = this.bossCubeController.parameters[parameterKey];
            if (!param) return;

            let displayParam = param;
            if (param.resolveKey) {
                const cc = this.getControlConfig(parameterKey);
                const resolvedKey = this.resolveVirtualKey(param, cc);
                if (resolvedKey) displayParam = this.bossCubeController.parameters[resolvedKey] || param;
            }

            displayParam.current = value;

            const isButtonControl = ['looperControl', 'guitarAmpType', 'guitarEffectType', 'micInstEffectType'].includes(parameterKey);
            if (isButtonControl) {
                updateButtonGroupDisplay(control, value);
                // Effect button state refresh is handled by bus 'effect:changed' event
            } else {
                updateControlDisplay(control, displayParam, parameterKey, value);
            }
            return;
        }

        // Real parameter key may correspond to a virtual unified control —
        // find any unified control whose resolved target matches this key.
        const unifiedControls = document.querySelectorAll('.unified-effect-control');
        for (const uc of unifiedControls) {
            const virtualKey = uc.dataset.virtualKey;
            if (!virtualKey) continue;
            const vParam = this.bossCubeController.parameters[virtualKey];
            if (!vParam || !vParam.resolveKey) continue;

            const cc = this.getControlConfig(virtualKey);
            const allKeys = this.resolveAllVirtualKeys(vParam, cc);
            // Only update from the primary (first) resolved key to avoid
            // oscillation when multiple real params have different values
            if (allKeys.length > 0 && allKeys[0] === parameterKey) {
                const resolvedParam = this.bossCubeController.parameters[parameterKey];
                if (resolvedParam) resolvedParam.current = value;
                updateControlDisplay(uc, resolvedParam || vParam, virtualKey, value);
                return;
            }
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
        
        // Export presets button
        const exportBtn = document.getElementById('livePerformanceExportPresetsBtn');
        if (exportBtn) {
            exportBtn.replaceWith(exportBtn.cloneNode(true));
            const newExportBtn = document.getElementById('livePerformanceExportPresetsBtn');
            newExportBtn.addEventListener('click', () => this.exportPresets());
        }
        
        // Import presets button + file input
        const importBtn = document.getElementById('livePerformanceImportPresetsBtn');
        const fileInput = document.getElementById('livePerformanceImportFileInput');
        if (importBtn && fileInput) {
            importBtn.replaceWith(importBtn.cloneNode(true));
            const newImportBtn = document.getElementById('livePerformanceImportPresetsBtn');
            newImportBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.importPresets(e.target.files[0]);
                    e.target.value = '';
                }
            });
        }
    }
    
    exportPresets() {
        const data = JSON.stringify(this.presets, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `live-performance-presets-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.log('📥 Presets exported to file', 'success');
    }
    
    async importPresets(file) {
        try {
            const text = await file.text();
            const imported = JSON.parse(text);
            
            if (typeof imported !== 'object' || imported === null || Array.isArray(imported)) {
                this.log('❌ Invalid preset file format', 'error');
                return;
            }
            
            let count = 0;
            for (const [id, preset] of Object.entries(imported)) {
                if (!preset.name || !Array.isArray(preset.controls)) {
                    continue;
                }
                // Add pedalControl default for backward compat
                preset.controls.forEach(c => {
                    if (c.pedalControl === undefined) c.pedalControl = false;
                });
                this.presets[id] = preset;
                count++;
            }
            
            this.savePresetsToStorage();
            this.updatePresetDropdown();
            this.updatePresetListFull();
            this.log(`📤 Imported ${count} preset(s) from file`, 'success');
        } catch (error) {
            this.log(`❌ Failed to import presets: ${error.message}`, 'error');
        }
    }
} 