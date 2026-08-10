import {
	getAuth,
	signInWithEmailAndPassword,
	signOut,
	onAuthStateChanged,
} from "firebase/auth";
import { getDatabase, ref, get } from "firebase/database";

/**
 * Hard gate: unauthenticated users only see the public login page.
 * Pair with locked database rules + Netlify edge session cookie.
 *
 * User allowlist (emails/names/roles) is NOT in client JS.
 * Each signed-in account may only read its own /userProfiles/{key} row.
 */
export const REQUIRE_AUTH = true;

export const ROLE_ADMIN = "admin";
export const ROLE_USER = "user";
/** Backup + color-blind toggle (operations only in RTDB seed). */
export const ROLE_SUPER = "super";

/** Resolved after Firebase Auth + profile fetch. Not a static directory. */
let currentSession = null;

export function getCurrentSession() {
	return currentSession;
}

/** RTDB-safe key from email (does not embed other accounts). */
export function emailToProfileKey(email) {
	return String(email || "")
		.trim()
		.toLowerCase()
		.replace(/[.#$\[\]/@]/g, "_");
}

/**
 * Load only this user's profile (rules block listing others).
 * @returns {Promise<{ email: string, name: string, role: string } | null>}
 */
export async function loadUserProfile(app, email) {
	if (!email) return null;
	const key = emailToProfileKey(email);
	const snap = await get(ref(getDatabase(app), `userProfiles/${key}`));
	if (!snap.exists()) return null;

	const data = snap.val();
	if (!data || typeof data !== "object") return null;

	const profileEmail = String(data.email || "").toLowerCase();
	if (profileEmail !== email.toLowerCase()) return null;

	const name = String(data.name || "").trim();
	const role = String(data.role || "").trim();
	if (!name || !role) return null;
	if (![ROLE_USER, ROLE_ADMIN, ROLE_SUPER].includes(role)) return null;

	return { email: profileEmail, name, role };
}

export function isEditor(_email) {
	const role = currentSession?.role;
	return role === ROLE_ADMIN || role === ROLE_SUPER;
}

/** All locations: admin/super can edit, user is view-only. */
export function canEditLocation(email, _locationId) {
	return isEditor(email);
}

/** Super only (backup / CB map toggle). */
export function isAdminUser(_email) {
	return currentSession?.role === ROLE_SUPER;
}

export function initAuth(app, onAuthChange) {
	const auth = getAuth(app);

	onAuthStateChanged(auth, (user) => {
		void (async () => {
			if (!user?.email) {
				currentSession = null;
				onAuthChange(false, null, null);
				return;
			}

			try {
				const profile = await loadUserProfile(app, user.email);
				if (!profile) {
					currentSession = null;
					await signOut(auth);
					onAuthChange(false, null, null, { denied: true });
					return;
				}
				currentSession = profile;
				onAuthChange(true, profile.name, user.email);
			} catch (err) {
				console.error("Profile load failed:", err);
				currentSession = null;
				try {
					await signOut(auth);
				} catch {
					/* ignore */
				}
				onAuthChange(false, null, null, { denied: true });
			}
		})();
	});

	return auth;
}

export function login(auth, email, password) {
	return signInWithEmailAndPassword(auth, email.trim(), password);
}

export function logout(auth) {
	currentSession = null;
	return signOut(auth);
}
