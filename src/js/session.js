export const SESSION_COOKIE = "hayshed_id";
export const LOGIN_PATH = "/";
export const APP_PATH = "/";
const MAX_AGE_SEC = 60 * 60 * 24 * 400;

function cookieSecureFlag() {
	return typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
}

export function getSessionToken() {
	if (typeof document === "undefined") return "";
	const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`));
	return match ? decodeURIComponent(match[1]) : "";
}

export function setSessionToken(token) {
	if (!token || typeof document === "undefined") return;
	document.cookie =
		`${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${MAX_AGE_SEC}; SameSite=Lax${cookieSecureFlag()}`;
}

export function clearSessionToken() {
	if (typeof document === "undefined") return;
	document.cookie =
		`${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${cookieSecureFlag()}`;
}
