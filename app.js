// Boss Cube Web Control - Full Mixer Interface
// Complete parameter control with dual Bluetooth support

import BossCubeController from './boss-cube-controller.js';
import TemplateLoader from './template-loader.js';
import { LivePerformance } from './live-performance.js';
import { LOOPER_VOLUME_CONFIG, LOOPER_BUTTONS } from './constants.js';
import { bus } from './event-bus.js';
import {
    createSliderControl, createButtonGroupControl, createToggleGroupControl,
    getDisplayValue, updateControlDisplay, updateButtonGroupDisplay,
    queueFillUpdate,
} from './control-factory.js';
import { EFFECT_SWITCH_MAP, normalizeEffectKey, refreshEffectButtons } from './effect-definitions.js';
import { initVersionSwitcher } from './version-switcher.js';
import { LooperTimeline } from './looper-timeline.js';
import { DiscoveryDashboard } from './discovery-dashboard.js';

const VERSION = '2.27.0';

let bossCubeController = null;
let templateLoader = null;
let discoveryDashboard = null;
let currentParameterKey = 'masterVolume';
let lastPedalValue = null; // Previous pedal value for crossing detection

// Screen Wake Lock
let wakeLock = null;
let wakeLockSupported = false;

// Pickup mode state (using global pedal position from controller)
let pickupMode = {
    active: false,
    threshold: 3, // Pickup threshold in parameter units for capture/exit
    targetControlValue: null, // Static target value to converge to
    activeParameter: null // Parameter key that is currently in pickup mode
};

// UI Elements
let statusEl, pedalStatusEl, logEl;
let connectBtn, connectPedalBtn, readValuesBtn, livePerformanceBtn;
let mixerControlsEl, effectsControlsEl;
let versionTextEl, refreshBtn;

// Tuner state
let tunerEnabled = false;
let tunerModalEl = null;

// Looper timeline
const looperTimeline = new LooperTimeline();

// Log buffer for save functionality
const logBuffer = [];
let logVerbosity = 'normal'; // 'minimal', 'normal', 'verbose'

// EFFECT_SWITCH_MAP imported from effect-definitions.js (single source of truth)

// Master Out binding state
let masterBindEnabled = false;
let isUpdatingMasterBind = false;
let masterBindControl, masterBindInfoIcon;
let bindInfoOverlay, bindInfoPopup;

// Looper Volume state
let currentLooperVolume = LOOPER_VOLUME_CONFIG.DEFAULT;
let isUpdatingLooperVolume = false; // Flag to prevent recursive updates
let looperVolumeThrottle = {
    lastUpdateTime: 0,
    updateInterval: 10 // Reduced to 50ms for smoother movement
};

// Live performance mode
let livePerformance = null;

// Settings management
let settings = {
    pedalCCCodes: {
        previousParameter: 80,  // Default CC for previous parameter (left footswitch)
        nextParameter: 81,      // Default CC for next parameter (right footswitch)
        pedalControl: 127       // Default CC for pedal control (expression pedal)
    },
    footswitchPolarity: 'normally_open' // 'normally_open' (Boss) or 'normally_closed' (others)
};

// Initialize when page loads
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', async function() {
    // Get DOM elements
    statusEl = document.getElementById('status');
    pedalStatusEl = document.getElementById('pedalStatus');
    logEl = document.getElementById('log');
    connectBtn = document.getElementById('connectBtn');
    connectPedalBtn = document.getElementById('connectPedalBtn');

    readValuesBtn = document.getElementById('readValuesBtn');
    livePerformanceBtn = document.getElementById('livePerformanceBtn');
    mixerControlsEl = document.getElementById('mixerControls');
    effectsControlsEl = document.getElementById('effectsControls');
    versionTextEl = document.getElementById('versionText');
    refreshBtn = document.getElementById('refreshBtn');
    
    // Master bind elements - will be created dynamically
    masterBindControl = null;
    masterBindInfoIcon = null;
    

    
    // Bind info popup elements
    bindInfoOverlay = document.getElementById('bindInfoOverlay');
    bindInfoPopup = document.getElementById('bindInfoPopup');
    
    // Initialize settings modal and theme
    initializeSettingsModal();
    initializeThemeToggle();
    setupLogPanel();

    // Auto-detect dev server log endpoint
    fetch('/api/log', { method: 'POST', body: '--- client connected ---' })
        .then(() => { window._devLogEnabled = true; console.log('📡 Dev log streaming enabled'); })
        .catch(() => {}); // Not running dev server, silently skip
    
    // Set up event listeners (removed duplicate connectBtn listener)
    
    refreshBtn.addEventListener('click', () => {
        log('🔄 Force refreshing app...', 'info');
        
        // Disable button to prevent multiple clicks
        refreshBtn.disabled = true;
        refreshBtn.textContent = '🔄 Updating...';
        
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            // Method 1: Clear caches via service worker
            navigator.serviceWorker.controller.postMessage({ action: 'clearCache' });
            
            // Method 2: Clear caches directly
            if ('caches' in window) {
                caches.keys().then(names => {
                    return Promise.all(
                        names.map(name => {
                            console.log('Clearing cache:', name);
                            return caches.delete(name);
                        })
                    );
                }).then(() => {
                    console.log('All caches cleared by app');
                });
            }
            
            // Method 3: Force service worker update
            navigator.serviceWorker.controller.postMessage({ action: 'skipWaiting' });
            
            // Method 4: Force reload with cache bypass after delay
            setTimeout(() => {
                window.location.reload(true);
            }, 500);
        } else {
            // Fallback: Hard reload for browsers without service worker
            setTimeout(() => {
                window.location.reload(true);
            }, 100);
        }
    });
    
    // Initialize controller and template loader
    bossCubeController = new BossCubeController();
    window.discovery = (on = true) => {
        bossCubeController.discoveryMode = on;
        log(`Discovery mode: ${on ? 'ON — all params logged' : 'OFF'}`);
    };
    document.getElementById('discoveryMode')?.addEventListener('change', (e) => {
        window.discovery(e.target.checked);
    });
    document.getElementById('probeBtn')?.addEventListener('click', () => {
        const unknowns = [
            [0x10, 0x00, 0x00, 0x03], [0x10, 0x00, 0x00, 0x04],
            [0x10, 0x00, 0x00, 0x05], [0x10, 0x00, 0x00, 0x06],
            [0x10, 0x00, 0x00, 0x5f],
            [0x10, 0x00, 0x00, 0x62],
            [0x10, 0x00, 0x00, 0x6c], [0x10, 0x00, 0x00, 0x6d],
            [0x10, 0x00, 0x00, 0x6e], [0x10, 0x00, 0x00, 0x6f],
            [0x20, 0x00, 0x20, 0x0c],
            [0x00, 0x00, 0x00, 0x00], [0x00, 0x00, 0x00, 0x01],
            [0x00, 0x00, 0x00, 0x02], [0x00, 0x00, 0x00, 0x03],
            [0x00, 0x00, 0x00, 0x08], [0x00, 0x00, 0x00, 0x09],
        ];
        bossCubeController.probeAddresses(unknowns);
    });
    document.getElementById('discoveryDashboardBtn')?.addEventListener('click', () => {
        if (!discoveryDashboard) {
            discoveryDashboard = new DiscoveryDashboard(bossCubeController);
        }
        discoveryDashboard.open();
    });
    templateLoader = new TemplateLoader();
    
    // Restore looper volume state from localStorage (after controller initialization)
    try {
        const savedCurrentLooperVolume = localStorage.getItem('currentLooperVolume');
        if (savedCurrentLooperVolume) {
            currentLooperVolume = parseInt(savedCurrentLooperVolume);
            // Update the virtual parameter current value
            if (bossCubeController.parameters.looperVolume) {
                bossCubeController.parameters.looperVolume.current = currentLooperVolume;
            }
        }
    } catch (error) {
        // Handle localStorage not available (e.g., in Node.js environment)
        console.warn('localStorage not available:', error);
    }
    
    // Initialize live performance mode after controller and template loader are ready
    const livePerformanceOverlay = document.getElementById('livePerformanceOverlay');
    looperTimeline.logger = log;
    livePerformance = new LivePerformance(bossCubeController, templateLoader, log);
    livePerformance.looperTimeline = looperTimeline;
    livePerformance.initialize(livePerformanceOverlay);
    
    // Set up looper control monitoring for Live Performance sync
    setupLooperControlMonitoring();
    
    // Event bus: Live Performance emits 'param:update' when user changes a control
    bus.on('param:update', (key, value) => updateParameterValue(key, value));
    
    // Load settings from localStorage before applying them to controller
    loadSettings();
    
    // Apply loaded settings to controller
    applySettingsToController();
    
    // Set up event listeners
    setupEventListeners();
    
    // Create parameter controls
    await createParameterControls();
    
    // Select initial parameter
    selectParameter(currentParameterKey);
    
    // Enable pedal connection independently
    if (BossCubeController.isSupported()) {
        connectPedalBtn.disabled = false;
    }
    
    // Initialize version checking and updates
    initializeVersioning();
    
    // Initialize tuner modal and wake lock
    initTunerModal();
    initializeWakeLock();
    
    log(`Boss Cube Web Control v${VERSION} initialized`, 'success');

    // Try auto-reconnect to previously paired devices
    tryAutoReconnect();
});
}

function initializeVersioning() {
    if (versionTextEl) {
        versionTextEl.textContent = `v${VERSION}`;
    }
    initVersionSwitcher(VERSION);

    if (!('serviceWorker' in navigator)) {
        return;
    }

    navigator.serviceWorker.register('sw.js')
        .then(registration => {
            registration.update();
            window.addEventListener('focus', () => registration.update());

            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        if (refreshBtn) {
                            refreshBtn.style.display = 'inline-block';
                            refreshBtn.textContent = '🔄 Update Available';
                            refreshBtn.classList.add('btn-update-pulse');
                        }
                        log('🔄 New version available — click "Update Available" to refresh', 'success');
                    }
                });
            });

            navigator.serviceWorker.addEventListener('controllerchange', () => {
                log('🔄 App updated, reloading...', 'info');
                window.location.reload();
            });
        })
        .catch(error => {
            console.warn('Service Worker registration failed:', error.message);
            log('⚠️ Service Worker unavailable — app works without offline support', 'warning');
        });
}

function setupEventListeners() {
    // Connection buttons
    connectBtn.addEventListener('click', handleBossCubeButton);
    connectPedalBtn.addEventListener('click', handlePedalUIButton);

    readValuesBtn.addEventListener('click', readValuesFromCube);
    
    // Live performance button
    livePerformanceBtn.addEventListener('click', () => livePerformance.toggle());
    
    // Set up pedal event listeners
    bossCubeController.onPedalEvent((event) => {
        switch (event.type) {
            case 'volume':
                handlePedalVolumeChange(event);
                break;
            case 'button':
                handlePedalButton(event);
                break;
            case 'status':
                handlePedalStatusChange(event);
                break;
            case 'parameterChange':
                handleParameterChange(event);
                break;
        }
    });
    
    // Set up logging
    bossCubeController.onLog = (message, type) => {
        log(message, type);
    };
    
    // Set up parameter update callback for Boss Cube read responses
    bossCubeController.onParameterUpdate = (paramKey, value, isPhysicalKnobChange) => {
        updateParameterDisplayFromCube(paramKey, value, isPhysicalKnobChange);
    };
    
    // Set up physical knob change callback for special UI feedback
    bossCubeController.onPhysicalKnobChange = (paramKey, paramName, value) => {
        handlePhysicalKnobChange(paramKey, paramName, value);
    };
    
    // Effect state changes → refresh all effect buttons via shared function
    bossCubeController.onEffectStateChanged = (channel) => {
        bus.emit('effect:changed', channel);
    };
    bus.on('effect:changed', (channel) => {
        refreshEffectButtons(channel, bossCubeController);
        if (channel === 'guitar') updateGuitarEffectControls();
        else updateMicInstEffectControls();
    });
    
    // Set up master bind check callback
    bossCubeController.checkMasterBindEnabled = () => {
        return masterBindEnabled;
    };
}

/**
 * Handle pedal volume changes with pickup mode exit detection
 * 
 * Main app only exits pickup mode during pedal movement - activation only
 * occurs through manual control changes via updateParameterValue().
 * 
 * @param {Object} event - Pedal event object
 * @param {number} event.value - Converted parameter value
 * @param {Object} event.parameter - Parameter object
 * @param {string} event.parameterKey - Parameter identifier
 */
function handlePedalVolumeChange(event) {
    const { value, parameter, parameterKey } = event;
    
    // Store previous pedal value for crossing detection
    const previousPedalValue = lastPedalValue || value;
    lastPedalValue = value;
    
    if (pickupMode.active) {
        // In pickup mode - check if we should exit
        const targetValue = pickupMode.targetControlValue;
        const valueDifference = Math.abs(value - targetValue);
        const shouldExit = valueDifference <= pickupMode.threshold || 
                          hasCrossedTarget(previousPedalValue, value, targetValue);
        
        if (shouldExit) {
            // Exit pickup mode - pedal has reached target position or crossed it
            pickupMode.active = false;
            pickupMode.targetControlValue = null;
            pickupMode.activeParameter = null;
            
            updatePickupModeVisuals(parameterKey, false);
            bossCubeController.disablePickupMode();
            log(`✅ Pickup mode deactivated`, 'success');
        }
    }
    
    if (pickupMode.active) {
        // In pickup mode - update pedal position indicator but don't change parameter
        updatePedalPositionIndicator(parameterKey, value);
    } else {
        // Normal mode - update parameter value
        if (parameterKey === 'looperVolume') {
            // For looper volume, use the full update logic to trigger volume adjustments
            updateParameterValue(parameterKey, value);
        } else {
            // For other parameters, use fast display update
            updateParameterDisplayFast(parameterKey, value);
        }
    }
    
    // Throttled logging to prevent console spam during fast movement
    throttledPedalLog(parameter.name, value);
}

/**
 * Check if the pedal has crossed the target control value
 * This ensures we always capture control when moving past the target, even during fast movement
 */
function hasCrossedTarget(previousValue, currentValue, targetValue) {
    // If we don't have a previous value, we can't detect crossing
    if (previousValue === 0) return false;
    
    // Check if the target value is between the previous and current pedal values
    const minVal = Math.min(previousValue, currentValue);
    const maxVal = Math.max(previousValue, currentValue);
    
    return targetValue >= minVal && targetValue <= maxVal;
}

function handlePedalButton(event) {
    const { button, currentParameter } = event;
    log(`🦶 Pedal ${button} button: Switched to ${currentParameter.name}`, 'info');
}

function handlePedalStatusChange(event) {
    const { connected, pedalName } = event;
    if (connected) {
        pedalStatusEl.textContent = `🎹 Pedal: ${pedalName}`;
        pedalStatusEl.className = 'pedal-status connected';
        connectPedalBtn.textContent = 'Disconnect Pedal';
        connectPedalBtn.disabled = false;
        connectPedalBtn.className = 'btn danger';
        log(`🎯 Pedal connected: ${pedalName}`, 'success');
    } else {
        pedalStatusEl.textContent = '🎹 Pedal: Disconnected';
        pedalStatusEl.className = 'pedal-status';
        connectPedalBtn.textContent = 'Connect Pedal (EV-1-WL)';
        connectPedalBtn.disabled = false;
        connectPedalBtn.className = 'btn';
        log('🔌 Pedal disconnected', 'info');
    }
}

function handleParameterChange(event) {
    const { parameter } = event;
    const oldParameterKey = currentParameterKey;
    currentParameterKey = bossCubeController.currentParameterKey;
    
    // Reset pickup mode when switching parameters
    if (pickupMode.active) {
        // Clear pickup mode from old parameter
        if (oldParameterKey) {
            const oldControl = document.querySelector(`[data-param-key="${oldParameterKey}"]`);
            if (oldControl) {
                oldControl.classList.remove('pickup-mode');
            }
        }
        pickupMode.active = false;
        pickupMode.targetControlValue = null;
        pickupMode.activeParameter = null;
        bossCubeController.disablePickupMode();
    }
    
    // Check if pickup mode should be activated for new parameter using global pedal position
    const globalPedalPosition = bossCubeController.getGlobalPedalPosition(parameter);
    if (globalPedalPosition !== null) {
        const valueDifference = Math.abs(globalPedalPosition - parameter.current);
        if (valueDifference > pickupMode.threshold) {
            pickupMode.active = true;
            pickupMode.targetControlValue = parameter.current;
            pickupMode.activeParameter = currentParameterKey;
            updatePickupModeVisuals(currentParameterKey, true);
            bossCubeController.enablePickupMode();
            log(`🎯 Pickup mode activated after parameter switch`, 'info');
        }
    }
    
    // Update visual selection
    updateParameterSelection();
    
    log(`🔄 Parameter switched to: ${parameter.name}`, 'info');
}

async function createParameterControls() {
    // Clear existing controls
    mixerControlsEl.innerHTML = '';
    effectsControlsEl.innerHTML = '';
    
    // Create mixer controls
    const mixerParams = bossCubeController.getParametersByCategory('mixer');
    for (const [key, param] of Object.entries(mixerParams)) {
        const control = await createParameterControl(param, key);
        mixerControlsEl.appendChild(control);
        
        // Add bind control after Master Out parameter
        if (key === 'masterVolume') {
            const bindControl = await createMasterBindControl();
            mixerControlsEl.appendChild(bindControl);
        }
        

    }
    
    // Create effects interface with selectors and controls
    await createEffectsInterface();
}

async function createEffectsInterface() {
    try {
        const effectsHTML = await templateLoader.loadTemplate('templates/effects-interface.html');
        effectsControlsEl.innerHTML = effectsHTML;
    } catch (error) {
        console.error('Failed to load effects interface template:', error);
        // Fallback to empty content
        effectsControlsEl.innerHTML = '<div class="error">Failed to load effects interface</div>';
        return;
    }
    
    // Set up effect selectors
    setupEffectSelectors();
    
    // Set up collapsible sections
    setupCollapsibleSections();
    
    // Initially populate all effect controls
    await updateLooperControls();
    await updateLooperSettingsControls();
    await updateMicInstEQControls();
    await updateGuitarEQControls();
    await updateGuitarAmpControls();
    await updateGuitarEffectControls();
    await updateMicInstEffectControls();
    await updateReverbDelayControls();
    await updateTunerControls();
    
    // Looper controls are set up in updateLooperControls() with current state
}

function setupEffectSelectors() {
    createEffectButtonGroup('guitarEffectButtons', 'guitarEffectType', 'guitar');
    createEffectButtonGroup('micInstEffectButtons', 'micInstEffectType', 'micInst');
    refreshEffectButtons('guitar', bossCubeController);
    refreshEffectButtons('micInst', bossCubeController);
}

function createEffectButtonGroup(containerId, paramKey, channel) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const param = bossCubeController.parameters[paramKey];
    if (!param) return;

    const control = createButtonGroupControl(param, paramKey, {
        className: 'effect-buttons-control',
        buttonClass: 'btn-base btn-effect effect-btn',
        groupClass: 'btn-group effect-type-buttons',
        allowDeselect: true,
        skipOptimisticActive: true,
        onButtonClick: async (k, v) => {
            const effectKey = normalizeEffectKey(param.valueLabels[v].toLowerCase());
            try {
                await bossCubeController.toggleEffect(channel, effectKey);
            } catch (error) {
                log(`Failed to toggle ${channel} effect: ${error.message}`, 'error');
            }
        },
        onDeselect: async (k, v) => {
            const effectKey = normalizeEffectKey(param.valueLabels[v].toLowerCase());
            try {
                await bossCubeController.toggleEffect(channel, effectKey);
            } catch (error) {
                log(`Failed to deactivate ${channel} effect: ${error.message}`, 'error');
            }
        },
    });
    container.appendChild(control);
}

function setupCollapsibleSections() {
    const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
    const COLLAPSED_SECTIONS_KEY = 'boss-cube-collapsed-sections';
    
    // Load collapsed state from localStorage
    let collapsedSections = new Set();
    try {
        const saved = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
        if (saved) {
            collapsedSections = new Set(JSON.parse(saved));
        }
    } catch (error) {
        console.warn('Failed to load collapsed sections from localStorage:', error);
    }
    
    // Apply saved collapsed state and set up event listeners
    collapsibleHeaders.forEach(header => {
        const targetId = header.dataset.target;
        const section = header.closest('.collapsible-section');
        
        if (targetId && section) {
            // Apply saved collapsed state
            if (collapsedSections.has(targetId)) {
                section.classList.add('collapsed');
            }
            
            // Add click event listener
            header.addEventListener('click', () => {
                const isCollapsed = section.classList.contains('collapsed');
                
                if (isCollapsed) {
                    // Expand section
                    section.classList.remove('collapsed');
                    collapsedSections.delete(targetId);
                    log(`📖 Expanded section: ${header.querySelector('h4').textContent}`, 'info');
                } else {
                    // Collapse section
                    section.classList.add('collapsed');
                    collapsedSections.add(targetId);
                    log(`📕 Collapsed section: ${header.querySelector('h4').textContent}`, 'info');
                }
                
                // Save state to localStorage
                try {
                    localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...collapsedSections]));
                } catch (error) {
                    console.warn('Failed to save collapsed sections to localStorage:', error);
                }
            });
        }
    });
}

let _guitarEffectRebuildId = 0;
async function updateGuitarEffectControls() {
    const rebuildId = ++_guitarEffectRebuildId;
    const container = document.getElementById('guitarEffectControls');
    if (!container) return;
    
    container.innerHTML = '';
    const effectParams = bossCubeController.getCurrentGuitarEffectParameters();
    
    for (const [key, param] of Object.entries(effectParams)) {
        if (rebuildId !== _guitarEffectRebuildId) return;
        if (param.hidden) continue;
        const control = await createParameterControl(param, key);
        if (rebuildId !== _guitarEffectRebuildId) return;
        container.appendChild(control);
    }
}

let _micInstEffectRebuildId = 0;
async function updateMicInstEffectControls() {
    const rebuildId = ++_micInstEffectRebuildId;
    const container = document.getElementById('micInstEffectControls');
    if (!container) return;
    
    container.innerHTML = '';
    const effectParams = bossCubeController.getCurrentMicInstEffectParameters();
    
    for (const [key, param] of Object.entries(effectParams)) {
        if (rebuildId !== _micInstEffectRebuildId) return;
        if (param.hidden) continue;
        const control = await createParameterControl(param, key);
        if (rebuildId !== _micInstEffectRebuildId) return;
        container.appendChild(control);
    }

    applyDisabledWhenRules(container, effectParams);
}

function applyDisabledWhenRules(container, params) {
    for (const [key, param] of Object.entries(params)) {
        if (!param.disabledWhen) continue;
        const depParam = bossCubeController.parameters[param.disabledWhen.paramKey];
        if (!depParam) continue;
        const control = container.querySelector(`[data-param-key="${key}"]`);
        if (!control) continue;
        const disabled = depParam.current === param.disabledWhen.value;
        control.classList.toggle('control-disabled', disabled);
        control.querySelectorAll('input, button').forEach(el => el.disabled = disabled);
    }
}

function updateDisabledWhenState(changedParamKey, newValue) {
    for (const [key, param] of Object.entries(bossCubeController.parameters)) {
        if (!param.disabledWhen || param.disabledWhen.paramKey !== changedParamKey) continue;
        const control = document.querySelector(`[data-param-key="${key}"]`);
        if (!control) continue;
        const disabled = newValue === param.disabledWhen.value;
        control.classList.toggle('control-disabled', disabled);
        control.querySelectorAll('input, button').forEach(el => el.disabled = disabled);
    }
}

async function updateReverbDelayControls() {
    // Guitar Delay
    const guitarDelayContainer = document.getElementById('guitarDelayControls');
    if (guitarDelayContainer) {
        guitarDelayContainer.innerHTML = '';
        const guitarDelayParams = bossCubeController.getParametersByCategory('guitarDelay');
        for (const [key, param] of Object.entries(guitarDelayParams)) {
            if (param.hidden) continue;
            const control = await createParameterControl(param, key);
            guitarDelayContainer.appendChild(control);
        }
    }
    
    // Shared Reverb Controls
    const reverbContainer = document.getElementById('reverbControls');
    if (reverbContainer) {
        reverbContainer.innerHTML = '';
        const reverbParams = bossCubeController.getParametersByCategory('reverb');
        for (const [key, param] of Object.entries(reverbParams)) {
            if (param.hidden) continue;
            const control = await createParameterControl(param, key);
            reverbContainer.appendChild(control);
        }
    }
    
    // Reverb Levels (separate for Guitar and Mic/Inst) with on/off toggles
    const reverbLevelsContainer = document.getElementById('reverbLevelsControls');
    if (reverbLevelsContainer) {
        reverbLevelsContainer.innerHTML = '';

        const togglePairs = [
            { switchKey: 'guitarReverbSwitch', label: 'Guitar Reverb' },
            { switchKey: 'micInstReverbSwitch', label: 'Mic/Inst Reverb' },
        ];
        const toggleRow = document.createElement('div');
        toggleRow.className = 'reverb-toggle-row';
        for (const { switchKey, label } of togglePairs) {
            const switchParam = bossCubeController.parameters[switchKey];
            const btn = document.createElement('button');
            btn.className = 'reverb-toggle-btn' + (switchParam && switchParam.current === 1 ? ' on' : '');
            btn.textContent = label;
            btn.dataset.switchKey = switchKey;
            btn.addEventListener('click', async () => {
                if (!bossCubeController.isCubeConnected) return;
                const sp = bossCubeController.parameters[switchKey];
                const newVal = sp && sp.current === 1 ? 0 : 1;
                await bossCubeController.setParameter(switchKey, newVal);
                sp.current = newVal;
                btn.classList.toggle('on', newVal === 1);
            });
            toggleRow.appendChild(btn);
        }
        reverbLevelsContainer.appendChild(toggleRow);

        const reverbLevelsParams = bossCubeController.getParametersByCategory('reverbLevels');
        for (const [key, param] of Object.entries(reverbLevelsParams)) {
            const control = await createParameterControl(param, key);
            reverbLevelsContainer.appendChild(control);
        }
    }
}

async function updateLooperControls() {
    const container = document.getElementById('looperControls');
    if (!container) return;
    
    const looperParam = bossCubeController.parameters.looperControl;
    if (!looperParam) return;
    
    try {
        const looperHTML = await templateLoader.renderTemplate('templates/looper-controls.html', {
            LOOPER_BUTTONS: ''
        });
        container.innerHTML = looperHTML;
    } catch (error) {
        console.error('Failed to load looper controls template:', error);
        container.innerHTML = '<div class="error">Failed to load looper controls</div>';
        return;
    }

    const buttonsContainer = container.querySelector('.looper-buttons-improved') || container;
    const control = createButtonGroupControl(looperParam, 'looperControl', {
        buttons: LOOPER_BUTTONS,
        className: 'looper-control-widget',
        buttonClass: 'btn-base btn-looper looper-btn-improved',
        groupClass: 'btn-group--grid btn-group--grid-6 looper-buttons-improved',
        onValueChange: (k, v) => {
            looperTimeline.onLooperStateChange(v, 'ui-click');
            updateParameterValue(k, v);
            if (livePerformance && livePerformance.isActive) {
                livePerformance.updateLivePerformanceDisplay(k, v);
            }
            log(`🔁 Looper: ${LOOPER_BUTTONS[v]?.title || v}`, 'success');
        },
    });
    buttonsContainer.replaceWith(control);

    const timelineEl = LooperTimeline.createProgressElement();
    container.appendChild(timelineEl);
    looperTimeline.addProgressElement(timelineEl);
    
    // Setup info button
    const infoBtn = document.getElementById('looperInfoBtn');
    if (infoBtn) {
        infoBtn.addEventListener('click', () => {
            const helpText = `🔁 Looper Controls:
⏹️ Erase Loop - Clear current loop content
⏸️ Paused - Pause current loop operation  
🔴 Recording - Record new loop content
▶️ Playing - Playback recorded loop
🔄 Overdub - Layer additional audio over existing loop
⏯️ Standby - Looper ready state

📅 Recording Time: Normal (45s/Stereo) or Long (90s/Mono)
Settings control which audio sources are included in loops.`;
            alert(helpText);
        });
    }
    
    if (livePerformance && livePerformance.isActive) {
        livePerformance.updateLivePerformanceDisplay('looperControl', looperParam.current);
    }
}

async function updateLooperSettingsControls() {
    const container = document.getElementById('looperSettings');
    if (!container) return;

    const looperAssigns = bossCubeController.parameters.looperAssigns;
    if (!looperAssigns) return;

    try {
        const settingsHTML = await templateLoader.renderTemplate('templates/looper-settings.html', {
            LOOPER_SETTING_BUTTONS: ''
        });
        container.innerHTML = settingsHTML;
    } catch (error) {
        console.error('Failed to load looper settings template:', error);
        container.innerHTML = '<div class="error">Failed to load looper settings</div>';
        return;
    }

    const toggleTarget = container.querySelector('.looper-settings-improved') || container;
    const toggleGroup = createToggleGroupControl(looperAssigns, bossCubeController.parameters, {
        onToggle: async (childKey, newVal) => {
            if (!bossCubeController.isCubeConnected) {
                log('Boss Cube not connected - cannot change looper settings', 'error');
                return;
            }
            try {
                await bossCubeController.setParameter(childKey, newVal);
                const label = looperAssigns.childLabels?.[childKey] || childKey;
                log(`🔧 ${label} ${newVal ? 'On' : 'Off'}`, 'success');
            } catch (error) {
                log(`Failed to update looper setting: ${error.message}`, 'error');
            }
        },
    });
    toggleTarget.replaceWith(toggleGroup);

    setupLooperSettingsModal();
}

function setupLooperSettingsModal() {
    const settingsBtn = document.getElementById('looperSettingsBtn');
    const modal = document.getElementById('looperSettingsModal');
    const closeBtn = document.getElementById('closeLooperSettings');
    const recTimeNormal = document.getElementById('recTimeNormal');
    const recTimeLong = document.getElementById('recTimeLong');
    
    if (!settingsBtn || !modal || !closeBtn) return;
    
    // Open modal
    settingsBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
        
        // Update button states based on current parameter
        const param = bossCubeController.parameters.looperRecTime;
        if (param) {
            recTimeNormal.classList.toggle('active', param.current === 0);
            recTimeLong.classList.toggle('active', param.current === 1);
        }
    });
    
    // Close modal
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    });
    
    // Rec Time button handlers
    if (recTimeNormal) {
        recTimeNormal.addEventListener('click', () => setRecordingTime(0));
    }
    if (recTimeLong) {
        recTimeLong.addEventListener('click', () => setRecordingTime(1));
    }
}

async function setRecordingTime(value) {
    if (!bossCubeController.isCubeConnected) {
        log('Boss Cube not connected - cannot change recording time', 'error');
        return;
    }
    
    try {
        // Send to Boss Cube
        await bossCubeController.setParameter('looperRecTime', value);
        
        // Update parameter value locally for immediate UI response
        const param = bossCubeController.parameters.looperRecTime;
        if (param) {
            param.current = value;
        }
        
        // Update button states
        const recTimeNormal = document.getElementById('recTimeNormal');
        const recTimeLong = document.getElementById('recTimeLong');
        
        if (recTimeNormal && recTimeLong) {
            recTimeNormal.classList.toggle('active', value === 0);
            recTimeLong.classList.toggle('active', value === 1);
        }
        
        const timeDesc = value === 0 ? 'Normal (45s/Stereo)' : 'Long (90s/Mono)';
        log(`🔧 Recording Time set to ${timeDesc}`, 'success');
        
    } catch (error) {
        log(`Failed to set recording time: ${error.message}`, 'error');
    }
}



async function updateMicInstEQControls() {
    const container = document.getElementById('micInstEQControls');
    if (!container) return;
    
    container.innerHTML = '';
    const eqParams = bossCubeController.getParametersByCategory('micInstEQ');
    
    for (const [key, param] of Object.entries(eqParams)) {
        const control = await createParameterControl(param, key);
        container.appendChild(control);
    }
}

async function updateGuitarEQControls() {
    const container = document.getElementById('guitarEQControls');
    if (!container) return;
    
    container.innerHTML = '';
    const eqParams = bossCubeController.getParametersByCategory('guitarEQ');
    
    for (const [key, param] of Object.entries(eqParams)) {
        const control = await createParameterControl(param, key);
        container.appendChild(control);
    }
}

async function updateGuitarAmpControls() {
    const container = document.getElementById('guitarAmpControls');
    if (!container) return;
    
    container.innerHTML = '';
    const ampParams = bossCubeController.getParametersByCategory('guitarAmp');
    
    for (const [key, param] of Object.entries(ampParams)) {
        const control = await createParameterControl(param, key);
        container.appendChild(control);
    }
}

async function updateTunerControls() {
    const tunerToggleBtn = document.getElementById('tunerToggleBtn');
    if (tunerToggleBtn) {
        tunerToggleBtn.replaceWith(tunerToggleBtn.cloneNode(true));
        const newTunerToggleBtn = document.getElementById('tunerToggleBtn');
        
        if (bossCubeController.isCubeConnected) {
            newTunerToggleBtn.disabled = false;
        }
        
        updateTunerButtonState();
        newTunerToggleBtn.addEventListener('click', toggleTuner);
    }
    

    
    // Update visual display with current values
    updateTunerVisualDisplay();
}

async function toggleTuner() {
    if (!bossCubeController.isCubeConnected) {
        log('Boss Cube not connected - cannot control tuner', 'error');
        return;
    }
    
    try {
        tunerEnabled = !tunerEnabled;
        
        // Update button appearance and visual state
        updateTunerButtonState();
        updateTunerVisualState();
        
        // Send tuner control command to Boss Cube
        await bossCubeController.setTunerControl(tunerEnabled);
        
        log(`🎵 Tuner ${tunerEnabled ? 'enabled' : 'disabled'}`, 'success');
        
    } catch (error) {
        // Revert button state on error
        tunerEnabled = !tunerEnabled;
        updateTunerButtonState();
        updateTunerVisualState();
        
        log(`Failed to control tuner: ${error.message}`, 'error');
    }
}

function updateTunerButtonState() {
    // Update both the old tuner button (if it exists) and the new one
    const oldTunerBtn = document.getElementById('tunerBtn');
    const newTunerBtn = document.getElementById('tunerToggleBtn');
    
    if (oldTunerBtn) {
        if (tunerEnabled) {
            oldTunerBtn.textContent = '🎵 Tuner ON';
            oldTunerBtn.classList.add('active', 'tuner');
        } else {
            oldTunerBtn.textContent = '🎵 Tuner';
            oldTunerBtn.classList.remove('active');
        }
    }
    
    if (newTunerBtn) {
        if (tunerEnabled) {
            newTunerBtn.textContent = '🎵 Tuner ON';
            newTunerBtn.classList.add('active');
        } else {
            newTunerBtn.textContent = '🎵 Tuner OFF';
            newTunerBtn.classList.remove('active');
        }
    }
}

function updateTunerVisualState() {
    // Tuner visual is now only in the modal — nothing to do here for the section
}



function updateTunerVisualDisplay() {
    // noop — tuner visual display is now only in the modal, updated by controller.updateTunerDisplay


}



function toggleMasterBind() {
    masterBindEnabled = !masterBindEnabled;
    
    if (masterBindEnabled) {
        masterBindControl.classList.add('enabled');
        log(`🔗 Master Out binding enabled - Aux volume knob will control both sliders`, 'success');
    } else {
        masterBindControl.classList.remove('enabled');
        log('🔗 Master Out binding disabled - controls work normally', 'info');
    }
}

function showBindInfo() {
    bindInfoOverlay.classList.add('show');
    bindInfoPopup.classList.add('show');
    
    // Close popup when clicking overlay
    bindInfoOverlay.addEventListener('click', hideBindInfo);
    
    // Close popup on escape key
    document.addEventListener('keydown', handleBindInfoEscape);
}

function hideBindInfo() {
    bindInfoOverlay.classList.remove('show');
    bindInfoPopup.classList.remove('show');
    
    // Remove event listeners
    bindInfoOverlay.removeEventListener('click', hideBindInfo);
    document.removeEventListener('keydown', handleBindInfoEscape);
}

function handleBindInfoEscape(e) {
    if (e.key === 'Escape') {
        hideBindInfo();
    }
}

async function createMasterBindControl() {
    const bindControl = document.createElement('div');
    bindControl.className = 'mixer-bind-control';
    
    try {
        const bindHTML = await templateLoader.loadTemplate('templates/master-bind-control.html');
        bindControl.innerHTML = bindHTML;
    } catch (error) {
        console.error('Failed to load master bind control template:', error);
        // Fallback to inline HTML
    bindControl.innerHTML = `
        <div class="bind-main-text">🔗 Bind Master Out with Aux</div>
        <button class="bind-info-icon" type="button">i</button>
    `;
    }
    
    // Store references
    masterBindControl = bindControl;
    masterBindInfoIcon = bindControl.querySelector('.bind-info-icon');
    
    // Add event listeners
    bindControl.addEventListener('click', (e) => {
        // Don't toggle if clicking the info icon
        if (e.target === masterBindInfoIcon) {
            return;
        }
        toggleMasterBind();
    });
    
    masterBindInfoIcon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showBindInfo();
    });
    
    return bindControl;
}

// ===== LOOPER VOLUME CONTROL =====

function calculateLooperVolumeAdjustment(targetLooperVolume) {
    // Get current actual volumes
    const currentMaster = bossCubeController.parameters.masterVolume.current;
    const currentGuitar = bossCubeController.parameters.guitarMicVolume.current;
    const currentMicInst = bossCubeController.parameters.micInstVolume.current;
    
    // Calculate the adjustment needed
    const looperVolumeChange = targetLooperVolume - currentLooperVolume;
    
    // Master volume changes directly with looper volume, but with minimum level
    const newMaster = Math.max(
        LOOPER_VOLUME_CONFIG.MIN_MASTER_LEVEL, 
        Math.min(100, Math.round(currentMaster + looperVolumeChange))
    );
    
    // Input volumes change inversely but more gently and with minimum levels
    const inputAdjustment = -looperVolumeChange * LOOPER_VOLUME_CONFIG.INPUT_ADJUSTMENT_FACTOR;
    const newGuitar = Math.max(
        LOOPER_VOLUME_CONFIG.MIN_INPUT_LEVEL, 
        Math.min(100, Math.round(currentGuitar + inputAdjustment))
    );
    const newMicInst = Math.max(
        LOOPER_VOLUME_CONFIG.MIN_INPUT_LEVEL, 
        Math.min(100, Math.round(currentMicInst + inputAdjustment))
    );
    
    return {
        masterVolume: newMaster,
        guitarMicVolume: newGuitar,
        micInstVolume: newMicInst
    };
}

async function updateLooperVolume(targetVolume) {
    // Prevent recursive updates
    isUpdatingLooperVolume = true;
    
    try {
        const adjustments = calculateLooperVolumeAdjustment(targetVolume);
        
        // Update displays first for immediate UI feedback
        for (const [paramKey, newValue] of Object.entries(adjustments)) {
            updateParameterDisplay(paramKey, newValue);
            
            // Update Live Performance mode controls if active
            if (livePerformance && livePerformance.isActive) {
                livePerformance.updateLivePerformanceDisplay(paramKey, newValue);
            }
        }
        
        // Throttle hardware updates to prevent GATT conflicts
        const now = Date.now();
        const shouldUpdateHardware = now - looperVolumeThrottle.lastUpdateTime >= looperVolumeThrottle.updateInterval;
        
        if (bossCubeController.isCubeConnected && shouldUpdateHardware) {
            looperVolumeThrottle.lastUpdateTime = now;
            
            // Send hardware updates sequentially to avoid GATT conflicts
            for (const [paramKey, newValue] of Object.entries(adjustments)) {
                try {
                    await bossCubeController.setParameter(paramKey, newValue);
                } catch (error) {
                    console.warn(`Failed to update ${paramKey}:`, error.message);
                }
            }
        }
        
        currentLooperVolume = targetVolume;
        
        // Also update the looper volume parameter display itself
        updateParameterDisplay('looperVolume', targetVolume);
        
        // Update Live Performance mode looper volume display if active
        if (livePerformance && livePerformance.isActive) {
            livePerformance.updateLivePerformanceDisplay('looperVolume', targetVolume);
        }
        
        // Save current looper volume to localStorage
        localStorage.setItem('currentLooperVolume', currentLooperVolume.toString());
        
        log(`🔁 Looper Volume: ${targetVolume} (Master: ${adjustments.masterVolume}, Guitar: ${adjustments.guitarMicVolume}, Mic/Inst: ${adjustments.micInstVolume})`, 'success');
    } finally {
        // Always reset the flag
        isUpdatingLooperVolume = false;
    }
}



function createParameterControl(param, key) {
    const isDiscreteChoice = Array.isArray(param.valueLabels) && param.valueLabels.length <= 9;

    if (key === 'guitarAmpType') {
        return createButtonGroupControl(param, key, {
            className: 'amp-type-control',
            buttonClass: 'btn-base btn-effect amp-type-btn',
            groupClass: 'btn-group amp-type-buttons',
            onValueChange: (k, v) => updateParameterValue(k, v),
        });
    }

    if (isDiscreteChoice) {
        return createButtonGroupControl(param, key, {
            label: param.name,
            onValueChange: (k, v) => updateParameterValue(k, v),
        });
    }

    return createSliderControl(param, key, {
        onValueChange: (k, v) => { updateParameterValue(k, v); updateParameterDisplay(k, v); },
        onSelect: (k) => { selectParameter(k); log(`Selected for pedal control: ${param.name}`, 'info'); },
    });
}

function updateParameterFill(key, value, min, max) {
    const control = document.querySelector(`[data-param-key="${key}"]`);
    if (control) {
        const fill = control.querySelector('.parameter-fill');
        const percentage = ((value - min) / (max - min)) * 100;
        
        // Reset any transform and use width for consistency
        fill.style.transform = '';
        fill.style.width = `${percentage}%`;
    }
}

function selectParameter(key) {
    if (!bossCubeController.parameters[key]) return;
    
    currentParameterKey = key;
    bossCubeController.setCurrentParameter(key);
    
    // Clear cached elements when switching parameters
    cachedPedalElements = null;
    
    const param = bossCubeController.parameters[key];
    
    // Update UI
    updateParameterSelection();
    
    log(`Selected parameter: ${param.name}`, 'info');
}

function updateParameterSelection() {
    const allControls = document.querySelectorAll('.parameter-control');
    let targetControl = null;
    
    allControls.forEach((control) => {
        const key = control.getAttribute('data-param-key');
        if (key === currentParameterKey) {
            control.classList.add('current');
            targetControl = control;
        } else {
            control.classList.remove('current');
        }
    });

    // Delay scroll slightly so DOM/log updates don't cancel it
    if (targetControl) {
        requestAnimationFrame(() => {
            targetControl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }
}

/**
 * Update parameter value with pickup mode activation on manual changes
 * 
 * Activates pickup mode when user manually changes a control and pedal position
 * differs significantly. This ensures smooth transitions when pedal takes over.
 * 
 * @param {string} key - Parameter key identifier
 * @param {number} value - New parameter value
 */
function updateParameterValue(key, value) {
    if (!bossCubeController.parameters[key]) return;
    
    // Handle virtual looper volume parameter
    if (key === 'looperVolume') {
        if (!isUpdatingLooperVolume) {
            updateLooperVolume(value);
        }
        return;
    }
    
    // Prevent feedback loops when looper volume is updating other parameters
    if (isUpdatingLooperVolume && (key === 'masterVolume' || key === 'guitarMicVolume' || key === 'micInstVolume')) {
        return;
    }
    
    const param = bossCubeController.parameters[key];
    
    // Clamp value to parameter range
    value = Math.max(param.min, Math.min(param.max, value));
    
    // Update pickup mode state when control is changed manually
    if (key === currentParameterKey) {
        // Get global pedal position for this parameter
        const globalPedalPosition = bossCubeController.getGlobalPedalPosition(param);
        
        // If pedal position is significantly different, enter pickup mode
        if (!pickupMode.active && globalPedalPosition !== null) {
            const valueDifference = Math.abs(globalPedalPosition - value);
            if (valueDifference > pickupMode.threshold) {
                pickupMode.active = true;
                pickupMode.targetControlValue = value; // Target is the manually set control value
                pickupMode.activeParameter = key;
                updatePickupModeVisuals(key, true);
                bossCubeController.enablePickupMode();
                log(`🎯 Pickup mode activated (control set to ${value})`, 'info');
            }
        }
    }
    
    // Send command to Boss Cube only if connected
    if (bossCubeController.isCubeConnected) {
        bossCubeController.setParameter(key, value);
    } else {
        // Update internal parameter even without Boss Cube connection
        param.current = value;
        log(`UI only: ${param.name} = ${value} (Boss Cube not connected)`, 'warning');
    }
    
    // Update parameter display
    updateParameterDisplay(key, value);

    updateDisabledWhenState(key, value);

    // Sync effect type changes to controller state.
    // The bus 'effect:changed' event will then refresh all effect buttons.
    if (key === 'guitarEffectType') {
        const typeParam = bossCubeController.parameters[key];
        const effectLabel = typeParam.valueLabels?.[value];
        if (effectLabel) {
            bossCubeController.currentGuitarEffect = normalizeEffectKey(effectLabel.toLowerCase());
            bus.emit('effect:changed', 'guitar');
        }
    } else if (key === 'micInstEffectType') {
        const typeParam = bossCubeController.parameters[key];
        const effectLabel = typeParam.valueLabels?.[value];
        if (effectLabel) {
            bossCubeController.currentMicInstEffect = normalizeEffectKey(effectLabel.toLowerCase());
            bus.emit('effect:changed', 'micInst');
        }
    }

    // Master bind: mirror between masterVolume and auxBluetoothVolume
    if (masterBindEnabled && !isUpdatingMasterBind) {
        isUpdatingMasterBind = true;
        if (key === 'masterVolume') {
            updateParameterValue('auxBluetoothVolume', value);
        } else if (key === 'auxBluetoothVolume') {
            updateParameterValue('masterVolume', value);
        }
        isUpdatingMasterBind = false;
    }
}

function updateParameterDisplay(key, value) {
    const control = document.querySelector(`[data-param-key="${key}"]`);
    if (!control) return;

    const param = bossCubeController.parameters[key];
    if (!param) return;

    param.current = value;

    if (control.querySelector('[data-value]')) {
        updateButtonGroupDisplay(control, value);
    } else {
        updateControlDisplay(control, param, key, value);
    }
}

// Cache DOM elements for faster pedal updates
let cachedPedalElements = null;

function updateParameterDisplayFast(key, value) {
    if (!cachedPedalElements || cachedPedalElements.key !== key) {
        const control = document.querySelector(`[data-param-key="${key}"]`);
        if (!control) return;
        cachedPedalElements = {
            key,
            control,
            valueDisplay: control.querySelector('.parameter-value'),
            slider: control.querySelector('.parameter-slider'),
            param: bossCubeController.parameters[key],
        };
    }

    const { control, valueDisplay, slider, param } = cachedPedalElements;
    param.current = value;

    queueFillUpdate(control, key, value, param.min, param.max);

    const newText = getDisplayValue(param, value);
    if (valueDisplay.textContent !== newText) {
        valueDisplay.textContent = newText;
    }
    slider.value = value;
}

function updatePickupModeVisuals(key, active) {
    // Only show pickup mode visuals on the current parameter
    if (key === currentParameterKey) {
        const control = document.querySelector(`[data-param-key="${key}"]`);
        if (control) {
            if (active) {
                control.classList.add('pickup-mode');
                // Update pedal position indicator when entering pickup mode using global pedal position
                const param = bossCubeController.parameters[key];
                const globalPedalPosition = bossCubeController.getGlobalPedalPosition(param);
                if (globalPedalPosition !== null) {
                    updatePedalPositionIndicator(key, globalPedalPosition);
                }
            } else {
                control.classList.remove('pickup-mode');
            }
        }
    }
}

function updatePedalPositionIndicator(key, pedalValue) {
    const control = document.querySelector(`[data-param-key="${key}"]`);
    if (control) {
        const pedalIndicator = control.querySelector('.parameter-pedal-position');
        const param = bossCubeController.parameters[key];
        
        if (pedalIndicator && param) {
            const percentage = ((pedalValue - param.min) / (param.max - param.min)) * 100;
            pedalIndicator.style.left = `${percentage}%`;
        }
    }
}

async function tryAutoReconnect() {
    const cubePromise = (async () => {
        try {
            const cubeReconnected = await bossCubeController.tryAutoReconnectCube();
            if (cubeReconnected) {
                statusEl.textContent = 'Boss Cube Connected';
                statusEl.className = 'status success';
                connectBtn.textContent = 'Disconnect Boss Cube';
                connectBtn.className = 'btn danger';
                readValuesBtn.disabled = false;
                const tunerToggleBtn = document.getElementById('tunerToggleBtn');
                if (tunerToggleBtn) tunerToggleBtn.disabled = false;
                log('🔄 Auto-reconnected to Boss Cube', 'success');
                await readCurrentValuesOnConnect();
            }
        } catch (error) {
            log(`Cube auto-reconnect failed: ${error.message}`, 'info');
        }
    })();

    const pedalPromise = (async () => {
        try {
            const pedalReconnected = await bossCubeController.tryAutoReconnectPedal();
            if (pedalReconnected) {
                log('🔄 Auto-reconnected to pedal', 'success');
            }
        } catch (error) {
            log(`Pedal auto-reconnect failed: ${error.message}`, 'info');
        }
    })();

    await Promise.all([cubePromise, pedalPromise]);
}

async function handleBossCubeButton({ skipReadValues = false } = {}) {
    if (bossCubeController.isCubeConnected) {
        await disconnectBossCube();
    } else {
        await connectToBossCube({ skipReadValues });
    }
}
window.handleBossCubeButton = handleBossCubeButton;

async function handlePedalUIButton() {
    if (bossCubeController.isPedalConnected) {
        await disconnectPedal();
    } else {
        await connectToPedal();
    }
}

async function connectToBossCube({ skipReadValues = false } = {}) {
    try {
        statusEl.textContent = 'Connecting to Boss Cube...';
        statusEl.className = 'status info';
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';
        
        await bossCubeController.connectToBossCube();
        
        statusEl.textContent = 'Boss Cube Connected';
        statusEl.className = 'status success';
        connectBtn.textContent = 'Disconnect Boss Cube';
        connectBtn.disabled = false;
        connectBtn.className = 'btn danger';
        
        // Enable read values button and tuner buttons
        readValuesBtn.disabled = false;
        
        // Enable the tuner button in effects section
        const tunerToggleBtn = document.getElementById('tunerToggleBtn');
        if (tunerToggleBtn) tunerToggleBtn.disabled = false;
        
        // Automatically enable notifications for physical knob changes
        try {
            log('🔔 Enabling continuous notifications...', 'info');
            await bossCubeController.enableContinuousNotifications();
            log('✅ Continuous notifications enabled', 'success');
        } catch (error) {
            log(`⚠️ Failed to enable notifications: ${error.message}`, 'warning');
        }
        
        log('Connected to Boss Cube II', 'success');
        if (discoveryDashboard) discoveryDashboard._updateConnectBtn();
        
        if (!skipReadValues) {
            await readCurrentValuesOnConnect();
        }
        
    } catch (error) {
        statusEl.textContent = 'Connection Failed';
        statusEl.className = 'status error';
        connectBtn.textContent = 'Connect Boss Cube';
        connectBtn.disabled = false;
        connectBtn.className = 'btn';
        log(`Connection failed: ${error.message}`, 'error');
    }
}

async function disconnectBossCube() {
    try {
        statusEl.textContent = 'Disconnecting Boss Cube...';
        statusEl.className = 'status info';
        connectBtn.disabled = true;
        connectBtn.textContent = 'Disconnecting...';
        
        await bossCubeController.disconnectBossCube();
        
        statusEl.textContent = 'Boss Cube Disconnected';
        statusEl.className = 'status error';
        connectBtn.textContent = 'Connect Boss Cube';
        connectBtn.disabled = false;
        connectBtn.className = 'btn';
        
        // Disable read values button and tuner buttons
        readValuesBtn.disabled = true;
        
        // Disable the tuner button in effects section
        const tunerToggleBtn = document.getElementById('tunerToggleBtn');
        if (tunerToggleBtn) tunerToggleBtn.disabled = true;
        
        // Reset tuner state
        tunerEnabled = false;
        updateTunerButtonState();
        
        // Reset master bind state
        masterBindEnabled = false;
        if (masterBindControl) {
            masterBindControl.classList.remove('enabled');
        }
        
        log('Disconnected from Boss Cube II', 'info');
        if (discoveryDashboard) discoveryDashboard._updateConnectBtn();
        updateBatteryBadge(0, false);
        
    } catch (error) {
        connectBtn.disabled = false;
        log(`Disconnect failed: ${error.message}`, 'error');
    }
}

async function connectToPedal() {
    try {
        pedalStatusEl.textContent = '🎹 Pedal: Connecting...';
        connectPedalBtn.disabled = true;
        connectPedalBtn.textContent = 'Connecting...';
        
        const success = await bossCubeController.connectToPedal();
        
        if (success) {
            log('Connected to EV-1-WL pedal', 'success');
            // Status will be updated by the pedal status change callback
        } else {
            throw new Error('Failed to connect to pedal');
        }
        
    } catch (error) {
        pedalStatusEl.textContent = '🎹 Pedal: Connection Failed';
        pedalStatusEl.className = 'pedal-status';
        connectPedalBtn.textContent = 'Connect Pedal (EV-1-WL)';
        connectPedalBtn.disabled = false;
        connectPedalBtn.className = 'btn';
        log(`Pedal connection failed: ${error.message}`, 'error');
    }
}

async function disconnectPedal() {
    try {
        pedalStatusEl.textContent = '🎹 Pedal: Disconnecting...';
        pedalStatusEl.className = 'pedal-status';
        connectPedalBtn.disabled = true;
        connectPedalBtn.textContent = 'Disconnecting...';
        
        await bossCubeController.disconnectPedal();
        
        pedalStatusEl.textContent = '🎹 Pedal: Disconnected';
        pedalStatusEl.className = 'pedal-status';
        connectPedalBtn.textContent = 'Connect Pedal (EV-1-WL)';
        connectPedalBtn.disabled = false;
        connectPedalBtn.className = 'btn';
        
        log('Disconnected from EV-1-WL pedal', 'info');
        
    } catch (error) {
        connectPedalBtn.disabled = false;
        log(`Pedal disconnect failed: ${error.message}`, 'error');
    }
}

async function readCurrentValuesOnConnect() {
    const connectCallId = Math.random().toString(36).substr(2, 9);

    
    try {
        log('📖 Reading ALL current values from Boss Cube...', 'info');
        
        // Show status during reading
        statusEl.textContent = 'Reading current values...';
        statusEl.className = 'status info';
        
        // Read all parameter values (comprehensive)
        await bossCubeController.readAllValues();
        
        // Small delay to allow responses to come in
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        statusEl.textContent = 'Boss Cube Connected';
        statusEl.className = 'status success';
        
        log('✅ All current values read from Boss Cube', 'success');
        
    } catch (error) {
        log(`❌ Failed to read current values: ${error.message}`, 'error');
        
        // Fallback: set a reasonable default volume if reading fails
        try {
            await bossCubeController.setParameter('masterVolume', 50);
            updateParameterDisplay('masterVolume', 50);
            log('Fallback: Set Master Volume to 50', 'warning');
        } catch (fallbackError) {
            log(`Fallback also failed: ${fallbackError.message}`, 'error');
        }
    }
}

async function testConnection() {
    try {
        log('Testing connection...', 'info');
        
        // Test with master volume at 50%
        await bossCubeController.setParameter('masterVolume', 50);
        updateParameterDisplay('masterVolume', 50);
        log('Test successful: Set Master Volume to 50', 'success');
        
    } catch (error) {
        log(`Test failed: ${error.message}`, 'error');
    }
}



function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const line = `${timestamp} [${type}] ${message}`;

    // Always store in buffer for save
    logBuffer.push(line);
    if (logBuffer.length > 5000) logBuffer.shift();

    // Stream to dev server
    if (window._devLogEnabled) {
        navigator.sendBeacon('/api/log', line);
    }

    // Verbosity filter for UI display
    if (logVerbosity === 'minimal' && type === 'info') return;
    if (logVerbosity === 'normal' && type === 'warning') return;

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `<span class="timestamp">${timestamp}</span>${message}`;
    
    logEl.appendChild(logEntry);
    logEl.scrollTop = logEl.scrollHeight;
    
    while (logEl.children.length > 200) {
        logEl.removeChild(logEl.firstChild);
    }
}

// Lightweight logging for pedal movements - more responsive but controlled
let pedalLogThrottle = {
    lastLogTime: 0,
    lastLogValue: -1,
    finalLogTimer: null,
    logInterval: 100 // Reduced to 100ms for more responsive feedback
};

function setupLogPanel() {
    const verbositySelect = document.getElementById('logVerbosity');
    const saveBtn = document.getElementById('saveLogsBtn');
    const toggleBtn = document.getElementById('toggleLogBtn');

    if (verbositySelect) {
        verbositySelect.addEventListener('change', () => {
            logVerbosity = verbositySelect.value;
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const blob = new Blob([logBuffer.join('\n')], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `boss-cube-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const isHidden = logEl.style.display === 'none';
            logEl.style.display = isHidden ? 'block' : 'none';
            toggleBtn.textContent = isHidden ? '▲ Hide' : '▼ Show';
        });
    }
}

function throttledPedalLog(paramName, value) {
    const now = Date.now();
    
    // Clear any pending final log
    if (pedalLogThrottle.finalLogTimer) {
        clearTimeout(pedalLogThrottle.finalLogTimer);
    }
    
    // Log immediately if enough time has passed and value changed
    if (now - pedalLogThrottle.lastLogTime >= pedalLogThrottle.logInterval &&
        Math.abs(value - pedalLogThrottle.lastLogValue) >= 1) { // Reduced threshold for more feedback
        
        log(`🎚️ Pedal: ${paramName} = ${value}`, 'info');
        pedalLogThrottle.lastLogTime = now;
        pedalLogThrottle.lastLogValue = value;
    } else {
        // Schedule final log to capture the last value after movement stops
        pedalLogThrottle.finalLogTimer = setTimeout(() => {
            if (value !== pedalLogThrottle.lastLogValue) {
                log(`🎚️ Pedal: ${paramName} = ${value} (final)`, 'info');
                pedalLogThrottle.lastLogValue = value;
            }
        }, 200); // Faster final log
    }
}

async function readValuesFromCube() {
    const buttonCallId = Math.random().toString(36).substr(2, 9);

    
    if (!bossCubeController.isCubeConnected) {
        log('Boss Cube not connected - cannot read values', 'error');
        return;
    }
    
    // Prevent multiple simultaneous calls by checking if button is already disabled
    if (readValuesBtn.disabled) {
        log(`⚠️ [${buttonCallId}] Read operation already in progress - ignoring duplicate request`, 'warning');
        return;
    }
    
    try {
        readValuesBtn.disabled = true;
        readValuesBtn.textContent = '🔄 Reload Values';
        
        log(`🔄 [${buttonCallId}] Reloading all parameter values from Boss Cube...`, 'info');
        
        // Read all mixer and effects values
        await bossCubeController.readAllValues();
        
        log('✅ All reload requests sent - watch for incoming values', 'success');
        
    } catch (error) {
        log(`❌ Failed to reload values: ${error.message}`, 'error');
    } finally {
        readValuesBtn.disabled = false;
        readValuesBtn.textContent = '📖 Read Values';
    }
}

function updateParameterDisplayFromCube(paramKey, value, isPhysicalKnobChange = false) {
    // Master bind: mirror aux knob changes to master volume
    if (masterBindEnabled && paramKey === 'auxBluetoothVolume') {
        updateParameterValue('masterVolume', value);
        if (livePerformance && livePerformance.isActive) {
            livePerformance.updateLivePerformanceDisplay('masterVolume', value);
        }
    }

    // Update the parameter display when Boss Cube sends us a value
    updateParameterDisplay(paramKey, value);
    
    // Effect button refresh is handled by bus event from controller.onEffectStateChanged

    // Hardware status badges
    if (paramKey === 'outputPowerMode') updatePowerBadge(value);
    if (paramKey === 'micInstInputSelect') updateInputBadge(value);
    if (paramKey === 'batteryLevel') {
        const low = bossCubeController.parameters.batteryLowIndicator?.current;
        updateBatteryBadge(value, low === 1);
    }
    if (paramKey === 'batteryLowIndicator') {
        const level = bossCubeController.parameters.batteryLevel?.current || 0;
        updateBatteryBadge(level, value === 1);
    }

    updateDisabledWhenState(paramKey, value);

    // Tuner hardware switch → show/hide modal
    if (paramKey === 'tunerSwitch') {
        if (value === 1) {
            showTunerModal();
        } else {
            hideTunerModal();
        }
    }

    // Tuner mode/key sync from hardware
    if (paramKey === 'manualTunerMode') updateTunerModeUI(value);
    if (paramKey === 'tunerManualKey') {
        const keySelect = document.getElementById('modalTunerKeySelect');
        if (keySelect) keySelect.value = value;
    }
    if (paramKey === 'tunerAccidental') updateTunerAccidentalUI(value);
    if (paramKey === 'tunerPitch') {
        const pitchSelect = document.querySelector('#modalTunerPitchControls select');
        if (pitchSelect) pitchSelect.value = value;
    }

    // Reverb on/off switches → update toggle buttons
    if (paramKey === 'guitarReverbSwitch' || paramKey === 'micInstReverbSwitch') {
        updateReverbToggle(paramKey, value);
    }

    // Handle special controls that need custom updates
    if (paramKey === 'looperControl') {
        looperTimeline.onLooperStateChange(value, 'hardware');
        updateLooperControls().catch(error => {
            console.error('Failed to update looper controls UI:', error);
        });
    }
    
    updateDeviceSettingDisplay(paramKey, value);

    // Update Live Performance mode controls if active (after special handling)
    if (livePerformance && livePerformance.isActive) {
        livePerformance.updateLivePerformanceDisplay(paramKey, value);
    }
    
    // Handle looper settings toggle buttons - regenerate the UI to show updated values
    const looperSettingParams = ['looperRecTime', 'looperMicInstAssign', 'looperGuitarMicAssign', 'looperReverbAssign', 'looperICubeLinkAssign'];
    if (looperSettingParams.includes(paramKey)) {
        updateLooperSettingsControls().catch(error => {
            console.error('Failed to update looper settings UI:', error);
        });
    }
    
    // Handle tuner parameter updates
    const param = bossCubeController.parameters[paramKey];
    if (param && param.category === 'tuner') {
        updateTunerVisualDisplay();
    }
    
    // Reset pickup mode when physical knob changes are detected
    if (isPhysicalKnobChange && paramKey === currentParameterKey && pickupMode.active) {
        pickupMode.active = false;
        updatePickupModeVisuals(paramKey, false);
        bossCubeController.disablePickupMode();
        log(`🎛️ Physical knob change detected - pickup mode reset`, 'info');
    }
    
    // Reset pickup mode in Live Performance mode when physical knob changes are detected
    if (isPhysicalKnobChange && livePerformance && livePerformance.isActive) {
        livePerformance.handlePhysicalKnobChange(paramKey, value);
    }
}

function handlePhysicalKnobChange(paramKey, paramName, value) {
    // Handle physical knob changes with special logging and UI feedback
    if (masterBindEnabled) {
        if (paramKey === 'masterVolume') {
            log(`🔗 Master Out controlled via Aux volume knob: ${value}`, 'success');
        } else if (paramKey === 'auxBluetoothVolume') {
            log(`🔗 Aux volume knob position: ${value} (both sliders moving)`, 'info');
        }
        // Skip regular logging for other knobs when binding is active
    }
    // Remove the regular "Physical knob: ..." logging since it's handled in the controller now
}

// updateEffectOnOffIndicator removed — effect button refresh now handled by
// bus 'effect:changed' event from controller.onEffectStateChanged

function updatePowerBadge(value) {
    const badge = document.getElementById('powerBadge');
    const container = document.getElementById('hardwareBadges');
    if (!badge) return;
    badge.textContent = value === 0 ? '⚡ MAX' : '🔋 ECO';
    if (container) container.style.display = 'flex';
}

function updateInputBadge(value) {
    const badge = document.getElementById('inputBadge');
    const container = document.getElementById('hardwareBadges');
    if (!badge) return;
    badge.textContent = value === 0 ? '🎤 MIC' : '🎸 INST';
    if (container) container.style.display = 'flex';
}

function updateBatteryBadge(level, low) {
    const badge = document.getElementById('batteryBadge');
    if (!badge) return;
    if (level === 0 && !low) {
        badge.style.display = 'none';
        return;
    }
    const bars = '▓'.repeat(level) + '░'.repeat(3 - level);
    badge.textContent = `🔋 ${bars}`;
    badge.className = 'hw-badge' + (low ? ' battery-low' : '');
    badge.style.display = '';
    const container = document.getElementById('hardwareBadges');
    if (container) container.style.display = 'flex';
}

function showTunerModal() {
    tunerModalEl = tunerModalEl || document.getElementById('tunerModal');
    if (tunerModalEl) {
        tunerModalEl.style.display = 'flex';
        tunerEnabled = true;
        updateTunerButtonState();

        const modeParam = bossCubeController.parameters.manualTunerMode;
        updateTunerModeUI(modeParam ? modeParam.current : 0);
        const keySelect = document.getElementById('modalTunerKeySelect');
        const keyParam = bossCubeController.parameters.tunerManualKey;
        if (keySelect && keyParam) keySelect.value = keyParam.current;
        const accParam = bossCubeController.parameters.tunerAccidental;
        updateTunerAccidentalUI(accParam ? accParam.current : 0);
        const pitchSelect = document.querySelector('#modalTunerPitchControls select');
        const pitchParam = bossCubeController.parameters.tunerPitch;
        if (pitchSelect && pitchParam) pitchSelect.value = pitchParam.current;

    }
}

function hideTunerModal() {
    tunerModalEl = tunerModalEl || document.getElementById('tunerModal');
    if (tunerModalEl) {
        tunerModalEl.style.display = 'none';
        tunerEnabled = false;
        updateTunerButtonState();
        updateTunerVisualState();
    }
}

function updateReverbToggle(paramKey, value) {
    const btn = document.querySelector(`.reverb-toggle-btn[data-switch-key="${paramKey}"]`);
    if (btn) {
        btn.classList.toggle('on', value === 1);
    }
}

function initTunerModal() {
    const modal = document.getElementById('tunerModal');
    const closeBtn = document.getElementById('tunerModalClose');
    const modeBtn = document.getElementById('modalTunerModeBtn');
    const keySelect = document.getElementById('modalTunerKeySelect');
    const pitchContainer = document.getElementById('modalTunerPitchControls');
    if (!modal) return;

    const closeTuner = async () => {
        hideTunerModal();
        if (bossCubeController.isCubeConnected) {
            await bossCubeController.setTunerControl(false);
        }
    };

    closeBtn.addEventListener('click', closeTuner);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeTuner(); });

    if (modeBtn) {
        modeBtn.addEventListener('click', async () => {
            if (!bossCubeController.isCubeConnected) return;
            const param = bossCubeController.parameters.manualTunerMode;
            const newValue = param && param.current === 1 ? 0 : 1;
            await bossCubeController.setParameter('manualTunerMode', newValue);
            updateTunerModeUI(newValue);
        });
    }

    if (keySelect) {
        keySelect.addEventListener('change', async () => {
            if (!bossCubeController.isCubeConnected) return;
            await bossCubeController.setParameter('tunerManualKey', parseInt(keySelect.value));
        });
    }

    const accidentalContainer = document.getElementById('modalTunerAccidental');
    if (accidentalContainer) {
        accidentalContainer.querySelectorAll('.btn-accidental').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!bossCubeController.isCubeConnected) return;
                const val = parseInt(btn.dataset.value);
                await bossCubeController.setParameter('tunerAccidental', val);
                updateTunerAccidentalUI(val);
            });
        });
    }

    if (pitchContainer) {
        const pitchParam = bossCubeController.parameters.tunerPitch;
        if (pitchParam) {
            const pitchSelect = document.createElement('select');
            for (let i = pitchParam.min; i <= pitchParam.max; i++) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = `${435 + i}Hz`;
                if (i === pitchParam.current) opt.selected = true;
                pitchSelect.appendChild(opt);
            }
            pitchSelect.addEventListener('change', async () => {
                if (!bossCubeController.isCubeConnected) return;
                await bossCubeController.setParameter('tunerPitch', parseInt(pitchSelect.value));
            });
            const label = document.createElement('span');
            label.className = 'pitch-label';
            label.textContent = 'A=';
            pitchContainer.appendChild(label);
            pitchContainer.appendChild(pitchSelect);
        }
    }

}

function updateTunerModeUI(manualMode) {
    const modeBtn = document.getElementById('modalTunerModeBtn');
    const keySelect = document.getElementById('modalTunerKeySelect');
    const accidental = document.getElementById('modalTunerAccidental');
    if (modeBtn) {
        modeBtn.textContent = manualMode === 1 ? 'Manual' : 'Chromatic';
        modeBtn.classList.toggle('active', manualMode === 1);
    }
    const show = manualMode === 1 ? 'inline-flex' : 'none';
    if (keySelect) keySelect.style.display = manualMode === 1 ? 'inline-block' : 'none';
    if (accidental) accidental.style.display = show;
}

function updateTunerAccidentalUI(value) {
    const container = document.getElementById('modalTunerAccidental');
    if (!container) return;
    container.querySelectorAll('.btn-accidental').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.value) === value);
    });
}

// Direct key value (0-16) → { key: 0-6 index into C,D,E,F,G,A,B, accidental: 0=nat,1=flat,2=sharp }
// Load settings from localStorage
function loadSettings() {
    try {
        const savedSettings = localStorage.getItem('bossCubeSettings');
        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            settings = { ...settings, ...parsed };
            log('Settings loaded from storage', 'info');
        }
    } catch (error) {
        log('Failed to load settings, using defaults', 'warning');
    }
}

// Save settings to localStorage
function saveSettings() {
    try {
        localStorage.setItem('bossCubeSettings', JSON.stringify(settings));
        log('Settings saved to storage', 'success');
    } catch (error) {
        log('Failed to save settings', 'error');
    }
}

function initializeThemeToggle() {
    const btn = document.getElementById('themeToggleBtn');
    const saved = localStorage.getItem('bossCubeTheme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        btn.textContent = '☀️';
    }
    btn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            btn.textContent = '🌙';
            localStorage.setItem('bossCubeTheme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            btn.textContent = '☀️';
            localStorage.setItem('bossCubeTheme', 'dark');
        }
    });
}

function initializeSettingsModal() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const resetSettingsBtn = document.getElementById('resetSettingsBtn');
    
    // Settings form elements
    const prevParamCC = document.getElementById('prevParamCC');
    const nextParamCC = document.getElementById('nextParamCC');
    const pedalControlCC = document.getElementById('pedalControlCC');
    const footswitchRadios = document.querySelectorAll('input[name="footswitchPolarity"]');
    
    // Open settings modal
    settingsBtn.addEventListener('click', () => {
        loadSettingsIntoForm();
        populateDeviceSettings();
        settingsModal.style.display = 'flex';
    });
    
    // Close modal handlers
    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });
    
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });
    
    // Save settings
    saveSettingsBtn.addEventListener('click', () => {
        // Update settings object
        settings.pedalCCCodes.previousParameter = parseInt(prevParamCC.value);
        settings.pedalCCCodes.nextParameter = parseInt(nextParamCC.value);
        settings.pedalCCCodes.pedalControl = parseInt(pedalControlCC.value);
        
        // Get selected footswitch polarity
        const selectedPolarity = document.querySelector('input[name="footswitchPolarity"]:checked');
        if (selectedPolarity) {
            settings.footswitchPolarity = selectedPolarity.value;
        }
        
        // Save to localStorage
        saveSettings();
        
        // Apply settings to controller if connected
        if (bossCubeController) {
            applySettingsToController();
        }
        
        // Close modal
        settingsModal.style.display = 'none';
        
        log('Settings saved and applied', 'success');
    });
    
    // Reset to defaults
    resetSettingsBtn.addEventListener('click', () => {
        if (confirm('Reset all settings to defaults? This cannot be undone.')) {
            settings = {
                pedalCCCodes: {
                    previousParameter: 80,
                    nextParameter: 81,
                    pedalControl: 127
                },
                footswitchPolarity: 'normally_open'
            };
            
            loadSettingsIntoForm();
            saveSettings();
            
            if (bossCubeController) {
                applySettingsToController();
            }
            
            log('Settings reset to defaults', 'info');
        }
    });
    
    // Load current settings into form
    function loadSettingsIntoForm() {
        prevParamCC.value = settings.pedalCCCodes.previousParameter;
        nextParamCC.value = settings.pedalCCCodes.nextParameter;
        pedalControlCC.value = settings.pedalCCCodes.pedalControl;
        
        // Set footswitch polarity radio
        footswitchRadios.forEach(radio => {
            radio.checked = radio.value === settings.footswitchPolarity;
        });
    }
}

const DEVICE_SETTINGS_GROUPS = {
    settingsNoiseSuppControls:    ['noiseSuppMicInst', 'noiseSuppGuitarMic', 'noiseSuppAuxBt'],
    settingsDuckingControls:      ['auxInDucking', 'auxInDuckingLevel'],
    settingsConnectivityControls: ['iCubeLinkLoopback', 'usbAudioLoopback', 'applyPanelCondition', 'stereoLinkMode', 'stereoInputMode', 'bleDeviceId'],
    settingsFootSWControls:       ['footSW1Tip', 'footSW1Ring', 'footSW2Tip', 'footSW2Ring'],
    settingsAudioControls:        ['audioOutputMute'],
};

function populateDeviceSettings() {
    const section = document.getElementById('deviceSettingsSection');
    const connected = bossCubeController && bossCubeController.isCubeConnected;
    section.style.display = connected ? '' : 'none';
    if (!connected) return;

    for (const [containerId, paramKeys] of Object.entries(DEVICE_SETTINGS_GROUPS)) {
        const container = document.getElementById(containerId);
        if (!container) continue;
        container.innerHTML = '';

        for (const key of paramKeys) {
            const param = bossCubeController.parameters[key];
            if (!param) continue;

            const row = document.createElement('div');
            row.className = 'settings-param-row';
            row.dataset.paramKey = key;

            const label = document.createElement('label');
            label.textContent = param.name;
            row.appendChild(label);

            if (param.valueLabels && Array.isArray(param.valueLabels) && (param.max - param.min) <= 5) {
                const btnGroup = document.createElement('div');
                btnGroup.className = 'settings-btn-group';
                for (let v = param.min; v <= param.max; v++) {
                    const btn = document.createElement('button');
                    btn.className = 'btn-small settings-option-btn';
                    btn.textContent = param.valueLabels[v] ?? v;
                    btn.dataset.value = v;
                    if (v === param.current) btn.classList.add('active');
                    btn.addEventListener('click', async () => {
                        btnGroup.querySelectorAll('.settings-option-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        await bossCubeController.setParameter(key, v);
                    });
                    btnGroup.appendChild(btn);
                }
                row.appendChild(btnGroup);
            } else {
                const slider = document.createElement('input');
                slider.type = 'range';
                slider.min = param.min;
                slider.max = param.max;
                slider.value = param.current;
                slider.className = 'settings-slider';

                const formatValue = param.displayValue || (v => v);
                const valueDisplay = document.createElement('span');
                valueDisplay.className = 'settings-value';
                valueDisplay.textContent = formatValue(param.current);

                slider.addEventListener('input', async () => {
                    const val = parseInt(slider.value, 10);
                    valueDisplay.textContent = formatValue(val);
                    await bossCubeController.setParameter(key, val);
                });

                row.appendChild(slider);
                row.appendChild(valueDisplay);
            }

            container.appendChild(row);
        }
    }
}

function updateDeviceSettingDisplay(paramKey, value) {
    const row = document.querySelector(`#deviceSettingsSection .settings-param-row[data-param-key="${paramKey}"]`);
    if (!row) return;

    const btnGroup = row.querySelector('.settings-btn-group');
    if (btnGroup) {
        btnGroup.querySelectorAll('.settings-option-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.value, 10) === value);
        });
        return;
    }

    const slider = row.querySelector('.settings-slider');
    const valueDisplay = row.querySelector('.settings-value');
    if (slider) slider.value = value;
    if (valueDisplay) {
        const param = bossCubeController?.parameters[paramKey];
        const formatValue = param?.displayValue || (v => v);
        valueDisplay.textContent = formatValue(value);
    }
}

// Apply current settings to the controller
function applySettingsToController() {
    if (!bossCubeController) return;
    
    // Apply pedal CC codes
    bossCubeController.setPedalCCCodes(
        settings.pedalCCCodes.previousParameter,
        settings.pedalCCCodes.nextParameter,
        settings.pedalCCCodes.pedalControl
    );
    
    // Apply footswitch polarity
    bossCubeController.setFootswitchPolarity(settings.footswitchPolarity);
    
    log(`Settings applied: CC codes [${settings.pedalCCCodes.previousParameter}, ${settings.pedalCCCodes.nextParameter}, ${settings.pedalCCCodes.pedalControl}], Polarity: ${settings.footswitchPolarity}`, 'info');
}

// Wake Lock Functions
function initializeWakeLock() {
    // Check if wake lock is supported
    wakeLockSupported = 'wakeLock' in navigator;
    
    if (!wakeLockSupported) {
        log('⚠️ Screen Wake Lock API not supported (requires modern browser + HTTPS)', 'warning');
        return;
    }
    
    // Set up visibility change listener to re-acquire wake lock
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Automatically acquire wake lock on app start
    acquireWakeLock();
    
    log('📱 Screen Wake Lock initialized - keeping screen active automatically', 'success');
}



async function acquireWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        
        wakeLock.addEventListener('release', () => {
            log('📱 Screen wake lock released - screen can now turn off', 'info');
            wakeLock = null;
        });
        
        log('📱 Screen wake lock active - screen will stay on during app use', 'success');
        
    } catch (error) {
        log(`❌ Failed to acquire wake lock: ${error.message}`, 'error');
        wakeLock = null;
    }
}

async function releaseWakeLock() {
    if (wakeLock) {
        try {
            await wakeLock.release();
            wakeLock = null;
            log('📱 Screen wake lock disabled - screen can now turn off normally', 'info');
        } catch (error) {
            log(`❌ Failed to release wake lock: ${error.message}`, 'error');
        }
    }
}



async function handleVisibilityChange() {
    if (document.hidden) {
        await releaseWakeLock();
    } else {
        await acquireWakeLock();
    }
} 

/**
 * Set up monitoring for looper control changes to ensure Live Performance sync
 */
function setupLooperControlMonitoring() {
    let lastLooperControlValue = bossCubeController.parameters.looperControl.current;
    
    // Poll for looper control changes every 100ms during Live Performance mode
    setInterval(() => {
        if (livePerformance && livePerformance.isActive) {
            const currentValue = bossCubeController.parameters.looperControl.current;
            if (currentValue !== lastLooperControlValue) {
                livePerformance.updateLivePerformanceDisplay('looperControl', currentValue);
                lastLooperControlValue = currentValue;
            }
        } else {
            // Update the last known value when not in Live Performance mode
            lastLooperControlValue = bossCubeController.parameters.looperControl.current;
        }
    }, 100);
}

// Live Performance Mode functionality moved to live-performance.js 