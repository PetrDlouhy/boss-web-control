/**
 * In-app version switcher. Fetches versions.json from the deployment root
 * and populates a <select> element allowing users to switch between versions.
 *
 * Works both in versioned deployments (/boss-web-control/v/vX.Y.Z/) and
 * during local development (gracefully hides when versions.json is unavailable).
 */

const REPO_BASE = '/boss-web-control';

export function initVersionSwitcher(currentVersion) {
    const switcher = document.getElementById('versionSwitcher');
    if (!switcher) return;

    const versionsUrl = `${REPO_BASE}/versions.json`;

    fetch(versionsUrl)
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(versions => {
            if (!versions.length) return;

            switcher.innerHTML = '';
            for (const v of versions) {
                const opt = document.createElement('option');
                opt.value = v.path;
                opt.textContent = v.tag;
                if (v.tag === `v${currentVersion}`) {
                    opt.selected = true;
                }
                switcher.appendChild(opt);
            }

            switcher.style.display = '';
            switcher.addEventListener('change', () => {
                const selected = versions.find(v => v.path === switcher.value);
                if (selected) {
                    localStorage.setItem('boss-cube-preferred-version', selected.tag);
                    window.location.href = switcher.value;
                }
            });
        })
        .catch(() => {
            // versions.json not available (local dev, or not yet deployed)
        });
}
