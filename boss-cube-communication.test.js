/**
 * Boss Cube Communication Tests
 * Tests for SysEx parsing and BLE MIDI handling
 */

import { BossCubeCommunication } from './boss-cube-communication.js';

// Test suite for Boss Cube SysEx parsing
const BossCubeCommunicationTests = {
    name: 'Boss Cube Communication Tests',
    
    async runAllTests() {
        console.log(`🧪 Starting ${this.name}...`);
        
        const tests = [
            this.testSysExParsing,
            this.testMultiPacketBLEMIDI,
            this.testBossCubeHeaderValidation,
            this.testPhysicalKnobDetection,
            this.testParameterValueExtraction,
            this.testInvalidSysExHandling,
            this.testEdgeCases
        ];
        
        let passed = 0;
        let failed = 0;
        
        for (const test of tests) {
            try {
                await test.call(this);
                console.log(`✅ ${test.name}`);
                passed++;
            } catch (error) {
                console.error(`❌ ${test.name}: ${error.message}`);
                failed++;
            }
        }
        
        console.log(`\n📊 ${this.name} Results: ${passed} passed, ${failed} failed`);
        return { passed, failed };
    },
    
    // Helper method to create mock communication instance
    createMockCommunication() {
        const comm = new BossCubeCommunication();
        
        // Mock the logging to capture messages
        comm.logMessages = [];
        comm.log = function(message, type = 'info') {
            this.logMessages.push({ message, type });
        };
        
        // Mock parameter updates
        comm.parameterUpdates = [];
        comm.onParameterUpdate = function(addressBytes, value, isPhysicalKnobChange) {
            this.parameterUpdates.push({ addressBytes, value, isPhysicalKnobChange });
        };
        
        // Mock physical knob changes
        comm.physicalKnobChanges = [];
        comm.onPhysicalKnobChange = function(addressBytes, value) {
            this.physicalKnobChanges.push({ addressBytes, value });
        };
        
        return comm;
    },
    
    // Test basic SysEx parsing with complete Boss Cube message
    async testSysExParsing() {
        const comm = this.createMockCommunication();
        
        // Valid Boss Cube SysEx message: Master Volume = 50
        const sysexData = [
            0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, // Header (7 bytes)
            0x12, // Command (data response)
            0x00, 0x00, 0x00, 0x00, // Address (master volume)
            0x32, // Value (50)
            0x0D  // Checksum
        ];
        
        comm.parseBossCubeSysEx(sysexData);
        
        // Should have one parameter update
        if (comm.parameterUpdates.length !== 1) {
            throw new Error(`Expected 1 parameter update, got ${comm.parameterUpdates.length}`);
        }
        
        const update = comm.parameterUpdates[0];
        if (update.value !== 0x32) {
            throw new Error(`Expected value 0x32, got 0x${update.value.toString(16)}`);
        }
        
        // Check address bytes
        const expectedAddress = [0x00, 0x00, 0x00, 0x00];
        if (!update.addressBytes.every((byte, i) => byte === expectedAddress[i])) {
            throw new Error(`Address mismatch: expected [${expectedAddress.join(', ')}], got [${update.addressBytes.join(', ')}]`);
        }
    },
    
    // Test multi-packet BLE MIDI message handling
    async testMultiPacketBLEMIDI() {
        const comm = this.createMockCommunication();
        
        // Simulate multi-packet BLE MIDI messages like user's physical knob data
        const packets = [
            new Uint8Array([0xb4, 0xed, 0xf0, 0x41, 0x10]), // Start packet with F0
            new Uint8Array([0xb4, 0x00, 0x00, 0x00]),         // Continuation
            new Uint8Array([0xb4, 0x00, 0x09, 0x12]),         // Continuation
            new Uint8Array([0xb4, 0x20, 0x00, 0x20]),         // Continuation
            new Uint8Array([0xb4, 0x01, 0x32, 0x0d]),         // Continuation
            new Uint8Array([0xb4, 0xed, 0xf7])                // End packet with F7
        ];
        
        // Process each packet
        for (const packet of packets) {
            comm.handleMIDIData({ buffer: packet.buffer });
        }
        
        // Should have processed one complete SysEx message
        if (comm.parameterUpdates.length !== 1) {
            throw new Error(`Expected 1 parameter update from multi-packet message, got ${comm.parameterUpdates.length}`);
        }
        
        const update = comm.parameterUpdates[0];
        if (update.value !== 0x32) {
            throw new Error(`Expected value 0x32 from multi-packet message, got 0x${update.value.toString(16)}`);
        }
    },
    
    // Test Boss Cube header validation
    async testBossCubeHeaderValidation() {
        const comm = this.createMockCommunication();
        
        // Test invalid headers
        const invalidHeaders = [
            // Wrong manufacturer (not Roland)
            [0x42, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, 0x12, 0x00, 0x00, 0x00, 0x00, 0x32, 0x0D],
            // Wrong device ID
            [0x41, 0x11, 0x00, 0x00, 0x00, 0x00, 0x09, 0x12, 0x00, 0x00, 0x00, 0x00, 0x32, 0x0D],
            // Wrong model bytes
            [0x41, 0x10, 0x01, 0x00, 0x00, 0x00, 0x09, 0x12, 0x00, 0x00, 0x00, 0x00, 0x32, 0x0D],
            // Too short message
            [0x41, 0x10, 0x00, 0x00, 0x00]
        ];
        
        for (const invalidHeader of invalidHeaders) {
            comm.parameterUpdates = []; // Reset
            comm.parseBossCubeSysEx(invalidHeader);
            
            if (comm.parameterUpdates.length !== 0) {
                throw new Error(`Invalid header should not generate parameter updates: ${invalidHeader}`);
            }
        }
        
        // Test valid header
        const validMessage = [0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, 0x12, 0x00, 0x00, 0x00, 0x00, 0x32, 0x0D];
        comm.parameterUpdates = [];
        comm.parseBossCubeSysEx(validMessage);
        
        if (comm.parameterUpdates.length !== 1) {
            throw new Error(`Valid header should generate parameter update`);
        }
    },
    
    // Test physical knob change detection
    async testPhysicalKnobDetection() {
        const comm = this.createMockCommunication();
        
        // Mock the physical knob detection method
        comm.detectPhysicalKnobChange = function(addressBytes, value) {
            return !this.pendingReadRequests.has(addressBytes.map(b => b.toString(16).padStart(2, '0')).join(''));
        };
        
        // Test unsolicited update (physical knob)
        const sysexData = [0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, 0x12, 0x00, 0x00, 0x00, 0x00, 0x32, 0x0D];
        comm.parseBossCubeSysEx(sysexData);
        
        if (comm.parameterUpdates.length !== 1) {
            throw new Error(`Expected parameter update for physical knob change`);
        }
        
        const update = comm.parameterUpdates[0];
        if (!update.isPhysicalKnobChange) {
            throw new Error(`Should detect as physical knob change when no pending read request`);
        }
        
        // Test response to read request (not physical knob)
        comm.parameterUpdates = [];
        comm.pendingReadRequests.set('00000000', Date.now()); // Mock pending request
        comm.parseBossCubeSysEx(sysexData);
        
        const responseUpdate = comm.parameterUpdates[0];
        if (responseUpdate.isPhysicalKnobChange) {
            throw new Error(`Should not detect as physical knob change when read request pending`);
        }
    },
    
    // Test parameter value extraction
    async testParameterValueExtraction() {
        const comm = this.createMockCommunication();
        
        // Test different parameter values
        const testValues = [0x00, 0x01, 0x32, 0x64, 0x7F];
        
        for (const testValue of testValues) {
            const sysexData = [
                0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, // Header
                0x12, // Command
                0x10, 0x00, 0x20, 0x01, // Address
                testValue, // Value
                0x00  // Checksum (simplified)
            ];
            
            comm.parameterUpdates = [];
            comm.parseBossCubeSysEx(sysexData);
            
            if (comm.parameterUpdates.length !== 1) {
                throw new Error(`Expected parameter update for value 0x${testValue.toString(16)}`);
            }
            
            const update = comm.parameterUpdates[0];
            if (update.value !== testValue) {
                throw new Error(`Expected value 0x${testValue.toString(16)}, got 0x${update.value.toString(16)}`);
            }
        }
    },
    
    // Test invalid SysEx handling
    async testInvalidSysExHandling() {
        const comm = this.createMockCommunication();
        
        // Test various invalid messages
        const invalidMessages = [
            [], // Empty
            [0x41], // Too short
            [0x41, 0x10, 0x00, 0x00], // Still too short
            [0x41, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, 0x11], // Wrong command (0x11 instead of 0x12)
            [0x43, 0x10, 0x00, 0x00, 0x00, 0x00, 0x09, 0x12, 0x00, 0x00, 0x00, 0x00, 0x32, 0x0D] // Wrong manufacturer
        ];
        
        for (const invalidMsg of invalidMessages) {
            comm.parameterUpdates = [];
            comm.parseBossCubeSysEx(invalidMsg);
            
            if (comm.parameterUpdates.length !== 0) {
                throw new Error(`Invalid message should not generate updates: [${invalidMsg.join(', ')}]`);
            }
        }
    },
    
    // Test edge cases and buffer management
    async testEdgeCases() {
        const comm = this.createMockCommunication();
        
        // Test buffer clearing
        comm.sysexBuffer = [1, 2, 3];
        comm.bufferingActive = true;
        comm.clearSysExBuffer();
        
        if (comm.sysexBuffer.length !== 0) {
            throw new Error(`Buffer should be cleared`);
        }
        
        if (comm.bufferingActive) {
            throw new Error(`Buffering should be inactive after clear`);
        }
        
        // Test timeout handling
        const incompletePackets = [
            new Uint8Array([0xb4, 0xed, 0xf0, 0x41, 0x10]), // Start without end
            new Uint8Array([0xb4, 0x00, 0x00, 0x00])          // Continuation
        ];
        
        for (const packet of incompletePackets) {
            comm.handleMIDIData({ buffer: packet.buffer });
        }
        
        // Should be buffering but not have processed yet
        if (!comm.bufferingActive) {
            throw new Error(`Should be in buffering mode for incomplete message`);
        }
        
        if (comm.parameterUpdates.length !== 0) {
            throw new Error(`Incomplete message should not generate updates yet`);
        }
    }
};

// Export for test runner
if (typeof window !== 'undefined') {
    window.BossCubeCommunicationTests = BossCubeCommunicationTests;
}

export default BossCubeCommunicationTests; 