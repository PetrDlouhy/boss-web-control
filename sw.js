// Boss Cube Web Control - Service Worker
// Network-first strategy: always fresh when online, cached fallback when offline

const VERSION = '2.30.0';
// Version-scoped cache so each deployed version keeps its own offline copy and
// versions never overwrite each other's assets in the shared per-origin store.
const CACHE_PREFIX = 'boss-cube-control';
const CACHE_NAME = `${CACHE_PREFIX}-v${VERSION}`;

const urlsToCache = [
    './',
    './index.html',
    './styles/styles.css',
    './styles/live-performance.css',
    './styles/tuner.css',
    './styles/looper-controls.css',
    './styles/looper-settings.css',
    './app.js',
    './boss-cube-controller.js',
    './boss-cube-communication.js',
    './pedal-communication.js',
    './parameters.js',
    './constants.js',
    './template-loader.js',
    './live-performance.js',
    './event-bus.js',
    './control-factory.js',
    './pedal-utils.js',
    './effect-definitions.js',
    './volume-calibration.js',
    './version-switcher.js',
    './discovery-dashboard.js',
    './looper-timeline.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-192.svg',
    './icons/icon-512.svg',
    './templates/effects-interface.html',
    './templates/live-performance.html',
    './templates/looper-controls.html',
    './templates/looper-settings.html'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return Promise.allSettled(
                    urlsToCache.map(url =>
                        cache.add(url).catch(error => {
                            console.warn(`Failed to cache ${url}:`, error.message);
                        })
                    )
                );
            })
            .then(() => self.skipWaiting())
            .catch(error => {
                console.error('Service worker install failed:', error);
            })
    );
});

// Network-first: try network, update cache, fall back to cache when offline.
self.addEventListener('fetch', event => {
    const { request } = event;

    // Only manage same-origin GET requests. Let the browser handle the rest
    // (e.g. the app's POST to /api/log) so we never break non-cacheable calls.
    if (request.method !== 'GET') return;
    if (new URL(request.url).origin !== self.location.origin) return;

    event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            // Best-effort refresh; ignore quota/write errors so serving never breaks.
            cache.put(request, response.clone()).catch(() => {});
        }
        return response;
    } catch (networkError) {
        const cached = await cache.match(request);
        if (cached) return cached;

        // Offline with nothing cached: serve the app shell for navigations so the
        // installed PWA still boots even on a deep-linked or directory URL.
        if (request.mode === 'navigate') {
            const shell = (await cache.match('./index.html')) || (await cache.match('./'));
            if (shell) return shell;
        }
        throw networkError;
    }
}

self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            // Remove this app's legacy/older caches (the unversioned cache and
            // previous version caches) while leaving unrelated origin caches alone.
            caches.keys().then(names =>
                Promise.all(
                    names
                        .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
                        .map(name => caches.delete(name))
                )
            ),
            self.clients.claim()
        ])
    );
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: VERSION });
    }

    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }

    if (event.data && event.data.action === 'clearCache') {
        caches.delete(CACHE_NAME);
    }
});
