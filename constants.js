/**
 * Boss Cube II Constants and Configuration
 * Constants, UUIDs, addresses, and configuration values
 * Extracted from reverse-engineered protocol documentation
 */

// Roland SysEx Headers (manufacturer 0x41, device ID 0x10, model ID, DT1 command 0x12)
export const BOSS_CUBE_HEADER = [0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, 0x12];
export const EV1WL_HEADER = [0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x10, 0x12];

// BLE MIDI Service UUID (standard)
export const BLE_MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
export const BLE_MIDI_CHARACTERISTIC = '7772e5db-3868-4112-a1a9-f2669d106bf3';

// Device reference address (for documentation only)
export const DEVICE_ADDRESS = "fb:b7:d0:2d:4a:2d";

// System addresses for special commands
export const SYSTEM_ADDRESSES = {
    ENABLE_NOTIFICATIONS: [0x7F, 0x00, 0x00, 0x01],
    KEEP_ALIVE: [0x7F, 0x00, 0x00, 0x00],
    TUNER_CONTROL: [0x7F, 0x00, 0x00, 0x02]
};

// SysEx timing and buffer configuration
export const SYSEX_CONFIG = {
    BUFFER_TIMEOUT: 1000, // 1 second timeout for incomplete messages
    READ_REQUEST_TIMEOUT: 2000, // 2 seconds for read request tracking
    COMMAND_DELAY: 50, // Delay between commands in milliseconds
    READ_DELAY: 100, // Delay after read requests in milliseconds (restored to working v2.22.1 value)
    MAINTENANCE_INTERVAL: 30000 // Notification maintenance every 30 seconds
};

// Default CC codes for pedal controls
export const DEFAULT_PEDAL_CC_CODES = {
    PREVIOUS_PARAMETER: 80,
    NEXT_PARAMETER: 81,
    PEDAL_CONTROL: 127
};

// Footswitch polarities
export const FOOTSWITCH_POLARITIES = {
    NORMALLY_OPEN: 'normally_open',
    NORMALLY_CLOSED: 'normally_closed'
};

// EV-1-WL pedal SysEx parameter map (from official EV-1-WL Editor address_map.js)
// Addresses are 4-byte Roland SysEx format [byte3, byte2, byte1, byte0]
// Base: System = [0x10, 0x00, 0x00, 0x00]
//   TotalSettings at +[0x00, 0x00, 0x00, 0x00]
//   MidiSetting(BT) at +[0x00, 0x01, 0x00, 0x00]
//   MidiSetting(USB) at +[0x00, 0x02, 0x00, 0x00]
//   MidiSetting(MIDI) at +[0x00, 0x03, 0x00, 0x00]
export const EV1WL_PARAMS = {
    // TotalSettings (base: 0x10, 0x00, 0x00, 0x00)
    midiTxChannel:  { address: [0x10, 0x00, 0x00, 0x00], min: 0, max: 15, init: 0,   name: 'MIDI Tx Channel' },
    expSwLedColor:  { address: [0x10, 0x00, 0x00, 0x01], min: 0, max: 6,  init: 5,   name: 'Exp Sw LED Color',
        valueLabels: ['Red', 'Blue', 'Light Blue', 'Green', 'Yellow', 'White', 'Purple'] },
    expCurve:       { address: [0x10, 0x00, 0x00, 0x02], min: 0, max: 4,  init: 0,   name: 'Exp Curve',
        valueLabels: ['Normal', 'Slow 1', 'Slow 2', 'Fast', '(unknown)'] },
    expSwSens:      { address: [0x10, 0x00, 0x00, 0x03], min: 0, max: 15, init: 8,   name: 'Exp Sw Sensitivity' },
    expSwState:     { address: [0x10, 0x00, 0x00, 0x04], min: 0, max: 1,  init: 0,   name: 'Exp Sw State',
        valueLabels: ['Off', 'On'] },
    expSwMode:      { address: [0x10, 0x00, 0x00, 0x05], min: 0, max: 1,  init: 0,   name: 'Exp Sw Mode',
        valueLabels: ['Latch', 'Momentary'] },
    ctl1Mode:       { address: [0x10, 0x00, 0x00, 0x06], min: 0, max: 1,  init: 0,   name: 'Ctl 1 Mode',
        valueLabels: ['Latch', 'Momentary'] },
    ctl2Mode:       { address: [0x10, 0x00, 0x00, 0x07], min: 0, max: 1,  init: 0,   name: 'Ctl 2 Mode',
        valueLabels: ['Latch', 'Momentary'] },

    // MidiSetting - Bluetooth (base: 0x10, 0x00, 0x01, 0x00)
    btExpOffCC:       { address: [0x10, 0x00, 0x01, 0x00], min: 0, max: 127, init: 0,   name: 'BT Exp Off CC#' },
    btExpOffRangeMin: { address: [0x10, 0x00, 0x01, 0x01], min: 0, max: 127, init: 0,   name: 'BT Exp Off Range Min' },
    btExpOffRangeMax: { address: [0x10, 0x00, 0x01, 0x02], min: 0, max: 127, init: 127, name: 'BT Exp Off Range Max' },
    btExpOnCC:        { address: [0x10, 0x00, 0x01, 0x03], min: 0, max: 127, init: 0,   name: 'BT Exp On CC#' },
    btExpOnRangeMin:  { address: [0x10, 0x00, 0x01, 0x04], min: 0, max: 127, init: 0,   name: 'BT Exp On Range Min' },
    btExpOnRangeMax:  { address: [0x10, 0x00, 0x01, 0x05], min: 0, max: 127, init: 127, name: 'BT Exp On Range Max' },
    btExpSwCC:        { address: [0x10, 0x00, 0x01, 0x06], min: 0, max: 127, init: 0,   name: 'BT Exp Sw CC#' },
    btExpSwOffValue:  { address: [0x10, 0x00, 0x01, 0x07], min: 0, max: 126, init: 0,   name: 'BT Exp Sw Off Value' },
    btExpSwOnValue:   { address: [0x10, 0x00, 0x01, 0x08], min: 1, max: 127, init: 127, name: 'BT Exp Sw On Value' },
    btCtl1CC:         { address: [0x10, 0x00, 0x01, 0x09], min: 0, max: 127, init: 0,   name: 'BT Ctl 1 CC#' },
    btCtl1OffValue:   { address: [0x10, 0x00, 0x01, 0x0A], min: 0, max: 126, init: 0,   name: 'BT Ctl 1 Off Value' },
    btCtl1OnValue:    { address: [0x10, 0x00, 0x01, 0x0B], min: 1, max: 127, init: 127, name: 'BT Ctl 1 On Value' },
    btCtl2CC:         { address: [0x10, 0x00, 0x01, 0x0C], min: 0, max: 127, init: 0,   name: 'BT Ctl 2 CC#' },
    btCtl2OffValue:   { address: [0x10, 0x00, 0x01, 0x0D], min: 0, max: 126, init: 0,   name: 'BT Ctl 2 Off Value' },
    btCtl2OnValue:    { address: [0x10, 0x00, 0x01, 0x0E], min: 1, max: 127, init: 127, name: 'BT Ctl 2 On Value' },
    btExpOffCCOnOff:  { address: [0x10, 0x00, 0x01, 0x0F], min: 0, max: 1,   init: 0,   name: 'BT Exp Off CC# On/Off',
        valueLabels: ['Off', 'On'] },
    btExpOnCCOnOff:   { address: [0x10, 0x00, 0x01, 0x10], min: 0, max: 1,   init: 0,   name: 'BT Exp On CC# On/Off',
        valueLabels: ['Off', 'On'] },
    btExpSwCCOnOff:   { address: [0x10, 0x00, 0x01, 0x11], min: 0, max: 1,   init: 0,   name: 'BT Exp Sw CC# On/Off',
        valueLabels: ['Off', 'On'] },
    btCtl1CCOnOff:    { address: [0x10, 0x00, 0x01, 0x12], min: 0, max: 1,   init: 0,   name: 'BT Ctl 1 CC# On/Off',
        valueLabels: ['Off', 'On'] },
    btCtl2CCOnOff:    { address: [0x10, 0x00, 0x01, 0x13], min: 0, max: 1,   init: 0,   name: 'BT Ctl 2 CC# On/Off',
        valueLabels: ['Off', 'On'] },
};

// Block read for all pedal parameters: TotalSettings (8 bytes) + BT MidiSetting (20 bytes)
export const EV1WL_BLOCK_READS = [
    { address: [0x10, 0x00, 0x00, 0x00], size: [0x00, 0x00, 0x00, 0x08], name: 'TotalSettings' },
    { address: [0x10, 0x00, 0x01, 0x00], size: [0x00, 0x00, 0x00, 0x14], name: 'BT MIDI Settings' },
];

// Parameter categories for organization
export const PARAMETER_CATEGORIES = {
    MIXER: 'mixer',
    LOOPER: 'looper',
    MIC_INST_EQ: 'micInstEQ',
    GUITAR_EQ: 'guitarEQ',
    GUITAR_EFFECTS: 'guitarEffects',
    MIC_INST_EFFECTS: 'micInstEffects',
    REVERB: 'reverb',
    REVERB_LEVELS: 'reverbLevels',
    GUITAR_DELAY: 'guitarDelay',
    GUITAR_AMP: 'guitarAmp',
    TUNER: 'tuner'
};

// Effect types
export const EFFECT_TYPES = {
    GUITAR: {
        PHASER: 'phaser',
        CHORUS: 'chorus',
        TREMOLO: 'tremolo',
        TWAH: 'twah',
        FLANGER: 'flanger'
    },
    MIC_INST: {
        HARMONY: 'harmony',
        CHORUS: 'chorus',
        PHASER: 'phaser',
        FLANGER: 'flanger',
        TREMOLO: 'tremolo',
        TWAH: 'twah'
    }
};

// Shared interaction constants (used by app.js and live-performance.js)
export const INTERACTION = {
    HOLD_DURATION: 800,           // ms — long press to select for pedal
    MOVEMENT_THRESHOLD: 10,       // px — cancels hold if finger moves
    VIBRATION_DURATION: 50,       // ms — haptic feedback
    THROTTLE_INTERVAL: 50,        // ms — LP update batching (~20 FPS)
    PEDAL_POSITION_TIMEOUT: 3000, // ms — pedal position indicator display
};

// Application version configuration
export const VERSION_CONFIG = {
    CURRENT_VERSION: 'v2.29.0'
};

// Master Out binding configuration
export const MASTER_BIND_CONFIG = {
    REDIRECT_BEHAVIOR: true // Always use redirect behavior
};

// Looper button definitions — single source for both live and non-live modes.
// Icon can be overridden per-mode by spreading and replacing.
export const LOOPER_BUTTONS = [
    { icon: '⏹️', title: 'Erase Loop', label: 'Erase' },
    { icon: '⏸️', title: 'Paused', label: 'Paused' },
    { icon: '🔴', title: 'Recording', label: 'Record' },
    { icon: '▶️', title: 'Playing', label: 'Play' },
    { icon: '🔄', title: 'Overdub', label: 'Overdub' },
    { icon: '⏯️', title: 'Standby', label: 'Standby' },
];

// Looper Volume binding configuration
export const LOOPER_VOLUME_CONFIG = {
    ENABLED: true,
    // Range for the virtual looper volume control
    MIN: 0,
    MAX: 100,
    DEFAULT: 50,
    // How much input volumes adjust relative to looper volume change (reduced for gentler adjustment)
    INPUT_ADJUSTMENT_FACTOR: 0.4,
    // Minimum level for input volumes (prevents guitar from going completely silent)
    MIN_INPUT_LEVEL: 5,
    // Minimum level for master volume (prevents entire output from going silent)
    MIN_MASTER_LEVEL: 5
}; 