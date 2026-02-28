// ========================================
// SERVICE WORKER - Caching y Offline
// ========================================

const CACHE_NAME = 'caa-brs-v3';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/tailwind.css',
    '/manifest.json',
    '/Images/Logo.png',
    '/Images/icon-192.png',
    '/Images/icon-512.png'
];

// Instalar Service Worker y cachear assets
self.addEventListener('install', (event) => {
    console.log('Service Worker: Instalando...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Cacheando assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting()) // Activar inmediatamente
    );
});

// Activar Service Worker
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activado');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Eliminando cache antiguo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    
    self.clients.claim(); // Tomar control de todos los clientes
});

// Interceptar peticiones (Network First Strategy)
self.addEventListener('fetch', (event) => {
    const { request } = event;
    
    // Solo cachear GET
    if (request.method !== 'GET') {
        return;
    }

    // Network first, fallback a cache
    event.respondWith(
        fetch(request)
            .then((response) => {
                // Si es exitosa, cachearla
                if (response.status === 200) {
                    const cache = caches.open(CACHE_NAME);
                    cache.then((c) => c.put(request, response.clone()));
                }
                return response;
            })
            .catch(() => {
                // Si falla, usar cache
                return caches.match(request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        
                        // Si no está en cache, retornar página offline
                        if (request.destination === 'document') {
                            return caches.match('/index.html');
                        }
                    });
            })
    );
});

// Limpiar cache de forma periódica
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME);
    }
});

console.log('Service Worker: Listo para usar');
