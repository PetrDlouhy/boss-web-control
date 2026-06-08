self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      // Keep version-scoped app caches (boss-cube-control-v*) so installed
      // versioned PWAs keep working offline; only clear legacy/root caches.
      return Promise.all(
        names
          .filter(function(n) { return n.indexOf('boss-cube-control-v') !== 0; })
          .map(function(n) { return caches.delete(n); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function(e) { e.respondWith(fetch(e.request)); });
SWEOF
