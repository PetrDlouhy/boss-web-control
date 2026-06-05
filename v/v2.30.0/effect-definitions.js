/**
 * Boss Cube II Effect Definitions
 * SysEx commands, state maps, and shared utilities for effect management.
 * Single source of truth for effect-related constants and logic.
 */

export const EFFECT_ACTIVATE_COMMAND = [0x7f, 0x01, 0x02, 0x04, 0x7f, 0x7f];

// Maps effect switch parameter keys to { channel, effect }.
// Used by controller (hardware feedback) and UI (button state refresh).
export const EFFECT_SWITCH_MAP = {
    guitarChorusSwitch: { channel: 'guitar', effect: 'chorus' },
    guitarPhaserSwitch: { channel: 'guitar', effect: 'phaser' },
    guitarFlangerSwitch: { channel: 'guitar', effect: 'flanger' },
    guitarTremoloSwitch: { channel: 'guitar', effect: 'tremolo' },
    guitarTWahSwitch: { channel: 'guitar', effect: 'twah' },
    micInstHarmonySwitch: { channel: 'micInst', effect: 'harmony' },
    micInstChorusSwitch: { channel: 'micInst', effect: 'chorus' },
    micInstPhaserSwitch: { channel: 'micInst', effect: 'phaser' },
    micInstFlangerSwitch: { channel: 'micInst', effect: 'flanger' },
    micInstTremoloSwitch: { channel: 'micInst', effect: 'tremolo' },
    micInstTWahSwitch: { channel: 'micInst', effect: 'twah' },
};

export function normalizeEffectKey(key) {
    return key ? key.replace('.', '') : key;
}

/**
 * Refresh effect button visual state in ALL matching containers in the DOM.
 * Finds every element with data-param-key matching the channel's effect type,
 * so one call updates both live and non-live mode buttons.
 */
export function refreshEffectButtons(channel, controller) {
    const isGuitar = channel === 'guitar';
    const paramKey = isGuitar ? 'guitarEffectType' : 'micInstEffectType';
    const currentEffect = isGuitar ? controller.currentGuitarEffect : controller.currentMicInstEffect;
    const isActive = isGuitar ? controller.guitarEffectActive : controller.micInstEffectActive;
    const typeParam = controller.parameters[paramKey];
    if (!typeParam || !typeParam.valueLabels) return;

    document.querySelectorAll(`[data-param-key="${paramKey}"]`).forEach(container => {
        container.querySelectorAll('[data-value]').forEach(btn => {
            const idx = parseInt(btn.getAttribute('data-value'));
            const effectKey = normalizeEffectKey(typeParam.valueLabels[idx]?.toLowerCase());
            const isSelected = effectKey === currentEffect;
            btn.classList.toggle('active', isSelected);
            btn.classList.toggle('effect-on', isSelected && isActive);
        });
    });
}

// Per-effect on/off addresses (value 0=off, 1=on).
// Each address is 1 byte before the effect's first parameter address.
export const GUITAR_EFFECT_ONOFF = {
    chorus:  [0x10, 0x00, 0x00, 0x3a],
    phaser:  [0x10, 0x00, 0x00, 0x45],
    flanger: [0x10, 0x00, 0x00, 0x4c],
    tremolo: [0x10, 0x00, 0x00, 0x53],
    twah:    [0x10, 0x00, 0x00, 0x58],
};

export const MIC_INST_EFFECT_ONOFF = {
    harmony: [0x10, 0x00, 0x00, 0x02],
    chorus:  [0x10, 0x00, 0x00, 0x07],
    phaser:  [0x10, 0x00, 0x00, 0x12],
    flanger: [0x10, 0x00, 0x00, 0x19],
    tremolo: [0x10, 0x00, 0x00, 0x20],
    twah:    [0x10, 0x00, 0x00, 0x25],
};

export const EFFECT_SWITCH_COMMANDS = {
    guitar: {
        phaser: {
            switch: [0x10, 0x00, 0x00, 0x39, 0x01],
            activate: EFFECT_ACTIVATE_COMMAND
        },
        chorus: {
            switch: [0x10, 0x00, 0x00, 0x39, 0x00],
            activate: EFFECT_ACTIVATE_COMMAND
        },
        tremolo: {
            switch: [0x10, 0x00, 0x00, 0x39, 0x03],
            activate: EFFECT_ACTIVATE_COMMAND
        },
        twah: {
            switch: [0x10, 0x00, 0x00, 0x39, 0x04],
            activate: EFFECT_ACTIVATE_COMMAND
        },
        flanger: {
            switch: [0x10, 0x00, 0x00, 0x39, 0x02],
            activate: EFFECT_ACTIVATE_COMMAND
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
