const PROMPT_SEEN_KEY = "hayshed.pwaInstallPromptSeen";
const ICON_VERSION_KEY = "hayshed.iconVersion";
const PROMPT_DELAY_MS = 1200;
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

function getInstallModal() {
	return document.getElementById("pwaInstallModal");
}

function setInstallButtonVisible(visible) {
	const btn = getInstallButton();
	if (!btn) return;
	btn.hidden = !visible;
}

function hasSeenInstallPrompt() {
	try {
		return window.localStorage.getItem(PROMPT_SEEN_KEY) === "1";
	} catch {
		return false;
	}
}

function rememberInstallPromptSeen() {
	try {
		window.localStorage.setItem(PROMPT_SEEN_KEY, "1");
	} catch {
		/* ignore */
	}
}

function openInstallModal() {
	const modal = getInstallModal();
	if (!modal || modal.classList.contains("auth-modal--open")) return;

	rememberInstallPromptSeen();
	modal.classList.add("auth-modal--open");
	modal.removeAttribute("inert");
	modal.setAttribute("aria-hidden", "false");
}

function closeInstallModal() {
	const modal = getInstallModal();
	if (!modal) return;

	rememberInstallPromptSeen();
	modal.classList.remove("auth-modal--open");
	modal.setAttribute("inert", "");
	modal.setAttribute("aria-hidden", "true");
}

/**
 * Chromium discovers icon/name updates from the document's <link rel="manifest">.
 * A bare fetch() of manifest.json is not enough — force one full reload when
 * ICON_VERSION changes so the installed app re-parses the latest HTML + manifest.
 */
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
		/* ignore */
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
		/* ignore */
	}

	try {
		window.localStorage.setItem(ICON_VERSION_KEY, version);
	} catch {
		/* ignore */
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
				/* ignore */
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

/**
 * Chromium/Edge (Windows, Android, desktop): native install dialog via beforeinstallprompt.
 * No alert / instruction fallbacks — only the browser install UI.
 */
export function initPwa() {
	const btn = getInstallButton();
	const modal = getInstallModal();
	if (!btn) return;

	if (isStandaloneDisplay()) {
		setInstallButtonVisible(false);
		registerServiceWorker();
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
			/* ignore */
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
		closeInstallModal();
	});

	btn.addEventListener("click", async (event) => {
		event.preventDefault();
		await runNativeInstall();
	});

	if (modal && !isStandaloneDisplay()) {
		const dismiss = () => closeInstallModal();
		modal.querySelector("#pwaInstallOverlay")?.addEventListener("click", dismiss);
		modal.querySelector("#pwaInstallClose")?.addEventListener("click", dismiss);
		modal.querySelector("#pwaInstallDismiss")?.addEventListener("click", dismiss);
		modal.querySelector("#pwaInstallConfirm")?.addEventListener("click", async () => {
			closeInstallModal();
			await runNativeInstall();
		});

		if (!hasSeenInstallPrompt()) {
			window.setTimeout(() => {
				if (isStandaloneDisplay() || hasSeenInstallPrompt()) return;
				openInstallModal();
			}, PROMPT_DELAY_MS);
		}
	}

	registerServiceWorker().then(() => {
		/* SW ready — Chromium may fire beforeinstallprompt shortly after */
	});
}
