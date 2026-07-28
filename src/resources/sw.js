/* Network-first SW required for Chromium/Edge installability (Windows included). */
const SW_VERSION = "hayshed-pwa-2026-07-28-sm-icon-g";

self.addEventListener("install", (event) => {
	event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(keys.map((key) => caches.delete(key)));
			await self.clients.claim();
		})(),
	);
});

/* A fetch handler is required for installability. Always prefer network. */
self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") return;
	event.respondWith(
		fetch(event.request).catch(() => caches.match(event.request)),
	);
});

void SW_VERSION;
