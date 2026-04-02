/**
 * Lightweight pub/sub event bus for decoupling app.js and live-performance.js.
 * Replaces window.* global function assignments.
 */
class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    on(event, fn) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(fn);
    }

    off(event, fn) {
        const fns = this._listeners.get(event);
        if (fns) fns.delete(fn);
    }

    emit(event, ...args) {
        const fns = this._listeners.get(event);
        if (fns) {
            for (const fn of fns) fn(...args);
        }
    }
}

export const bus = new EventBus();
