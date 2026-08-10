import { initializeApp } from "firebase/app";
import {
	getAuth,
	onAuthStateChanged,
	signInWithEmailAndPassword,
	signOut,
} from "firebase/auth";
import { getFirebaseConfig } from "./firebase-config.js";
import { clearSessionToken, setSessionToken } from "./session.js";

/**
 * Public login only — no user directory / emails in this bundle.
 * Authorization profiles load from Firebase after login (protected app).
 */

function showError(message) {
	const errorEl = document.getElementById("loginError");
	if (!errorEl) return;
	errorEl.hidden = !message;
	errorEl.textContent = message || "";
}

async function enterApp(user) {
	const token = await user.getIdToken(true);
	setSessionToken(token);
	// App + login share /; cookie set → hard reload so edge serves app shell (URL stays clean).
	window.location.reload();
}

function initLoginGate() {
	const form = document.getElementById("loginForm");
	const emailEl = document.getElementById("loginEmail");
	const passwordEl = document.getElementById("loginPassword");
	const submitEl = document.getElementById("loginSubmit");
	const toggleEl = document.getElementById("loginPasswordToggle");

	const params = new URLSearchParams(window.location.search);
	const wasDenied = params.get("error") === "unauthorized";
	if (wasDenied) {
		clearSessionToken();
		showError("This account is not authorized. Contact Vlad for access.");
		window.history.replaceState({}, "", window.location.pathname);
	}

	const app = initializeApp(getFirebaseConfig());
	const auth = getAuth(app);

	onAuthStateChanged(auth, (user) => {
		if (!user) return;
		// Avoid bounce-loop: app already rejected this account.
		if (wasDenied) {
			void signOut(auth).then(() => clearSessionToken());
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
			if (submitEl) submitEl.disabled = false;
		}
	});

	emailEl?.removeAttribute("readonly");
	passwordEl?.removeAttribute("readonly");
	requestAnimationFrame(() => emailEl?.focus());
}

initLoginGate();
