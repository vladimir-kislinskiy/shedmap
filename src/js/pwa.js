const INSTALL_HINT =
	"Install this site as an app on your device.\n\n" +
	"Browser menu → Install app / Add to Home Screen.\n\n" +
	"iPhone/iPad: Share → Add to Home Screen.";

const PROMPT_SEEN_KEY = "hayshed.pwaInstallPromptSeen";
const PROMPT_DELAY_MS = 1200;
const SW_UPDATE_MS = 60 * 60 * 1000;

function isStandaloneDisplay() {
	return (
		window.matchMedia("(display-mode: standalone)").matches
		|| window.matchMedia("(display-mode: fullscreen)").matches
		|| window.navigator.standalone === true
	);
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

function registerServiceWorker() {
	if (!("serviceWorker" in navigator)) return;

	navigator.serviceWorker
		.register("./sw.js", { updateViaCache: "none" })
		.then((registration) => {
			registration.update().catch(() => {});

			window.setInterval(() => {
				registration.update().catch(() => {});
			}, SW_UPDATE_MS);

			registration.addEventListener("updatefound", () => {
				const worker = registration.installing;
				if (!worker) return;
				worker.addEventListener("statechange", () => {
					if (
						worker.state === "installed"
						&& navigator.serviceWorker.controller
					) {
						/* New SW ready — activate immediately via skipWaiting in sw.js */
					}
				});
			});
		})
		.catch((err) => {
			console.warn("Service worker registration failed:", err);
		});

	let refreshing = false;
	let hadController = Boolean(navigator.serviceWorker.controller);
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		if (refreshing) return;
		if (!hadController) {
			hadController = true;
			return;
		}
		refreshing = true;
		window.location.reload();
	});
}

export function initPwa() {
	const btn = getInstallButton();
	const modal = getInstallModal();
	if (!btn) return;

	if (isStandaloneDisplay()) {
		setInstallButtonVisible(false);
	} else {
		setInstallButtonVisible(true);
	}

	let deferredPrompt = null;

	async function promptInstall() {
		if (deferredPrompt) {
			deferredPrompt.prompt();
			try {
				await deferredPrompt.userChoice;
			} catch {
				/* ignore */
			}
			deferredPrompt = null;
			return;
		}

		window.alert(INSTALL_HINT);
	}

	window.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		deferredPrompt = event;
		setInstallButtonVisible(true);
	});

	window.addEventListener("appinstalled", () => {
		deferredPrompt = null;
		setInstallButtonVisible(false);
		closeInstallModal();
	});

	btn.addEventListener("click", (event) => {
		event.preventDefault();
		promptInstall();
	});

	if (modal && !isStandaloneDisplay()) {
		const dismiss = () => closeInstallModal();
		modal.querySelector("#pwaInstallOverlay")?.addEventListener("click", dismiss);
		modal.querySelector("#pwaInstallClose")?.addEventListener("click", dismiss);
		modal.querySelector("#pwaInstallDismiss")?.addEventListener("click", dismiss);
		modal.querySelector("#pwaInstallConfirm")?.addEventListener("click", async () => {
			closeInstallModal();
			await promptInstall();
		});

		if (!hasSeenInstallPrompt()) {
			window.setTimeout(() => {
				if (isStandaloneDisplay() || hasSeenInstallPrompt()) return;
				openInstallModal();
			}, PROMPT_DELAY_MS);
		}
	}

	registerServiceWorker();
}
