/**
 * Boss Cube II SysEx Parameters
 * Complete parameter definitions with addresses, ranges, and metadata
 * Extracted from reverse-engineered protocol documentation
 */

export const BOSS_CUBE_PARAMETERS = {
    // Mixer controls
    micInstVolume: { 
        name: 'Mic/Inst Volume', 
        address: [0x20, 0x00, 0x00, 0x00], 
        min: 0, max: 100, current: 50,
        category: 'mixer'
    },
    guitarMicVolume: { 
        name: 'Guitar/Mic Volume', 
        address: [0x20, 0x00, 0x00, 0x01], 
        min: 0, max: 100, current: 50,
        category: 'mixer'
    },
    auxBluetoothVolume: { 
        name: 'Aux/Bluetooth Volume', 
        address: [0x20, 0x00, 0x00, 0x02], 
        min: 0, max: 100, current: 50,
        category: 'mixer'
    },
    iCubeLinkOut: { 
        name: 'i-CUBE LINK Out', 
        address: [0x20, 0x00, 0x00, 0x03], 
        min: 0, max: 100, current: 50,
        category: 'mixer'
    },
    masterVolume: { 
        name: 'Master Volume', 
        address: [0x20, 0x00, 0x00, 0x04], 
        min: 0, max: 100, current: 50,
        category: 'mixer'
    },

    // Looper Control (updated to match README.md specification)
    looperControl: { 
        name: 'Looper Control', 
        address: [0x20, 0x00, 0x10, 0x01], 
        min: 0, max: 5, current: 0,
        valueLabels: ['Erase Loop', 'Paused', 'Recording', 'Playing', 'Overdub', 'Standby'],
        displayValue: (value) => {
            const labels = ['Erase Loop', 'Paused', 'Recording', 'Playing', 'Overdub', 'Standby'];
            return labels[value] || 'Unknown';
        },
        category: 'looper'
    },

    // Looper Settings (verified addresses from README)
    looperRecTime: { 
        name: 'Recording Time', 
        address: [0x00, 0x00, 0x00, 0x0A], 
        min: 0, max: 1, current: 0,
        valueLabels: ['Normal', 'Long'],
        displayValue: (value) => {
            const labels = ['Normal', 'Long'];
            return labels[value] || 'Normal';
        },
        category: 'looper'
    },
    looperMicInstAssign: { 
        name: 'Mic/Inst Assign', 
        address: [0x00, 0x00, 0x00, 0x0B], 
        min: 0, max: 1, current: 0,
        valueLabels: ['Off', 'On'],
        displayValue: (value) => {
            const labels = ['Off', 'On'];
            return labels[value] || 'Off';
        },
        category: 'looper'
    },
    looperGuitarMicAssign: { 
        name: 'Guitar/Mic Assign', 
        address: [0x00, 0x00, 0x00, 0x0C], 
        min: 0, max: 1, current: 0,
        valueLabels: ['Off', 'On'],
        displayValue: (value) => {
            const labels = ['Off', 'On'];
            return labels[value] || 'Off';
        },
        category: 'looper'
    },
    looperReverbAssign: { 
        name: 'Reverb Assign', 
        address: [0x00, 0x00, 0x00, 0x0D], 
        min: 0, max: 1, current: 0,
        valueLabels: ['Off', 'On'],
        displayValue: (value) => {
            const labels = ['Off', 'On'];
            return labels[value] || 'Off';
        },
        category: 'looper'
    },
    looperICubeLinkAssign: { 
        name: 'I-Cube Link/Aux/BT Assign', 
        address: [0x00, 0x00, 0x00, 0x0E], 
        min: 0, max: 1, current: 0,
        valueLabels: ['Off', 'On'],
        displayValue: (value) => {
            const labels = ['Off', 'On'];
            return labels[value] || 'Off';
        },
        category: 'looper'
    },

    // Mic/Inst EQ Controls (verified addresses from README)
    micInstEQBass: { 
        name: 'Bass', 
        address: [0x20, 0x00, 0x20, 0x01], 
        min: 0, max: 100, current: 50,
        category: 'micInstEQ'
    },
    micInstEQMiddle: { 
        name: 'Middle', 
        address: [0x20, 0x00, 0x20, 0x02], 
        min: 0, max: 100, current: 50,
        category: 'micInstEQ'
    },
    micInstEQTreble: { 
        name: 'Treble', 
        address: [0x20, 0x00, 0x20, 0x03], 
        min: 0, max: 100, current: 50,
        category: 'micInstEQ'
    },

    // Guitar EQ & Amp Controls (verified addresses from README)
    guitarEQBass: { 
        name: 'Bass', 
        address: [0x20, 0x00, 0x20, 0x04], 
        min: 0, max: 100, current: 50,
        category: 'guitarEQ'
    },
    guitarEQMiddle: { 
        name: 'Middle', 
        address: [0x20, 0x00, 0x20, 0x05], 
        min: 0, max: 100, current: 50,
        category: 'guitarEQ'
    },
    guitarEQTreble: { 
        name: 'Treble', 
        address: [0x20, 0x00, 0x20, 0x06], 
        min: 0, max: 100, current: 50,
        category: 'guitarEQ'
    },
    guitarGain: { 
        name: 'Gain', 
        address: [0x20, 0x00, 0x20, 0x07], 
        min: 0, max: 100, current: 50,
        category: 'guitarEQ'
    },
    guitarAmpType: { 
        name: 'Amp Type', 
        address: [0x20, 0x00, 0x20, 0x0A], 
        min: 0, max: 8, current: 4,
        valueLabels: ['Normal', 'Bright', 'Wide', 'Instrument', 'Clean', 'Crunch', 'Lead', 'Acoustic Sim', 'Mic'],
        displayValue: (value) => {
            const labels = ['Normal', 'Bright', 'Wide', 'Instrument', 'Clean', 'Crunch', 'Lead', 'Acoustic Sim', 'Mic'];
            return labels[value] || 'Unknown';
        },
        category: 'guitarEQ'
    },

    // Guitar Effects - Phaser
    guitarPhaserRate: { 
        name: 'Phaser Rate', 
        address: [0x10, 0x00, 0x00, 0x47], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'phaser'
    },
    guitarPhaserDepth: { 
        name: 'Phaser Depth', 
        address: [0x10, 0x00, 0x00, 0x48], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'phaser'
    },
    guitarPhaserResonance: { 
        name: 'Phaser Resonance', 
        address: [0x10, 0x00, 0x00, 0x49], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'phaser'
    },
    guitarPhaserManual: { 
        name: 'Phaser Manual', 
        address: [0x10, 0x00, 0x00, 0x4a], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'phaser'
    },
    guitarPhaserLevel: { 
        name: 'Phaser Level', 
        address: [0x10, 0x00, 0x00, 0x4b], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'phaser'
    },
    guitarPhaserType: { 
        name: 'Phaser Type', 
        address: [0x10, 0x00, 0x00, 0x46], 
        min: 0, max: 3, current: 0,
        valueLabels: ['4stage', '8stage', '12stage', 'BiPHASE'],
        category: 'guitarEffects',
        effectType: 'phaser'
    },
    
    // Guitar Effects - Chorus
    guitarChorusLowRate: { 
        name: 'Chorus Low Rate', 
        address: [0x10, 0x00, 0x00, 0x3b], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'chorus'
    },
    guitarChorusLowDepth: { 
        name: 'Chorus Low Depth', 
        address: [0x10, 0x00, 0x00, 0x3c], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'chorus'
    },
    guitarChorusLowPreDelay: { 
        name: 'Chorus Low Pre Delay', 
        address: [0x10, 0x00, 0x00, 0x3d], 
        min: 0, max: 80, current: 50,
        unit: 'ms',
        displayValue: (value) => `${(value * 0.5).toFixed(1)}ms`,
        category: 'guitarEffects',
        effectType: 'chorus'
    },
    guitarChorusLowLevel: { 
        name: 'Chorus Low Level', 
        address: [0x10, 0x00, 0x00, 0x3e], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'chorus'
    },
    guitarChorusDirectMix: { 
        name: 'Chorus Direct Mix', 
        address: [0x10, 0x00, 0x00, 0x3f], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'chorus'
    },
    guitarChorusHighRate: { 
        name: 'Chorus High Rate', 
        address: [0x10, 0x00, 0x00, 0x40], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'chorus'
    },
    guitarChorusHighDepth: { 
        name: 'Chorus High Depth', 
        address: [0x10, 0x00, 0x00, 0x41], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'chorus'
    },
    guitarChorusHighPreDelay: { 
        name: 'Chorus High Pre Delay', 
        address: [0x10, 0x00, 0x00, 0x42], 
        min: 0, max: 80, current: 50,
        unit: 'ms',
        displayValue: (value) => `${(value * 0.5).toFixed(1)}ms`,
        category: 'guitarEffects',
        effectType: 'chorus'
    },
    guitarChorusHighLevel: { 
        name: 'Chorus High Level', 
        address: [0x10, 0x00, 0x00, 0x43], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'chorus'
    },
    guitarChorusXoverFreq: { 
        name: 'Chorus Xover Frequency', 
        address: [0x10, 0x00, 0x00, 0x44], 
        min: 0, max: 16, current: 8,
        category: 'guitarEffects',
        effectType: 'chorus'
    },

    // Guitar Effects - Tremolo
    guitarTremoloWaveShape: { 
        name: 'Tremolo Wave Shape', 
        address: [0x10, 0x00, 0x00, 0x54], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'tremolo'
    },
    guitarTremoloRate: { 
        name: 'Tremolo Rate', 
        address: [0x10, 0x00, 0x00, 0x55], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'tremolo'
    },
    guitarTremoloDepth: { 
        name: 'Tremolo Depth', 
        address: [0x10, 0x00, 0x00, 0x56], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'tremolo'
    },
    guitarTremoloLevel: { 
        name: 'Tremolo Level', 
        address: [0x10, 0x00, 0x00, 0x57], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'tremolo'
    },

    // Guitar Effects - T.WAH
    guitarTWahMode: { 
        name: 'T.WAH Mode', 
        address: [0x10, 0x00, 0x00, 0x59], 
        min: 0, max: 1, current: 0,
        valueLabels: ['LPF', 'BPF'],
        category: 'guitarEffects',
        effectType: 'twah'
    },
    guitarTWahPolarity: { 
        name: 'T.WAH Polarity', 
        address: [0x10, 0x00, 0x00, 0x5a], 
        min: 0, max: 1, current: 0,
        valueLabels: ['UP', 'DOWN'],
        category: 'guitarEffects',
        effectType: 'twah'
    },
    guitarTWahSens: { 
        name: 'T.WAH Sens', 
        address: [0x10, 0x00, 0x00, 0x5b], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'twah'
    },
    guitarTWahFrequency: { 
        name: 'T.WAH Frequency', 
        address: [0x10, 0x00, 0x00, 0x5c], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'twah'
    },
    guitarTWahPeak: { 
        name: 'T.WAH Peak', 
        address: [0x10, 0x00, 0x00, 0x5d], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'twah'
    },
    guitarTWahLevel: { 
        name: 'T.WAH Level', 
        address: [0x10, 0x00, 0x00, 0x5e], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'twah'
    },

    // Guitar Effects - Flanger
    guitarFlangerRate: { 
        name: 'Flanger Rate', 
        address: [0x10, 0x00, 0x00, 0x4d], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'flanger'
    },
    guitarFlangerDepth: { 
        name: 'Flanger Depth', 
        address: [0x10, 0x00, 0x00, 0x4e], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'flanger'
    },
    guitarFlangerResonance: { 
        name: 'Flanger Resonance', 
        address: [0x10, 0x00, 0x00, 0x4f], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'flanger'
    },
    guitarFlangerManual: { 
        name: 'Flanger Manual', 
        address: [0x10, 0x00, 0x00, 0x50], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'flanger'
    },
    guitarFlangerLevel: { 
        name: 'Flanger Level', 
        address: [0x10, 0x00, 0x00, 0x51], 
        min: 0, max: 100, current: 50,
        category: 'guitarEffects',
        effectType: 'flanger'
    },
    guitarFlangerLowCut: { 
        name: 'Flanger Low Cut', 
        address: [0x10, 0x00, 0x00, 0x52], 
        min: 0, max: 10, current: 0,
        valueLabels: ['FLAT', '55Hz', '110Hz', '165Hz', '200Hz', '280Hz', '340Hz', '400Hz', '500Hz', '530Hz', '800Hz'],
        category: 'guitarEffects',
        effectType: 'flanger'
    },

    // Shared Reverb Controls (verified from README - shared between Guitar and Mic/Inst)
    reverbType: { 
        name: 'Type', 
        address: [0x10, 0x00, 0x00, 0x2d], 
        min: 0, max: 2, current: 0,
        valueLabels: ['ROOM', 'HALL', 'PLATE'],
        category: 'reverb'
    },
    reverbTime: { 
        name: 'Time', 
        address: [0x10, 0x00, 0x00, 0x2e], 
        min: 0, max: 49, current: 25,
        unit: 's',
        step: 0.1,
        displayValue: (value) => `${(value * 0.1 + 0.1).toFixed(1)}s`,
        category: 'reverb'
    },
    reverbPreDelay: { 
        name: 'Pre-Delay', 
        address: [0x10, 0x00, 0x00, 0x2f], 
        min: 0, max: 200, current: 100,
        unit: 'ms',
        displayValue: (value) => `${value}ms`,
        category: 'reverb',
        is16Bit: true
    },
    reverbLowCut: { 
        name: 'Low Cut', 
        address: [0x10, 0x00, 0x00, 0x32], 
        min: 0, max: 12, current: 0,
        valueLabels: ['FLAT', '50Hz', '63Hz', '80Hz', '100Hz', '125Hz', '160Hz', '200Hz', '250Hz', '315Hz', '400Hz', '500Hz', '630Hz'],
        category: 'reverb'
    },
    reverbHighCut: { 
        name: 'High Cut', 
        address: [0x10, 0x00, 0x00, 0x33], 
        min: 0, max: 10, current: 10,
        valueLabels: ['1.6kHz', '2.0kHz', '2.5kHz', '3.15kHz', '4.0kHz', '5.0kHz', '6.3kHz', '8.0kHz', '10.0kHz', '12.5kHz', 'FLAT'],
        category: 'reverb'
    },
    reverbDensity: { 
        name: 'Density', 
        address: [0x10, 0x00, 0x00, 0x34], 
        min: 0, max: 10, current: 5,
        displayValue: (value) => `${value}`,
        category: 'reverb'
    },
    reverbKnobAssign: { 
        name: 'Knob Assign', 
        address: [0x10, 0x00, 0x00, 0x35], 
        min: 0, max: 1, current: 0,
        valueLabels: ['Rev Time', 'FX Level'],
        category: 'reverb'
    },
    
    // Separate Reverb Effect Levels (verified from README)
    guitarReverbLevel: { 
        name: 'Guitar Reverb Level', 
        address: [0x10, 0x00, 0x00, 0x67], 
        min: 0, max: 100, current: 25,
        category: 'reverbLevels'
    },
    micInstReverbLevel: { 
        name: 'Mic/Inst Reverb Level', 
        address: [0x10, 0x00, 0x00, 0x31], 
        min: 0, max: 100, current: 25,
        category: 'reverbLevels'
    },

    // Guitar Delay (separate section)
    guitarDelayType: { 
        name: 'Type', 
        address: [0x10, 0x00, 0x00, 0x60], 
        min: 0, max: 3, current: 0,
        valueLabels: ['Digital', 'Reverse', 'Analog', 'Tape Echo'],
        category: 'guitarDelay'
    },
    guitarDelayTime: { 
        name: 'Time', 
        address: [0x10, 0x00, 0x00, 0x61], 
        min: 1, max: 1000, current: 500,
        unit: 'ms',
        displayValue: (value) => `${value}ms`,
        category: 'guitarDelay',
        is16Bit: true
    },
    guitarDelayFeedback: { 
        name: 'Feedback', 
        address: [0x10, 0x00, 0x00, 0x63], 
        min: 0, max: 100, current: 30,
        category: 'guitarDelay'
    },
    guitarDelayHighCut: { 
        name: 'High Cut', 
        address: [0x10, 0x00, 0x00, 0x64], 
        min: 0, max: 14, current: 14,
        category: 'guitarDelay'
    },
    guitarDelayLevel: { 
        name: 'Level', 
        address: [0x10, 0x00, 0x00, 0x65], 
        min: 0, max: 100, current: 25,
        category: 'guitarDelay'
    },
    guitarDelayKnobAssign: { 
        name: 'Knob Assign', 
        address: [0x10, 0x00, 0x00, 0x66], 
        min: 0, max: 3, current: 0,
        valueLabels: ['Default', 'Delay Time', 'Feedback', 'FX Level'],
        category: 'guitarDelay'
    },

    // Guitar Amp Settings (verified addresses from README)
    guitarAmpCleanType: { 
        name: 'Clean Amp Type', 
        address: [0x10, 0x00, 0x00, 0x36], 
        min: 0, max: 1, current: 0,
        valueLabels: ['Type 1', 'Type 2'],
        category: 'guitarAmp'
    },
    guitarAmpCrunchType: { 
        name: 'Crunch Amp Type', 
        address: [0x10, 0x00, 0x00, 0x37], 
        min: 0, max: 1, current: 0,
        valueLabels: ['Type 1', 'Type 2'],
        category: 'guitarAmp'
    },
    guitarAmpLeadType: { 
        name: 'Lead Amp Type', 
        address: [0x10, 0x00, 0x00, 0x38], 
        min: 0, max: 1, current: 0,
        valueLabels: ['Type 1', 'Type 2'],
        category: 'guitarAmp'
    },

    // Tuner Settings (verified addresses from README)
    tunerPitch: { 
        name: 'Tuner Pitch', 
        address: [0x10, 0x00, 0x00, 0x68], 
        min: 0, max: 10, current: 5,
        valueLabels: ['435Hz', '436Hz', '437Hz', '438Hz', '439Hz', '440Hz', '441Hz', '442Hz', '443Hz', '444Hz', '445Hz'],
        displayValue: (value) => {
            const frequencies = ['435Hz', '436Hz', '437Hz', '438Hz', '439Hz', '440Hz', '441Hz', '442Hz', '443Hz', '444Hz', '445Hz'];
            return frequencies[value] || '440Hz';
        },
        category: 'tuner'
    },
    tunerManualKey: { 
        name: 'Manual Key', 
        address: [0x20, 0x00, 0x30, 0x01], 
        min: 0, max: 11, current: 0,
        valueLabels: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        displayValue: (value) => {
            const keys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
            return keys[value] || 'C';
        },
        category: 'tuner'
    },

    // Real-time tuner pitch data (discovered) - internal use only, not displayed as control
    tunerPitchData: {
        name: 'Tuner Pitch Data',
        address: [0x7F, 0x00, 0x03, 0x00],
        min: 0, max: 2097151, current: 1048576, // Auto-detected size, up to 3 bytes = 21 bits
        isMultiByte: true, // Dynamically sized parameter
        category: 'internal' // Changed from 'tuner' to 'internal' to hide from UI
    },

    // Mic/Inst General Settings (verified addresses from README)
    micInstEQType: { 
        name: 'Mic/Inst EQ Type', 
        address: [0x10, 0x00, 0x00, 0x00], 
        min: 0, max: 3, current: 0,
        valueLabels: ['EQ off', 'speech', 'vocal', 'inst'],
        category: 'micInstEffects'
    },
    
    // Mic/Inst Effect Type Selector (verified addresses from README)
    micInstEffectType: { 
        name: 'Effect Type', 
        address: [0x10, 0x00, 0x00, 0x01], 
        min: 0, max: 5, current: 0,
        valueLabels: ['Harmony', 'Chorus', 'Phaser', 'Flanger', 'Tremolo', 'T.WAH'],
        category: 'micInstEffects'
    },

    // Mic/Inst Effects - Harmony (verified addresses from README)
    // NOTE: These addresses are ONLY valid when micInstEffectType = 0 (Harmony)
    micInstHarmonyKey: { 
        name: 'Harmony Key', 
        address: [0x10, 0x00, 0x00, 0x0B], 
        min: 0, max: 1, current: 0,
        valueLabels: ['Auto', 'Set'],
        category: 'micInstEffects',
        effectType: 'harmony',
        effectIndex: 0
    },
    micInstHarmonyKeySetup: { 
        name: 'Harmony Key Setup', 
        address: [0x10, 0x00, 0x00, 0x0C], 
        min: 0, max: 11, current: 0,
        valueLabels: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        category: 'micInstEffects',
        effectType: 'harmony',
        effectIndex: 0
    },
    micInstHarmonyAccurate: { 
        name: 'Harmony Accurate', 
        address: [0x10, 0x00, 0x00, 0x0D], 
        min: 0, max: 9, current: 5,
        displayValue: (value) => `${value + 1}`,
        category: 'micInstEffects',
        effectType: 'harmony',
        effectIndex: 0
    },
    micInstHarmonyVoiceAssign: { 
        name: 'Harmony Voice Assign', 
        address: [0x10, 0x00, 0x00, 0x0E], 
        min: 0, max: 3, current: 0,
        valueLabels: ['Default', 'Unison/Low/High', 'Unison/Low/Higher', 'Low/High/Higher'],
        category: 'micInstEffects',
        effectType: 'harmony',
        effectIndex: 0
    },

    // Mic/Inst Effects - Chorus (verified addresses from README)
    // NOTE: These addresses are ONLY valid when micInstEffectType = 1 (Chorus)
    micInstChorusLowRate: { 
        name: 'Chorus Low Rate', 
        address: [0x10, 0x00, 0x00, 0x08], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'chorus',
        effectIndex: 1
    },
    micInstChorusLowDepth: { 
        name: 'Chorus Low Depth', 
        address: [0x10, 0x00, 0x00, 0x09], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'chorus',
        effectIndex: 1
    },
    micInstChorusLowPreDelay: { 
        name: 'Chorus Low Pre Delay', 
        address: [0x10, 0x00, 0x00, 0x0A], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'chorus',
        effectIndex: 1
    },
    micInstChorusLowLevel: { 
        name: 'Chorus Low Level', 
        address: [0x10, 0x00, 0x00, 0x0B], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'chorus',
        effectIndex: 1
    },
    micInstChorusDirectMix: { 
        name: 'Chorus Direct Mix', 
        address: [0x10, 0x00, 0x00, 0x0C], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'chorus',
        effectIndex: 1
    },
    micInstChorusHighRate: { 
        name: 'Chorus High Rate', 
        address: [0x10, 0x00, 0x00, 0x0D], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'chorus',
        effectIndex: 1
    },
    micInstChorusHighDepth: { 
        name: 'Chorus High Depth', 
        address: [0x10, 0x00, 0x00, 0x0E], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'chorus',
        effectIndex: 1
    },
    micInstChorusHighPreDelay: { 
        name: 'Chorus High Pre Delay', 
        address: [0x10, 0x00, 0x00, 0x0F], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'chorus',
        effectIndex: 1
    },
    micInstChorusHighLevel: { 
        name: 'Chorus High Level', 
        address: [0x10, 0x00, 0x00, 0x10], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'chorus',
        effectIndex: 1
    },
    micInstChorusXoverFreq: { 
        name: 'Chorus Xover Frequency', 
        address: [0x10, 0x00, 0x00, 0x11], 
        min: 0, max: 16, current: 8,
        valueLabels: ['200Hz', '250Hz', '315Hz', '400Hz', '500Hz', '630Hz', '800Hz', '1.0kHz', '1.25kHz', '1.6kHz', '2.0kHz', '2.5kHz', '3.15kHz', '4.0kHz', '5.0kHz', '6.3kHz', '8.0kHz'],
        category: 'micInstEffects',
        effectType: 'chorus',
        effectIndex: 1
    },

    // Mic/Inst Effects - Phaser (verified addresses from README)
    // NOTE: These addresses are ONLY valid when micInstEffectType = 2 (Phaser)
    micInstPhaserType: { 
        name: 'Phaser Type', 
        address: [0x10, 0x00, 0x00, 0x13], 
        min: 0, max: 3, current: 0,
        valueLabels: ['4stage', '8stage', '12stage', 'BiPHASE'],
        category: 'micInstEffects',
        effectType: 'phaser',
        effectIndex: 2
    },
    micInstPhaserRate: { 
        name: 'Phaser Rate', 
        address: [0x10, 0x00, 0x00, 0x14], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'phaser',
        effectIndex: 2
    },
    micInstPhaserDepth: { 
        name: 'Phaser Depth', 
        address: [0x10, 0x00, 0x00, 0x15], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'phaser',
        effectIndex: 2
    },
    micInstPhaserResonance: { 
        name: 'Phaser Resonance', 
        address: [0x10, 0x00, 0x00, 0x16], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'phaser',
        effectIndex: 2
    },
    micInstPhaserManual: { 
        name: 'Phaser Manual', 
        address: [0x10, 0x00, 0x00, 0x17], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'phaser',
        effectIndex: 2
    },
    micInstPhaserLevel: { 
        name: 'Phaser Level', 
        address: [0x10, 0x00, 0x00, 0x18], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'phaser',
        effectIndex: 2
    },

    // Mic/Inst Effects - Flanger (verified addresses from README)
    // NOTE: These addresses are ONLY valid when micInstEffectType = 3 (Flanger)
    micInstFlangerRate: { 
        name: 'Flanger Rate', 
        address: [0x10, 0x00, 0x00, 0x1A], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'flanger',
        effectIndex: 3
    },
    micInstFlangerDepth: { 
        name: 'Flanger Depth', 
        address: [0x10, 0x00, 0x00, 0x1B], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'flanger',
        effectIndex: 3
    },
    micInstFlangerResonance: { 
        name: 'Flanger Resonance', 
        address: [0x10, 0x00, 0x00, 0x1C], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'flanger',
        effectIndex: 3
    },
    micInstFlangerManual: { 
        name: 'Flanger Manual', 
        address: [0x10, 0x00, 0x00, 0x1D], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'flanger',
        effectIndex: 3
    },
    micInstFlangerLevel: { 
        name: 'Flanger Level', 
        address: [0x10, 0x00, 0x00, 0x1E], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'flanger',
        effectIndex: 3
    },
    micInstFlangerLowCut: { 
        name: 'Flanger Low Cut', 
        address: [0x10, 0x00, 0x00, 0x1F], 
        min: 0, max: 10, current: 0,
        valueLabels: ['FLAT', '55Hz', '110Hz', '165Hz', '200Hz', '280Hz', '340Hz', '400Hz', '500Hz', '530Hz', '800Hz'],
        category: 'micInstEffects',
        effectType: 'flanger',
        effectIndex: 3
    },

    // Mic/Inst Effects - Tremolo (verified addresses from README)
    // NOTE: These addresses are ONLY valid when micInstEffectType = 4 (Tremolo)
    micInstTremoloWaveShape: { 
        name: 'Tremolo Wave Shape', 
        address: [0x10, 0x00, 0x00, 0x21], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'tremolo',
        effectIndex: 4
    },
    micInstTremoloRate: { 
        name: 'Tremolo Rate', 
        address: [0x10, 0x00, 0x00, 0x22], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'tremolo',
        effectIndex: 4
    },
    micInstTremoloDepth: { 
        name: 'Tremolo Depth', 
        address: [0x10, 0x00, 0x00, 0x23], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'tremolo',
        effectIndex: 4
    },
    micInstTremoloLevel: { 
        name: 'Tremolo Level', 
        address: [0x10, 0x00, 0x00, 0x24], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'tremolo',
        effectIndex: 4
    },

    // Mic/Inst Effects - T.WAH (verified addresses from README)
    // NOTE: These addresses are ONLY valid when micInstEffectType = 5 (T.WAH)
    micInstTWahMode: { 
        name: 'Mic/Inst T.WAH Mode', 
        address: [0x10, 0x00, 0x00, 0x26], 
        min: 0, max: 1, current: 0,
        valueLabels: ['LPF', 'BPF'],
        category: 'micInstEffects',
        effectType: 'twah',
        effectIndex: 5
    },
    micInstTWahPolarity: { 
        name: 'Mic/Inst T.WAH Polarity', 
        address: [0x10, 0x00, 0x00, 0x27], 
        min: 0, max: 1, current: 0,
        valueLabels: ['UP', 'DOWN'],
        category: 'micInstEffects',
        effectType: 'twah',
        effectIndex: 5
    },
    micInstTWahSens: { 
        name: 'Mic/Inst T.WAH Sens', 
        address: [0x10, 0x00, 0x00, 0x28], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'twah',
        effectIndex: 5
    },
    micInstTWahFrequency: { 
        name: 'Mic/Inst T.WAH Frequency', 
        address: [0x10, 0x00, 0x00, 0x29], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'twah',
        effectIndex: 5
    },
    micInstTWahPeak: { 
        name: 'Mic/Inst T.WAH Peak', 
        address: [0x10, 0x00, 0x00, 0x2a], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'twah',
        effectIndex: 5
    },
    micInstTWahLevel: { 
        name: 'Mic/Inst T.WAH Level', 
        address: [0x10, 0x00, 0x00, 0x2b], 
        min: 0, max: 100, current: 50,
        category: 'micInstEffects',
        effectType: 'twah',
        effectIndex: 5
    }
}; 