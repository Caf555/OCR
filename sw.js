// Qwen3-VL OCR Service Worker
// 支援離線使用

const CACHE_NAME = 'qwen-ocr-v1';
const CACHE_ASSETS = [
  './',
  './qwen3-ocr.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
];

// 安裝事件 - 快取必要資源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 快取資源中...');
        return cache.addAll(CACHE_ASSETS);
      })
      .then(() => {
        console.log('[SW] 所有資源已快取');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] 快取失敗:', error);
      })
  );
});

// 啟動事件 - 清理舊快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] 刪除舊快取:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker 已啟動');
        return self.clients.claim();
      })
  );
});

// 攔截請求 - 快取優先策略（適用於靜態資源）
// 網路優先策略（適用於 API 請求）
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API 請求 - 網路優先
  if (url.pathname.includes('/v1/') || url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return new Response(JSON.stringify({
            error: '離線模式：無法連接到 API 伺服器',
            offline: true
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // 靜態資源 - 快取優先，網路備援
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // 背景更新快取
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(event.request, networkResponse));
              }
            })
            .catch(() => {});

          return cachedResponse;
        }

        // 未快取 - 從網路獲取並快取
        return fetch(event.request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            // 快取可快取的資源
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          })
          .catch(() => {
            // 離線且無快取 - 返回離線頁面
            if (event.request.mode === 'navigate') {
              return caches.match('./qwen3-ocr.html');
            }
            return new Response('離線中', { status: 503 });
          });
      })
  );
});

// 接收主執行緒訊息
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }

  if (event.data === 'clearCache') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] 快取已清除');
    });
  }
});

// 推送通知（預留）
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon
    });
  }
});

console.log('[SW] Service Worker 已載入');
