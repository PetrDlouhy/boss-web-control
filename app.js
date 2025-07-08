// Boss Cube Web Control - Full Mixer Interface
// Complete parameter control with dual Bluetooth support

import BossCubeController from './boss-cube-controller.js';
import TemplateLoader from './template-loader.js';

const VERSION = '2.22.16-alpha.4';

let bossCubeController = null;
let templateLoader = null;
let currentParameterKey = 'masterVolume';
let pedalExpression = 64; // Current pedal expression value (0-127)

// Screen Wake Lock
let wakeLock = null;
let wakeLockSupported = false;

// Pickup mode state
let pickupMode = {
    active: false,
    pedalValue: 0,
    controlValue: 0,
    threshold: 3, // Pickup threshold in parameter units for capture
    activationThreshold: 15 // Activation threshold as percentage for new parameter selection
};

// UI Elements
let statusEl, pedalStatusEl, logEl;
let connectBtn, connectPedalBtn, debugBtn, readValuesBtn;
let mixerControlsEl, effectsControlsEl;
let versionTextEl, refreshBtn;

// Tuner state
let tunerEnabled = false;

// Master Out binding state
let masterBindEnabled = false;
let masterBindControl, masterBindInfoIcon;
let bindInfoOverlay, bindInfoPopup;

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
document.addEventListener('DOMContentLoaded', async function() {
    // Get DOM elements
    statusEl = document.getElementById('status');
    pedalStatusEl = document.getElementById('pedalStatus');
    logEl = document.getElementById('log');
    connectBtn = document.getElementById('connectBtn');
    connectPedalBtn = document.getElementById('connectPedalBtn');
    debugBtn = document.getElementById('debugBtn');
    readValuesBtn = document.getElementById('readValuesBtn');
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
    
    // Initialize settings modal
    initializeSettingsModal();
    
    // Set up event listeners (removed duplicate connectBtn listener)
    
    refreshBtn.addEventListener('click', () => {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            // Clear browser cache and reload aggressively
            if ('caches' in window) {
                caches.keys().then(names => {
                    names.forEach(name => {
                        console.log('Clearing cache:', name);
                        caches.delete(name);
                    });
                });
            }
            
            navigator.serviceWorker.controller.postMessage({ action: 'skipWaiting' });
            
            // Force reload with cache bypass
            setTimeout(() => {
                window.location.reload(true);
            }, 100);
        } else {
            // Fallback: force reload with cache bypass
            window.location.reload(true);
        }
    });
    
    // Initialize controller and template loader
    bossCubeController = new BossCubeController();
    templateLoader = new TemplateLoader();
    
    // Apply current settings to controller
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
    
    // Load settings from localStorage
    loadSettings();
    
    // Initialize wake lock
    initializeWakeLock();
    
    log(`Boss Cube Web Control v${VERSION} initialized`, 'success');
});

function initializeVersioning() {
    // Display current version
    if (versionTextEl) {
        versionTextEl.textContent = `v${VERSION}`;
    }
    
    // Register service worker and check for updates
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('Service Worker registered:', registration);
                
                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // New version available
                                if (refreshBtn) {
                                    refreshBtn.style.display = 'inline-block';
                                    refreshBtn.textContent = '🔄 Update Available';
                                }
                                log('🔄 New version available - click Update Available to refresh', 'info');
                            }
                        });
                    }
                });
                
                // Listen for controlling service worker changes
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    window.location.reload();
                });
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });
    }
}

function setupEventListeners() {
    // Connection buttons
    connectBtn.addEventListener('click', handleBossCubeButton);
    connectPedalBtn.addEventListener('click', handlePedalUIButton);
    debugBtn.addEventListener('click', runDebugSequence);
    readValuesBtn.addEventListener('click', readValuesFromCube);
    
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
    
    // Set up master bind check callback
    bossCubeController.checkMasterBindEnabled = () => {
        return masterBindEnabled;
    };
}

function handlePedalVolumeChange(event) {
    const { value, pedalValue, parameter, parameterKey } = event;
    
    // Store previous pedal value to detect crossing
    const previousPedalValue = pickupMode.pedalValue;
    
    // Update pickup mode state
    pickupMode.pedalValue = value;
    
    // Don't update control value from parameter.current - keep the actual UI control value
    // Only update if we don't have a control value yet
    if (pickupMode.controlValue === 0) {
        pickupMode.controlValue = parameter.current;
    }
    
    // If we're not in pickup mode, update control value immediately to prevent false activation
    if (!pickupMode.active) {
        pickupMode.controlValue = value;
    }
    
    // Check if we need to enter pickup mode
    const valueDifference = Math.abs(pickupMode.pedalValue - pickupMode.controlValue);
    
    if (!pickupMode.active && valueDifference > pickupMode.threshold) {
        // Enter pickup mode - pedal and control positions don't match
        pickupMode.active = true;
        updatePickupModeVisuals(parameterKey, true);
        bossCubeController.enablePickupMode();
        log(`🎯 Pickup mode activated`, 'info');
    } else if (pickupMode.active) {
        // Check if we should exit pickup mode
        const shouldExit = valueDifference <= pickupMode.threshold || 
                          hasCrossedTarget(previousPedalValue, pickupMode.pedalValue, pickupMode.controlValue);
        
        if (shouldExit) {
            // Exit pickup mode - pedal has reached control position or crossed it
            pickupMode.active = false;
            updatePickupModeVisuals(parameterKey, false);
            bossCubeController.disablePickupMode();
            log(`✅ Pickup mode deactivated`, 'success');
        }
    }
    
    if (pickupMode.active) {
        // In pickup mode - update pedal position indicator but don't change parameter
        updatePedalPositionIndicator(parameterKey, value);
        
        // Don't update the parameter value or send to Boss Cube while in pickup mode
        // Just update the visual pedal indicator
    } else {
        // Normal mode - update parameter value
    updateParameterDisplayFast(parameterKey, value);
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
        bossCubeController.disablePickupMode();
    }
    
    // Initialize pickup mode state for the new parameter
    pickupMode.controlValue = parameter.current;
    // Keep existing pedal value and check if pickup mode should be activated
    if (pickupMode.pedalValue !== 0) {
        const valueDifference = Math.abs(pickupMode.pedalValue - pickupMode.controlValue);
        const percentageDifference = (valueDifference / parameter.max) * 100;
        if (percentageDifference > pickupMode.activationThreshold) {
            pickupMode.active = true;
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
    // Guitar effect buttons (first effect-buttons container)
    const guitarEffectContainer = document.querySelector('.effects-section .effect-buttons');
    const guitarEffectButtons = guitarEffectContainer.querySelectorAll('.effect-btn');
    
    // Mic/Inst effect buttons (fourth effect-buttons container)
    const micInstEffectContainer = document.querySelectorAll('.effects-section .effect-buttons')[1];
    const micInstEffectButtons = micInstEffectContainer.querySelectorAll('.effect-btn');
    
    guitarEffectButtons.forEach((button) => {
        button.addEventListener('click', async (e) => {
            const effectType = e.target.getAttribute('data-effect');
            try {
                await bossCubeController.switchGuitarEffect(effectType);
                updateGuitarEffectControls();
                updateGuitarEffectButtonHighlight(effectType);
                log(`Switched to guitar effect: ${effectType}`, 'info');
            } catch (error) {
                log(`Failed to switch guitar effect: ${error.message}`, 'error');
            }
        });
    });
    
    micInstEffectButtons.forEach((button) => {
        button.addEventListener('click', async (e) => {
            const effectType = e.target.getAttribute('data-effect');
            await bossCubeController.switchMicInstEffect(effectType);
            updateMicInstEffectControls();
            updateMicInstEffectButtonHighlight(effectType);
            log(`Switched to mic/inst effect: ${effectType}`, 'info');
        });
    });
    
    // Set initial highlights
    updateGuitarEffectButtonHighlight(bossCubeController.currentGuitarEffect);
    updateMicInstEffectButtonHighlight(bossCubeController.currentMicInstEffect);
}

async function updateGuitarEffectControls() {
    const container = document.getElementById('guitarEffectControls');
    if (!container) return;
    
    container.innerHTML = '';
    const effectParams = bossCubeController.getCurrentGuitarEffectParameters();
    
    for (const [key, param] of Object.entries(effectParams)) {
        const control = await createParameterControl(param, key);
        container.appendChild(control);
    }
}

async function updateMicInstEffectControls() {
    const container = document.getElementById('micInstEffectControls');
    if (!container) return;
    
    container.innerHTML = '';
    const effectParams = bossCubeController.getCurrentMicInstEffectParameters();
    
    for (const [key, param] of Object.entries(effectParams)) {
        const control = await createParameterControl(param, key);
        container.appendChild(control);
    }
}

async function updateReverbDelayControls() {
    // Guitar Delay
    const guitarDelayContainer = document.getElementById('guitarDelayControls');
    if (guitarDelayContainer) {
        guitarDelayContainer.innerHTML = '';
        const guitarDelayParams = bossCubeController.getParametersByCategory('guitarDelay');
        for (const [key, param] of Object.entries(guitarDelayParams)) {
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
            const control = await createParameterControl(param, key);
            reverbContainer.appendChild(control);
        }
    }
    
    // Reverb Levels (separate for Guitar and Mic/Inst)
    const reverbLevelsContainer = document.getElementById('reverbLevelsControls');
    if (reverbLevelsContainer) {
        reverbLevelsContainer.innerHTML = '';
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
    
    // Create the looper control UI
    const looperControl = bossCubeController.parameters.looperControl;
    if (!looperControl) return;
    
    // Looper buttons with icons and descriptive labels
    const looperButtons = [
        { icon: '⏹️', title: 'Erase Loop', label: 'Erase' },      // 0
        { icon: '⏸️', title: 'Paused', label: 'Paused' },         // 1  
        { icon: '🔴', title: 'Recording', label: 'Record' },      // 2
        { icon: '▶️', title: 'Playing', label: 'Play' },          // 3
        { icon: '🔄', title: 'Overdub', label: 'Overdub' },       // 4
        { icon: '⏯️', title: 'Standby', label: 'Standby' }        // 5
    ];
    
    try {
        const buttonsHTML = looperButtons.map((btn, index) => `
            <button class="looper-btn-improved ${looperControl.current === index ? 'active' : ''}" 
                    data-value="${index}" 
                    data-looper-value="${index}"
                    title="${btn.title}">
                <div class="looper-icon">${btn.icon}</div>
                <div class="looper-label">${btn.label}</div>
            </button>
        `).join('');
        
        const looperHTML = await templateLoader.renderTemplate('templates/looper-controls.html', {
            LOOPER_BUTTONS: buttonsHTML
        });
        
        container.innerHTML = looperHTML;
    } catch (error) {
        console.error('Failed to load looper controls template:', error);
        // Fallback to basic content
        container.innerHTML = '<div class="error">Failed to load looper controls</div>';
        return;
    }
    
    // Set up looper buttons with improved styling
    const looperBtns = container.querySelectorAll('.looper-btn-improved');
    looperBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!bossCubeController.isCubeConnected) {
                log('Boss Cube not connected - cannot control looper', 'error');
                return;
            }
            
                        // Get the button element (in case we clicked on inner div)
            const button = e.target.closest('.looper-btn-improved');
            const value = parseInt(button.getAttribute('data-looper-value'));
            
            try {
                await bossCubeController.setParameter('looperControl', value);
                
                // Update parameter value locally for immediate UI response
                looperControl.current = value;
                
                // Update button visual state immediately
                const allLooperBtns = container.querySelectorAll('.looper-btn-improved');
                allLooperBtns.forEach((btn, index) => {
                    if (index === value) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
                
                const actionName = button.getAttribute('title');
                log(`🔁 Looper: ${actionName}`, 'success');
            } catch (error) {
                log(`Failed to control looper: ${error.message}`, 'error');
            }
        });
    });
    
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
}

async function updateLooperSettingsControls() {
    const container = document.getElementById('looperSettings');
    if (!container) return;
    
    const looperSettings = [
        { 
            key: 'looperMicInstAssign', 
            id: 'looperMicInstBtn',
            icon: '🎤', 
            label: 'Mic/Inst',
            title: 'Include Mic/Inst input in loop'
        },
        { 
            key: 'looperGuitarMicAssign', 
            id: 'looperGuitarBtn',
            icon: '🎸', 
            label: 'Guitar',
            title: 'Include Guitar input in loop'
        },
        { 
            key: 'looperReverbAssign', 
            id: 'looperReverbBtn',
            icon: '🌊', 
            label: 'Reverb',
            title: 'Include reverb effects in loop'
        },
        { 
            key: 'looperICubeLinkAssign', 
            id: 'looperAuxBtn',
            icon: '🔗', 
            label: 'Aux/BT',
            title: 'Include I-Cube Link/Aux/BT in loop'
        }
    ];
    
    try {
        const buttonsHTML = looperSettings.map(({ key, id, icon, label, title }) => {
            const param = bossCubeController.parameters[key];
            if (!param) return '';
            
            const isActive = param.current === 1;
            let statusText = '';
            
            // Only show status text for Rec Time, others rely on color
            if (key === 'looperRecTime') {
                statusText = isActive ? 'Long (90s/Mono)' : 'Normal (45s/Stereo)';
            }
            
            return `
                <button id="${id}" 
                        class="toggle-btn-improved ${isActive ? 'active' : ''}" 
                        data-param="${key}"
                        title="${title}">
                    <div class="toggle-icon">${icon}</div>
                    <div class="toggle-label">${label}</div>
                    ${statusText ? `<div class="toggle-status">${statusText}</div>` : ''}
                </button>
            `;
        }).join('');
        
        const settingsHTML = await templateLoader.renderTemplate('templates/looper-settings.html', {
            LOOPER_SETTING_BUTTONS: buttonsHTML
        });
        
        container.innerHTML = settingsHTML;
    } catch (error) {
        console.error('Failed to load looper settings template:', error);
        // Fallback to basic content
        container.innerHTML = '<div class="error">Failed to load looper settings</div>';
        return;
    }
    
    // Set up toggle buttons with proper cleanup and debouncing
    setupLooperToggleButtons();
    
    // Set up settings modal handlers
    setupLooperSettingsModal();
}

function setupLooperToggleButtons() {
    const container = document.getElementById('looperSettings');
    if (!container) return;
    
    const toggleButtons = container.querySelectorAll('.toggle-btn-improved');
    
    toggleButtons.forEach(button => {
        // Remove any existing event listeners by cloning the button
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        const paramKey = newButton.getAttribute('data-param');
        const param = bossCubeController.parameters[paramKey];
        
        if (!param) return;
        
        // Add debounced click handler
        let isProcessing = false;
        newButton.addEventListener('click', async () => {
            if (isProcessing) return; // Prevent rapid clicks
            
            if (!bossCubeController.isCubeConnected) {
                log('Boss Cube not connected - cannot change looper settings', 'error');
                return;
            }
            
            isProcessing = true;
            newButton.disabled = true;
            
            try {
                // Toggle the value (0 -> 1, 1 -> 0)
                const newValue = param.current === 0 ? 1 : 0;
                
                // Send to Boss Cube
                await bossCubeController.setParameter(paramKey, newValue);
                
                // Update parameter value locally for immediate UI response
                param.current = newValue;
                
                // Update button visual state immediately
                if (newValue === 1) {
                    newButton.classList.add('active');
        } else {
                    newButton.classList.remove('active');
                }
                
                // Update button text to reflect new state (only for Rec Time)
                if (paramKey === 'looperRecTime') {
                    const statusText = newValue === 1 ? 'Long (90s/Mono)' : 'Normal (45s/Stereo)';
                    const statusElement = newButton.querySelector('.toggle-status');
                    if (statusElement) {
                        statusElement.textContent = statusText;
                    }
                }
                
                const settingName = getSettingDisplayName(paramKey);
                const stateName = newValue === 1 ? 'On' : 'Off';
                log(`🔧 ${settingName} ${stateName}`, 'success');
                
            } catch (error) {
                log(`Failed to update looper setting: ${error.message}`, 'error');
            } finally {
                isProcessing = false;
                newButton.disabled = false;
            }
        });
    });
}

// Function removed - looper settings now use automatic UI updates via updateParameterDisplayFromCube

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

function getSettingDisplayName(paramKey) {
    switch(paramKey) {
        case 'looperRecTime': return 'Rec Time';
        case 'looperMicInstAssign': return 'Mic/Inst';
        case 'looperGuitarMicAssign': return 'Guitar';
        case 'looperReverbAssign': return 'Reverb';
        case 'looperICubeLinkAssign': return 'Aux/BT';
        default: return paramKey;
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
    const container = document.getElementById('tunerControls');
    if (!container) return;
    
    container.innerHTML = '';
    const tunerParams = bossCubeController.getParametersByCategory('tuner');
    
    for (const [key, param] of Object.entries(tunerParams)) {
        const control = await createParameterControl(param, key);
        container.appendChild(control);
    }
    
    // Set up the new tuner toggle button
    const tunerToggleBtn = document.getElementById('tunerToggleBtn');
    if (tunerToggleBtn) {
        // Remove any existing event listeners
        tunerToggleBtn.replaceWith(tunerToggleBtn.cloneNode(true));
        const newTunerToggleBtn = document.getElementById('tunerToggleBtn');
        
        // Enable the button if Boss Cube is connected
        if (bossCubeController.isCubeConnected) {
            newTunerToggleBtn.disabled = false;
        }
        
        // Update button text based on current state
        updateTunerButtonState();
        
        // Add click handler
        newTunerToggleBtn.addEventListener('click', toggleTuner);
    }
    
    // Set up frequency preset buttons
    setupTunerPresetButtons();
    
    // Set up key preset buttons
    setupTunerKeyButtons();
    
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
    const tunerStatus = document.getElementById('tunerStatus');
    const tunerVisual = document.getElementById('tunerVisual');
    
    if (tunerStatus) {
        if (tunerEnabled) {
            tunerStatus.textContent = '🎵 Tuner Listening...';
            tunerStatus.className = 'tuner-status listening';
        } else {
            tunerStatus.textContent = 'Tuner Off';
            tunerStatus.className = 'tuner-status off';
        }
    }
    
    if (tunerVisual) {
        if (tunerEnabled) {
            tunerVisual.classList.add('active');
        } else {
            tunerVisual.classList.remove('active');
        }
    }
}

function setupTunerPresetButtons() {
    const presetButtons = document.querySelectorAll('.tuner-preset-btn');
    
    presetButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            const frequency = parseInt(e.target.getAttribute('data-freq'));
            const pitchValue = frequency - 435; // Convert to parameter value (0-10)
            
            if (!bossCubeController.isCubeConnected) {
                log('Boss Cube not connected - cannot set tuner frequency', 'error');
                return;
            }
            
            try {
                // Update parameter
                await bossCubeController.setParameter('tunerPitch', pitchValue);
                
                // Update visual display
                updateTunerVisualDisplay();
                
                // Update button states
                presetButtons.forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                
                log(`🎵 Tuner frequency set to ${frequency}Hz`, 'success');
                
            } catch (error) {
                log(`Failed to set tuner frequency: ${error.message}`, 'error');
            }
        });
    });
}

function setupTunerKeyButtons() {
    const keyButtons = document.querySelectorAll('.tuner-key-btn');
    
    keyButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            const keyValue = parseInt(e.target.getAttribute('data-key'));
            
            if (!bossCubeController.isCubeConnected) {
                log('Boss Cube not connected - cannot set tuner key', 'error');
                return;
            }
            
            try {
                // Update parameter
                await bossCubeController.setParameter('tunerManualKey', keyValue);
                
                // Update visual display
                updateTunerVisualDisplay();
                
                // Update button states
                keyButtons.forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                
                const keyName = e.target.textContent;
                log(`🎵 Tuner reference key set to ${keyName}`, 'success');
                
            } catch (error) {
                log(`Failed to set tuner key: ${error.message}`, 'error');
            }
        });
    });
}

function updateTunerVisualDisplay() {
    const frequencyDisplay = document.getElementById('tunerFrequencyDisplay');
    const noteDisplay = document.getElementById('tunerNoteDisplay');
    
    if (frequencyDisplay && bossCubeController.parameters.tunerPitch) {
        const pitchParam = bossCubeController.parameters.tunerPitch;
        const frequency = pitchParam.current + 435; // Convert from parameter value
        frequencyDisplay.textContent = `${frequency}Hz`;
    }
    
    if (noteDisplay && bossCubeController.parameters.tunerManualKey) {
        const keyParam = bossCubeController.parameters.tunerManualKey;
        const keyLabels = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        noteDisplay.textContent = keyLabels[keyParam.current] || 'A';
    }
    
    // Update preset button states to match current values
    updateTunerPresetStates();
    updateTunerKeyStates();
}

function updateTunerPresetStates() {
    const presetButtons = document.querySelectorAll('.tuner-preset-btn');
    const currentFreq = bossCubeController.parameters.tunerPitch?.current + 435;
    
    presetButtons.forEach(button => {
        const buttonFreq = parseInt(button.getAttribute('data-freq'));
        if (buttonFreq === currentFreq) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

function updateTunerKeyStates() {
    const keyButtons = document.querySelectorAll('.tuner-key-btn');
    const currentKey = bossCubeController.parameters.tunerManualKey?.current;
    
    keyButtons.forEach(button => {
        const buttonKey = parseInt(button.getAttribute('data-key'));
        if (buttonKey === currentKey) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
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

async function createParameterControl(param, key) {
    const control = document.createElement('div');
    control.className = 'parameter-control';
    control.setAttribute('data-param-key', key);
    
    // Get initial display value
    let initialDisplayValue;
    if (param.valueLabels && param.valueLabels[param.current] !== undefined) {
        initialDisplayValue = param.valueLabels[param.current];
    } else if (param.displayValue && typeof param.displayValue === 'function') {
        initialDisplayValue = param.displayValue(param.current);
    } else {
        initialDisplayValue = `${param.current}/${param.max}`;
    }
    
    try {
        const paramHTML = await templateLoader.renderTemplate('templates/parameter-control.html', {
            PARAM_KEY: key,
            PARAM_NAME: param.name,
            PARAM_VALUE: initialDisplayValue,
            PARAM_MIN: param.min,
            PARAM_MAX: param.max,
            PARAM_CURRENT: param.current
        });
        control.innerHTML = paramHTML;
    } catch (error) {
        console.error('Failed to load parameter control template:', error);
        control.innerHTML = '<div class="error">Template load failed</div>';
        throw error; // Re-throw to indicate critical failure
    }
    
    // Set initial visual fill
    updateParameterFill(key, param.current, param.min, param.max);
    
    // Add interaction handlers for the entire control
    addControlInteraction(control, key, param);
    
    // Add traditional slider handler for accessibility
    const slider = control.querySelector('.parameter-slider');
    slider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        updateParameterValue(key, value);
        updateParameterDisplay(key, value);
    });
    
    return control;
}

function addControlInteraction(control, key, param) {
    let isDragging = false;
    let holdTimer = null;
    let hasMovedDuringHold = false;
    let startPosition = null;
    
    const HOLD_DURATION = 800; // 800ms hold to select for pedal control
    const MOVEMENT_THRESHOLD = 10; // pixels of movement allowed during hold
    
    function startHoldTimer(initialEvent) {
        hasMovedDuringHold = false;
        startPosition = { x: initialEvent.clientX, y: initialEvent.clientY };
        
        holdTimer = setTimeout(() => {
            if (!hasMovedDuringHold && isDragging) {
                // Long hold without movement - select for pedal control
                selectParameter(key);
                log(`Selected for pedal control: ${param.name}`, 'info');
                
                // Optional: Add vibration feedback if supported
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
            }
        }, HOLD_DURATION);
    }
    
    function checkMovement(currentEvent) {
        if (startPosition) {
            const deltaX = Math.abs(currentEvent.clientX - startPosition.x);
            const deltaY = Math.abs(currentEvent.clientY - startPosition.y);
            
            if (deltaX > MOVEMENT_THRESHOLD || deltaY > MOVEMENT_THRESHOLD) {
                hasMovedDuringHold = true;
                if (holdTimer) {
                    clearTimeout(holdTimer);
                    holdTimer = null;
                }
            }
        }
    }
    
    function cleanup() {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
        isDragging = false;
        hasMovedDuringHold = false;
        startPosition = null;
    }
    
    // Handle mouse events
    control.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        handlePositionInput(e, control, key, param);
        startHoldTimer(e);
        
        // Add temporary mouse move and up listeners
        const handleMouseMove = (e) => {
            if (isDragging) {
                checkMovement(e);
                handlePositionInput(e, control, key, param);
            }
        };
        
        const handleMouseUp = () => {
            cleanup();
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });
    
    // Handle touch events
    control.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isDragging = true;
        handlePositionInput(e.touches[0], control, key, param);
        startHoldTimer(e.touches[0]);
    });
    
    control.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (isDragging) {
            checkMovement(e.touches[0]);
            handlePositionInput(e.touches[0], control, key, param);
        }
    });
    
    control.addEventListener('touchend', (e) => {
        e.preventDefault();
        cleanup();
    });
    
    // Prevent context menu on long press
    control.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
}

function handlePositionInput(event, control, key, param) {
    const rect = control.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const width = rect.width;
    
    // Calculate value based on position (left = min, right = max)
    const percentage = Math.max(0, Math.min(1, x / width));
    const value = Math.round(param.min + (param.max - param.min) * percentage);
    
    updateParameterValue(key, value);
    updateParameterDisplay(key, value);
    
    // Update the hidden slider for accessibility
    const slider = control.querySelector('.parameter-slider');
    slider.value = value;
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

// Unified visual update system using requestAnimationFrame for smooth rendering
let pendingAnimationUpdates = new Map();

function updateParameterFillFast(control, value, min, max) {
    const paramKey = control.getAttribute('data-param-key');
    
    // Store the update and use requestAnimationFrame for smooth rendering
    pendingAnimationUpdates.set(paramKey, { control, value, min, max });
    
    // Schedule animation frame update if not already scheduled
    if (pendingAnimationUpdates.size === 1) {
        requestAnimationFrame(processPendingAnimationUpdates);
    }
}

function processPendingAnimationUpdates() {
    for (const [paramKey, { control, value, min, max }] of pendingAnimationUpdates) {
        const fill = control.querySelector('.parameter-fill');
        const percentage = ((value - min) / (max - min)) * 100;
        
        // Always use width for consistency (no transform conflicts)
        // Reset any transform that might have been applied
        fill.style.transform = '';
        fill.style.width = `${percentage}%`;
    }
    
    // Clear pending updates
    pendingAnimationUpdates.clear();
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
    // Update visual selection
    const allControls = document.querySelectorAll('.parameter-control');
    
    allControls.forEach((control) => {
        const key = control.getAttribute('data-param-key');
        if (key === currentParameterKey) {
            control.classList.add('current');
            // Scroll to the mixer section containing this control
            const mixerSection = control.closest('.mixer-section');
            if (mixerSection) {
                mixerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else {
            control.classList.remove('current');
        }
    });
}

function updateParameterValue(key, value) {
    if (!bossCubeController.parameters[key]) return;
    
    const param = bossCubeController.parameters[key];
    
    // Clamp value to parameter range
    value = Math.max(param.min, Math.min(param.max, value));
    
    // Update pickup mode state when control is changed manually
    if (key === currentParameterKey) {
        pickupMode.controlValue = value;
        
        // If pedal position is significantly different, enter pickup mode
        if (!pickupMode.active && pickupMode.pedalValue !== 0) {
            const valueDifference = Math.abs(pickupMode.pedalValue - pickupMode.controlValue);
            const percentageDifference = (valueDifference / param.max) * 100;
            if (percentageDifference > pickupMode.activationThreshold) {
                pickupMode.active = true;
                updatePickupModeVisuals(key, true);
                bossCubeController.enablePickupMode();
                log(`🎯 Pickup mode activated`, 'info');
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
}

function updateParameterDisplay(key, value) {
    const control = document.querySelector(`[data-param-key="${key}"]`);
    if (control) {
        const slider = control.querySelector('.parameter-slider');
        const valueDisplay = control.querySelector('.parameter-value');
        const param = bossCubeController.parameters[key];
        
        slider.value = value;
        
        // Display meaningful labels or formatted values
        let displayText;
        if (param.valueLabels && param.valueLabels[value] !== undefined) {
            // Use value labels for discrete parameters
            displayText = param.valueLabels[value];
        } else if (param.displayValue && typeof param.displayValue === 'function') {
            // Use custom display function
            displayText = param.displayValue(value);
        } else {
            // Default numeric display
            displayText = `${value}/${param.max}`;
        }
        
        valueDisplay.textContent = displayText;
        
        // Update visual fill
        updateParameterFill(key, value, param.min, param.max);
        
        // Update internal parameter
        param.current = value;
    }
}

// Cache DOM elements for faster pedal updates
let cachedPedalElements = null;

function updateParameterDisplayFast(key, value) {
    // Cache elements on first use for the current parameter
    if (!cachedPedalElements || cachedPedalElements.key !== key) {
        const control = document.querySelector(`[data-param-key="${key}"]`);
        if (!control) return;
        
        cachedPedalElements = {
            key: key,
            control: control,
            fill: control.querySelector('.parameter-fill'),
            valueDisplay: control.querySelector('.parameter-value'),
            slider: control.querySelector('.parameter-slider'),
            param: bossCubeController.parameters[key]
        };
    }
    
    const { fill, valueDisplay, slider, param } = cachedPedalElements;
    
    // Update internal parameter immediately
    param.current = value;
    
    // Fast visual fill update using requestAnimationFrame
    const percentage = ((value - param.min) / (param.max - param.min)) * 100;
    pendingAnimationUpdates.set(key, { 
        control: cachedPedalElements.control, 
        value, 
        min: param.min, 
        max: param.max 
    });
    
    if (pendingAnimationUpdates.size === 1) {
        requestAnimationFrame(processPendingAnimationUpdates);
    }
    
    // Display meaningful labels or formatted values
    let newText;
    if (param.valueLabels && param.valueLabels[value] !== undefined) {
        // Use value labels for discrete parameters
        newText = param.valueLabels[value];
    } else if (param.displayValue && typeof param.displayValue === 'function') {
        // Use custom display function
        newText = param.displayValue(value);
    } else {
        // Default numeric display
        newText = `${value}/${param.max}`;
    }
    
    if (valueDisplay.textContent !== newText) {
        valueDisplay.textContent = newText;
    }
    
    // Update value display and slider immediately (these are less expensive)
    slider.value = value;
}

function updatePickupModeVisuals(key, active) {
    // Only show pickup mode visuals on the current parameter
    if (key === currentParameterKey) {
        const control = document.querySelector(`[data-param-key="${key}"]`);
        if (control) {
            if (active) {
                control.classList.add('pickup-mode');
                // Update pedal position indicator when entering pickup mode
                updatePedalPositionIndicator(key, pickupMode.pedalValue);
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

async function handleBossCubeButton() {
    if (bossCubeController.isCubeConnected) {
        await disconnectBossCube();
    } else {
        await connectToBossCube();
    }
}

async function handlePedalUIButton() {
    if (bossCubeController.isPedalConnected) {
        await disconnectPedal();
    } else {
        await connectToPedal();
    }
}

async function connectToBossCube() {
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
        
        // Read current values from Boss Cube instead of setting defaults
        await readCurrentValuesOnConnect();
        
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
    log(`🔍 DEBUG: [${connectCallId}] readCurrentValuesOnConnect() called during connection`, 'info');
    
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

async function runDebugSequence() {
    if (!bossCubeController.isCubeConnected) {
        log('Boss Cube not connected - debug requires Boss Cube', 'error');
        return;
    }
    
    try {
        debugBtn.disabled = true;
        debugBtn.textContent = 'Running Debug...';
        
        log('=== Debug Sequence Started ===', 'info');
        
        // Test all mixer parameters
        log('Testing mixer parameters...', 'info');
        const mixerParams = bossCubeController.getParametersByCategory('mixer');
        
        for (const [key, param] of Object.entries(mixerParams)) {
            const testValue = Math.round(param.max * 0.6); // 60%
            await bossCubeController.setParameter(key, testValue);
            updateParameterDisplay(key, testValue);
            log(`Set ${param.name} to ${testValue}/${param.max}`, 'success');
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Test effects parameters
        log('Testing effects parameters...', 'info');
        const effectsParams = bossCubeController.getParametersByCategory('effects');
        
        for (const [key, param] of Object.entries(effectsParams)) {
            // Send effect switch commands first
            if (param.effectSwitchCommands) {
                await bossCubeController.sendEffectSwitchCommands(param.effectSwitchCommands);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const testValue = Math.round(param.max * 0.7); // 70%
            await bossCubeController.setParameter(key, testValue);
            updateParameterDisplay(key, testValue);
            log(`Set ${param.name} to ${testValue}/${param.max}`, 'success');
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        log('=== Debug Sequence Complete ===', 'success');
        
    } catch (error) {
        log(`Debug sequence error: ${error.message}`, 'error');
    } finally {
        debugBtn.disabled = false;
        debugBtn.textContent = 'Run Debug';
    }
}

function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `<span class="timestamp">${timestamp}</span>${message}`;
    
    logEl.appendChild(logEntry);
    logEl.scrollTop = logEl.scrollHeight;
    
    // Keep only last 100 entries
    while (logEl.children.length > 100) {
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
    log(`🔍 DEBUG: [${buttonCallId}] readValuesFromCube() called from UI button`, 'info');
    
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
    // Update the parameter display when Boss Cube sends us a value
    updateParameterDisplay(paramKey, value);
    
    // Handle special controls that need custom updates
    if (paramKey === 'looperControl') {
        // Fire and forget - just update the UI asynchronously
        updateLooperControls().catch(error => {
            console.error('Failed to update looper controls UI:', error);
        });
    }
    
    // Handle looper settings toggle buttons - regenerate the UI to show updated values
    const looperSettingParams = ['looperRecTime', 'looperMicInstAssign', 'looperGuitarMicAssign', 'looperReverbAssign', 'looperICubeLinkAssign'];
    if (looperSettingParams.includes(paramKey)) {
        // Fire and forget - just update the UI asynchronously
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
        pickupMode.controlValue = value;
        bossCubeController.disablePickupMode();
        log(`🎛️ Physical knob change detected - pickup mode reset`, 'info');
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

function updateGuitarEffectButtonHighlight(activeEffect) {
    const guitarEffectContainer = document.querySelector('.effects-section .effect-buttons');
    const buttons = guitarEffectContainer.querySelectorAll('.effect-btn');
    
    buttons.forEach(button => {
        if (button.getAttribute('data-effect') === activeEffect) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

function updateMicInstEffectButtonHighlight(activeEffect) {
    const micInstEffectContainer = document.querySelectorAll('.effects-section .effect-buttons')[1];
    const buttons = micInstEffectContainer.querySelectorAll('.effect-btn');
    
    buttons.forEach(button => {
        if (button.getAttribute('data-effect') === activeEffect) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

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
    if (wakeLock !== null && document.visibilityState === 'visible') {
        // Re-acquire wake lock when page becomes visible again
        await acquireWakeLock();
    }
} 