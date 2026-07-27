/* Network-first SW: installable PWA without freezing on old cached shells. */
const SW_VERSION = "hayshed-pwa-2026-07-27";

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

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;

	const isNavigate = request.mode === "navigate";
	const url = new URL(request.url);
	const isAppShell =
		isNavigate
		|| url.pathname.endsWith(".html")
		|| url.pathname.endsWith("/sw.js")
		|| url.pathname.endsWith("/manifest.json")
		|| url.pathname.startsWith("/favicon/");

	event.respondWith(
		fetch(request, isAppShell ? { cache: "no-store" } : undefined).catch(
			() => fetch(request),
		),
	);
});

// Touch version string so deploys replace the SW file.
void SW_VERSION;
