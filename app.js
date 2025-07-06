// Boss Cube Web Control - Full Mixer Interface
// Complete parameter control with dual Bluetooth support

const APP_VERSION = '2.13.2';

let bossCubeController = null;
let currentParameterKey = 'masterVolume';
let pedalExpression = 64; // Current pedal expression value (0-127)

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

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Get UI elements
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
    
    // Initialize controller
    bossCubeController = new BossCubeController();
    
    // Set up event listeners
    setupEventListeners();
    
    // Create parameter controls
    createParameterControls();
    
    // Select initial parameter
    selectParameter(currentParameterKey);
    
    // Enable pedal connection independently
    if (BossCubeController.isSupported()) {
        connectPedalBtn.disabled = false;
    }
    
    // Initialize version checking and updates
    initializeVersioning();
    
    log(`Boss Cube Web Control v${APP_VERSION} initialized`, 'success');
});

function initializeVersioning() {
    // Display current version
    if (versionTextEl) {
        versionTextEl.textContent = `v${APP_VERSION}`;
    }
    
    // Set up refresh button handler
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            try {
                refreshBtn.disabled = true;
                refreshBtn.textContent = '🔄 Updating...';
                
                // Force service worker update
                if ('serviceWorker' in navigator) {
                    const registration = await navigator.serviceWorker.getRegistration();
                    if (registration) {
                        await registration.update();
                        // Force page reload after update
                        window.location.reload();
                    }
                }
            } catch (error) {
                console.error('Update failed:', error);
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 Update Available';
            }
        });
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

function createParameterControls() {
    // Clear existing controls
    mixerControlsEl.innerHTML = '';
    effectsControlsEl.innerHTML = '';
    
    // Create mixer controls
    const mixerParams = bossCubeController.getParametersByCategory('mixer');
    Object.entries(mixerParams).forEach(([key, param]) => {
        const control = createParameterControl(param, key);
        mixerControlsEl.appendChild(control);
    });
    
    // Create effects controls
    const effectsParams = bossCubeController.getParametersByCategory('effects');
    Object.entries(effectsParams).forEach(([key, param]) => {
        const control = createParameterControl(param, key);
        effectsControlsEl.appendChild(control);
    });
}

function createParameterControl(param, key) {
    const control = document.createElement('div');
    control.className = 'parameter-control';
    control.setAttribute('data-param-key', key);
    
    // Create the interactive structure with visual fill
    control.innerHTML = `
        <div class="parameter-fill" data-param-key="${key}"></div>
        <div class="parameter-pedal-position" data-param-key="${key}"></div>
        <div class="parameter-label">${param.name}</div>
        <input type="range" 
               class="parameter-slider" 
               min="${param.min}" 
               max="${param.max}" 
               value="${param.current}"
               data-param-key="${key}"
               aria-label="${param.name}">
        <div class="parameter-value">${param.current}/${param.max}</div>
    `;
    
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
        valueDisplay.textContent = `${value}/${param.max}`;
        
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
    
    // Update value display and slider immediately (these are less expensive)
    const newText = `${value}/${param.max}`;
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
        
        // Enable read values button
        readValuesBtn.disabled = false;
        
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
        
        // Disable read values button
        readValuesBtn.disabled = true;
        
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
    try {
        log('📖 Reading current values from Boss Cube...', 'info');
        
        // Show status during reading
        statusEl.textContent = 'Reading current values...';
        statusEl.className = 'status info';
        
        // Read all mixer values first (most important for live use)
        await bossCubeController.readAllMixerValues();
        
        // Small delay to allow responses to come in
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Also read key effects parameters
        try {
            await bossCubeController.readParameter('guitarReverbLevel');
            await new Promise(resolve => setTimeout(resolve, 200));
            await bossCubeController.readParameter('guitarReverbTime');
            await new Promise(resolve => setTimeout(resolve, 200));
            await bossCubeController.readParameter('guitarChorusLevel');
        } catch (error) {
            console.log('Failed to read some effects parameters:', error);
        }
        
        statusEl.textContent = 'Boss Cube Connected';
        statusEl.className = 'status success';
        
        log('✅ Current values read from Boss Cube', 'success');
        
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
    if (!bossCubeController.isCubeConnected) {
        log('Boss Cube not connected - cannot read values', 'error');
        return;
    }
    
    try {
        readValuesBtn.disabled = true;
        readValuesBtn.textContent = '🔄 Reload Values';
        
        log('🔄 Reloading all parameter values from Boss Cube...', 'info');
        
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
    
    // Reset pickup mode when physical knob changes are detected
    if (isPhysicalKnobChange && paramKey === currentParameterKey && pickupMode.active) {
        pickupMode.active = false;
        updatePickupModeVisuals(paramKey, false);
        pickupMode.controlValue = value;
        bossCubeController.disablePickupMode();
        log(`🎛️ Physical knob change detected - pickup mode reset`, 'info');
    }
}