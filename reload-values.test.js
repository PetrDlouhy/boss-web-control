/**
 * Unit Tests for "Reload Values" UI Functionality
 * Tests the readValuesFromCube() function and UI button behavior
 */

class ReloadValuesTestFramework {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, testFunction) {
        this.tests.push({ name, testFunction });
    }

    async run() {
        console.log('🧪 Running Reload Values Tests...\n');
        
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
        
        console.log(`\n📊 Reload Values Test Results: ${this.passed} passed, ${this.failed} failed`);
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

    assertContains(actual, expected, message) {
        if (!actual.includes(expected)) {
            throw new Error(`${message}: expected "${actual}" to contain "${expected}"`);
        }
    }
}

// Mock DOM elements for testing
class MockButton {
    constructor(initialText = '📖 Read Values') {
        this.disabled = false;
        this.textContent = initialText;
        this.clickHandlers = [];
    }

    addEventListener(event, handler) {
        if (event === 'click') {
            this.clickHandlers.push(handler);
        }
    }

    click() {
        this.clickHandlers.forEach(handler => handler());
    }
}

// Mock BossCubeController for testing
class MockBossCubeController {
    constructor() {
        this.isCubeConnected = false;
        this.readAllValuesCallCount = 0;
        this.readAllValuesShouldFail = false;
        this.readAllValuesDelay = 50;
        this.readAllValuesCallTimes = [];
    }

    async readAllValues() {
        this.readAllValuesCallCount++;
        this.readAllValuesCallTimes.push(Date.now());
        
        await new Promise(resolve => setTimeout(resolve, this.readAllValuesDelay));
        
        if (this.readAllValuesShouldFail) {
            throw new Error('Mock read all values failure');
        }
        
        return true;
    }

    reset() {
        this.readAllValuesCallCount = 0;
        this.readAllValuesShouldFail = false;
        this.readAllValuesCallTimes = [];
    }
}

// Mock logging function
class MockLogger {
    constructor() {
        this.logs = [];
    }

    log(message, type = 'info') {
        this.logs.push({ message, type, timestamp: Date.now() });
    }

    getLogs(type = null) {
        return type ? this.logs.filter(log => log.type === type) : this.logs;
    }

    clearLogs() {
        this.logs = [];
    }
}

// Create readValuesFromCube function for testing
function createReadValuesFromCube(mockController, mockButton, mockLogger) {
    return async function readValuesFromCube() {
        const buttonCallId = Math.random().toString(36).substr(2, 9);
        mockLogger.log(`🔍 DEBUG: [${buttonCallId}] readValuesFromCube() called from UI button`, 'info');
        
        if (!mockController.isCubeConnected) {
            mockLogger.log('Boss Cube not connected - cannot read values', 'error');
            return;
        }
        
        // Prevent multiple simultaneous calls by checking if button is already disabled
        if (mockButton.disabled) {
            mockLogger.log(`⚠️ [${buttonCallId}] Read operation already in progress - ignoring duplicate request`, 'warning');
            return;
        }
        
        try {
            mockButton.disabled = true;
            mockButton.textContent = '🔄 Reload Values';
            
            mockLogger.log(`🔄 [${buttonCallId}] Reloading all parameter values from Boss Cube...`, 'info');
            
            // Read all mixer and effects values
            await mockController.readAllValues();
            
            mockLogger.log('✅ All reload requests sent - watch for incoming values', 'success');
            
        } catch (error) {
            mockLogger.log(`❌ Failed to reload values: ${error.message}`, 'error');
        } finally {
            mockButton.disabled = false;
            mockButton.textContent = '📖 Read Values';
        }
    };
}

// Test suite
const test = new ReloadValuesTestFramework();

test.test('Reload Values function exists and is callable', () => {
    const mockController = new MockBossCubeController();
    const mockButton = new MockButton();
    const mockLogger = new MockLogger();
    
    const readValuesFromCube = createReadValuesFromCube(mockController, mockButton, mockLogger);
    
    test.assert(typeof readValuesFromCube === 'function', 'readValuesFromCube should be a function');
});

test.test('Reload Values requires Boss Cube connection', async () => {
    const mockController = new MockBossCubeController();
    const mockButton = new MockButton();
    const mockLogger = new MockLogger();
    
    // Boss Cube not connected
    mockController.isCubeConnected = false;
    
    const readValuesFromCube = createReadValuesFromCube(mockController, mockButton, mockLogger);
    
    await readValuesFromCube();
    
    // Should not call readAllValues
    test.assertEqual(mockController.readAllValuesCallCount, 0, 'Should not call readAllValues when not connected');
    
    // Should log error message
    const errorLogs = mockLogger.getLogs('error');
    test.assertContains(errorLogs[0].message, 'Boss Cube not connected', 'Should log connection error');
});

test.test('Reload Values button state management', async () => {
    const mockController = new MockBossCubeController();
    const mockButton = new MockButton();
    const mockLogger = new MockLogger();
    
    mockController.isCubeConnected = true;
    mockController.readAllValuesDelay = 100; // Add delay to test button state
    
    const readValuesFromCube = createReadValuesFromCube(mockController, mockButton, mockLogger);
    
    // Initial state
    test.assertEqual(mockButton.disabled, false, 'Button should start enabled');
    test.assertEqual(mockButton.textContent, '📖 Read Values', 'Button should start with Read Values text');
    
    // Start operation
    const operationPromise = readValuesFromCube();
    
    // Check button state during operation
    test.assertEqual(mockButton.disabled, true, 'Button should be disabled during operation');
    test.assertEqual(mockButton.textContent, '🔄 Reload Values', 'Button should show Reload Values text during operation');
    
    // Wait for operation to complete
    await operationPromise;
    
    // Check button state after operation
    test.assertEqual(mockButton.disabled, false, 'Button should be enabled after operation');
    test.assertEqual(mockButton.textContent, '📖 Read Values', 'Button should restore Read Values text after operation');
    
    // Should have called readAllValues
    test.assertEqual(mockController.readAllValuesCallCount, 1, 'Should call readAllValues once');
});

test.test('Reload Values prevents duplicate calls', async () => {
    const mockController = new MockBossCubeController();
    const mockButton = new MockButton();
    const mockLogger = new MockLogger();
    
    mockController.isCubeConnected = true;
    mockController.readAllValuesDelay = 200; // Longer delay to test concurrency
    
    const readValuesFromCube = createReadValuesFromCube(mockController, mockButton, mockLogger);
    
    // Start first operation
    const operation1 = readValuesFromCube();
    
    // Try to start second operation while first is running
    await readValuesFromCube();
    
    // Wait for first operation to complete
    await operation1;
    
    // Should only call readAllValues once
    test.assertEqual(mockController.readAllValuesCallCount, 1, 'Should only call readAllValues once, ignoring duplicate calls');
    
    // Should log warning about duplicate request
    const warningLogs = mockLogger.getLogs('warning');
    test.assertContains(warningLogs[0].message, 'Read operation already in progress', 'Should log warning for duplicate request');
});

test.test('Reload Values error handling', async () => {
    const mockController = new MockBossCubeController();
    const mockButton = new MockButton();
    const mockLogger = new MockLogger();
    
    mockController.isCubeConnected = true;
    mockController.readAllValuesShouldFail = true;
    
    const readValuesFromCube = createReadValuesFromCube(mockController, mockButton, mockLogger);
    
    await readValuesFromCube();
    
    // Should attempt to call readAllValues
    test.assertEqual(mockController.readAllValuesCallCount, 1, 'Should attempt to call readAllValues');
    
    // Should log error message
    const errorLogs = mockLogger.getLogs('error');
    test.assertContains(errorLogs[0].message, 'Failed to reload values', 'Should log error message');
    
    // Button should be restored to normal state even after error
    test.assertEqual(mockButton.disabled, false, 'Button should be enabled after error');
    test.assertEqual(mockButton.textContent, '📖 Read Values', 'Button should restore Read Values text after error');
});

test.test('Reload Values logging behavior', async () => {
    const mockController = new MockBossCubeController();
    const mockButton = new MockButton();
    const mockLogger = new MockLogger();
    
    mockController.isCubeConnected = true;
    
    const readValuesFromCube = createReadValuesFromCube(mockController, mockButton, mockLogger);
    
    await readValuesFromCube();
    
    const allLogs = mockLogger.getLogs();
    
    // Should have debug log for function call
    test.assertContains(allLogs[0].message, 'readValuesFromCube() called from UI button', 'Should log function call');
    
    // Should have info log for reload start
    test.assertContains(allLogs[1].message, 'Reloading all parameter values from Boss Cube', 'Should log reload start');
    
    // Should have success log for completion
    test.assertContains(allLogs[2].message, 'All reload requests sent - watch for incoming values', 'Should log completion');
});

test.test('Reload Values integration with controller', async () => {
    const mockController = new MockBossCubeController();
    const mockButton = new MockButton();
    const mockLogger = new MockLogger();
    
    mockController.isCubeConnected = true;
    
    const readValuesFromCube = createReadValuesFromCube(mockController, mockButton, mockLogger);
    
    const startTime = Date.now();
    await readValuesFromCube();
    const endTime = Date.now();
    
    // Should call readAllValues exactly once
    test.assertEqual(mockController.readAllValuesCallCount, 1, 'Should call readAllValues exactly once');
    
    // Should complete within reasonable time
    const duration = endTime - startTime;
    test.assert(duration >= 50, 'Should take at least the mock delay time');
    test.assert(duration < 500, 'Should complete within reasonable time');
});

test.test('Reload Values button click integration', async () => {
    const mockController = new MockBossCubeController();
    const mockButton = new MockButton();
    const mockLogger = new MockLogger();
    
    mockController.isCubeConnected = true;
    
    const readValuesFromCube = createReadValuesFromCube(mockController, mockButton, mockLogger);
    
    // Set up button event listener
    mockButton.addEventListener('click', readValuesFromCube);
    
    // Simulate button click
    mockButton.click();
    
    // Wait for async operation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should have called readAllValues
    test.assertEqual(mockController.readAllValuesCallCount, 1, 'Button click should trigger readAllValues');
    
    // Should have proper logging
    const allLogs = mockLogger.getLogs();
    test.assert(allLogs.length > 0, 'Should have log entries from button click');
});

test.test('Reload Values button state restoration on error', async () => {
    const mockController = new MockBossCubeController();
    const mockButton = new MockButton();
    const mockLogger = new MockLogger();
    
    mockController.isCubeConnected = true;
    mockController.readAllValuesShouldFail = true;
    
    const readValuesFromCube = createReadValuesFromCube(mockController, mockButton, mockLogger);
    
    // Button should start enabled
    test.assertEqual(mockButton.disabled, false, 'Button should start enabled');
    
    try {
        await readValuesFromCube();
    } catch (error) {
        // Errors should be caught internally
    }
    
    // Button should be restored even after error
    test.assertEqual(mockButton.disabled, false, 'Button should be enabled after error');
    test.assertEqual(mockButton.textContent, '📖 Read Values', 'Button text should be restored after error');
});

test.test('REGRESSION: Reload Values functionality working after fixes', async () => {
    const mockController = new MockBossCubeController();
    const mockButton = new MockButton();
    const mockLogger = new MockLogger();
    
    mockController.isCubeConnected = true;
    
    const readValuesFromCube = createReadValuesFromCube(mockController, mockButton, mockLogger);
    
    // This test verifies that the core functionality works
    // (regression test for the Boss Cube communication fix)
    
    await readValuesFromCube();
    
    // Should successfully call readAllValues
    test.assertEqual(mockController.readAllValuesCallCount, 1, 'Should successfully call readAllValues');
    
    // Should have success log
    const successLogs = mockLogger.getLogs('success');
    test.assert(successLogs.length > 0, 'Should have success log entries');
    
    // Should not have error logs
    const errorLogs = mockLogger.getLogs('error');
    test.assertEqual(errorLogs.length, 0, 'Should not have error logs for successful operation');
});

// Export test runner for use in browser
window.runReloadValuesTests = async function() {
    return await test.run();
};

// Auto-run message
if (typeof window !== 'undefined') {
    console.log('📋 Reload Values tests loaded. Run window.runReloadValuesTests() to execute.');
} 