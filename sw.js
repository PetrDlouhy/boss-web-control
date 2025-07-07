// Boss Cube Web Control - Service Worker
// Enables PWA functionality with aggressive update strategy

const VERSION = '2.22.14';
const CACHE_NAME = `boss-cube-control-v${VERSION}`;
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/boss-cube-controller.js',
    '/boss-cube-communication.js',
    '/pedal-communication.js',
    '/parameters.js',
    '/effect-definitions.js',
    '/constants.js',
    '/manifest.json',
    '/pedal-communication.test.js',
    '/boss-cube-controller.test.js',
    '/boss-cube-communication.test.js',
    '/reload-values.test.js',
    '/test-runner.html',
    '/manual-test-read-values.html',
    '/package.json'
];

// Install event - cache resources
self.addEventListener('install', event => {
    console.log(`Service Worker ${VERSION} installing...`);
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service worker caching files with version:', VERSION);
                return cache.addAll(urlsToCache);
            })
    );
    
    // Only skip waiting when explicitly requested via message
    // This allows proper update detection
});

// Fetch event - network first for HTML/JS, cache for others
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // For HTML and JS files, try network first to get updates
    if (url.pathname.endsWith('.html') || 
        url.pathname.endsWith('.js') || 
        url.pathname === '/') {
        
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
        // For other files, use cache first
        event.respondWith(
            caches.match(event.request)
                .then(response => response || fetch(event.request))
        );
    }
});

// Activate event - cleanup old caches and claim clients
self.addEventListener('activate', event => {
    console.log(`Service Worker ${VERSION} activating...`);
    
    event.waitUntil(
        Promise.all([
            // Clear old caches
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

// Message handling for version requests and skip waiting
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: VERSION });
    }
    
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
}); 