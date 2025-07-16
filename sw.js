// Boss Cube Web Control - Service Worker
// Enables PWA functionality with aggressive update strategy

const VERSION = '2.24.0';
const CACHE_NAME = `boss-cube-control-v${VERSION}`;
const urlsToCache = [
    '/',
    '/index.html',
    '/styles/styles.css',
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
    '/preset-manager.js',
    '/manifest.json',
    '/templates/effects-interface.html',
    '/templates/live-performance.html',
    '/templates/looper-controls.html',
    '/templates/looper-settings.html'
];

// Install event - cache resources with error handling
self.addEventListener('install', event => {
    
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {

                // Cache files individually to handle missing files gracefully
                return Promise.allSettled(
                    urlsToCache.map(url => 
                        cache.add(url).catch(error => {
                            console.warn(`Failed to cache ${url}:`, error.message);
                            return null; // Continue with other files
                        })
                    )
                );
            })
            .then(() => {

                // Skip waiting immediately for development versions to ensure quick updates
                if (VERSION.includes('-alpha') || VERSION.includes('-beta') || VERSION.includes('-rc')) {
                    return self.skipWaiting();
                }
            })
            .catch(error => {
                console.error('Service worker install failed:', error);
                // Still proceed with installation even if caching fails
            })
    );
});

// Fetch event - network first for critical files during development
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // For development versions, always try network first for JS/CSS/HTML
    const isDevelopment = VERSION.includes('-alpha') || VERSION.includes('-beta') || VERSION.includes('-rc');
    
    if (isDevelopment && (
        url.pathname.endsWith('.html') || 
        url.pathname.endsWith('.js') || 
        url.pathname.endsWith('.css') || 
        url.pathname === '/'
    )) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // If successful, update cache and return response
                    if (response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, responseClone));
                    }
                    return response;
                })
                .catch(() => {
                    // If network fails, fall back to cache
                    return caches.match(event.request);
                })
        );
    } else {
        // For stable versions or other files, use cache first
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    if (response) {
                        return response;
                    }
                    return fetch(event.request);
                })
        );
    }
});

// Activate event - aggressive cleanup and immediate control
self.addEventListener('activate', event => {
    console.log(`Service Worker ${VERSION} activating...`);
    
    event.waitUntil(
        Promise.all([
            // Clear ALL old caches aggressively
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Service worker clearing old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Take control of all clients immediately
            self.clients.claim()
        ])
    );
});

// Enhanced message handling for version requests and cache management
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: VERSION });
    }
    
    if (event.data && event.data.action === 'skipWaiting') {
        console.log('Forced update requested, clearing all caches...');
        // Clear ALL caches before skipWaiting for immediate update
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    console.log('Force clearing cache for update:', cacheName);
                    return caches.delete(cacheName);
                })
            );
        }).then(() => {
            console.log('All caches cleared, skipping waiting...');
            self.skipWaiting();
        });
    }
    
    if (event.data && event.data.action === 'clearCache') {
        // Manual cache clear request
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    console.log('Manual cache clear:', cacheName);
                    return caches.delete(cacheName);
                })
            );
        });
    }
}); 