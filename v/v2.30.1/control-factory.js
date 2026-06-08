/**
 * Shared control factory for creating parameter UI controls.
 * Used by both app.js (main mixer) and live-performance.js.
 */
import { INTERACTION } from './constants.js';

// ===== ANIMATION BATCHING =====

export const pendingAnimationUpdates = new Map();

export function processPendingAnimationUpdates() {
    for (const [, { control, value, min, max }] of pendingAnimationUpdates) {
        const fill = control.querySelector('.parameter-fill');
        const percentage = ((value - min) / (max - min)) * 100;
        if (fill) {
            fill.style.width = `${percentage}%`;
            fill.style.transform = 'none';
        }
    }
    pendingAnimationUpdates.clear();
}

export function queueFillUpdate(control, paramKey, value, min, max) {
    pendingAnimationUpdates.set(paramKey, { control, value, min, max });
    if (pendingAnimationUpdates.size === 1) {
        requestAnimationFrame(processPendingAnimationUpdates);
    }
}

// ===== DISPLAY VALUE =====

export function getDisplayValue(param, value) {
    if (param.valueLabels && param.valueLabels[value] !== undefined) {
        return param.valueLabels[value];
    }
    if (param.displayValue && typeof param.displayValue === 'function') {
        return param.displayValue(value);
    }
    return `${value}/${param.max}`;
}

// ===== SLIDER CONTROL =====

/**
 * Create a slider-style parameter control.
 * @param {Object} param - Parameter definition (min, max, current, name, etc.)
 * @param {string} key - Parameter key
 * @param {Object} opts
 * @param {string} [opts.className='parameter-control'] - Outer div class
 * @param {string} [opts.label] - Override label (defaults to param.name)
 * @param {boolean} [opts.showPedalIndicator=false] - Show pedal indicator
 * @param {function} opts.onValueChange - Called with (key, value) on slider/drag change
 * @param {function} [opts.onSelect] - Called with (key) on long-press select
 */
export function createSliderControl(param, key, opts = {}) {
    const {
        className = 'parameter-control',
        label = param.name,
        showPedalIndicator = false,
        onValueChange,
        onSelect,
    } = opts;

    const control = document.createElement('div');
    control.className = className;
    control.setAttribute('data-param-key', key);

    const displayValue = getDisplayValue(param, param.current);
    const pedalHTML = showPedalIndicator ? '<div class="pedal-indicator">🦶</div>' : '';

    control.innerHTML = `
        <div class="parameter-fill"></div>
        <div class="parameter-pedal-position"></div>
        <div class="parameter-label">${label}</div>
        <div class="parameter-value">${displayValue}</div>
        ${pedalHTML}
        <input type="range" class="parameter-slider"
               min="${param.min}" max="${param.max}" value="${param.current}"
               data-param-key="${key}" aria-label="${label}">
    `;

    // Initial fill
    const fill = control.querySelector('.parameter-fill');
    const pct = ((param.current - param.min) / (param.max - param.min)) * 100;
    fill.style.width = `${pct}%`;

    // Slider input (accessibility fallback)
    const slider = control.querySelector('.parameter-slider');
    slider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        if (onValueChange) onValueChange(key, value);
        updateControlDisplay(control, param, key, value);
    });

    // Drag + long-press interaction
    setupDragInteraction(control, key, param, { onValueChange, onSelect });

    return control;
}

// ===== BUTTON GROUP CONTROL =====

/**
 * Unified button-group control for discrete value selection.
 * Handles text buttons (amp type, effect type), icon buttons (looper), or mixed.
 *
 * @param {Object} param - Parameter definition (needs .current; .valueLabels used as default buttons)
 * @param {string} key - Parameter key
 * @param {Object} opts
 * @param {Array}  [opts.buttons] - Custom button data [{icon?, label, title?}]. Overrides param.valueLabels.
 * @param {string} [opts.className='amp-type-control'] - Outer div class
 * @param {string} [opts.label] - Optional label text above buttons
 * @param {string} [opts.buttonClass='btn-base btn-effect'] - Per-button CSS classes
 * @param {string} [opts.groupClass='btn-group'] - Button container CSS classes
 * @param {boolean} [opts.showPedalIndicator=false]
 * @param {boolean} [opts.allowDeselect=false] - Second click on active button deselects
 * @param {boolean} [opts.skipOptimisticActive=false] - Don't toggle active class on click;
 *                  caller is responsible for updating visuals (use for async operations like effect toggle)
 * @param {function} opts.onValueChange - Called with (key, value)
 * @param {function} [opts.onButtonClick] - Extra handler called with (key, value, buttonData)
 * @param {function} [opts.onDeselect] - Called with (key, value, buttonData) on deselect
 */
export function createButtonGroupControl(param, key, opts = {}) {
    const {
        buttons: customButtons,
        className = 'amp-type-control',
        label,
        buttonClass = 'btn-base btn-effect',
        groupClass = 'btn-group',
        showPedalIndicator = false,
        allowDeselect = false,
        skipOptimisticActive = false,
        onValueChange,
        onButtonClick,
        onDeselect,
    } = opts;

    const control = document.createElement('div');
    control.className = className;
    control.setAttribute('data-param-key', key);

    const buttonsData = customButtons
        ? customButtons.map((btn, index) => ({
            value: index,
            label: btn.label,
            title: btn.title || btn.label,
            icon: btn.icon || null,
        }))
        : param.valueLabels.map((lbl, index) => ({
            value: index,
            label: lbl,
            title: (param.valueTitles && param.valueTitles[index]) || lbl,
            icon: null,
        }));

    const labelHTML = label ? `<div class="control-label">${label}</div>` : '';
    const pedalHTML = showPedalIndicator ? '<div class="pedal-indicator">🦶</div>' : '';

    const buttonsHTML = buttonsData.map(btn => {
        const shortLabel = btn.label.length > 8 ? btn.label.substring(0, 8) + '...' : btn.label;
        const content = btn.icon
            ? `<div class="btn-icon">${btn.icon}</div><div class="btn-label">${shortLabel}</div>`
            : shortLabel;
        return `
            <button class="${buttonClass} ${param.current === btn.value ? 'active' : ''}"
                    data-value="${btn.value}" title="${btn.title}">
                ${content}
            </button>`;
    }).join('');

    control.innerHTML = `
        ${labelHTML}
        ${pedalHTML}
        <div class="${groupClass}">
            ${buttonsHTML}
        </div>
    `;

    const buttons = control.querySelectorAll('[data-value]');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            const value = parseInt(button.getAttribute('data-value'));
            const isAlreadyActive = button.classList.contains('active');

            if (allowDeselect && isAlreadyActive) {
                if (!skipOptimisticActive) button.classList.remove('active');
                if (onDeselect) onDeselect(key, value, buttonsData[value]);
                return;
            }

            if (!skipOptimisticActive) {
                buttons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            }
            if (onValueChange) onValueChange(key, value);
            if (onButtonClick) onButtonClick(key, value, buttonsData[value]);
        });
    });

    return control;
}

// ===== TOGGLE GROUP CONTROL =====

/**
 * Independent on/off toggles for composite parameters (e.g. looper assigns).
 * Each toggle is independent — clicking one does NOT deselect others.
 *
 * @param {Object} compositeDef - Composite parameter definition with childKeys, childIcons, childLabels
 * @param {Object} allParams - Full parameters object to look up child params
 * @param {Object} opts
 * @param {string} [opts.className='looper-settings-improved'] - Container class
 * @param {function} opts.onToggle - Called with (childKey, newValue) when a toggle is clicked
 */
export function createToggleGroupControl(compositeDef, allParams, opts = {}) {
    const {
        className = 'looper-settings-improved',
        onToggle,
    } = opts;

    const control = document.createElement('div');
    control.className = className;
    control.setAttribute('data-param-key', compositeDef.name || 'composite');

    compositeDef.childKeys.forEach(childKey => {
        const childParam = allParams[childKey];
        if (!childParam) return;
        const isActive = childParam.current === 1;
        const icon = compositeDef.childIcons?.[childKey] || '';
        const lbl = compositeDef.childLabels?.[childKey] || childParam.name;

        const btn = document.createElement('button');
        btn.className = `toggle-btn-improved ${isActive ? 'active' : ''}`;
        btn.setAttribute('data-param', childKey);
        btn.title = childParam.name;
        btn.innerHTML = `<div class="toggle-icon">${icon}</div><div class="toggle-label">${lbl}</div>`;

        btn.addEventListener('click', () => {
            const newVal = childParam.current === 1 ? 0 : 1;
            childParam.current = newVal;
            btn.classList.toggle('active', newVal === 1);
            if (onToggle) onToggle(childKey, newVal);
        });

        control.appendChild(btn);
    });

    return control;
}

// ===== DRAG INTERACTION =====

/**
 * Set up drag-to-adjust and long-press-to-select interaction on a slider control.
 */
export function setupDragInteraction(control, key, param, opts = {}) {
    const { onValueChange, onSelect } = opts;
    const { HOLD_DURATION, MOVEMENT_THRESHOLD } = INTERACTION;

    let isDragging = false;
    let holdTimer = null;
    let hasMovedDuringHold = false;
    let startPosition = null;

    function positionToValue(event) {
        const rect = control.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        return Math.round(param.min + (param.max - param.min) * pct);
    }

    function applyValue(event) {
        const value = positionToValue(event);
        if (onValueChange) onValueChange(key, value);

        // Immediate visual feedback: fill bar, value text, slider
        const fill = control.querySelector('.parameter-fill');
        if (fill) {
            const pct = ((value - param.min) / (param.max - param.min)) * 100;
            fill.style.width = `${pct}%`;
        }
        const valueEl = control.querySelector('.parameter-value');
        if (valueEl) valueEl.textContent = getDisplayValue(param, value);
        const slider = control.querySelector('.parameter-slider');
        if (slider) slider.value = value;
    }

    function startHold(e) {
        hasMovedDuringHold = false;
        startPosition = { x: e.clientX, y: e.clientY };
        holdTimer = setTimeout(() => {
            if (!hasMovedDuringHold && isDragging && onSelect) {
                onSelect(key);
                if (navigator.vibrate) navigator.vibrate(INTERACTION.VIBRATION_DURATION);
            }
        }, HOLD_DURATION);
    }

    function checkMove(e) {
        if (!startPosition) return;
        const dx = Math.abs(e.clientX - startPosition.x);
        const dy = Math.abs(e.clientY - startPosition.y);
        if (dx > MOVEMENT_THRESHOLD || dy > MOVEMENT_THRESHOLD) {
            hasMovedDuringHold = true;
            if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        }
    }

    function cleanup() {
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        isDragging = false;
        hasMovedDuringHold = false;
        startPosition = null;
    }

    control.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        applyValue(e);
        startHold(e);

        const onMove = (e) => { if (isDragging) { checkMove(e); applyValue(e); } };
        const onUp = () => { cleanup(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    control.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isDragging = true;
        applyValue(e.touches[0]);
        startHold(e.touches[0]);
    });

    control.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (isDragging) { checkMove(e.touches[0]); applyValue(e.touches[0]); }
    });

    control.addEventListener('touchend', (e) => { e.preventDefault(); cleanup(); });
    control.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ===== CONTROL DISPLAY UPDATES =====

/**
 * Update a control's fill bar, value text, and slider from an external value change.
 */
export function updateControlDisplay(control, param, key, value) {
    if (!control) return;

    const fill = control.querySelector('.parameter-fill');
    if (fill) {
        const pct = ((value - param.min) / (param.max - param.min)) * 100;
        fill.style.width = `${pct}%`;
    }

    const valueEl = control.querySelector('.parameter-value');
    if (valueEl) {
        valueEl.textContent = getDisplayValue(param, value);
    }

    const slider = control.querySelector('.parameter-slider');
    if (slider) slider.value = value;
}

/**
 * Update button-group active state from an external value change.
 */
export function updateButtonGroupDisplay(control, value) {
    if (!control) return;
    const buttons = control.querySelectorAll('[data-value]');
    buttons.forEach(btn => {
        const btnValue = parseInt(btn.getAttribute('data-value'));
        btn.classList.toggle('active', btnValue === value);
    });
}
