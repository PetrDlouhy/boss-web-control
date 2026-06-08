/**
 * Shared utilities for pedal control and pickup mode functionality
 * Used by both main app and Live Performance mode to avoid code duplication
 */

export class PedalUtils {
    /**
     * Create pickup mode state object with default configuration
     * 
     * @returns {Object} Pickup mode state with default settings
     * @returns {boolean} returns.active - Whether pickup mode is currently active
     * @returns {number} returns.threshold - Activation/exit threshold (3 units)
     * @returns {number|null} returns.targetControlValue - Target value to converge to
     * @returns {string|null} returns.activeParameter - Currently active parameter key
     */
    static createPickupModeState() {
        return {
            active: false,
            threshold: 3, // Pickup threshold in parameter units for capture/exit
            targetControlValue: null, // Static target value to converge to
            activeParameter: null // Parameter key that is currently in pickup mode
        };
    }

    /**
     * Check if pedal movement has crossed the target value
     * 
     * Used to determine pickup mode exit condition when pedal crosses target
     * rather than just reaching it within threshold.
     * 
     * @param {number} previousValue - Previous pedal position
     * @param {number} currentValue - Current pedal position
     * @param {number} targetValue - Target control value to reach
     * @returns {boolean} True if pedal has crossed the target value
     */
    static hasCrossedTarget(previousValue, currentValue, targetValue) {
        // Check if the pedal movement has crossed the target value
        const prevDistance = previousValue - targetValue;
        const currDistance = currentValue - targetValue;
        
        // If signs are different, we've crossed the target
        return (prevDistance * currDistance) <= 0;
    }

    /**
     * Update pickup mode visual indicators (orange border, pickup-mode class)
     * 
     * @param {string} parameterKey - Parameter identifier
     * @param {boolean} active - Whether to activate or deactivate visuals
     * @param {string} controlSelector - CSS selector for control elements
     */
    static updatePickupModeVisuals(parameterKey, active, controlSelector = '.parameter-control') {
        const control = document.querySelector(`${controlSelector}[data-param-key="${parameterKey}"]`);
        if (control) {
            if (active) {
                control.classList.add('pickup-mode');
            } else {
                control.classList.remove('pickup-mode');
            }
        }
    }

    /**
     * Update pedal position indicator (red line showing current pedal position)
     * 
     * @param {string} parameterKey - Parameter identifier
     * @param {number} pedalValue - Current pedal value
     * @param {Object} param - Parameter definition object
     * @param {string} controlSelector - CSS selector for control elements
     */
    static updatePedalPositionIndicator(parameterKey, pedalValue, param, controlSelector = '.parameter-control') {
        const control = document.querySelector(`${controlSelector}[data-param-key="${parameterKey}"]`);
        if (control && param) {
            const pedalIndicator = control.querySelector('.parameter-pedal-position');
            if (pedalIndicator) {
                const percentage = ((pedalValue - param.min) / (param.max - param.min)) * 100;
                pedalIndicator.style.left = `${percentage}%`;
            }
        }
    }

    /**
     * Handle pickup mode logic during parameter switching
     * 
     * Resets pickup mode from old parameter and activates it for new parameter
     * if pedal position differs from control value.
     * 
     * @param {Object} pickupModeState - Pickup mode state object
     * @param {string} oldParameterKey - Previous parameter key
     * @param {Object} newParameter - New parameter object
     * @param {number|null} globalPedalPosition - Current pedal position for new parameter
     * @param {string} controlSelector - CSS selector for control elements
     * @returns {boolean} True if pickup mode should be activated for new parameter
     */
    static handleParameterSwitch(pickupModeState, oldParameterKey, newParameter, globalPedalPosition, controlSelector = '.parameter-control') {
        // Reset pickup mode when switching parameters
        if (pickupModeState.active) {
            // Clear pickup mode from old parameter
            if (oldParameterKey) {
                PedalUtils.updatePickupModeVisuals(oldParameterKey, false, controlSelector);
            }
            pickupModeState.active = false;
            pickupModeState.targetControlValue = null;
            pickupModeState.activeParameter = null;
        }
        
        // Check if pickup mode should be activated for new parameter
        if (globalPedalPosition !== null) {
            const valueDifference = Math.abs(globalPedalPosition - newParameter.current);
            if (valueDifference > pickupModeState.threshold) {
                pickupModeState.active = true;
                pickupModeState.targetControlValue = newParameter.current;
                pickupModeState.activeParameter = newParameter.key;
                return true; // Indicates pickup mode should be activated
            }
        }
        
        return false; // No pickup mode needed
    }

    /**
     * Scroll to show the selected parameter in Live Performance mode
     * 
     * @param {string} parameterKey - Parameter identifier
     * @param {string} containerSelector - CSS selector for scroll container
     * @param {string} controlSelector - CSS selector for control elements
     */
    static scrollToParameter(parameterKey, containerSelector, controlSelector) {
        const container = document.querySelector(containerSelector);
        const control = document.querySelector(`${controlSelector}[data-param-key="${parameterKey}"]`);
        
        if (container && control) {
            // Calculate scroll position to center the control
            const containerRect = container.getBoundingClientRect();
            const controlRect = control.getBoundingClientRect();
            const scrollTop = control.offsetTop - (containerRect.height / 2) + (controlRect.height / 2);
            
            container.scrollTo({
                top: Math.max(0, scrollTop),
                behavior: 'smooth'
            });
        }
    }
} 