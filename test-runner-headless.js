#!/usr/bin/env node

/**
 * Headless Test Runner for PedalCommunication Tests
 * Runs browser-based tests in headless Chrome for CI/CD
 */

import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple HTTP server for serving test files
function createTestServer(port = 3000) {
    const server = createServer((req, res) => {
        let filePath = req.url === '/' ? '/test-runner.html' : req.url;
        
        // Remove query parameters
        filePath = filePath.split('?')[0];
        
        const fullPath = join(__dirname, filePath);
        
        try {
            const content = readFileSync(fullPath);
            let contentType = 'text/html';
            
            if (filePath.endsWith('.js')) {
                contentType = 'application/javascript';
            } else if (filePath.endsWith('.css')) {
                contentType = 'text/css';
            } else if (filePath.endsWith('.json')) {
                contentType = 'application/json';
            }
            
            res.writeHead(200, {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            });
            res.end(content);
        } catch (error) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`File not found: ${filePath}`);
        }
    });
    
    return new Promise((resolve, reject) => {
        server.listen(port, (err) => {
            if (err) reject(err);
            else resolve({ server, port });
        });
    });
}

async function runTests() {
    console.log('🚀 Starting headless test runner...');
    
    let server, browser;
    
    try {
        // Start local server
        console.log('📡 Starting test server...');
        const serverInfo = await createTestServer(3000);
        server = serverInfo.server;
        const port = serverInfo.port;
        
        console.log(`🌐 Test server running on http://localhost:${port}`);
        
        // Launch headless browser
        console.log('🖥️ Launching headless Chrome...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--enable-experimental-web-platform-features'
            ]
        });
        
        const page = await browser.newPage();
        
        // Enable console logging from the page
        page.on('console', (msg) => {
            const type = msg.type();
            const text = msg.text();
            
            // Filter out some noise but keep test-related logs
            if (text.includes('✅') || text.includes('❌') || text.includes('🧪') || 
                text.includes('Test Results') || text.includes('Running') ||
                text.includes('PedalCommunication')) {
                console.log(`[Browser ${type}] ${text}`);
            }
        });
        
        // Capture errors
        page.on('pageerror', (error) => {
            console.error('❌ Page error:', error.message);
        });
        
        // Navigate to test page
        console.log('📄 Loading test page...');
        await page.goto(`http://localhost:${port}/test-runner.html`, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        
        console.log('🧪 Running tests...');
        
        // Wait for the test runner to be available and run tests
        const testResult = await page.evaluate(async () => {
            // Wait for test runners to be available
            let attempts = 0;
            while ((!window.runPedalCommunicationTests || !window.runBossCubeControllerTests || !window.BossCubeCommunicationTests || !window.runReloadValuesTests || !window.runVolumeCalibrationTests) && attempts < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            
            if (!window.runPedalCommunicationTests || !window.runBossCubeControllerTests || !window.BossCubeCommunicationTests || !window.runReloadValuesTests || !window.runVolumeCalibrationTests) {
                throw new Error('Test runners not available after 5 seconds');
            }
            
            // Run all test suites
            try {
                console.log('🧪 Running PedalCommunication Tests...');
                const pedalSuccess = await window.runPedalCommunicationTests();
                
                console.log('\n' + '='.repeat(50) + '\n');
                
                console.log('🧪 Running BossCubeController Tests...');
                const controllerSuccess = await window.runBossCubeControllerTests();
                
                console.log('\n' + '='.repeat(50) + '\n');
                
                console.log('🧪 Running BossCubeCommunication Tests...');
                const communicationResults = await window.BossCubeCommunicationTests.runAllTests();
                const communicationSuccess = communicationResults.failed === 0;
                
                console.log('\n' + '='.repeat(50) + '\n');
                
                console.log('🧪 Running Reload Values Tests...');
                const reloadValuesSuccess = await window.runReloadValuesTests();

                console.log('\n' + '='.repeat(50) + '\n');

                console.log('🧪 Running Volume Calibration Tests...');
                const volumeCalibrationSuccess = await window.runVolumeCalibrationTests();
                
                const allSuccess = pedalSuccess && controllerSuccess && communicationSuccess && reloadValuesSuccess && volumeCalibrationSuccess;
                return { success: allSuccess, error: null };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });
        
        // Report results
        if (testResult.error) {
            console.error('💥 Test execution failed:', testResult.error);
            process.exit(1);
        } else if (testResult.success) {
            console.log('✅ All tests passed!');
            process.exit(0);
        } else {
            console.error('❌ Some tests failed!');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('💥 Test runner failed:', error.message);
        process.exit(1);
    } finally {
        // Cleanup
        if (browser) {
            await browser.close();
            console.log('🔒 Browser closed');
        }
        if (server) {
            server.close();
            console.log('🛑 Server stopped');
        }
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Test runner interrupted');
    process.exit(1);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Test runner terminated');
    process.exit(1);
});

// Run tests
runTests().catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
}); 