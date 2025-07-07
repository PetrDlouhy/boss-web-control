/**
 * Unit Tests for PedalCommunication Class
 * Tests critical MIDI parsing functions to prevent pedal lag issues
 */

import { PedalCommunication } from './pedal-communication.js';

class TestFramework {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, testFunction) {
        this.tests.push({ name, testFunction });
    }

    async run() {
        console.log('🧪 Running PedalCommunication Tests...\n');
        
        for (const test of this.tests) {
            try {
                await test.testFunction();
                console.log(`✅ ${test.name}`);
                this.passed++;
            } catch (error) {
                console.error(`❌ ${test.name}: ${error.message}`);
                this.failed++;
            }
        }
        
        console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
        return this.failed === 0;
    }

    assert(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    }

    assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(`${message}: expected ${expected}, got ${actual}`);
        }
    }

    assertArrayEqual(actual, expected, message) {
        if (actual.length !== expected.length || !actual.every((val, i) => val === expected[i])) {
            throw new Error(`${message}: expected [${expected}], got [${actual}]`);
        }
    }
}

// Test helper to create mock MIDI data
function createMIDIData(messages) {
    const data = [];
    for (const msg of messages) {
        data.push(msg.status, msg.control, msg.value);
    }
    return new Uint8Array(data);
}

// Test helper to create BLE MIDI packet with timestamps
function createBLEMIDIPacket(messages) {
    const data = [];
    data.push(0x80); // BLE MIDI timestamp header
    for (const msg of messages) {
        data.push(msg.status, msg.control, msg.value);
    }
    return new Uint8Array(data);
}

// Test suite
const test = new TestFramework();

test.test('PedalCommunication instantiation', () => {
    const pedal = new PedalCommunication();
    test.assert(pedal !== null, 'PedalCommunication should be instantiated');
    test.assertEqual(pedal.isConnected, false, 'Should start disconnected');
    test.assertEqual(pedal.lastPedalValue, -1, 'Should start with no last value');
});

test.test('handleMIDIData - Single CC message', () => {
    const pedal = new PedalCommunication();
    const receivedEvents = [];
    
    pedal.onVolumeChange = (event) => receivedEvents.push(event);
    
    // Create single CC message: CC 127 (pedal control) with value 64
    const data = createMIDIData([{ status: 0xB0, control: 127, value: 64 }]);
    
    pedal.handleMIDIData({ buffer: data.buffer });
    
    test.assertEqual(receivedEvents.length, 1, 'Should process one volume change event');
    test.assertEqual(receivedEvents[0].value, 64, 'Should receive correct value');
    test.assertEqual(pedal.lastPedalValue, 64, 'Should update last pedal value');
});

test.test('handleMIDIData - Multiple CC messages in one packet', () => {
    const pedal = new PedalCommunication();
    const receivedEvents = [];
    
    pedal.onVolumeChange = (event) => receivedEvents.push(event);
    
    // Create multiple CC messages in one packet
    const data = createMIDIData([
        { status: 0xB0, control: 127, value: 32 },
        { status: 0xB0, control: 127, value: 64 },
        { status: 0xB0, control: 127, value: 96 }
    ]);
    
    pedal.handleMIDIData({ buffer: data.buffer });
    
    test.assertEqual(receivedEvents.length, 3, 'Should process all three messages');
    test.assertEqual(receivedEvents[0].value, 32, 'First message value should be 32');
    test.assertEqual(receivedEvents[1].value, 64, 'Second message value should be 64');
    test.assertEqual(receivedEvents[2].value, 96, 'Third message value should be 96');
    test.assertEqual(pedal.lastPedalValue, 96, 'Should update to last value');
});

test.test('handleMIDIData - BLE MIDI format with timestamps', () => {
    const pedal = new PedalCommunication();
    const receivedEvents = [];
    
    pedal.onVolumeChange = (event) => receivedEvents.push(event);
    
    // Create BLE MIDI packet with timestamp
    const data = createBLEMIDIPacket([
        { status: 0xB0, control: 127, value: 75 }
    ]);
    
    pedal.handleMIDIData({ buffer: data.buffer });
    
    test.assertEqual(receivedEvents.length, 1, 'Should process message despite timestamp');
    test.assertEqual(receivedEvents[0].value, 75, 'Should receive correct value');
});

test.test('handleMIDIData - Invalid MIDI bytes (>= 0x80)', () => {
    const pedal = new PedalCommunication();
    const receivedEvents = [];
    
    pedal.onVolumeChange = (event) => receivedEvents.push(event);
    
    // Create invalid MIDI data with control byte >= 0x80
    const data = createMIDIData([
        { status: 0xB0, control: 0x80, value: 64 }, // Invalid control byte
        { status: 0xB0, control: 127, value: 0x80 }, // Invalid value byte
        { status: 0xB0, control: 127, value: 64 }    // Valid message
    ]);
    
    pedal.handleMIDIData({ buffer: data.buffer });
    
    test.assertEqual(receivedEvents.length, 1, 'Should only process valid message');
    test.assertEqual(receivedEvents[0].value, 64, 'Should receive value from valid message');
});

test.test('handleMIDIData - Non-CC messages ignored', () => {
    const pedal = new PedalCommunication();
    const receivedEvents = [];
    
    pedal.onVolumeChange = (event) => receivedEvents.push(event);
    
    // Create non-CC messages (Note On/Off)
    const data = createMIDIData([
        { status: 0x90, control: 60, value: 100 }, // Note On
        { status: 0x80, control: 60, value: 0 },   // Note Off
        { status: 0xB0, control: 127, value: 50 }  // Valid CC
    ]);
    
    pedal.handleMIDIData({ buffer: data.buffer });
    
    test.assertEqual(receivedEvents.length, 1, 'Should only process CC message');
    test.assertEqual(receivedEvents[0].value, 50, 'Should receive value from CC message');
});

test.test('handleVolumeChange - Duplicate value filtering', () => {
    const pedal = new PedalCommunication();
    const receivedEvents = [];
    
    pedal.onVolumeChange = (event) => receivedEvents.push(event);
    
    // Send same value multiple times
    pedal.handleVolumeChange(64);
    pedal.handleVolumeChange(64);
    pedal.handleVolumeChange(64);
    pedal.handleVolumeChange(65);
    pedal.handleVolumeChange(65);
    
    test.assertEqual(receivedEvents.length, 2, 'Should filter duplicate values');
    test.assertEqual(receivedEvents[0].value, 64, 'First unique value should be 64');
    test.assertEqual(receivedEvents[1].value, 65, 'Second unique value should be 65');
});

test.test('handleVolumeChange - Value range validation', () => {
    const pedal = new PedalCommunication();
    const receivedEvents = [];
    const logMessages = [];
    
    pedal.onVolumeChange = (event) => receivedEvents.push(event);
    pedal.onLog = (message, type) => logMessages.push({ message, type });
    
    // Test invalid values
    pedal.handleVolumeChange(-1);
    pedal.handleVolumeChange(128);
    pedal.handleVolumeChange(255);
    
    // Test valid values
    pedal.handleVolumeChange(0);
    pedal.handleVolumeChange(127);
    
    test.assertEqual(receivedEvents.length, 2, 'Should only process valid values');
    test.assertEqual(receivedEvents[0].value, 0, 'Should accept minimum valid value');
    test.assertEqual(receivedEvents[1].value, 127, 'Should accept maximum valid value');
    
    const warningMessages = logMessages.filter(log => log.type === 'warning');
    test.assertEqual(warningMessages.length, 3, 'Should log warnings for invalid values');
});

test.test('handleMIDICC - Button press detection', () => {
    const pedal = new PedalCommunication();
    const receivedEvents = [];
    
    pedal.onButtonPress = (event) => receivedEvents.push(event);
    
    // Set custom CC codes
    pedal.setPedalCCCodes(20, 21, 127);
    
    // Test button presses
    pedal.handleMIDICC(20, 127); // Previous button press
    pedal.handleMIDICC(21, 127); // Next button press
    pedal.handleMIDICC(20, 0);   // Previous button release
    pedal.handleMIDICC(21, 0);   // Next button release
    
    test.assertEqual(receivedEvents.length, 2, 'Should detect two button presses');
    test.assertEqual(receivedEvents[0].button, 'previous', 'First press should be previous');
    test.assertEqual(receivedEvents[1].button, 'next', 'Second press should be next');
});

test.test('handleMIDICC - Unknown CC codes ignored', () => {
    const pedal = new PedalCommunication();
    const receivedEvents = [];
    const consoleMessages = [];
    
    // Mock console.log to capture unknown CC messages
    const originalConsoleLog = console.log;
    console.log = (...args) => {
        consoleMessages.push(args.join(' '));
        originalConsoleLog(...args);
    };
    
    pedal.onVolumeChange = (event) => receivedEvents.push(event);
    
    // Send unknown CC codes
    pedal.handleMIDICC(1, 64);   // Unknown CC
    pedal.handleMIDICC(64, 100); // Unknown CC
    pedal.handleMIDICC(127, 50); // Known CC (pedal control)
    
    console.log = originalConsoleLog; // Restore console.log
    
    test.assertEqual(receivedEvents.length, 1, 'Should only process known CC');
    test.assertEqual(receivedEvents[0].value, 50, 'Should receive value from known CC');
    
    const unknownCCMessages = consoleMessages.filter(msg => msg.includes('Unknown pedal CC'));
    test.assertEqual(unknownCCMessages.length, 2, 'Should log unknown CC messages');
});

test.test('Footswitch polarity - Normally Open', () => {
    const pedal = new PedalCommunication();
    const receivedEvents = [];
    
    pedal.onButtonPress = (event) => receivedEvents.push(event);
    pedal.setFootswitchPolarity('normally_open');
    pedal.setPedalCCCodes(20, 21, 127);
    
    // Test normally open behavior (127 = pressed, 0 = released)
    pedal.handleButtonCC(127, 'previous'); // Should trigger
    pedal.handleButtonCC(0, 'previous');   // Should not trigger
    pedal.handleButtonCC(127, 'next');     // Should trigger
    
    test.assertEqual(receivedEvents.length, 2, 'Should detect presses only for value 127');
    test.assertEqual(receivedEvents[0].button, 'previous', 'First press should be previous');
    test.assertEqual(receivedEvents[1].button, 'next', 'Second press should be next');
});

test.test('Footswitch polarity - Normally Closed', () => {
    const pedal = new PedalCommunication();
    const receivedEvents = [];
    
    pedal.onButtonPress = (event) => receivedEvents.push(event);
    pedal.setFootswitchPolarity('normally_closed');
    pedal.setPedalCCCodes(20, 21, 127);
    
    // Test normally closed behavior (0 = pressed, 127 = released)
    pedal.handleButtonCC(0, 'previous');   // Should trigger
    pedal.handleButtonCC(127, 'previous'); // Should not trigger
    pedal.handleButtonCC(0, 'next');       // Should trigger
    
    test.assertEqual(receivedEvents.length, 2, 'Should detect presses only for value 0');
    test.assertEqual(receivedEvents[0].button, 'previous', 'First press should be previous');
    test.assertEqual(receivedEvents[1].button, 'next', 'Second press should be next');
});

test.test('Configuration management', () => {
    const pedal = new PedalCommunication();
    
    // Test initial configuration
    let config = pedal.getConfiguration();
    test.assertEqual(config.footswitchPolarity, 'normally_open', 'Should start with normally_open');
    
    // Test setting CC codes
    pedal.setPedalCCCodes(10, 11, 12);
    config = pedal.getConfiguration();
    test.assertEqual(config.pedalCCCodes.previousParameter, 10, 'Should update previous CC');
    test.assertEqual(config.pedalCCCodes.nextParameter, 11, 'Should update next CC');
    test.assertEqual(config.pedalCCCodes.pedalControl, 12, 'Should update control CC');
    
    // Test setting polarity
    pedal.setFootswitchPolarity('normally_closed');
    config = pedal.getConfiguration();
    test.assertEqual(config.footswitchPolarity, 'normally_closed', 'Should update polarity');
});

test.test('Connection status management', () => {
    const pedal = new PedalCommunication();
    const statusEvents = [];
    
    pedal.onConnectionStatusChange = (event) => statusEvents.push(event);
    
    // Test initial status
    let status = pedal.getConnectionStatus();
    test.assertEqual(status.isConnected, false, 'Should start disconnected');
    test.assertEqual(status.lastPedalValue, -1, 'Should start with no value');
    
    // Test status change notification
    pedal.notifyConnectionStatusChange(true);
    test.assertEqual(statusEvents.length, 1, 'Should notify status change');
    test.assertEqual(statusEvents[0].connected, true, 'Should report connected');
    
    // Test cleanup
    pedal.cleanup();
    status = pedal.getConnectionStatus();
    test.assertEqual(status.isConnected, false, 'Should be disconnected after cleanup');
    test.assertEqual(status.lastPedalValue, -1, 'Should reset last value after cleanup');
});

// Regression test for the specific pedal lag issue
test.test('REGRESSION: Multiple messages in single BLE packet', () => {
    const pedal = new PedalCommunication();
    const receivedEvents = [];
    
    pedal.onVolumeChange = (event) => receivedEvents.push(event);
    
    // Simulate the exact scenario that was causing lag:
    // Multiple rapid CC messages in a single BLE MIDI packet
    const data = new Uint8Array([
        0x80, 0x81,           // BLE MIDI timestamp headers
        0xB0, 127, 10,        // CC 127, value 10
        0xB0, 127, 20,        // CC 127, value 20
        0xB0, 127, 30,        // CC 127, value 30
        0xB0, 127, 40,        // CC 127, value 40
        0xB0, 127, 50         // CC 127, value 50
    ]);
    
    pedal.handleMIDIData({ buffer: data.buffer });
    
    // Before the fix, only the first message would be processed
    // After the fix, all 5 messages should be processed
    test.assertEqual(receivedEvents.length, 5, 'Should process all 5 messages in the packet');
    test.assertEqual(receivedEvents[0].value, 10, 'First message should be 10');
    test.assertEqual(receivedEvents[1].value, 20, 'Second message should be 20');
    test.assertEqual(receivedEvents[2].value, 30, 'Third message should be 30');
    test.assertEqual(receivedEvents[3].value, 40, 'Fourth message should be 40');
    test.assertEqual(receivedEvents[4].value, 50, 'Fifth message should be 50');
    test.assertEqual(pedal.lastPedalValue, 50, 'Should end with last processed value');
});

// Export test runner for use in browser
window.runPedalCommunicationTests = async function() {
    return await test.run();
};

// Auto-run tests if not in module context
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TestFramework, runPedalCommunicationTests: () => test.run() };
} else if (typeof window !== 'undefined') {
    console.log('📋 PedalCommunication tests loaded. Run window.runPedalCommunicationTests() to execute.');
} 