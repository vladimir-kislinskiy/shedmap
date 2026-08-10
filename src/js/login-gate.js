import { initializeApp } from "firebase/app";
import {
	getAuth,
	onAuthStateChanged,
	signInWithEmailAndPassword,
	signOut,
} from "firebase/auth";
import { getFirebaseConfig } from "./firebase-config.js";
import {
	SESSION_COOKIE,
	clearSessionToken,
	getSessionToken,
	setSessionToken,
} from "./session.js";

const ENTER_ONCE_KEY = "hayshed.enterOnce";
const LEAVE_APP_KEY = "hayshed.leaveApp";

function showError(message) {
	const errorEl = document.getElementById("loginError");
	if (!errorEl) return;
	errorEl.hidden = !message;
	errorEl.textContent = message || "";
}

async function enterApp(user) {
	if (sessionStorage.getItem(ENTER_ONCE_KEY) === "1") {
		sessionStorage.removeItem(ENTER_ONCE_KEY);
		clearSessionToken();
		showError("Sign-in could not open the app. Please try again.");
		return;
	}

	const token = await user.getIdToken(true);
	setSessionToken(token);
	sessionStorage.setItem(ENTER_ONCE_KEY, "1");
	sessionStorage.removeItem(LEAVE_APP_KEY);
	window.location.assign("/");
}

function initLoginGate() {
	const form = document.getElementById("loginForm");
	const emailEl = document.getElementById("loginEmail");
	const passwordEl = document.getElementById("loginPassword");
	const submitEl = document.getElementById("loginSubmit");
	const toggleEl = document.getElementById("loginPasswordToggle");

	sessionStorage.removeItem(LEAVE_APP_KEY);

	const params = new URLSearchParams(window.location.search);
	const wasDenied = params.get("error") === "unauthorized";
	let blockAutoEnter = wasDenied;

	if (wasDenied) {
		clearSessionToken();
		sessionStorage.removeItem(ENTER_ONCE_KEY);
		showError("This account is not authorized. Contact Vlad for access.");
		window.history.replaceState({}, "", window.location.pathname || "/");
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

	if (wasDenied) {
		void signOut(auth)
			.catch(() => {})
			.finally(() => {
				clearSessionToken();
			});
	}

	onAuthStateChanged(auth, (user) => {
		if (!user || blockAutoEnter) return;
		if (!getSessionToken() && !document.cookie.includes(`${SESSION_COOKIE}=`)) return;
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
		sessionStorage.removeItem(ENTER_ONCE_KEY);
		if (submitEl) submitEl.disabled = true;
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
			if (submitEl) submitEl.disabled = false;
		}
	});

	emailEl?.removeAttribute("readonly");
	passwordEl?.removeAttribute("readonly");
	requestAnimationFrame(() => emailEl?.focus());
}

initLoginGate();
