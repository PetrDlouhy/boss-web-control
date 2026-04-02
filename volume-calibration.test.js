import {
    GUITAR_CALIBRATION_EFFECTS,
    createDefaultEffectOffsets,
    getEffectLabel,
    getMixLabel,
    formatPct,
    calculateBaseVolume,
    calculateTargetVolume,
} from './volume-calibration.js';

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
        console.log('🧪 Running Volume Calibration Tests...\n');

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

        console.log(`\n📊 Volume Calibration Test Results: ${this.passed} passed, ${this.failed} failed`);
        return { passed: this.passed, failed: this.failed };
    }

    assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(`${message}: expected ${expected}, got ${actual}`);
        }
    }

    assertApprox(actual, expected, message, epsilon = 1e-9) {
        if (Math.abs(actual - expected) > epsilon) {
            throw new Error(`${message}: expected ${expected}, got ${actual}`);
        }
    }

    assert(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    }
}

const test = new TestFramework();

test.test('Default effect offsets cover all guitar effects except off', () => {
    const offsets = createDefaultEffectOffsets();
    const effectKeys = GUITAR_CALIBRATION_EFFECTS.map(({ key }) => key);

    test.assertEqual(effectKeys.includes('off'), true, 'Effect list should include off selector');
    test.assertEqual(Object.keys(offsets).includes('off'), false, 'Offsets should not include off selector');
    test.assertEqual(offsets.chorus, 0, 'Chorus offset should default to zero');
    test.assertEqual(offsets.phaser, 0, 'Phaser offset should default to zero');
    test.assertEqual(offsets.flanger, 0, 'Flanger offset should default to zero');
    test.assertEqual(offsets.tremolo, 0, 'Tremolo offset should default to zero');
    test.assertEqual(offsets.twah, 0, 'T.WAH offset should default to zero');
});

test.test('Default effect offsets return a fresh object each time', () => {
    const first = createDefaultEffectOffsets();
    const second = createDefaultEffectOffsets();

    first.chorus = 12;
    test.assertEqual(second.chorus, 0, 'Second defaults should not be mutated by first object');
});

test.test('Labels and mix labels match calibration UI expectations', () => {
    test.assertEqual(getEffectLabel('twah'), 'T.WAH', 'T.WAH label should match UI');
    test.assertEqual(getEffectLabel(null), 'Off', 'Null effect should resolve to Off label');
    test.assertEqual(getMixLabel(null), 'Amp only', 'No effect should show amp-only mix');
    test.assertEqual(getMixLabel('chorus'), 'Amp + Chorus', 'Active effect should be included in mix label');
    test.assertEqual(formatPct(10), '+10%', 'Positive percentages should include plus sign');
    test.assertEqual(formatPct(-7), '-7%', 'Negative percentages should keep minus sign');
});

test.test('Base volume calculation includes amp and effect factors', () => {
    const baseVolume = calculateBaseVolume(
        33,
        5,
        { 5: -25 },
        'chorus',
        { chorus: 10 }
    );

    test.assertApprox(baseVolume, 40, 'Base volume should be derived from current amp and effect factors');
});

test.test('Target volume calculation includes both amp and selected effect offsets', () => {
    const target = calculateTargetVolume(
        40,
        5,
        { 5: -25 },
        'chorus',
        { chorus: 10 }
    );

    test.assertEqual(target, 33, 'Target volume should reflect amp and effect scaling');
});

test.test('Target volume clamps to valid range', () => {
    const high = calculateTargetVolume(90, 6, { 6: 30 }, 'twah', { twah: 20 });
    const low = calculateTargetVolume(5, 6, { 6: -80 }, 'chorus', { chorus: -80 });

    test.assertEqual(high, 100, 'High target volume should clamp to 100');
    test.assertEqual(low, 0, 'Low target volume should clamp to 0');
});

test.test('Base and target calculations handle missing values safely', () => {
    test.assertEqual(calculateBaseVolume(null, 0, {}, null, {}), null, 'Missing current volume should return null');
    test.assertEqual(calculateBaseVolume(40, null, {}, null, {}), null, 'Missing amp type should return null');
    test.assertEqual(calculateTargetVolume(null, 0, {}, null, {}), null, 'Missing base volume should return null');
});

if (typeof window !== 'undefined') {
    window.runVolumeCalibrationTests = async () => {
        const results = await test.run();
        return results.failed === 0;
    };
    console.log('📋 Volume calibration tests loaded. Run window.runVolumeCalibrationTests() to execute.');
}
