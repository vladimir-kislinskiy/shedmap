const ICON_VERSION_KEY = "hayshed.iconVersion";
const SW_UPDATE_MS = 60 * 60 * 1000;
const PROMPT_WAIT_MS = 8000;
const PROMPT_POLL_MS = 200;

function isStandaloneDisplay() {
	return (
		window.matchMedia("(display-mode: standalone)").matches
		|| window.matchMedia("(display-mode: fullscreen)").matches
		|| window.navigator.standalone === true
	);
}

function getIconVersion() {
	return document.querySelector('meta[name="hayshed-icon-version"]')?.content?.trim() || "";
}

function getInstallButton() {
	return document.getElementById("pwaInstallBtn");
}

function setInstallButtonVisible(visible) {
	const btn = getInstallButton();
	if (!btn) return;
	btn.hidden = !visible;
}

function refreshManifestDiscovery() {
	const version = getIconVersion();
	if (!version) return;

	const manifestLink = document.querySelector('link[rel="manifest"]');
	const manifestHref = manifestLink?.href || "/favicon/manifest.json";

	fetch(manifestHref, { cache: "reload" }).catch(() => {});
	document.querySelectorAll('link[rel="apple-touch-icon"], link[rel="icon"]').forEach((link) => {
		if (!link.href) return;
		fetch(link.href, { cache: "reload" }).catch(() => {});
	});

	let seen = "";
	try {
		seen = window.localStorage.getItem(ICON_VERSION_KEY) || "";
	} catch {
		seen = "";
	}

	if (!isStandaloneDisplay() || seen === version) return;

	const reloadKey = `hayshed.iconReload.${version}`;
	try {
		if (!window.sessionStorage.getItem(reloadKey)) {
			window.sessionStorage.setItem(reloadKey, "1");
			window.location.reload();
			return;
		}
	} catch {
		return;
	}

	try {
		window.localStorage.setItem(ICON_VERSION_KEY, version);
	} catch {
		return;
	}
}

function registerServiceWorker() {
	if (!("serviceWorker" in navigator)) {
		refreshManifestDiscovery();
		return Promise.resolve(null);
	}

	return navigator.serviceWorker
		.register("/sw.js", { scope: "/", updateViaCache: "none" })
		.then(async (registration) => {
			try {
				await navigator.serviceWorker.ready;
			} catch {
				return registration;
			}

			const pokeUpdate = () => {
				registration.update().catch(() => {});
				refreshManifestDiscovery();
			};

			pokeUpdate();

			window.setInterval(pokeUpdate, SW_UPDATE_MS);
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "visible") pokeUpdate();
			});

			return registration;
		})
		.catch((err) => {
			console.warn("Service worker registration failed:", err);
			refreshManifestDiscovery();
			return null;
		});
}

function initInstallButton() {
	const btn = getInstallButton();
	if (!btn) return;

	if (isStandaloneDisplay()) {
		setInstallButtonVisible(false);
		return;
	}

	setInstallButtonVisible(true);

	let deferredPrompt = null;
	let promptWaiters = [];

	function notifyPromptReady() {
		const waiters = promptWaiters;
		promptWaiters = [];
		for (const resolve of waiters) resolve(deferredPrompt);
	}

	function waitForDeferredPrompt(timeoutMs) {
		if (deferredPrompt) return Promise.resolve(deferredPrompt);

		return new Promise((resolve) => {
			let settled = false;
			const finish = (value) => {
				if (settled) return;
				settled = true;
				resolve(value);
			};

			promptWaiters.push(finish);

			const started = Date.now();
			const poll = window.setInterval(() => {
				if (deferredPrompt) {
					window.clearInterval(poll);
					finish(deferredPrompt);
					return;
				}
				if (Date.now() - started >= timeoutMs) {
					window.clearInterval(poll);
					finish(null);
				}
			}, PROMPT_POLL_MS);
		});
	}

	async function runNativeInstall() {
		let promptEvent = deferredPrompt;
		if (!promptEvent) {
			promptEvent = await waitForDeferredPrompt(PROMPT_WAIT_MS);
		}
		if (!promptEvent) return false;

		deferredPrompt = null;
		promptEvent.prompt();

		try {
			await promptEvent.userChoice;
		} catch {
			return true;
		}

		return true;
	}

	window.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		deferredPrompt = event;
		setInstallButtonVisible(true);
		notifyPromptReady();
	});

	window.addEventListener("appinstalled", () => {
		deferredPrompt = null;
		setInstallButtonVisible(false);
	});

	btn.addEventListener("click", async (event) => {
		event.preventDefault();
		await runNativeInstall();
	});
}

export function initPwa() {
	initInstallButton();
	void registerServiceWorker();
}
