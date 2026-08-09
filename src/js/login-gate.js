import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirebaseConfig } from "./firebase-config.js";
import { getPersonFromEmail, APP_PATH } from "./auth.js";
import { clearSessionToken, setSessionToken } from "./session.js";

function showError(message) {
	const errorEl = document.getElementById("loginError");
	if (!errorEl) return;
	errorEl.hidden = !message;
	errorEl.textContent = message || "";
}

async function enterApp(user) {
	const person = getPersonFromEmail(user.email);
	if (!person) {
		await signOut(getAuth());
		clearSessionToken();
		showError("This account is not authorized. Contact Vlad for access.");
		return;
	}

	const token = await user.getIdToken(true);
	setSessionToken(token);
	window.location.replace(APP_PATH);
}

function initLoginGate() {
	const form = document.getElementById("loginForm");
	const emailEl = document.getElementById("loginEmail");
	const passwordEl = document.getElementById("loginPassword");
	const submitEl = document.getElementById("loginSubmit");
	const toggleEl = document.getElementById("loginPasswordToggle");

	const app = initializeApp(getFirebaseConfig());
	const auth = getAuth(app);

	onAuthStateChanged(auth, (user) => {
		if (user && getPersonFromEmail(user.email)) {
			void enterApp(user);
		}
	});

	function syncPasswordToggle() {
		if (!passwordEl || !toggleEl) return;
		const hasValue = passwordEl.value.length > 0;
		toggleEl.hidden = !hasValue;
		if (!hasValue) {
			passwordEl.type = "password";
			toggleEl.setAttribute("aria-pressed", "false");
			toggleEl.setAttribute("aria-label", "Show password");
		}
	}

	toggleEl?.addEventListener("click", () => {
		if (!passwordEl || !toggleEl || toggleEl.hidden) return;
		const show = passwordEl.type === "password";
		passwordEl.type = show ? "text" : "password";
		toggleEl.setAttribute("aria-pressed", show ? "true" : "false");
		toggleEl.setAttribute("aria-label", show ? "Hide password" : "Show password");
	});

	passwordEl?.addEventListener("input", syncPasswordToggle);
	passwordEl?.addEventListener("change", syncPasswordToggle);
	syncPasswordToggle();

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
