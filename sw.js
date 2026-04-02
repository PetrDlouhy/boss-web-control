// Boss Cube Web Control - Service Worker
// Network-first strategy: always fresh when online, cached fallback when offline

const VERSION = '2.28.0';
const CACHE_NAME = 'boss-cube-control';

const urlsToCache = [
    '/',
    '/index.html',
    '/styles/styles.css',
    '/styles/live-performance.css',
    '/styles/tuner.css',
    '/styles/looper-controls.css',
    '/styles/looper-settings.css',
    '/app.js',
    '/boss-cube-controller.js',
    '/boss-cube-communication.js',
    '/pedal-communication.js',
    '/parameters.js',
    '/constants.js',
    '/template-loader.js',
    '/live-performance.js',
    '/event-bus.js',
    '/control-factory.js',
    '/pedal-utils.js',
    '/effect-definitions.js',
    '/volume-calibration.js',
    '/version-switcher.js',
    '/discovery-dashboard.js',
    '/looper-timeline.js',
    '/manifest.json',
    '/templates/effects-interface.html',
    '/templates/live-performance.html',
    '/templates/looper-controls.html',
    '/templates/looper-settings.html'
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

// Network-first: try network, update cache, fall back to cache when offline
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            // Remove any legacy versioned caches
            caches.keys().then(names =>
                Promise.all(
                    names
                        .filter(name => name !== CACHE_NAME)
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
