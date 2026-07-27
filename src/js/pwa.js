const INSTALL_HINT =
	"Install this site as an app on your device.\n\n" +
	"Browser menu → Install app / Add to Home Screen.\n\n" +
	"iPhone/iPad: Share → Add to Home Screen.";

const DISMISS_KEY = "hayshed.pwaInstallDismissedAt";
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;
const PROMPT_DELAY_MS = 1200;

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

function wasInstallDismissedRecently() {
	try {
		const raw = window.localStorage.getItem(DISMISS_KEY);
		if (!raw) return false;
		const at = Number(raw);
		if (!Number.isFinite(at)) return false;
		return Date.now() - at < DISMISS_MS;
	} catch {
		return false;
	}
}

function rememberInstallDismissed() {
	try {
		window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
	} catch {
		/* ignore */
	}
}

function openInstallModal() {
	const modal = getInstallModal();
	if (!modal || modal.classList.contains("auth-modal--open")) return;

	modal.classList.add("auth-modal--open");
	modal.removeAttribute("inert");
	modal.setAttribute("aria-hidden", "false");
}

function closeInstallModal({ remember = false } = {}) {
	const modal = getInstallModal();
	if (!modal) return;

	if (remember) rememberInstallDismissed();

	modal.classList.remove("auth-modal--open");
	modal.setAttribute("inert", "");
	modal.setAttribute("aria-hidden", "true");
}

export function initPwa() {
	const btn = getInstallButton();
	const modal = getInstallModal();
	if (!btn) return;

	if (isStandaloneDisplay()) {
		setInstallButtonVisible(false);
		return;
	}

	setInstallButtonVisible(true);

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
		rememberInstallDismissed();
	});

	btn.addEventListener("click", () => {
		promptInstall();
	});

	if (modal) {
		const dismiss = () => closeInstallModal({ remember: true });
		modal.querySelector("#pwaInstallOverlay")?.addEventListener("click", dismiss);
		modal.querySelector("#pwaInstallClose")?.addEventListener("click", dismiss);
		modal.querySelector("#pwaInstallDismiss")?.addEventListener("click", dismiss);
		modal.querySelector("#pwaInstallConfirm")?.addEventListener("click", async () => {
			closeInstallModal({ remember: true });
			await promptInstall();
		});

		if (!wasInstallDismissedRecently()) {
			window.setTimeout(() => {
				if (isStandaloneDisplay()) return;
				openInstallModal();
			}, PROMPT_DELAY_MS);
		}
	}

	if (!("serviceWorker" in navigator)) return;

	navigator.serviceWorker.register("./sw.js").catch((err) => {
		console.warn("Service worker registration failed:", err);
	});
}
