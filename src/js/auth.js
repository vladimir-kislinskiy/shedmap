import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

/**
 * Hard gate: unauthenticated users only see the public login page.
 * Pair with locked database rules + Netlify edge session cookie.
 *
 * Allowlist lives in the protected app bundle only — NOT in public login-gate.js.
 * Guests without a session never receive this file.
 */
export const REQUIRE_AUTH = true;

export const ROLE_ADMIN = "admin";
export const ROLE_USER = "user";
/** Backup + color-blind toggle. */
export const ROLE_SUPER = "super";

/** Authorized accounts (no passwords — create in Firebase Auth Console). */
export const AUTH_USERS = {
	"admin@barr-ag.com": { name: "Serhii", role: ROLE_USER },
	"bdyson@barr-ag.com": { name: "Brad", role: ROLE_USER },
	"bschmitt@barr-ag.com": { name: "Barry", role: ROLE_USER },
	"cbrocklebank@barr-ag.com": { name: "Chris", role: ROLE_USER },
	"clee@barr-ag.com": { name: "Jack", role: ROLE_USER },
	"dehy@barr-ag.com": { name: "Dehy", role: ROLE_USER },
	"jbergeson@barr-ag.com": { name: "Jay", role: ROLE_USER },
	"nmathis@barr-ag.com": { name: "Natalie", role: ROLE_ADMIN },
	"operations@barr-ag.com": { name: "Vlad", role: ROLE_SUPER },
	"rschmitt@barr-ag.com": { name: "Ryley", role: ROLE_ADMIN },
	"scale@barr-ag.com": { name: "Maria", role: ROLE_USER },
	"shisadomi@barr-ag.com": { name: "Satoko", role: ROLE_USER },
	"siksika@barr-ag.com": { name: "Peter", role: ROLE_USER },
	"ssakamoto@barr-ag.com": { name: "Shu", role: ROLE_USER },
	"tbeschmitt@barr-ag.com": { name: "Taylor", role: ROLE_ADMIN },
	"tschmitt@barr-ag.com": { name: "Tyler", role: ROLE_ADMIN },
	"loader@barr-ag.com": { name: "Loaders", role: ROLE_USER },
	"logistic@barr-ag.com": { name: "Temporary", role: ROLE_USER },
};

let currentSession = null;

export function getCurrentSession() {
	return currentSession;
}

export function getUserRecord(email) {
	if (!email) return null;
	return AUTH_USERS[email.toLowerCase()] || null;
}

export function getPersonFromEmail(email) {
	return getUserRecord(email)?.name || null;
}

export function getUserRole(email) {
	return getUserRecord(email)?.role || null;
}

export function isEditor(email) {
	const role = currentSession?.role || getUserRole(email);
	return role === ROLE_ADMIN || role === ROLE_SUPER;
}

/** All locations: admin/super can edit, user is view-only. */
export function canEditLocation(email, _locationId) {
	return isEditor(email);
}

/** Super only (backup / CB map toggle). */
export function isAdminUser(email) {
	const role = currentSession?.role || getUserRole(email);
	return role === ROLE_SUPER;
}

export function initAuth(app, onAuthChange) {
	const auth = getAuth(app);

	onAuthStateChanged(auth, (user) => {
		if (user) {
			const record = getUserRecord(user.email);
			if (record) {
				currentSession = {
					email: user.email.toLowerCase(),
					name: record.name,
					role: record.role,
				};
				onAuthChange(true, record.name, user.email);
			} else {
				currentSession = null;
				signOut(auth).finally(() => {
					onAuthChange(false, null, null, { denied: true });
				});
			}
		} else {
			currentSession = null;
			onAuthChange(false, null, null);
		}
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
