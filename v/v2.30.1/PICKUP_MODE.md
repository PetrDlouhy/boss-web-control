# Pickup Mode Technical Documentation

## Overview

Pickup mode prevents parameter jumps when expression pedal position doesn't match control value, ensuring smooth transitions during live performance and parameter switching.

## Core Concept

When a parameter's current value differs from pedal position, pickup mode "freezes" the parameter at its current value and shows the pedal position with a red indicator line. The parameter only updates when the pedal reaches the control value.

## Implementation

### Activation Conditions

| Mode | Activation Trigger | Behavior |
|------|-------------------|----------|
| **Main App** | Manual control change only | User drags slider → pickup mode if pedal differs |
| **Live Performance** | Automatic on mismatch | Any pedal movement → pickup mode if control differs |
| **Parameter Switch** | Both modes | New parameter selected → pickup mode if pedal differs |

### State Management

```javascript
// Pickup mode state structure
{
    active: false,                    // Whether pickup mode is currently active
    threshold: 3,                     // Activation/exit threshold (parameter units)
    targetControlValue: null,         // Static target value to converge to
    activeParameter: null            // Currently active parameter key
}
```

### Exit Conditions

Pickup mode exits when **either** condition is met:
1. **Threshold**: Pedal reaches target value (±3 units)
2. **Crossing**: Pedal crosses target value (changes direction through target)

## Key Functions

### Controller Layer
- `handlePedalVolumeChange()` - Processes pedal input, provides `originalControlValue`
- `getGlobalPedalPosition()` - Converts pedal position to parameter scale

### Application Layer  
- `handlePedalVolumeChange()` - Main app: exits pickup mode only
- `updateParameterValue()` - Main app: activates pickup mode on manual changes
- `handleLivePerformanceVolumeChange()` - Live Performance: auto-activates pickup mode

### Utility Layer (`PedalUtils`)
- `createPickupModeState()` - Default state object creation
- `updatePickupModeVisuals()` - Visual feedback (orange border)
- `updatePedalPositionIndicator()` - Red line position indicator
- `hasCrossedTarget()` - Crossing detection for exit condition
- `handleParameterSwitch()` - Manages state during parameter changes

## Visual Feedback

| Element | State | Visual |
|---------|-------|--------|
| **Control Border** | Normal | Gray |
| **Control Border** | Selected | Orange |
| **Control Border** | Pickup Mode | Orange + `pickup-mode` class |
| **Red Line** | Normal | Hidden |
| **Red Line** | Pickup Mode | Visible at pedal position |

## Data Flow

### Main App Flow
```
User drags slider → updateParameterValue() → Check pedal position → 
Activate pickup mode if different → Pedal movement → Exit when reached
```

### Live Performance Flow  
```
Pedal moves → handleLivePerformanceVolumeChange() → Check against originalControlValue →
Auto-activate if different → Continue until pedal reaches target
```

## Configuration

- **Threshold**: 3 parameter units (configurable in `PedalUtils.createPickupModeState()`)
- **Original Value Tracking**: Always provided in pedal events for Live Performance mode
- **Visual Classes**: `.pickup-mode`, `.parameter-pedal-position`

## Debugging

Essential log messages:
- `🎯 Pickup mode activated (pedal: X, target: Y)`
- `✅ Pickup mode deactivated`

For debugging, check:
1. `originalControlValue` vs `value` in pedal events
2. `pickupModeState.active` flag
3. Visual class application (`.pickup-mode`)
4. Red line position indicator 