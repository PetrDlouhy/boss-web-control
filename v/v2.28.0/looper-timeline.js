const LOOPER_STATES = { ERASE: 0, PAUSED: 1, RECORDING: 2, PLAYING: 3, OVERDUB: 4, STANDBY: 5 };
const STATE_NAMES = ['Erase', 'Paused', 'Recording', 'Playing', 'Overdub', 'Standby'];

export class LooperTimeline {
    constructor() {
        this.loopDurationMs = 0;
        this.recordStartTime = 0;
        this.playStartTime = 0;
        this.animationFrameId = null;
        this.currentState = LOOPER_STATES.STANDBY;
        this.progressElements = new Set();
        this.logger = null;
    }

    _log(msg) {
        if (this.logger) this.logger(`⏱️ Timeline: ${msg}`, 'info');
    }

    addProgressElement(el) {
        this.progressElements.add(el);
    }

    removeProgressElement(el) {
        this.progressElements.delete(el);
    }

    onLooperStateChange(newState, source = 'unknown') {
        const prevState = this.currentState;
        if (newState === prevState) return;
        this.currentState = newState;

        this._log(`${STATE_NAMES[prevState]} → ${STATE_NAMES[newState]} (source: ${source})`);

        if (newState === LOOPER_STATES.RECORDING && prevState !== LOOPER_STATES.OVERDUB) {
            this.recordStartTime = performance.now();
            this.loopDurationMs = 0;
            this._stopAnimation();
            this._setProgress(0);
            this._setRecording(true);
            this._log(`Record started at t=${this.recordStartTime.toFixed(0)}`);
        } else if (newState === LOOPER_STATES.PLAYING || newState === LOOPER_STATES.OVERDUB) {
            if (prevState === LOOPER_STATES.RECORDING && this.recordStartTime > 0) {
                this.loopDurationMs = performance.now() - this.recordStartTime;
                this._log(`Loop duration captured: ${(this.loopDurationMs / 1000).toFixed(2)}s`);
            }
            this._setRecording(false);
            if (this.loopDurationMs > 0) {
                this.playStartTime = performance.now();
                this._startAnimation();
                this._log(`Playback started, duration=${(this.loopDurationMs / 1000).toFixed(2)}s`);
            } else {
                this._log(`No loop duration known, skipping animation`);
            }
        } else if (newState === LOOPER_STATES.PAUSED) {
            this._stopAnimation();
            this._log(`Paused`);
        } else {
            this._stopAnimation();
            this._setProgress(0);
            this._setRecording(false);
            this.loopDurationMs = 0;
            this._log(`Reset (${STATE_NAMES[newState]})`);
        }
    }

    _startAnimation() {
        this._stopAnimation();
        const tick = () => {
            if (this.loopDurationMs <= 0) return;
            const elapsed = performance.now() - this.playStartTime;
            const progress = (elapsed % this.loopDurationMs) / this.loopDurationMs;
            this._setProgress(progress);
            this.animationFrameId = requestAnimationFrame(tick);
        };
        this.animationFrameId = requestAnimationFrame(tick);
    }

    _stopAnimation() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    _setProgress(ratio) {
        const pct = `${(ratio * 100).toFixed(1)}%`;
        for (const el of this.progressElements) {
            const bar = el.querySelector('.looper-progress-bar');
            if (bar) bar.style.width = pct;
        }
    }

    _setRecording(isRec) {
        for (const el of this.progressElements) {
            el.classList.toggle('recording', isRec);
        }
    }

    static createProgressElement() {
        const container = document.createElement('div');
        container.className = 'looper-timeline';
        container.innerHTML = '<div class="looper-progress-bar"></div>';
        return container;
    }
}
