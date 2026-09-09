import { initializeApp } from "firebase/app";
import {
	browserLocalPersistence,
	getAuth,
	indexedDBLocalPersistence,
	initializeAuth,
	onAuthStateChanged,
	setPersistence,
	signInWithCustomToken,
	signInWithEmailAndPassword,
	signOut,
} from "firebase/auth";
import { getFirebaseConfig } from "./firebase-config.js";
import {
	clearSessionToken,
	fetchFirebaseCustomToken,
	requestPersistentStorage,
	setSessionToken,
} from "./session.js";

const ENTER_ONCE_KEY = "hayshed.enterOnce";
const LEAVE_APP_KEY = "hayshed.leaveApp";
const WAS_AUTHED_KEY = "hayshed.wasAuthed";
const MAX_ENTER_ATTEMPTS = 2;

function showError(message) {
	const errorEl = document.getElementById("loginError");
	if (!errorEl) return;
	errorEl.hidden = !message;
	errorEl.textContent = message || "";
}

function setGateBusy(busy, label) {
	const form = document.getElementById("loginForm");
	const submitEl = document.getElementById("loginSubmit");
	if (form) form.setAttribute("aria-busy", busy ? "true" : "false");
	if (submitEl) {
		submitEl.disabled = Boolean(busy);
		if (label) submitEl.textContent = label;
	}
}

function readEnterAttempts() {
	const raw = sessionStorage.getItem(ENTER_ONCE_KEY);
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

function createAuth(app) {
	try {
		return initializeAuth(app, {
			persistence: [indexedDBLocalPersistence, browserLocalPersistence],
		});
	} catch {
		return getAuth(app);
	}
}

function initLoginGate() {
	const form = document.getElementById("loginForm");
	const emailEl = document.getElementById("loginEmail");
	const passwordEl = document.getElementById("loginPassword");
	const toggleEl = document.getElementById("loginPasswordToggle");

	const params = new URLSearchParams(window.location.search);
	const wasDenied = params.get("error") === "unauthorized";
	const wasSignedOut = params.get("signedout") === "1";
	let blockAutoEnter = wasDenied || wasSignedOut;
	let enterStarted = false;
	let restoreTried = false;

	if (wasDenied) {
		void clearSessionToken();
		sessionStorage.removeItem(ENTER_ONCE_KEY);
		sessionStorage.setItem(LEAVE_APP_KEY, "1");
		try {
			localStorage.removeItem(WAS_AUTHED_KEY);
		} catch {
		}
		showError("This account is not authorized. Contact Vlad for access.");
	} else if (wasSignedOut) {
		sessionStorage.setItem(LEAVE_APP_KEY, "1");
		try {
			localStorage.removeItem(WAS_AUTHED_KEY);
		} catch {
		}
	} else {
		sessionStorage.removeItem(LEAVE_APP_KEY);
		try {
			if (localStorage.getItem(WAS_AUTHED_KEY) === "1") {
				setGateBusy(true, "Opening…");
			}
		} catch {
		}
	}

	if (
		params.has("authed") ||
		params.has("_") ||
		params.has("error") ||
		params.has("signedout")
	) {
		window.history.replaceState({}, "", window.location.pathname || "/");
	}

	const app = initializeApp(getFirebaseConfig());
	const auth = createAuth(app);
	void setPersistence(auth, indexedDBLocalPersistence).catch(() =>
		setPersistence(auth, browserLocalPersistence).catch(() => {}),
	);

	if (wasDenied || wasSignedOut) {
		void signOut(auth)
			.catch(() => {})
			.finally(() => {
				void clearSessionToken();
			});
	}

	async function enterApp(user) {
		if (enterStarted) return;

		const attempts = readEnterAttempts();
		if (attempts >= MAX_ENTER_ATTEMPTS) {
			sessionStorage.removeItem(ENTER_ONCE_KEY);
			await clearSessionToken();
			setGateBusy(false, "Sign In");
			showError("Sign-in could not open the app. Please try again.");
			return;
		}

		enterStarted = true;
		setGateBusy(true, "Opening…");
		try {
			const token = await user.getIdToken(true);
			await setSessionToken(token);
			await requestPersistentStorage();
			sessionStorage.setItem(ENTER_ONCE_KEY, String(attempts + 1));
			sessionStorage.removeItem(LEAVE_APP_KEY);
			try {
				localStorage.setItem(WAS_AUTHED_KEY, "1");
			} catch {
			}
			window.location.assign("/");
		} catch (err) {
			console.error("Session restore error:", err);
			enterStarted = false;
			sessionStorage.removeItem(ENTER_ONCE_KEY);
			await clearSessionToken();
			setGateBusy(false, "Sign In");
			showError("Could not restore session. Please sign in.");
		}
	}

	async function tryRestoreFromCookie() {
		if (blockAutoEnter || restoreTried || auth.currentUser) return false;
		restoreTried = true;
		setGateBusy(true, "Opening…");
		try {
			const customToken = await fetchFirebaseCustomToken();
			if (!customToken) {
				setGateBusy(false, "Sign In");
				return false;
			}
			const cred = await signInWithCustomToken(auth, customToken);
			await enterApp(cred.user);
			return true;
		} catch (err) {
			console.error("Cookie session restore failed:", err);
			setGateBusy(false, "Sign In");
			return false;
		}
	}

	onAuthStateChanged(auth, (user) => {
		if (!user || blockAutoEnter) {
			if (!user && !blockAutoEnter) {
				void tryRestoreFromCookie().then((restored) => {
					if (restored) return;
					try {
						if (localStorage.getItem(WAS_AUTHED_KEY) === "1") {
							localStorage.removeItem(WAS_AUTHED_KEY);
						}
					} catch {
					}
					setGateBusy(false, "Sign In");
				});
			}
			return;
		}
		void enterApp(user);
	});

	toggleEl?.addEventListener("click", () => {
		if (!passwordEl || !toggleEl) return;
		const show = passwordEl.type === "password";
		passwordEl.type = show ? "text" : "password";
		toggleEl.setAttribute("aria-pressed", show ? "true" : "false");
		toggleEl.setAttribute("aria-label", show ? "Hide password" : "Show password");
	});

	form?.addEventListener("submit", async (event) => {
		event.preventDefault();
		showError("");
		blockAutoEnter = false;
		enterStarted = false;
		restoreTried = true;
		sessionStorage.removeItem(ENTER_ONCE_KEY);
		sessionStorage.removeItem(LEAVE_APP_KEY);
		setGateBusy(true, "Signing in…");
		try {
			const result = await signInWithEmailAndPassword(
				auth,
				emailEl?.value.trim() || "",
				passwordEl?.value || "",
			);
			await enterApp(result.user);
		} catch (err) {
			console.error("Sign in error:", err);
			showError("Invalid credentials. Please try again.");
			sessionStorage.removeItem(ENTER_ONCE_KEY);
			enterStarted = false;
			setGateBusy(false, "Sign In");
		}
	});

	emailEl?.removeAttribute("readonly");
	passwordEl?.removeAttribute("readonly");
	requestAnimationFrame(() => emailEl?.focus());
}

initLoginGate();
