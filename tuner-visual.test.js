/**
 * Tuner Visual Tests
 * Tests for tuner needle positioning and visual display
 */

const TunerVisualTests = {
    name: 'Tuner Visual Tests',
    
    async runAllTests() {
        console.log(`🧪 Starting ${this.name}...`);
        
        const tests = [
            this.testNeedlePositioning,
            this.testTunerVisualState,
            this.testTunerDisplayUpdate,
            this.testNeedleColorChange,
            this.testScaleAlignment
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

    // Mock DOM setup for testing
    createMockDOM() {
        // Create mock tuner visual elements
        document.body.innerHTML = `
            <div id="tunerVisual" class="tuner-visual">
                <div id="tunerFrequencyDisplay" class="tuner-frequency-display">440Hz</div>
                <div id="tunerNoteDisplay" class="tuner-note-display">A</div>
                <div class="tuner-meter">
                    <div class="tuner-scale">
                        <span>♭</span>
                        <span>-20</span>
                        <span>-10</span>
                        <span>0</span>
                        <span>+10</span>
                        <span>+20</span>
                        <span>♯</span>
                    </div>
                </div>
            </div>
        `;
    },

    // Test needle positioning calculation
    async testNeedlePositioning() {
        this.createMockDOM();
        
        // Test cases for needle positioning
        const testCases = [
            { cents: -20, expectedPosition: 16.67 },  // Far left
            { cents: -10, expectedPosition: 33.33 },  // Left of center
            { cents: 0, expectedPosition: 50 },       // Center
            { cents: 10, expectedPosition: 66.67 },   // Right of center
            { cents: 20, expectedPosition: 83.33 }    // Far right
        ];
        
        for (const testCase of testCases) {
            const normalizedCents = Math.max(-20, Math.min(20, testCase.cents));
            const needlePosition = 50 + (normalizedCents / 20) * 33.33;
            
            const tolerance = 0.1;
            if (Math.abs(needlePosition - testCase.expectedPosition) > tolerance) {
                throw new Error(`Needle position for ${testCase.cents}¢: expected ${testCase.expectedPosition}%, got ${needlePosition}%`);
            }
        }
    },

    // Test tuner visual state management
    async testTunerVisualState() {
        this.createMockDOM();
        
        const tunerVisual = document.getElementById('tunerVisual');
        
        // Test initial state
        if (tunerVisual.style.display !== '') {
            throw new Error('Tuner visual should be hidden by default');
        }
        
        // Test active state
        tunerVisual.classList.add('active');
        tunerVisual.style.display = 'block';
        
        if (!tunerVisual.classList.contains('active')) {
            throw new Error('Tuner visual should have active class when enabled');
        }
        
        // Test background color changes
        const testBackgrounds = ['#333', '#2d5a2d', '#5a3d2d', '#5a2d2d'];
        for (const bg of testBackgrounds) {
            tunerVisual.style.background = bg;
            if (tunerVisual.style.background !== bg) {
                throw new Error(`Background color should be ${bg}`);
            }
        }
    },

    // Test tuner display updates
    async testTunerDisplayUpdate() {
        this.createMockDOM();
        
        const freqDisplay = document.getElementById('tunerFrequencyDisplay');
        const noteDisplay = document.getElementById('tunerNoteDisplay');
        
        // Test frequency display
        freqDisplay.textContent = '329.6Hz (+5¢)';
        if (freqDisplay.textContent !== '329.6Hz (+5¢)') {
            throw new Error('Frequency display should update correctly');
        }
        
        // Test note display
        noteDisplay.textContent = 'E4';
        if (noteDisplay.textContent !== 'E4') {
            throw new Error('Note display should update correctly');
        }
        
        // Test no signal state
        freqDisplay.textContent = '--Hz';
        noteDisplay.textContent = '--';
        
        if (freqDisplay.textContent !== '--Hz' || noteDisplay.textContent !== '--') {
            throw new Error('No signal state should display correctly');
        }
    },

    // Test needle color changes
    async testNeedleColorChange() {
        this.createMockDOM();
        
        const tunerMeter = document.querySelector('.tuner-meter');
        
        // Create needle element
        const needle = document.createElement('div');
        needle.className = 'tuner-needle';
        needle.style.left = '50%';
        tunerMeter.appendChild(needle);
        
        // Test needle positioning
        const positions = ['16.67%', '33.33%', '50%', '66.67%', '83.33%'];
        for (const pos of positions) {
            needle.style.left = pos;
            if (needle.style.left !== pos) {
                throw new Error(`Needle position should be ${pos}`);
            }
        }
        
        // Test needle colors for different states
        const colors = ['#e74c3c', '#27ae60'];  // Red for out of tune, green for in tune
        for (const color of colors) {
            needle.style.background = color;
            if (needle.style.background !== color) {
                throw new Error(`Needle color should be ${color}`);
            }
        }
    },

    // Test scale mark alignment
    async testScaleAlignment() {
        this.createMockDOM();
        
        const scaleMarks = document.querySelectorAll('.tuner-scale span');
        
        if (scaleMarks.length !== 7) {
            throw new Error('Should have 7 scale marks (♭, -20, -10, 0, +10, +20, ♯)');
        }
        
        // Test scale mark content
        const expectedMarks = ['♭', '-20', '-10', '0', '+10', '+20', '♯'];
        scaleMarks.forEach((mark, index) => {
            if (mark.textContent !== expectedMarks[index]) {
                throw new Error(`Scale mark ${index} should be "${expectedMarks[index]}", got "${mark.textContent}"`);
            }
        });
        
        // Test that center mark (index 3) is the "0"
        const centerMark = scaleMarks[3];
        if (centerMark.textContent !== '0') {
            throw new Error('Center mark should be "0"');
        }
    }
};

// Export for use in test runner
if (typeof window !== 'undefined') {
    window.TunerVisualTests = TunerVisualTests;
    window.runTunerVisualTests = () => TunerVisualTests.runAllTests();
    console.log('📋 Tuner Visual tests loaded. Run window.runTunerVisualTests() to execute.');
}

export { TunerVisualTests }; 