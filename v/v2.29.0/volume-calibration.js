export const GUITAR_CALIBRATION_EFFECTS = [
    { key: 'off', label: 'Off' },
    { key: 'chorus', label: 'Chorus' },
    { key: 'phaser', label: 'Phaser' },
    { key: 'flanger', label: 'Flanger' },
    { key: 'tremolo', label: 'Tremolo' },
    { key: 'twah', label: 'T.WAH' },
];

export function createDefaultEffectOffsets() {
    return Object.fromEntries(
        GUITAR_CALIBRATION_EFFECTS
            .filter(({ key }) => key !== 'off')
            .map(({ key }) => [key, 0])
    );
}

export function getEffectLabel(effectKey) {
    const resolvedKey = effectKey ?? 'off';
    return GUITAR_CALIBRATION_EFFECTS.find(({ key }) => key === resolvedKey)?.label || effectKey;
}

export function getMixLabel(effectKey) {
    return effectKey ? `Amp + ${getEffectLabel(effectKey)}` : 'Amp only';
}

export function formatPct(pct) {
    return `${pct >= 0 ? '+' : ''}${pct}%`;
}

export function getAmpFactor(ampOffsets, ampType) {
    return 1 + ((ampOffsets?.[ampType] ?? 0) / 100);
}

export function getEffectFactor(effectOffsets, effectKey) {
    if (!effectKey) return 1;
    return 1 + ((effectOffsets?.[effectKey] ?? 0) / 100);
}

export function calculateBaseVolume(currentVolume, ampType, ampOffsets, effectKey, effectOffsets) {
    if (currentVolume === null || currentVolume === undefined || ampType === null || ampType === undefined) {
        return null;
    }
    return currentVolume / (getAmpFactor(ampOffsets, ampType) * getEffectFactor(effectOffsets, effectKey));
}

export function calculateTargetVolume(baseVolume, ampType, ampOffsets, effectKey, effectOffsets) {
    if (baseVolume === null || baseVolume === undefined) {
        return null;
    }

    const raw = baseVolume * getAmpFactor(ampOffsets, ampType) * getEffectFactor(effectOffsets, effectKey);
    return Math.max(0, Math.min(100, Math.round(raw)));
}
