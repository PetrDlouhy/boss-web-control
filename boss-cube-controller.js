/**
 * Boss Cube II Web Bluetooth Controller
 * Handles two separate Bluetooth connections:
 * 1. Boss Cube II - for sending SysEx commands
 * 2. EV-1-WL Pedal - for receiving MIDI input
 */

class BossCubeController {
    constructor() {
        // Boss Cube connection
        this.cubeDevice = null;
        this.cubeServer = null;
        this.cubeCharacteristic = null;
        this.isCubeConnected = false;
        
        // EV-1-WL Pedal connection
        this.pedalDevice = null;
        this.pedalServer = null;
        this.pedalCharacteristic = null;
        this.isPedalConnected = false;
        this.lastPedalValue = -1;
        this.pedalCallbacks = [];
        
        // Pickup mode state
        this.pickupMode = {
            enabled: false,
            suppressHardwareUpdates: false
        };
        
        // Pedal throttling and debouncing for smooth performance
        this.pedalThrottle = {
            lastSentTime: 0,
            lastSentValue: -1,
            sendInterval: 30, // Send to Boss Cube max every 30ms (33 FPS)
            finalValueTimer: null,
            finalValueDelay: 150, // Send final value 150ms after movement stops
            isSending: false,
            pendingValue: null
        };
        
        // Boss Cube constants from Python script
        this.BOSS_CUBE_HEADER = [0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, 0x12];
        this.DEVICE_ADDRESS = "fb:b7:d0:2d:4a:2d"; // For reference only
        
        // BLE MIDI Service UUID (standard)
        this.BLE_MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
        this.BLE_MIDI_CHARACTERISTIC = '7772e5db-3868-4112-a1a9-f2669d106bf3';
        
        // SysEx buffer for multi-packet responses
        this.sysexBuffer = [];
        this.bufferingActive = false;
        this.lastBufferTime = 0;
        this.bufferTimeout = 1000; // 1 second timeout for incomplete messages
        
        // Physical knob change detection
        this.pendingReadRequests = new Map(); // Track pending read requests
        this.lastReadRequestTime = 0;
        this.readRequestTimeout = 2000;
        
        // Notification maintenance
        this.notificationMaintenanceTimer = null;
        
        // Parameters from Python script - complete set
        this.parameters = {
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

            // Looper Control (corrected address)
            looperControl: { 
                name: 'Looper Control', 
                address: [0x20, 0x00, 0x10, 0x01], 
                min: 0, max: 3, current: 0,
                valueLabels: ['Erase Loop', 'Start Recording', 'End Recording', 'Overdub'],
                displayValue: (value) => {
                    const labels = ['Erase Loop', 'Start Recording', 'End Recording', 'Overdub'];
                    return labels[value] || 'Unknown';
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
            },


        };
        
        // Current parameter selection for pedal control
        this.currentParameterKey = 'masterVolume';
        this.parameterKeys = Object.keys(this.parameters);

        // Effect state management
        this.currentGuitarEffect = 'phaser'; // phaser, chorus, tremolo, twah, flanger
        this.currentMicInstEffect = 'harmony'; // harmony, chorus, phaser, flanger, tremolo, twah
        
        // Effect switching commands from README (verified addresses)
        this.effectSwitchCommands = {
            guitar: {
                phaser: {
                    switch: [0x10, 0x00, 0x00, 0x39, 0x01],
                    activate: [0x7f, 0x01, 0x02, 0x04, 0x7f, 0x7f]
                },
                chorus: {
                    switch: [0x10, 0x00, 0x00, 0x39, 0x00],
                    activate: [0x7f, 0x01, 0x02, 0x04, 0x7f, 0x7f]
                },
                tremolo: {
                    switch: [0x10, 0x00, 0x00, 0x39, 0x03],
                    activate: [0x7f, 0x01, 0x02, 0x04, 0x7f, 0x7f]
                },
                twah: {
                    switch: [0x10, 0x00, 0x00, 0x39, 0x04],
                    activate: [0x7f, 0x01, 0x02, 0x04, 0x7f, 0x7f]
                },
                flanger: {
                    switch: [0x10, 0x00, 0x00, 0x39, 0x02],
                    activate: [0x7f, 0x01, 0x02, 0x04, 0x7f, 0x7f]
                }
            },
            micInst: {
                harmony: {
                    switch: [0x10, 0x00, 0x00, 0x01, 0x00]
                },
                chorus: {
                    switch: [0x10, 0x00, 0x00, 0x01, 0x01]
                },
                phaser: {
                    switch: [0x10, 0x00, 0x00, 0x01, 0x02]
                },
                flanger: {
                    switch: [0x10, 0x00, 0x00, 0x01, 0x03]
                },
                tremolo: {
                    switch: [0x10, 0x00, 0x00, 0x01, 0x04]
                },
                twah: {
                    switch: [0x10, 0x00, 0x00, 0x01, 0x05]
                }
            }
        };

        // Event callbacks
        this.onLog = null;
        this.onStatusChange = null;
        this.onParameterUpdate = null; // Callback for when Boss Cube sends parameter updates
        this.onPhysicalKnobChange = null; // Callback specifically for physical knob changes
        
        // Settings
        this.pedalCCCodes = {
            previousParameter: 80,
            nextParameter: 81,
            pedalControl: 127
        };
        this.footswitchPolarity = 'normally_open'; // 'normally_open' or 'normally_closed'
        
        // Master Out binding - callbacks
        this.checkMasterBindEnabled = null;
        // Master bind mode removed - always use redirect behavior
    }

    /**
     * Log message with timestamp
     */
    log(message, type = 'info') {
        console.log(message);
        
        if (this.onLog) {
            this.onLog(message, type);
        }
    }

    /**
     * Update connection status
     */
    updateStatus(status) {
        this.log(`Status: ${status}`, 'info');
        if (this.onStatusChange) {
            this.onStatusChange(status);
        }
    }

    /**
     * Calculate Roland checksum (from Python script)
     */
    rolandChecksum(dataBytes) {
        const total = dataBytes.reduce((sum, byte) => sum + byte, 0);
        const remainder = total % 128;
        return (128 - remainder) % 128;
    }

    /**
     * Create BLE MIDI command (from Python script)
     */
    createBLEMidiCommand(sysexData) {
        // BLE MIDI format: [0x90, timestamp, 0xf0, ...sysex, timestamp, 0xf7]
        const timestamp = 0xb7; // Use same timestamp as Python script
        return new Uint8Array([
            0x90, timestamp, 0xf0,
            ...sysexData,
            timestamp, 0xf7
        ]);
    }

    /**
     * Check if Web Bluetooth is supported
     */
    static isSupported() {
        const userAgent = navigator.userAgent || '';
        const isHTTPS = window.location.protocol === 'https:';
        const isLocalhost = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1';
        const isSecureContext = window.isSecureContext;
        const hasNavigatorBluetooth = 'bluetooth' in navigator;
        
        // Enhanced debugging
        console.log('=== WEB BLUETOOTH DEBUG INFO ===');
        console.log('User Agent:', userAgent);
        console.log('Location:', window.location.href);
        console.log('Is HTTPS?', isHTTPS);
        console.log('Is localhost?', isLocalhost);
        console.log('');
        console.log('navigator object exists?', 'navigator' in window);
        console.log('navigator.bluetooth exists?', hasNavigatorBluetooth);
        console.log('navigator.bluetooth value:', navigator.bluetooth);
        console.log('');
        console.log('Is secure context?', isSecureContext);
        console.log('');
        // Browser detection
        const isChrome = /Chrome/.test(userAgent) && !/Edge/.test(userAgent);
        const isEdge = /Edge/.test(userAgent);
        const isOpera = /OPR/.test(userAgent);
        
        console.log('Is Chrome?', isChrome);
        console.log('Is Edge?', isEdge);
        console.log('Is Opera?', isOpera);
        console.log('');
        console.log('Document domain:', document.domain);
        console.log('Window.crypto exists?', 'crypto' in window);
        console.log('');
        console.log('=== END DEBUG INFO ===');
        
        return hasNavigatorBluetooth && isSecureContext && (isChrome || isEdge || isOpera);
    }

    /**
     * Handle pedal volume change (CC 127, value 0-127) with smart throttling
     */
    handlePedalVolumeChange(pedalValue) {
        if (pedalValue === this.lastPedalValue) return;
        
        this.lastPedalValue = pedalValue;
        
        // Get current parameter and convert pedal value to parameter range
        const param = this.getCurrentParameter();
        const paramValue = Math.round((pedalValue / 127) * param.max);
        
        // Update internal parameter immediately (no lag in UI)
        param.current = paramValue;
        
        // Store pending value for hardware transmission
        this.pedalThrottle.pendingValue = { paramKey: this.currentParameterKey, value: paramValue };
        
        // Always notify callbacks immediately for responsive UI
        this.pedalCallbacks.forEach(callback => {
            try {
                callback({ 
                    type: 'volume', 
                    value: paramValue, 
                    pedalValue,
                    parameter: param,
                    parameterKey: this.currentParameterKey
                });
            } catch (error) {
                console.error('Error in pedal callback:', error);
            }
        });
        
        // Handle hardware transmission with throttling
        this.throttledSendToHardware();
    }

    /**
     * Throttled sending to prevent BLE overflow and ensure final values
     */
    throttledSendToHardware() {
        // Don't send to hardware if pickup mode is suppressing updates
        if (this.pickupMode.suppressHardwareUpdates) {
            return;
        }
        
        const now = Date.now();
        const timeSinceLastSend = now - this.pedalThrottle.lastSentTime;
        
        // Clear any existing final value timer
        if (this.pedalThrottle.finalValueTimer) {
            clearTimeout(this.pedalThrottle.finalValueTimer);
        }
        
        // If we can send now (throttle interval passed and not currently sending)
        if (timeSinceLastSend >= this.pedalThrottle.sendInterval && 
            !this.pedalThrottle.isSending &&
            this.pedalThrottle.pendingValue) {
            
            this.sendPendingValueToHardware();
        }
        
        // Always set up final value timer to ensure the last value is sent
        this.pedalThrottle.finalValueTimer = setTimeout(() => {
            if (this.pedalThrottle.pendingValue && !this.pedalThrottle.isSending) {
                this.sendPendingValueToHardware();
            }
        }, this.pedalThrottle.finalValueDelay);
    }

    /**
     * Send pending value to hardware
     */
    async sendPendingValueToHardware() {
        if (!this.pedalThrottle.pendingValue || this.pedalThrottle.isSending) {
            return;
        }
        
        const { paramKey, value } = this.pedalThrottle.pendingValue;
        
        // Skip if this value was already sent
        if (value === this.pedalThrottle.lastSentValue) {
            this.pedalThrottle.pendingValue = null;
            return;
        }
        
        this.pedalThrottle.isSending = true;
        
        try {
            // Only send to Boss Cube if connected
            if (this.isCubeConnected) {
                await this.setParameter(paramKey, value);
                this.pedalThrottle.lastSentValue = value;
                this.pedalThrottle.lastSentTime = Date.now();
            }
        } catch (error) {
            console.error('Error sending parameter to hardware:', error);
        } finally {
            this.pedalThrottle.isSending = false;
            this.pedalThrottle.pendingValue = null;
        }
    }

    /**
     * Handle pedal button CC messages
     */
    handlePedalButtonCC(ccValue, direction) {
        // Apply footswitch polarity
        const isPressed = this.footswitchPolarity === 'normally_open' ? ccValue === 127 : ccValue === 0;
        
        if (isPressed) {
            if (direction === 'previous') {
                this.handlePedalButton('left');
            } else if (direction === 'next') {
                this.handlePedalButton('right');
            }
        }
    }

    /**
     * Handle pedal button press
     */
    handlePedalButton(button) {
        if (button === 'right') {
            this.nextParameter();
        } else if (button === 'left') {
            this.previousParameter();
        }
        
        // Notify callbacks
        this.pedalCallbacks.forEach(callback => {
            try {
                callback({ type: 'button', button, currentParameter: this.getCurrentParameter() });
            } catch (error) {
                console.error('Error in pedal button callback:', error);
            }
        });
    }

    /**
     * Switch to next parameter for pedal control
     */
    nextParameter() {
        const currentIndex = this.parameterKeys.indexOf(this.currentParameterKey);
        const nextIndex = (currentIndex + 1) % this.parameterKeys.length;
        this.currentParameterKey = this.parameterKeys[nextIndex];
        
        const param = this.getCurrentParameter();
        
        // Send effect switch commands if this parameter has them
        if (param.effectSwitchCommands) {
            this.sendEffectSwitchCommands(param.effectSwitchCommands);
        }
        
        // Notify callbacks about parameter change
        this.pedalCallbacks.forEach((callback, index) => {
                callback({ type: 'parameterChange', parameter: param });
        });
    }

    /**
     * Switch to previous parameter for pedal control
     */
    previousParameter() {
        const currentIndex = this.parameterKeys.indexOf(this.currentParameterKey);
        const prevIndex = currentIndex === 0 ? this.parameterKeys.length - 1 : currentIndex - 1;
        this.currentParameterKey = this.parameterKeys[prevIndex];
        
        const param = this.getCurrentParameter();
        
        // Send effect switch commands if this parameter has them
        if (param.effectSwitchCommands) {
            this.sendEffectSwitchCommands(param.effectSwitchCommands);
        }
        
        // Notify callbacks about parameter change
        this.pedalCallbacks.forEach((callback, index) => {
                callback({ type: 'parameterChange', parameter: param });
        });
    }

    /**
     * Get current parameter for pedal control
     */
    getCurrentParameter() {
        return this.parameters[this.currentParameterKey];
    }

    /**
     * Set current parameter for pedal control
     */
    setCurrentParameter(paramKey) {
        if (this.parameters[paramKey]) {
            this.currentParameterKey = paramKey;
            const param = this.getCurrentParameter();
            
            // Send effect switch commands if this parameter has them
            if (param.effectSwitchCommands) {
                this.sendEffectSwitchCommands(param.effectSwitchCommands);
            }
        }
    }

    /**
     * Enable pickup mode - suppresses hardware updates from pedal
     */
    enablePickupMode() {
        this.pickupMode.enabled = true;
        this.pickupMode.suppressHardwareUpdates = true;
    }

    /**
     * Disable pickup mode - allows hardware updates from pedal
     */
    disablePickupMode() {
        this.pickupMode.enabled = false;
        this.pickupMode.suppressHardwareUpdates = false;
    }

    /**
     * Check if pickup mode is active
     */
    isPickupModeActive() {
        return this.pickupMode.enabled;
    }

    /**
     * Add callback for pedal events
     */
    onPedalEvent(callback) {
        this.pedalCallbacks.push(callback);
    }

    /**
     * Remove pedal event callback
     */
    removePedalEventCallback(callback) {
        const index = this.pedalCallbacks.indexOf(callback);
        if (index > -1) {
            this.pedalCallbacks.splice(index, 1);
        }
    }

    /**
     * Notify about pedal status change
     */
    notifyPedalStatusChange() {
        this.pedalCallbacks.forEach(callback => {
            try {
                callback({ 
                    type: 'status', 
                    connected: this.isPedalConnected,
                    pedalName: this.pedalDevice?.name || null
                });
            } catch (error) {
                console.error('Error in pedal status callback:', error);
            }
        });
    }

    /**
     * Connect to Boss Cube via Web Bluetooth
     */
    async connectToBossCube() {
        if (!BossCubeController.isSupported()) {
            throw new Error('Web Bluetooth not supported');
        }

        try {
            console.log('Requesting Boss Cube device...');
            
            // Request Boss Cube device with BLE MIDI service
            this.cubeDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'CUBE' },
                    { services: [this.BLE_MIDI_SERVICE] }
                ],
                optionalServices: [this.BLE_MIDI_SERVICE]
            });

            console.log('Boss Cube selected:', this.cubeDevice.name);
            
            // Connect to GATT server
            console.log('Connecting to Boss Cube GATT server...');
            this.cubeServer = await this.cubeDevice.gatt.connect();
            
            console.log('Getting Boss Cube BLE MIDI service...');
            const service = await this.cubeServer.getPrimaryService(this.BLE_MIDI_SERVICE);
            
            console.log('Getting Boss Cube BLE MIDI characteristic...');
            this.cubeCharacteristic = await service.getCharacteristic(this.BLE_MIDI_CHARACTERISTIC);
            
            // Set up notifications for reading values from Boss Cube
            console.log('Enabling Boss Cube notifications...');
            await this.cubeCharacteristic.startNotifications();
            
            // Set up event listener for incoming data from Boss Cube
            this.cubeCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                this.handleBossCubeMIDIData(event.target.value);
            });
            
            this.isCubeConnected = true;
            console.log('✓ Boss Cube connected successfully with notifications enabled!');
            
            return true;
            
        } catch (error) {
            console.error('Boss Cube connection failed:', error);
            this.isCubeConnected = false;
            throw error;
        }
    }

    /**
     * Connect to EV-1-WL Pedal via Web Bluetooth
     */
    async connectToPedal() {
        if (!BossCubeController.isSupported()) {
            console.log('Web Bluetooth not supported for pedal connection');
            return false;
        }

        try {
            console.log('Requesting EV-1-WL pedal device...');
            
            // Request EV-1-WL pedal device
            this.pedalDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'EV-1' },
                    { namePrefix: 'EV-1-WL' },
                    { services: [this.BLE_MIDI_SERVICE] }
                ],
                optionalServices: [this.BLE_MIDI_SERVICE]
            });

            console.log('EV-1-WL pedal selected:', this.pedalDevice.name);
            
            // Connect to pedal GATT server
            console.log('Connecting to pedal GATT server...');
            this.pedalServer = await this.pedalDevice.gatt.connect();
            
            console.log('Getting pedal BLE MIDI service...');
            const service = await this.pedalServer.getPrimaryService(this.BLE_MIDI_SERVICE);
            
            console.log('Getting pedal BLE MIDI characteristic...');
            this.pedalCharacteristic = await service.getCharacteristic(this.BLE_MIDI_CHARACTERISTIC);
            
            // Enable notifications for incoming MIDI data
            console.log('Enabling pedal MIDI notifications...');
            await this.pedalCharacteristic.startNotifications();
            
            // Set up event listener for pedal input
            this.pedalCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                this.handlePedalMIDIData(event.target.value);
            });
            
            // Add disconnect event listener
            this.pedalDevice.addEventListener('gattserverdisconnected', () => {
                this.isPedalConnected = false;
                this.notifyPedalStatusChange();
            });
            
            this.isPedalConnected = true;
            console.log('✓ EV-1-WL pedal connected successfully!');
            
            // Notify about pedal connection
            this.notifyPedalStatusChange();
            
            return true;
            
        } catch (error) {
            console.error('Pedal connection failed:', error);
            this.isPedalConnected = false;
            return false;
        }
    }

    /**
     * Handle incoming MIDI data from pedal
     */
    handlePedalMIDIData(value) {
        const data = new Uint8Array(value.buffer);
        
        // Parse BLE MIDI format - look for Control Change messages
        for (let i = 0; i < data.length - 2; i++) {
            const status = data[i];
            const control = data[i + 1];
            const ccValue = data[i + 2];
            
            // Check if this is a Control Change message (0xB0-0xBF)
            if ((status & 0xF0) === 0xB0 && control < 0x80 && ccValue < 0x80) {
                // Volume control (configurable CC for pedal control)
                if (control === this.pedalCCCodes.pedalControl) {
                    this.handlePedalVolumeChange(ccValue);
                }
                // Previous parameter button (configurable CC)
                else if (control === this.pedalCCCodes.previousParameter) {
                    this.handlePedalButtonCC(ccValue, 'previous');
                }
                // Next parameter button (configurable CC)
                else if (control === this.pedalCCCodes.nextParameter) {
                    this.handlePedalButtonCC(ccValue, 'next');
                }
                // Log unhandled CC codes for debugging
                else {
                    this.log(`Unknown pedal CC: CC${control} = ${ccValue}`, 'warn');
                }
            }
        }
    }

    /**
     * Connect to both Boss Cube and optionally try to connect to pedal
     */
    async connect() {
        // First connect to Boss Cube (required)
        await this.connectToBossCube();
        
        // Then try to connect to pedal (optional)
        try {
            await this.connectToPedal();
        } catch (error) {
            console.log('Pedal connection failed, continuing with Boss Cube only:', error.message);
        }
        
        return true;
    }

    /**
     * Connect specifically to pedal (separate button)
     */
    async connectPedal() {
        return await this.connectToPedal();
    }

    /**
     * Disconnect from Boss Cube only
     */
    async disconnectBossCube() {
        try {
            console.log('Disconnecting from Boss Cube...');
            
            // Stop notification maintenance
            this.stopNotificationMaintenance();
            
            // Disconnect from Boss Cube
            if (this.cubeServer) {
                await this.cubeServer.disconnect();
            }
            
            // Reset Boss Cube connection state
            this.cubeDevice = null;
            this.cubeServer = null;
            this.cubeCharacteristic = null;
            this.isCubeConnected = false;
            
            console.log('✓ Disconnected from Boss Cube');
            
        } catch (error) {
            console.error('Error disconnecting from Boss Cube:', error);
            throw error;
        }
    }

    /**
     * Disconnect from Pedal only
     */
    async disconnectPedal() {
        try {
            console.log('Disconnecting from pedal...');
            
            // Clear any pending pedal timers
            if (this.pedalThrottle.finalValueTimer) {
                clearTimeout(this.pedalThrottle.finalValueTimer);
                this.pedalThrottle.finalValueTimer = null;
            }
            
            // Reset pedal throttle state
            this.pedalThrottle.pendingValue = null;
            this.pedalThrottle.isSending = false;
            this.pedalThrottle.lastSentValue = -1;
            
            // Disconnect from Pedal
            if (this.pedalServer) {
                if (this.pedalCharacteristic) {
                    try {
                        await this.pedalCharacteristic.stopNotifications();
                    } catch (error) {
                        console.log('Error stopping pedal notifications:', error);
                    }
                }
                await this.pedalServer.disconnect();
            }
            
            // Reset pedal connection state
            this.pedalDevice = null;
            this.pedalServer = null;
            this.pedalCharacteristic = null;
            this.isPedalConnected = false;
            
            console.log('✓ Disconnected from pedal');
            
            // Notify about pedal disconnection
            this.notifyPedalStatusChange();
            
        } catch (error) {
            console.error('Error disconnecting from pedal:', error);
            throw error;
        }
    }

    /**
     * Disconnect from both devices
     */
    async disconnect() {
        try {
            console.log('Disconnecting from all devices...');
            
            // Disconnect both devices in parallel
            const promises = [];
            
            if (this.isCubeConnected) {
                promises.push(this.disconnectBossCube());
            }
            
            if (this.isPedalConnected) {
                promises.push(this.disconnectPedal());
            }
            
            await Promise.all(promises);
            
            console.log('✓ Disconnected from all devices');
            
        } catch (error) {
            console.error('Error during disconnect:', error);
            throw error;
        }
    }

    /**
     * Calculate Roland checksum
     */
    calculateChecksum(data) {
        const total = data.reduce((sum, byte) => sum + byte, 0);
        const remainder = total % 128;
        return (128 - remainder) % 128;
    }

    /**
     * Create BLE MIDI command from SysEx data
     */
    createBLEMIDICommand(sysexData) {
        // BLE MIDI format: [0x90, timestamp, 0xF0, ...sysex..., timestamp, 0xF7]
        const timestamp = 0xB7; // Common timestamp value
        const command = [0x90, timestamp, 0xF0, ...sysexData, timestamp, 0xF7];
        
        return new Uint8Array(command);
    }

    /**
     * Handle incoming MIDI data from Boss Cube (read responses and notifications)
     * Boss Cube responses are often split across multiple BLE MIDI packets
     */
    handleBossCubeMIDIData(value) {
        const data = new Uint8Array(value.buffer);
        const timestamp = new Date().toISOString().substr(11, 8); // HH:MM:SS
        console.log(`🔔 [${timestamp}] Received Boss Cube MIDI data:`, Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        const now = Date.now();
        
        // Check for buffer timeout (incomplete SysEx message)
        if (this.bufferingActive && (now - this.lastBufferTime) > this.bufferTimeout) {
            console.log('⚠️ SysEx buffer timeout, clearing buffer');
            this.clearSysExBuffer();
        }
        
        // Parse BLE MIDI format - extract MIDI data bytes (skip timestamps)
        let i = 0;
        while (i < data.length) {
            const byte = data[i];
            
            // Skip BLE MIDI timestamps (0x80+) unless it's 0xF0 (SysEx start) or 0xF7 (SysEx end)
            if (byte >= 0x80 && byte !== 0xF0 && byte !== 0xF7) {
                i++;
                continue;
            }
            
            // Handle SysEx start
            if (byte === 0xF0) {
                console.log(`📥 [${timestamp}] SysEx start detected, beginning buffer`);
                this.clearSysExBuffer();
                this.bufferingActive = true;
                this.lastBufferTime = now;
                i++;
                continue;
            }
            
            // Handle SysEx end
            if (byte === 0xF7) {
                if (this.bufferingActive) {
                    console.log(`📥 [${timestamp}] SysEx end detected, processing complete message`);
                    this.processSysExBuffer();
                    this.clearSysExBuffer();
                } else {
                    console.log('⚠️ SysEx end without start, ignoring');
                }
                i++;
                continue;
            }
            
            // Regular MIDI data byte
            if (this.bufferingActive) {
                this.sysexBuffer.push(byte);
                this.lastBufferTime = now;
            }
            
            i++;
        }
    }

    /**
     * Clear the SysEx buffer
     */
    clearSysExBuffer() {
        this.sysexBuffer = [];
        this.bufferingActive = false;
        this.lastBufferTime = 0;
    }

    /**
     * Process the complete SysEx message from buffer
     */
    processSysExBuffer() {
        if (this.sysexBuffer.length === 0) {
            console.log('⚠️ Empty SysEx buffer, nothing to process');
            return;
        }
        
        console.log('📥 Processing SysEx buffer:', this.sysexBuffer.map(b => b.toString(16).padStart(2, '0')).join(' '));
        this.parseBossCubeSysEx(this.sysexBuffer);
    }

    /**
     * Parse Boss Cube SysEx response
     */
    parseBossCubeSysEx(sysexData) {
        const timestamp = new Date().toISOString().substr(11, 8); // HH:MM:SS
        console.log(`📥 [${timestamp}] Parsing Boss Cube SysEx:`, sysexData.map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        // Check minimum length for a Boss Cube response
        if (sysexData.length < 10) {
            const fullMessage = sysexData.map(b => b.toString(16).padStart(2, '0')).join(' ');
            console.log('SysEx too short, ignoring');
            
            // Log short SysEx messages to UI for debugging
            this.log(`🔍 Short SysEx received (${sysexData.length} bytes): ${fullMessage}`, 'info');
            return;
        }
        
        // Check if this is a Boss Cube response (starts with our header)
        const expectedHeader = [0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09];
        
        // Check header
        for (let i = 0; i < expectedHeader.length; i++) {
            if (sysexData[i] !== expectedHeader[i]) {
                const fullMessage = sysexData.map(b => b.toString(16).padStart(2, '0')).join(' ');
                console.log('Not a Boss Cube SysEx, ignoring');
                
                // Log non-Boss Cube SysEx messages to UI for debugging
                this.log(`🔍 Non-Boss Cube SysEx received: ${fullMessage}`, 'info');
                return;
            }
        }
        
        const command = sysexData[7]; // 0x12 for response to read request
        
        if (command === 0x12) {
            // This is a data response - extract address and value
            const addressBytes = sysexData.slice(8, 12); // 4 bytes for address
            
            // The response format appears to be:
            // HEADER(7) + COMMAND(1) + ADDRESS(4) + [LENGTH(1)] + VALUE(1) + CHECKSUM(1)
            // Based on tshark captures, there may be a length byte between address and value
            
            // Try to determine correct value position by checking if we have a known parameter
            let valueIndex = 12;
            let value = sysexData[valueIndex];
            
            // Check if this address corresponds to a known parameter
            const paramAddressBytes = sysexData.slice(8, 12);
            let foundParameter = null;
            for (const [key, param] of Object.entries(this.parameters)) {
                if (param.address.length === paramAddressBytes.length &&
                    param.address.every((byte, index) => byte === paramAddressBytes[index])) {
                    foundParameter = param;
                    break;
                }
            }
            
            // If we have a known parameter and the value at position 12 is 0x00,
            // check if position 13 might be the actual value (length byte scenario)
            if (foundParameter && value === 0x00 && sysexData.length > 13) {
                const alternateValue = sysexData[13];
                
                // If the alternate value is within the parameter's range but 0 is not expected,
                // or if 0 is outside the parameter's range, use the alternate value
                if (foundParameter.min > 0 && alternateValue >= foundParameter.min && alternateValue <= foundParameter.max) {
                valueIndex = 13;
                    value = alternateValue;
                    console.log('📖 Used alternate value position (length byte detected)');
                }
                // Otherwise stick with the 0 value as it might be valid
            }
            
            const checksum = sysexData[valueIndex + 1];
            
            // Determine if this is a response to our read request or a spontaneous notification
            const isPhysicalKnobChange = this.detectPhysicalKnobChange(addressBytes, value);
            const notificationType = isPhysicalKnobChange ? '🎛️ PHYSICAL KNOB' : '📖 READ RESPONSE';
            
            console.log(`${notificationType} [${timestamp}] Boss Cube value - Address: [${addressBytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}], Value: ${value}, Checksum: 0x${checksum.toString(16).padStart(2, '0')}`);
            
            // Find which parameter this corresponds to
            this.updateParameterFromCube(addressBytes, value, isPhysicalKnobChange);
        } else {
            const commandHex = `0x${command.toString(16).toUpperCase().padStart(2, '0')}`;
            const fullMessage = sysexData.map(b => b.toString(16).padStart(2, '0')).join(' ');
            console.log(`⚠️ Unknown Boss Cube command: ${commandHex}`);
            console.log(`Full SysEx: ${fullMessage}`);
            
            // Also log to UI for user visibility
            this.log(`🔍 Unknown Boss Cube command: ${commandHex} - Full SysEx: ${fullMessage}`, 'warning');
        }
    }

    /**
     * Update parameter value from Boss Cube response
     */
    updateParameterFromCube(addressBytes, value, isPhysicalKnobChange = false) {
        const addressStr = addressBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
        
        // Find parameter by address
        for (const [key, param] of Object.entries(this.parameters)) {
            if (param.address.length === addressBytes.length &&
                param.address.every((byte, index) => byte === addressBytes[index])) {
                
                const updateType = isPhysicalKnobChange ? '🎛️' : '📖';
                
                // Create category display name for better context
                const categoryNames = {
                    'mixer': 'Mixer',
                    'guitarReverb': 'Guitar Reverb',
                    'micInstReverb': 'Mic/Inst Reverb',
                    'guitarDelay': 'Guitar Delay',
                    'guitarEffects': 'Guitar Effects',
                    'micInstEffects': 'Mic/Inst Effects',
                    'guitarEQ': 'Guitar EQ',
                    'micInstEQ': 'Mic/Inst EQ',
                    'guitarAmp': 'Guitar Amp',
                    'looper': 'Looper',
                    'tuner': 'Tuner'
                };
                
                const categoryName = categoryNames[param.category] || param.category;
                const displayName = `${categoryName} ${param.name}`;
                
                // Log to UI for user visibility
                this.log(`${updateType} ${addressStr} = ${value} (${displayName})`, isPhysicalKnobChange ? 'info' : 'success');
                
                // Check for Master Out binding - redirect Aux knob to control both sliders
                if (key === 'auxBluetoothVolume' && isPhysicalKnobChange && 
                    this.checkMasterBindEnabled && this.checkMasterBindEnabled()) {
                    
                    console.log(`🔗 BINDING ACTIVE! Aux knob value: ${value} - updating both sliders`);
                    
                    // Update master volume on the amp
                    this.setParameter('masterVolume', value).catch(error => {
                        console.error('Failed to set master volume during binding:', error);
                    });
                    
                    // Update master volume parameter and UI
                    this.parameters.masterVolume.current = value;
                    if (this.onParameterUpdate) {
                        this.onParameterUpdate('masterVolume', value, isPhysicalKnobChange);
                    }
                    
                    // Continue with normal aux volume update (so both sliders move)
                    // actualKey and actualParam remain as auxBluetoothVolume
                }
                
                // Handle value conversion from Boss Cube (some parameters send 1-based values)
                let uiValue = value;
                
                // Parameters that need -1 conversion (1-based Boss Cube to 0-based UI)
                const needsMinusOne = ['looperControl'];
                if (needsMinusOne.includes(key)) {
                    uiValue = Math.max(0, value - 1);
                }
                
                // Parameters that need -1 for EQ (1-100 Boss Cube to 0-100 UI)
                const eqParams = ['micInstEQBass', 'micInstEQMiddle', 'micInstEQTreble', 
                                 'guitarEQBass', 'guitarEQMiddle', 'guitarEQTreble', 'guitarGain'];
                if (eqParams.includes(key)) {
                    uiValue = Math.max(0, value - 1);
                }
                
                // Update parameter value
                param.current = uiValue;
                
                // Notify callbacks about the update
                if (this.onParameterUpdate) {
                    this.onParameterUpdate(key, uiValue, isPhysicalKnobChange);
                }
                
                // If this is a physical knob change, also notify about it specifically
                if (isPhysicalKnobChange && this.onPhysicalKnobChange) {
                    this.onPhysicalKnobChange(key, param.name, uiValue);
                }
                
                return;
            }
        }
        
        const unknownAddr = addressBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
        const unknownType = isPhysicalKnobChange ? '🎛️' : '📖';
        
        // Log to UI for user visibility
        this.log(`🔍 ${unknownAddr} = ${value} (unknown)`, 'warning');
    }

    /**
     * Send parameter command to Boss Cube
     */
    async sendParameterCommand(address, value) {
        if (!this.isCubeConnected) {
            throw new Error('Boss Cube not connected');
        }

        // Handle 16-bit values
        let valueBytes;
        if (Array.isArray(value)) {
            // Already an array of bytes
            valueBytes = value;
        } else if (value > 127) {
            // 16-bit value: split into two bytes (high, low)
            const high = Math.floor(value / 128);
            const low = value % 128;
            valueBytes = [high, low];
        } else {
            // 8-bit value
            valueBytes = [value];
        }
        
        // Create SysEx command: F0 41 10 00 00 00 00 09 12 [address] [value_bytes] [checksum] F7
        const baseCommand = [0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, 0x12];
        const dataBytes = [...address, ...valueBytes];
        const checksum = this.rolandChecksum([...baseCommand.slice(1), ...dataBytes]);
        const sysexData = [...baseCommand, ...dataBytes, checksum];
            
        const command = this.createBLEMidiCommand(sysexData);
            
        try {
            await this.cubeCharacteristic.writeValue(command);
            this.log(`📤 ${address.map(b => b.toString(16).padStart(2, '0')).join(' ')} = ${valueBytes.join(',')}`, 'info');
        } catch (error) {
            this.log(`Failed to send parameter command: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Send read request to Boss Cube to get current parameter value
     */
    async sendParameterReadRequest(address) {
        if (!this.isCubeConnected || !this.cubeCharacteristic) {
            throw new Error('Not connected to Boss Cube');
        }

        try {
            // Track this read request for physical knob detection
            this.trackReadRequest(address);
            
            // Create read request header (0x11 instead of 0x12)
            const readHeader = [...this.BOSS_CUBE_HEADER];
            readHeader[7] = 0x11; // Change command to read request
            
            // Create SysEx message for read request
            const data = [...readHeader, ...address, 0x00, 0x00, 0x00, 0x01]; // Request 1 byte
            const checksum = this.calculateChecksum([...address, 0x00, 0x00, 0x00, 0x01]);
            const sysexData = [...data, checksum];
            
            // Create BLE MIDI command
            const command = this.createBLEMIDICommand(sysexData);
            
            // console.log('📤 Read request sent');
            
            // Send via Web Bluetooth
            await this.cubeCharacteristic.writeValueWithoutResponse(command);
            
            return true;
            
        } catch (error) {
            console.error('Failed to send read request to Boss Cube:', error);
            throw error;
        }
    }

    /**
     * Read current value of a parameter from Boss Cube
     */
    async readParameter(paramKey) {
        const param = this.parameters[paramKey];
        if (!param) {
            throw new Error(`Unknown parameter: ${paramKey}`);
        }
        
        // Reading parameter from Boss Cube
        return await this.sendParameterReadRequest(param.address);
    }

    /**
     * Read all mixer parameter values from Boss Cube
     */
    async readAllMixerValues() {
        if (!this.isCubeConnected) {
            throw new Error('Not connected to Boss Cube');
        }
        
        console.log('📖 Reading all mixer values from Boss Cube...');
        
        const mixerParams = this.getParametersByCategory('mixer');
        
        for (const [key, param] of Object.entries(mixerParams)) {
            try {
                await this.readParameter(key);
                // Small delay between requests to avoid overwhelming the cube
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Failed to read ${param.name}:`, error);
            }
        }
    }

    /**
     * Read all effects parameter values from Boss Cube
     */
    async readAllEffectsValues() {
        if (!this.isCubeConnected) {
            throw new Error('Not connected to Boss Cube');
        }
        
        console.log('📖 Reading all effects values from Boss Cube...');
        
        const effectsParams = this.getParametersByCategory('effects');
        
        for (const [key, param] of Object.entries(effectsParams)) {
            try {
                await this.readParameter(key);
                // Small delay between requests to avoid overwhelming the cube
                await new Promise(resolve => setTimeout(resolve, 150));
            } catch (error) {
                console.error(`Failed to read ${param.name}:`, error);
            }
        }
    }

    /**
     * Read all parameter values from Boss Cube (all categories)
     */
    async readAllValues() {
        if (!this.isCubeConnected) {
            throw new Error('Not connected to Boss Cube');
        }
        
        console.log('📖 Reading ALL parameter values from Boss Cube...');
        
        // Read all parameters regardless of category
        for (const [key, param] of Object.entries(this.parameters)) {
            try {
                await this.readParameter(key);
                // Small delay between requests to avoid overwhelming the cube
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Failed to read ${param.name}:`, error);
            }
        }
        
        console.log('✅ All parameter read requests sent');
    }

    /**
     * Set any parameter by key
     */
    async setParameter(paramKey, value) {
        if (!this.parameters[paramKey]) {
            throw new Error(`Unknown parameter: ${paramKey}`);
        }
        
        const param = this.parameters[paramKey];
        
        // Clamp value to parameter range
        value = Math.max(param.min, Math.min(param.max, value));
        
        // Update internal value
        param.current = value;

        // Handle value conversion for Boss Cube (some parameters need 1-based values)
        let sendValue = value;
        
        // Parameters that need +1 conversion (0-based UI to 1-based Boss Cube)
        const needsPlusOne = ['looperControl'];
        if (needsPlusOne.includes(paramKey)) {
            sendValue = value + 1;
        }
        
        // Parameters that need +1 for EQ (0-100 UI to 1-100 Boss Cube)  
        const eqParams = ['micInstEQBass', 'micInstEQMiddle', 'micInstEQTreble', 
                         'guitarEQBass', 'guitarEQMiddle', 'guitarEQTreble', 'guitarGain'];
        if (eqParams.includes(paramKey)) {
            sendValue = value + 1;
        }

        // Handle 16-bit parameters
        if (param.is16Bit) {
            // For 16-bit parameters, send as two bytes
            const high = Math.floor(sendValue / 128);
            const low = sendValue % 128;
            sendValue = [high, low];
        }
        
        // Send to Boss Cube
        await this.sendParameterCommand(param.address, sendValue);
        
        this.log(`Set ${param.name} to ${value}`, 'success');
    }

    /**
     * Set master volume (0-100) - legacy method
     */
    async setMasterVolume(volume) {
        return await this.setParameter('masterVolume', volume);
    }

    /**
     * Send effect switch commands for effects that require mode switching
     */
    async sendEffectSwitchCommands(commands) {
        if (!this.isCubeConnected || !this.cubeCharacteristic) {
            console.log('Cannot send effect switch commands: not connected to Boss Cube');
            return false;
        }

        try {
            for (const command of commands) {
                // Add checksum to switch command
                const checksum = this.calculateChecksum(command);
                const sysexData = [...this.BOSS_CUBE_HEADER, ...command, checksum];
                
                // Create BLE MIDI command
                const bleMidiCommand = this.createBLEMIDICommand(sysexData);
                
                console.log('Sending effect switch command:', Array.from(bleMidiCommand).map(b => b.toString(16).padStart(2, '0')).join(' '));
                
                // Send via Web Bluetooth (use writeValue for effect switching to ensure it's processed)
                await this.cubeCharacteristic.writeValue(bleMidiCommand);
                
                // Small delay between commands for effect switching
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            console.log('Effect switch commands sent successfully');
            return true;
            
        } catch (error) {
            console.error('Failed to send effect switch commands:', error);
            return false;
        }
    }

    /**
     * Mute master volume
     */
    async muteMasterVolume() {
        return await this.setMasterVolume(0);
    }

    /**
     * Unmute master volume (restore to 50%)
     */
    async unmuteMasterVolume() {
        return await this.setMasterVolume(50);
    }

    /**
     * Test connection with a simple command
     */
    async testConnection() {
        try {
            // Test with a volume command
            await this.setMasterVolume(this.parameters.masterVolume.current);
            return true;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }

    /**
     * Get current connection status
     */
    getStatus() {
        return {
            bluetooth: this.isCubeConnected,
            pedal: this.isPedalConnected,
            pedalName: this.pedalDevice?.name || null,
            currentParameter: this.getCurrentParameter(),
            currentParameterKey: this.currentParameterKey,
            parameters: this.parameters
        };
    }

    /**
     * Get parameters by category
     */
    getParametersByCategory(category, effectType = null) {
        const filtered = {};
        for (const [key, param] of Object.entries(this.parameters)) {
            if (param.category === category && 
                (effectType === null || param.effectType === effectType)) {
                filtered[key] = param;
            }
        }
        return filtered;
    }

    /**
     * Send special command for testing notifications
     */
    async sendSpecialCommand(address, data) {
        if (!this.isCubeConnected || !this.cubeCharacteristic) {
            throw new Error('Not connected to Boss Cube');
        }

        try {
            // Create SysEx message with special command
            const sysexData = [...this.BOSS_CUBE_HEADER, ...address, ...data];
            const checksum = this.calculateChecksum([...address, ...data]);
            const completeSysex = [...sysexData, checksum];
            
            // Create BLE MIDI command
            const command = this.createBLEMIDICommand(completeSysex);
            
            console.log('📡 Sending special command to Boss Cube:', Array.from(command).map(b => b.toString(16).padStart(2, '0')).join(' '));
            console.log('📋 SysEx breakdown - Address:', address.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '), 'Data:', data.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            
            // Send via Web Bluetooth
            await this.cubeCharacteristic.writeValueWithoutResponse(command);
            
            return true;
            
        } catch (error) {
            console.error('Failed to send special command to Boss Cube:', error);
            throw error;
        }
    }

    /**
     * Legacy getter for backward compatibility
     */
    get isConnected() {
        return this.isCubeConnected;
    }

    /**
     * Detect if this is a physical knob change vs response to our read request
     */
    detectPhysicalKnobChange(addressBytes, value) {
        const now = Date.now();
        const addressKey = addressBytes.join(',');
        
        // Clean up expired read requests
        for (const [key, timestamp] of this.pendingReadRequests.entries()) {
            if (now - timestamp > this.readRequestTimeout) {
                this.pendingReadRequests.delete(key);
            }
        }
        
        // Check if we recently sent a read request for this address
        if (this.pendingReadRequests.has(addressKey)) {
            // This is likely a response to our read request
            this.pendingReadRequests.delete(addressKey);
            return false;
        }
        
        // If we haven't sent a read request recently, this is likely a physical knob change
        // Also check if it's been a while since any read request (spontaneous notification)
        const timeSinceLastRead = now - this.lastReadRequestTime;
        return timeSinceLastRead > 1000; // If more than 1 second since last read, consider it physical
    }

    /**
     * Track a read request for physical knob detection
     */
    trackReadRequest(addressBytes) {
        const now = Date.now();
        const addressKey = addressBytes.join(',');
        this.pendingReadRequests.set(addressKey, now);
        this.lastReadRequestTime = now;
        console.log(`📋 Tracking read: ${addressBytes.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    }

    // Send initialization read command (0x11) to system addresses
    async sendInitReadCommand(address, name) {
        if (!this.isCubeConnected || !this.cubeCharacteristic) {
            throw new Error('Boss Cube not connected');
        }
        
        try {
            // Roland SysEx with READ command (0x11) instead of SET command (0x12)
            const sysex = [
                0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, // Roland header
                0x11, // READ command (key difference!)
                ...address, // System address (like 0x7F, 0x00, 0x00, 0x00)
                0x00, 0x00, 0x00, 0x01 // Read length (1 byte)
            ];
            
            // Add checksum
            const checksum = this.calculateChecksum([...address, 0x00, 0x00, 0x00, 0x01]);
            sysex.push(checksum);
            
            console.log(`📖 Sending init read to ${name} [${address.map(b => b.toString(16).padStart(2, '0')).join(' ')}]:`, 
                       sysex.map(b => b.toString(16).padStart(2, '0')).join(' '));
            
            // Create BLE MIDI command and send
            const command = this.createBLEMIDICommand(sysex);
            await this.cubeCharacteristic.writeValueWithoutResponse(command);
            
        } catch (error) {
            console.error(`Failed to send init read command to ${name}:`, error);
            throw error;
        }
    }
    
    // Enable GATT-level notifications
    async enableGATTNotifications() {
        if (!this.isCubeConnected || !this.cubeCharacteristic) {
            throw new Error('Boss Cube not connected');
        }
        
        try {
            // Try to enable notifications on the MIDI characteristic
            // This writes 0x0001 to the Client Characteristic Configuration Descriptor
            const characteristic = this.cubeCharacteristic;
            
            console.log('🔔 Attempting to enable GATT notifications...');
            
            // First, try the standard notification enable
            await characteristic.startNotifications();
            console.log('✅ Standard notification enable successful');
            
            // Also try manual CCCD write if available
            if (characteristic.service && characteristic.service.device) {
                console.log('🔧 Attempting manual CCCD write...');
                // This is a more advanced approach - may not work in all browsers
                try {
                    const cccdUuid = '00002902-0000-1000-8000-00805f9b34fb';
                    // Note: This approach may not work in all browsers
                    console.log('📝 Manual CCCD write not supported in this browser');
                } catch (e) {
                    console.log('📝 Manual CCCD write not available:', e.message);
                }
            }
            
        } catch (error) {
            console.error('Failed to enable GATT notifications:', error);
            throw error;
        }
    }

    // Enable continuous notifications (key command from btsnoop analysis)
    async enableContinuousNotifications() {
        if (!this.isCubeConnected || !this.cubeCharacteristic) {
            throw new Error('Boss Cube not connected');
        }
        
        try {
            // The key command found in btsnoop: SET command to address 7F 00 00 01 with value 01
            // This enables continuous physical knob notifications
            const sysex = [
                0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, // Roland header
                0x12, // SET command (not read!)
                0x7F, 0x00, 0x00, 0x01, // Address: notification enable register
                0x01 // Value: enable continuous notifications
            ];
            
            // Add checksum
            const checksum = this.calculateChecksum([0x7F, 0x00, 0x00, 0x01, 0x01]);
            sysex.push(checksum);
            
            console.log('🔔 Sending continuous notification enable command:', 
                       sysex.map(b => b.toString(16).padStart(2, '0')).join(' '));
            
            // Create BLE MIDI command and send
            const command = this.createBLEMIDICommand(sysex);
            await this.cubeCharacteristic.writeValueWithoutResponse(command);
            
            console.log('✅ Continuous notification enable command sent!');
            
        } catch (error) {
            console.error('Failed to enable continuous notifications:', error);
            throw error;
        }
    }

    /**
     * Control tuner on/off (verified address from README)
     */
    async setTunerControl(enabled) {
        if (!this.isCubeConnected || !this.cubeCharacteristic) {
            throw new Error('Boss Cube not connected');
        }

        try {
            // Send tuner control command: 7F 00 00 02 = [00/01]
            const sysex = [
                0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, // Roland header
                0x12, // SET command
                0x7F, 0x00, 0x00, 0x02, // Address: tuner control register
                enabled ? 0x01 : 0x00 // Value: enable/disable tuner
            ];
            
            // Add checksum
            const checksum = this.calculateChecksum([0x7F, 0x00, 0x00, 0x02, enabled ? 0x01 : 0x00]);
            sysex.push(checksum);
            
            console.log(`🎵 Sending tuner ${enabled ? 'enable' : 'disable'} command:`, 
                       sysex.map(b => b.toString(16).padStart(2, '0')).join(' '));
            
            // Create BLE MIDI command and send
            const command = this.createBLEMIDICommand(sysex);
            await this.cubeCharacteristic.writeValueWithoutResponse(command);
            
            this.log(`🎵 Tuner ${enabled ? 'enabled' : 'disabled'}`, 'success');
            
        } catch (error) {
            this.log(`Failed to control tuner: ${error.message}`, 'error');
            throw error;
        }
    }
    
    // Start periodic notification maintenance (keeps notifications alive)
    startNotificationMaintenance() {
        // Clear any existing maintenance timer
        this.stopNotificationMaintenance();
        
        // Send the enable command every 5 seconds to maintain notifications
        this.notificationMaintenanceTimer = setInterval(async () => {
            if (this.isCubeConnected) {
                try {
                    console.log('⏰ Sending periodic notification maintenance...');
                    await this.enableContinuousNotifications();
                } catch (error) {
                    console.error('Notification maintenance failed:', error);
                    // Stop maintenance if connection is lost
                    if (!this.isCubeConnected) {
                        this.stopNotificationMaintenance();
                    }
                }
            } else {
                // Stop maintenance if not connected
                this.stopNotificationMaintenance();
            }
        }, 5000); // Every 5 seconds
        
        console.log('⏰ Started notification maintenance (every 5 seconds)');
    }
    
    // Stop periodic notification maintenance
    stopNotificationMaintenance() {
        if (this.notificationMaintenanceTimer) {
            clearInterval(this.notificationMaintenanceTimer);
            this.notificationMaintenanceTimer = null;
            console.log('⏹️ Stopped notification maintenance');
        }
    }

    /**
     * Switch guitar effect type
     */
    async switchGuitarEffect(effectType) {
        if (!this.effectSwitchCommands.guitar[effectType]) {
            throw new Error(`Unknown guitar effect type: ${effectType}`);
        }
        
        this.currentGuitarEffect = effectType;
        const commands = this.effectSwitchCommands.guitar[effectType];
        
        try {
            // Send switch command
            await this.sendSpecialCommand(commands.switch.slice(0, 4), commands.switch.slice(4));
            
            // Small delay between commands
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Send activation command
            await this.sendSpecialCommand(commands.activate.slice(0, 4), commands.activate.slice(4));
            
            this.log(`Switched to guitar effect: ${effectType}`, 'info');
        } catch (error) {
            this.log(`Failed to switch guitar effect: ${error.message}`, 'error');
            throw error;
        }
    }
    
    /**
     * Switch mic/inst effect type
     */
    async switchMicInstEffect(effectType) {
        if (!this.effectSwitchCommands.micInst[effectType]) {
            throw new Error(`Unknown mic/inst effect type: ${effectType}`);
        }
        
        this.currentMicInstEffect = effectType;
        const commands = this.effectSwitchCommands.micInst[effectType];
        
        try {
            // Send switch command (mic/inst effects only need one command)
            await this.sendSpecialCommand(commands.switch.slice(0, 4), commands.switch.slice(4));
            
            this.log(`Switched to mic/inst effect: ${effectType}`, 'info');
        } catch (error) {
            this.log(`Failed to switch mic/inst effect: ${error.message}`, 'error');
            throw error;
        }
    }
    
    /**
     * Get parameters for current guitar effect
     */
    getCurrentGuitarEffectParameters() {
        return this.getParametersByCategory('guitarEffects', this.currentGuitarEffect);
    }
    
    /**
     * Get parameters for current mic/inst effect
     */
    getCurrentMicInstEffectParameters() {
        return this.getParametersByCategory('micInstEffects', this.currentMicInstEffect);
    }
    
    /**
     * Set pedal CC codes
     */
    setPedalCCCodes(previousParameter, nextParameter, pedalControl) {
        this.pedalCCCodes = {
            previousParameter: previousParameter,
            nextParameter: nextParameter,
            pedalControl: pedalControl
        };
        this.log(`Pedal CC codes updated: Previous=${previousParameter}, Next=${nextParameter}, Control=${pedalControl}`, 'info');
    }
    
    /**
     * Set footswitch polarity
     */
    setFootswitchPolarity(polarity) {
        this.footswitchPolarity = polarity;
        this.log(`Footswitch polarity set to: ${polarity}`, 'info');
    }
} 