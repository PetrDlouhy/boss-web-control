/**
 * Boss Cube II Constants and Configuration
 * Constants, UUIDs, addresses, and configuration values
 * Extracted from reverse-engineered protocol documentation
 */

// Roland SysEx Header
export const BOSS_CUBE_HEADER = [0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, 0x12];

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

// Application version configuration
export const VERSION_CONFIG = {
    CURRENT_VERSION: 'v2.24.0'
};

// Master Out binding configuration
export const MASTER_BIND_CONFIG = {
    REDIRECT_BEHAVIOR: true // Always use redirect behavior
}; 