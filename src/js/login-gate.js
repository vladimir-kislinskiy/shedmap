import { initializeApp } from "firebase/app";
import {
	getAuth,
	onAuthStateChanged,
	signInWithEmailAndPassword,
	signOut,
} from "firebase/auth";
import { getFirebaseConfig } from "./firebase-config.js";
import {
	clearSessionToken,
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

	if (wasDenied) {
		clearSessionToken();
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
	const auth = getAuth(app);

	if (wasDenied || wasSignedOut) {
		void signOut(auth)
			.catch(() => {})
			.finally(() => {
				clearSessionToken();
			});
	}

	async function enterApp(user) {
		if (enterStarted) return;

		const attempts = readEnterAttempts();
		if (attempts >= MAX_ENTER_ATTEMPTS) {
			sessionStorage.removeItem(ENTER_ONCE_KEY);
			clearSessionToken();
			setGateBusy(false, "Sign In");
			showError("Sign-in could not open the app. Please try again.");
			return;
		}

		enterStarted = true;
		setGateBusy(true, "Opening…");
		try {
			const token = await user.getIdToken(true);
			setSessionToken(token);
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
			clearSessionToken();
			setGateBusy(false, "Sign In");
			showError("Could not restore session. Please sign in.");
		}
	}

	onAuthStateChanged(auth, (user) => {
		if (!user || blockAutoEnter) {
			if (!user && !blockAutoEnter) {
				try {
					if (localStorage.getItem(WAS_AUTHED_KEY) === "1") {
						localStorage.removeItem(WAS_AUTHED_KEY);
					}
				} catch {
				}
				setGateBusy(false, "Sign In");
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
