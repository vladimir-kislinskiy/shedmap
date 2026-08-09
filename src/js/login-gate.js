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

	function passwordHasValue() {
		return Boolean(passwordEl?.value?.length);
	}

	function syncPasswordToggle() {
		if (!passwordEl || !toggleEl) return;

		const hasValue = passwordHasValue();
		toggleEl.hidden = !hasValue;

		if (!hasValue) {
			if (passwordEl.type !== "password") passwordEl.type = "password";
			toggleEl.setAttribute("aria-pressed", "false");
			toggleEl.setAttribute("aria-label", "Show password");
		}
	}

	/** Schedule several value checks (autofill often writes after the event). */
	function schedulePasswordSync() {
		syncPasswordToggle();
		requestAnimationFrame(syncPasswordToggle);
		[0, 16, 50, 100, 250, 500, 1000].forEach((ms) => {
			window.setTimeout(syncPasswordToggle, ms);
		});
	}

	toggleEl?.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (!passwordEl || !toggleEl) return;
		syncPasswordToggle();
		if (toggleEl.hidden || !passwordHasValue()) return;

		const show = passwordEl.type === "password";
		passwordEl.type = show ? "text" : "password";
		toggleEl.setAttribute("aria-pressed", show ? "true" : "false");
		toggleEl.setAttribute("aria-label", show ? "Hide password" : "Show password");
		// Keep focus and caret in the field after type switch
		passwordEl.focus({ preventScroll: true });
	});

	const passwordEvents = [
		"input",
		"change",
		"keyup",
		"keydown",
		"paste",
		"cut",
		"focus",
		"blur",
		"mouseup",
		"touchend",
	];
	passwordEvents.forEach((type) => {
		passwordEl?.addEventListener(type, schedulePasswordSync);
	});

	// Email autofill often fills password in the same batch without firing password input
	["input", "change", "focus", "blur", "keyup"].forEach((type) => {
		emailEl?.addEventListener(type, schedulePasswordSync);
	});

	// WebKit / Chromium autofill signal
	passwordEl?.addEventListener("animationstart", (event) => {
		if (event.animationName === "gateAutofill") schedulePasswordSync();
	});
	emailEl?.addEventListener("animationstart", (event) => {
		if (event.animationName === "gateAutofill") schedulePasswordSync();
	});

	// Capture-phase on form for password managers that only dispatch bubbled events oddly
	form?.addEventListener("input", schedulePasswordSync, true);
	form?.addEventListener("change", schedulePasswordSync, true);

	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") schedulePasswordSync();
	});
	window.addEventListener("pageshow", schedulePasswordSync);
	window.addEventListener("focus", schedulePasswordSync);

	// Poll briefly after open — Safari/iOS and some password managers never fire input on autofill
	const pollStarted = Date.now();
	const pollMs = 12000;
	const pollId = window.setInterval(() => {
		syncPasswordToggle();
		if (Date.now() - pollStarted > pollMs) window.clearInterval(pollId);
	}, 200);

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
			schedulePasswordSync();
		}
	});

	emailEl?.removeAttribute("readonly");
	passwordEl?.removeAttribute("readonly");
	schedulePasswordSync();
	requestAnimationFrame(() => {
		emailEl?.focus();
		schedulePasswordSync();
	});
}

initLoginGate();
