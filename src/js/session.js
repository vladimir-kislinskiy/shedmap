export const SESSION_COOKIE = "hayshed_id";
export const LOGIN_PATH = "/";
export const APP_PATH = "/";
export const SESSION_API_PATH = "/api/session";

const CLIENT_MAX_AGE_SEC = 60 * 60 * 24 * 30;

function cookieSecureFlag() {
	return typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
}

function clearClientReadableCookie() {
	if (typeof document === "undefined") return;
	document.cookie =
		`${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${cookieSecureFlag()}`;
}

function setClientReadableCookie(token) {
	if (!token || typeof document === "undefined") return;
	document.cookie =
		`${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${CLIENT_MAX_AGE_SEC}; SameSite=Lax${cookieSecureFlag()}`;
}

export function getSessionToken() {
	if (typeof document === "undefined") return "";
	const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : "";
}

export async function setSessionToken(idToken) {
	if (!idToken) return false;

	try {
		const res = await fetch(SESSION_API_PATH, {
			method: "POST",
			credentials: "same-origin",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({ idToken }),
		});
		if (res.ok) {
			clearClientReadableCookie();
			return true;
		}
	} catch {
	}

	setClientReadableCookie(idToken);
	return true;
}

export async function clearSessionToken() {
	try {
		await fetch(SESSION_API_PATH, {
			method: "DELETE",
			credentials: "same-origin",
			headers: { Accept: "application/json" },
		});
	} catch {
	}
	clearClientReadableCookie();
}

export async function fetchFirebaseCustomToken() {
	try {
		const res = await fetch(SESSION_API_PATH, {
			method: "POST",
			credentials: "same-origin",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({ restore: true }),
		});
		if (!res.ok) return null;
		const data = await res.json();
		return typeof data?.customToken === "string" ? data.customToken : null;
	} catch {
		return null;
	}
}

export async function requestPersistentStorage() {
	try {
		if (navigator.storage?.persist) {
			await navigator.storage.persist();
		}
	} catch {
	}
}
