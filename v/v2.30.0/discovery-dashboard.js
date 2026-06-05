/**
 * SysEx Discovery Dashboard — dev tool for probing and monitoring unknown addresses.
 * Renders as a modal inside the existing app, reusing the active BLE connection.
 */
import BossCubeController from './boss-cube-controller.js';

export class DiscoveryDashboard {
    constructor(controller) {
        this.controller = controller;
        this.modal = null;
        this.monitorData = new Map(); // addressKey → { address, name, value, hits, firstSeen, lastSeen }
        this.recording = false;
        this.scanAbort = false;
        this._lastScanResults = null; // Map of addr → { value, paramDef } from previous scan
    }

    open() {
        if (this.modal) {
            this.modal.style.display = 'flex';
            this._renderMonitor();
            this._updateConnectBtn();
            return;
        }
        this._build();
        this._startRecording();
    }

    close() {
        if (this.modal) this.modal.style.display = 'none';
    }

    destroy() {
        this._stopRecording();
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
    }

    // ===== BUILD =====

    _build() {
        this.modal = document.createElement('div');
        this.modal.className = 'discovery-modal-overlay';
        this.modal.innerHTML = `
            <div class="discovery-modal">
                <div class="discovery-header">
                    <h2>SysEx Discovery</h2>
                    <button id="discConnectBtn" class="btn-small disc-connect">⏏ Disconnect</button>
                    <button class="discovery-close" aria-label="Close">&times;</button>
                </div>

                <div class="discovery-tabs">
                    <button class="discovery-tab active" data-tab="monitor">Live Monitor</button>
                    <button class="discovery-tab" data-tab="scanner">Range Scanner</button>
                    <button class="discovery-tab" data-tab="tweak">Tweak Unknowns</button>
                </div>

                <div class="discovery-panel" data-panel="monitor">
                    <div class="discovery-monitor-controls">
                        <button id="discMonitorClear" class="btn-small">Clear</button>
                        <label class="discovery-toggle">
                            <input type="checkbox" id="discShowKnown"> Show known
                        </label>
                        <span class="discovery-status" id="discRecordStatus">● Recording</span>
                    </div>
                    <div class="discovery-table-wrap">
                        <table class="discovery-table" id="discMonitorTable">
                            <thead><tr>
                                <th>Address</th><th>Name</th><th>Value</th><th>Hits</th><th>Last</th>
                            </tr></thead>
                            <tbody id="discMonitorBody"></tbody>
                        </table>
                    </div>
                </div>

                <div class="discovery-panel" data-panel="scanner" style="display:none">
                    <div class="discovery-quick-probes">
                        <span>Block Read:</span>
                        <button class="btn-small disc-block-read" data-block="0">System</button>
                        <button class="btn-small disc-block-read" data-block="1">Effects</button>
                        <button class="btn-small disc-block-read" data-block="2">Mixer</button>
                        <button class="btn-small disc-block-read" data-block="3">Panel</button>
                        <button class="btn-small disc-block-read" data-block="4">Looper</button>
                        <button class="btn-small disc-block-read" data-block="5">Tuner Cfg</button>
                        <button id="discBlockReadAll" class="btn-small disc-unknowns">⚡ All Blocks</button>
                        <button id="discScanStop" class="btn-small" disabled>Stop</button>
                        <label class="discovery-toggle">
                            <input type="checkbox" id="discHideKnown" checked> Hide known
                        </label>
                        <label class="discovery-toggle">
                            <input type="checkbox" id="discShowDiff"> Show diff
                        </label>
                    </div>
                    <div class="discovery-table-wrap">
                        <table class="discovery-table" id="discScanTable">
                            <thead><tr>
                                <th>Address</th><th>Name</th><th>Value</th><th>Status</th>
                            </tr></thead>
                            <tbody id="discScanBody"></tbody>
                        </table>
                    </div>
                    <div id="discScanProgress" class="discovery-progress"></div>
                </div>

                <div class="discovery-panel" data-panel="tweak" style="display:none">
                    <div class="discovery-tweak-info">Send values to unknown addresses. Read first, then slide to change.</div>
                    <button id="discTweakReadAll" class="btn-small">📖 Read All</button>
                    <div id="discTweakControls" class="discovery-tweak-grid"></div>
                </div>
            </div>
        `;

        document.body.appendChild(this.modal);
        this._wireEvents();
        this._buildTweakControls();
    }

    _wireEvents() {
        this.modal.querySelector('.discovery-close').addEventListener('click', () => this.close());

        this.modal.querySelectorAll('.discovery-tab').forEach(tab => {
            tab.addEventListener('click', () => this._switchTab(tab.dataset.tab));
        });

        document.getElementById('discMonitorClear').addEventListener('click', () => {
            this.monitorData.clear();
            this._renderMonitor();
        });

        document.getElementById('discShowKnown').addEventListener('change', () => this._renderMonitor());

        document.getElementById('discScanStop').addEventListener('click', () => {
            this.scanAbort = true;
        });

        this.modal.querySelectorAll('.disc-block-read').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.block, 10);
                this._runBlockRead([idx]);
            });
        });

        document.getElementById('discBlockReadAll').addEventListener('click', () => {
            const indices = DiscoveryDashboard.DISCOVERY_BLOCKS.map((_, i) => i);
            this._runBlockRead(indices);
        });

        document.getElementById('discTweakReadAll').addEventListener('click', () => this._tweakReadAll());

        const connBtn = document.getElementById('discConnectBtn');
        connBtn.addEventListener('click', async () => {
            connBtn.disabled = true;
            try {
                await window.handleBossCubeButton({ skipReadValues: true });
            } finally {
                connBtn.disabled = false;
                this._updateConnectBtn();
            }
        });
        this._updateConnectBtn();
    }

    _updateConnectBtn() {
        const btn = document.getElementById('discConnectBtn');
        if (!btn) return;
        const connected = this.controller.isCubeConnected;
        btn.textContent = connected ? '⏏ Disconnect' : '🔌 Connect';
        btn.classList.toggle('disc-connect-off', !connected);
    }

    _switchTab(tabId) {
        this.modal.querySelectorAll('.discovery-tab').forEach(t =>
            t.classList.toggle('active', t.dataset.tab === tabId));
        this.modal.querySelectorAll('.discovery-panel').forEach(p =>
            p.style.display = p.dataset.panel === tabId ? '' : 'none');
    }

    // ===== LIVE MONITOR =====

    _startRecording() {
        this.recording = true;
        this.controller.onRawSysEx = (addressBytes, value, paramDef) => {
            if (typeof value === 'object') return; // skip tuner structured data
            const key = addressBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
            const now = Date.now();
            const existing = this.monitorData.get(key);
            if (existing) {
                existing.value = value;
                existing.hits++;
                existing.lastSeen = now;
            } else {
                const name = paramDef ? `${paramDef.id}` : '???';
                this.monitorData.set(key, {
                    address: key,
                    name,
                    known: !!paramDef,
                    value,
                    hits: 1,
                    firstSeen: now,
                    lastSeen: now,
                });
                if (!paramDef) {
                    this.controller.log(`🧪 Monitor: new unknown [${key}] = ${value}`, 'warning');
                }
            }
            if (this.modal && this.modal.style.display !== 'none') {
                this._renderMonitorRow(key);
            }
        };
        const status = document.getElementById('discRecordStatus');
        if (status) status.textContent = '● Recording';
    }

    _stopRecording() {
        this.recording = false;
        this.controller.onRawSysEx = null;
    }

    _renderMonitor() {
        const tbody = document.getElementById('discMonitorBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        const showKnown = document.getElementById('discShowKnown')?.checked;

        const sorted = [...this.monitorData.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        for (const [key, data] of sorted) {
            if (!showKnown && data.known) continue;
            this._appendMonitorRow(tbody, key, data);
        }
    }

    _renderMonitorRow(key) {
        const data = this.monitorData.get(key);
        if (!data) return;
        const showKnown = document.getElementById('discShowKnown')?.checked;
        if (!showKnown && data.known) return;

        const tbody = document.getElementById('discMonitorBody');
        if (!tbody) return;

        let row = tbody.querySelector(`[data-addr="${key}"]`);
        if (!row) {
            row = document.createElement('tr');
            row.setAttribute('data-addr', key);
            row.className = data.known ? 'disc-known' : 'disc-unknown';
            row.innerHTML = `<td class="disc-addr">${key}</td><td>${data.name}</td><td class="disc-val"></td><td class="disc-hits"></td><td class="disc-time"></td>`;
            this._insertSorted(tbody, row, key);
        }
        row.querySelector('.disc-val').textContent = data.value;
        row.querySelector('.disc-hits').textContent = data.hits;
        row.querySelector('.disc-time').textContent = this._timeAgo(data.lastSeen);
        row.classList.add('disc-flash');
        setTimeout(() => row.classList.remove('disc-flash'), 400);
    }

    _appendMonitorRow(tbody, key, data) {
        const row = document.createElement('tr');
        row.setAttribute('data-addr', key);
        row.className = data.known ? 'disc-known' : 'disc-unknown';
        row.innerHTML = `<td class="disc-addr">${key}</td><td>${data.name}</td><td class="disc-val">${data.value}</td><td class="disc-hits">${data.hits}</td><td class="disc-time">${this._timeAgo(data.lastSeen)}</td>`;
        tbody.appendChild(row);
    }

    _insertSorted(tbody, newRow, key) {
        const rows = tbody.querySelectorAll('tr');
        for (const row of rows) {
            if (row.getAttribute('data-addr') > key) {
                tbody.insertBefore(newRow, row);
                return;
            }
        }
        tbody.appendChild(newRow);
    }

    // ===== BLOCK READ SCANNER =====

    async _runBlockRead(blockIndices) {
        if (!this.controller.isCubeConnected) {
            this.controller.log('Discovery: not connected', 'warning');
            return;
        }

        const stopBtn = document.getElementById('discScanStop');
        const progress = document.getElementById('discScanProgress');
        const tbody = document.getElementById('discScanBody');

        this.modal.querySelectorAll('.disc-block-read, #discBlockReadAll').forEach(b => b.disabled = true);
        stopBtn.disabled = false;
        this.scanAbort = false;
        tbody.innerHTML = '';

        const results = new Map();

        const prevHandler = this.controller.onRawSysEx;
        this.controller.onRawSysEx = (addressBytes, value, paramDef) => {
            if (typeof value === 'object') return;
            const key = addressBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
            results.set(key, { value, paramDef });
            if (prevHandler) prevHandler(addressBytes, value, paramDef);
        };

        const blocks = blockIndices.map(i => DiscoveryDashboard.DISCOVERY_BLOCKS[i]);
        for (const block of blocks) {
            if (this.scanAbort) break;
            progress.textContent = `Reading ${block.label} block...`;

            try {
                await this.controller.bossCubeComm.sendBlockReadRequest(block.address, block.size);
                const sizeBytes = block.size[2] * 128 + block.size[3];
                await new Promise(r => setTimeout(r, Math.max(300, sizeBytes * 5)));
            } catch (e) {
                this.controller.log(`🧪 Block read ${block.label} failed: ${e.message}`, 'warning');
            }
        }

        this.controller.onRawSysEx = prevHandler;

        const hideKnown = document.getElementById('discHideKnown')?.checked;
        const showDiff = document.getElementById('discShowDiff')?.checked;
        const prev = this._lastScanResults;
        let unknownCount = 0;
        let diffCount = 0;

        const sorted = [...results.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        for (const [addrStr, result] of sorted) {
            const isKnown = !!result.paramDef;
            if (!isKnown) unknownCount++;

            const prevEntry = prev?.get(addrStr);
            const changed = prevEntry !== undefined && prevEntry.value !== result.value;
            if (changed) diffCount++;

            if (showDiff && prev) {
                if (!changed) continue;
                const name = isKnown ? result.paramDef.id : '???';
                this._addScanRow(tbody, addrStr, name, result.value, isKnown ? 'known' : 'unknown', prevEntry.value);
            } else {
                if (hideKnown && isKnown) continue;
                const name = isKnown ? result.paramDef.id : '???';
                this._addScanRow(tbody, addrStr, name, result.value, isKnown ? 'known' : 'unknown', changed ? prevEntry.value : null);
            }
        }

        this._lastScanResults = results;

        let msg = this.scanAbort ? 'Scan aborted' : `Block read: ${results.size} params, ${unknownCount} unknown`;
        if (prev) msg += `, ${diffCount} changed`;
        progress.textContent = msg;
        this.controller.log(`🧪 ${msg}`, 'info');
        this.modal.querySelectorAll('.disc-block-read, #discBlockReadAll').forEach(b => b.disabled = false);
        stopBtn.disabled = true;
    }

    static get DISCOVERY_BLOCKS() {
        return BossCubeController.BLOCK_READS;
    }

    static TWEAK_PARAMS = [
        { addr: [0x00, 0x00, 0x00, 0x0f], label: 'Mix Level Reserved (0-100)', max: 100, value: null },
        { addr: [0x10, 0x00, 0x00, 0x6c], label: 'GTR Chorus/Delay Sel (0-2)', max: 2, value: null },
        { addr: [0x20, 0x00, 0x20, 0x12], label: 'Panel unknown (after Effect/Delay knob)', max: 5, value: null },
    ];

    static get UNKNOWN_ADDRESSES() {
        return DiscoveryDashboard.TWEAK_PARAMS.map(p => p.addr);
    }

    // ===== TWEAK UNKNOWNS =====

    _buildTweakControls() {
        const container = document.getElementById('discTweakControls');
        if (!container) return;
        container.innerHTML = '';

        for (const param of DiscoveryDashboard.TWEAK_PARAMS) {
            const addrStr = param.addr.map(b => b.toString(16).padStart(2, '0')).join(' ');
            const sMax = param.sliderMax ?? param.max;
            const row = document.createElement('div');
            row.className = 'discovery-tweak-row';
            row.dataset.addr = addrStr;
            row.innerHTML = `
                <div class="tweak-label">
                    <span class="tweak-addr">[${addrStr}]</span>
                    <span class="tweak-name">${param.label}</span>
                </div>
                <div class="tweak-control">
                    <input type="range" class="tweak-slider" min="0" max="${sMax}" value="${param.value ?? 0}" ${param.value === null ? 'disabled' : ''}>
                    <input type="number" class="tweak-value" min="0" max="${param.max}" value="${param.value ?? ''}" placeholder="?" ${param.value === null ? 'disabled' : ''}>
                    <button class="btn-small tweak-read" title="Read">📖</button>
                    <button class="btn-small tweak-send" title="Send" ${param.value === null ? 'disabled' : ''}>📤</button>
                </div>
            `;
            container.appendChild(row);

            const slider = row.querySelector('.tweak-slider');
            const numInput = row.querySelector('.tweak-value');
            slider.addEventListener('input', () => {
                numInput.value = slider.value;
                this._tweakSend(param, row);
            });
            numInput.addEventListener('input', () => {
                const v = Math.max(0, Math.min(param.max, parseInt(numInput.value, 10) || 0));
                slider.value = Math.min(v, sMax);
            });

            row.querySelector('.tweak-read').addEventListener('click', () => this._tweakRead(param, row));
            row.querySelector('.tweak-send').addEventListener('click', () => this._tweakSend(param, row));
        }

        this._buildJollyControl(container);
    }

    _buildJollyControl(container) {
        this._jollyParam = { addr: [0x00, 0x00, 0x00, 0x00], label: 'Custom', max: 127, value: null };
        const row = document.createElement('div');
        row.className = 'discovery-tweak-row tweak-jolly';
        row.dataset.addr = 'jolly';
        row.innerHTML = `
            <div class="tweak-label">
                <input type="text" class="tweak-addr-input discovery-input" value="00 00 00 00" size="14" title="4-byte hex address">
                <span class="tweak-name">Custom probe</span>
            </div>
            <div class="tweak-control">
                <input type="range" class="tweak-slider" min="0" max="127" value="0" disabled>
                <input type="number" class="tweak-value" min="0" max="127" value="" placeholder="?" disabled>
                <button class="btn-small tweak-read" title="Read">📖</button>
                <button class="btn-small tweak-send" title="Send" disabled>📤</button>
            </div>
        `;
        container.appendChild(row);

        const addrInput = row.querySelector('.tweak-addr-input');
        const parseAddr = () => {
            const bytes = addrInput.value.trim().split(/\s+/).map(s => parseInt(s, 16));
            if (bytes.length === 4 && bytes.every(b => !isNaN(b) && b >= 0 && b <= 0x7f)) {
                this._jollyParam.addr = bytes;
                return true;
            }
            return false;
        };

        const slider = row.querySelector('.tweak-slider');
        const numInput = row.querySelector('.tweak-value');
        slider.addEventListener('input', () => {
            numInput.value = slider.value;
            if (parseAddr()) this._tweakSend(this._jollyParam, row);
        });
        numInput.addEventListener('input', () => {
            const v = Math.max(0, Math.min(127, parseInt(numInput.value, 10) || 0));
            slider.value = v;
        });

        row.querySelector('.tweak-read').addEventListener('click', () => {
            if (parseAddr()) {
                this._tweakRead(this._jollyParam, row);
            } else {
                this.controller.log('Jolly: invalid address (4 hex bytes 00-7f)', 'warning');
            }
        });
        row.querySelector('.tweak-send').addEventListener('click', () => {
            if (parseAddr()) {
                this._tweakSend(this._jollyParam, row);
            } else {
                this.controller.log('Jolly: invalid address (4 hex bytes 00-7f)', 'warning');
            }
        });
    }

    async _tweakReadAll() {
        if (!this.controller.isCubeConnected) {
            this.controller.log('Tweak: not connected', 'warning');
            return;
        }

        const prevHandler = this.controller.onRawSysEx;
        const results = new Map();
        this.controller.onRawSysEx = (addressBytes, value, paramDef) => {
            if (typeof value === 'object') return;
            const key = addressBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
            results.set(key, value);
            if (prevHandler) prevHandler(addressBytes, value, paramDef);
        };

        for (const param of DiscoveryDashboard.TWEAK_PARAMS) {
            try {
                await this.controller.bossCubeComm.sendParameterReadRequest(param.addr);
            } catch (_) { /* skip */ }
            await new Promise(r => setTimeout(r, 250));
        }

        this.controller.onRawSysEx = prevHandler;

        for (const param of DiscoveryDashboard.TWEAK_PARAMS) {
            const addrStr = param.addr.map(b => b.toString(16).padStart(2, '0')).join(' ');
            const val = results.get(addrStr);
            if (val !== undefined) {
                param.value = val;
                const row = document.querySelector(`.discovery-tweak-row[data-addr="${addrStr}"]`);
                if (row) this._tweakUpdateRow(row, val);
            }
        }
        this.controller.log(`🔧 Tweak: read ${results.size}/${DiscoveryDashboard.TWEAK_PARAMS.length} values`, 'info');
    }

    async _tweakRead(param, row) {
        if (!this.controller.isCubeConnected) return;

        const prevHandler = this.controller.onRawSysEx;
        let result = null;
        const addrStr = param.addr.map(b => b.toString(16).padStart(2, '0')).join(' ');
        this.controller.onRawSysEx = (addressBytes, value, paramDef) => {
            if (typeof value === 'object') return;
            const key = addressBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
            if (key === addrStr) result = value;
            if (prevHandler) prevHandler(addressBytes, value, paramDef);
        };

        await this.controller.bossCubeComm.sendParameterReadRequest(param.addr);
        await new Promise(r => setTimeout(r, 300));
        this.controller.onRawSysEx = prevHandler;

        if (result !== null) {
            param.value = result;
            this._tweakUpdateRow(row, result);
        }
    }

    async _tweakSend(param, row) {
        if (!this.controller.isCubeConnected) return;
        const numInput = row.querySelector('.tweak-value');
        const value = Math.max(0, Math.min(param.max, parseInt(numInput.value, 10) || 0));
        await this.controller.bossCubeComm.sendParameterCommand(param.addr, value);
        param.value = value;
        this.controller.log(`🔧 Tweak: sent [${param.addr.map(b => b.toString(16).padStart(2, '0')).join(' ')}] = ${value}`, 'info');
    }

    _tweakUpdateRow(row, value) {
        const slider = row.querySelector('.tweak-slider');
        const numInput = row.querySelector('.tweak-value');
        slider.value = value;
        slider.disabled = false;
        numInput.value = value;
        numInput.disabled = false;
        row.querySelector('.tweak-send').disabled = false;
    }

    _addScanRow(tbody, addr, name, value, status, prevValue = null) {
        const row = document.createElement('tr');
        row.setAttribute('data-addr', addr);
        const changed = prevValue !== null;
        row.className = (status === 'known' ? 'disc-known' : (status === 'unknown' ? 'disc-unknown' : 'disc-empty'))
            + (changed ? ' disc-changed' : '');
        const valCell = changed ? `<span class="disc-prev">${prevValue}</span> → ${value}` : `${value ?? ''}`;
        row.innerHTML = `<td class="disc-addr">${addr}</td><td>${name || ''}</td><td class="disc-val">${valCell}</td><td>${status}</td>`;
        tbody.appendChild(row);
    }

    // ===== UTILS =====

    _timeAgo(ts) {
        const sec = Math.round((Date.now() - ts) / 1000);
        if (sec < 2) return 'now';
        if (sec < 60) return `${sec}s`;
        return `${Math.floor(sec / 60)}m`;
    }
}
