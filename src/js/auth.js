import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

/**
 * Hard gate: unauthenticated users only see the public login page.
 * Pair with locked database rules + Netlify edge session cookie.
 */
export const REQUIRE_AUTH = true;

export const ROLE_ADMIN = "admin";
export const ROLE_USER = "user";

/** Authorized accounts (no passwords here — create them in Firebase Auth Console). */
export const AUTH_USERS = {
	"admin@barr-ag.com": { name: "Serhii", role: ROLE_USER },
	"bdyson@barr-ag.com": { name: "Brad", role: ROLE_USER },
	"bschmitt@barr-ag.com": { name: "Barry", role: ROLE_USER },
	"cbrocklebank@barr-ag.com": { name: "Chris", role: ROLE_USER },
	"clee@barr-ag.com": { name: "Jack", role: ROLE_USER },
	"dehy@barr-ag.com": { name: "Dehy", role: ROLE_USER },
	"jbergeson@barr-ag.com": { name: "Jay", role: ROLE_USER },
	"nmathis@barr-ag.com": { name: "Natalie", role: ROLE_ADMIN },
	"operations@barr-ag.com": { name: "Vlad", role: ROLE_ADMIN },
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

const SUPER_ADMIN_EMAIL = "operations@barr-ag.com";

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

export function isAuthorizedEmail(email) {
	return !!getUserRecord(email);
}

export function isEditor(email) {
	return getUserRole(email) === ROLE_ADMIN;
}

/** All locations: admin can edit, user is view-only. */
export function canEditLocation(email, _locationId) {
	return isEditor(email);
}

/** Super admin only (backup / CB map toggle). */
export function isAdminUser(email) {
	return email?.toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function getAuthorizedEmails() {
	return Object.keys(AUTH_USERS);
}

export function getEditorEmails() {
	return Object.entries(AUTH_USERS)
		.filter(([, record]) => record.role === ROLE_ADMIN)
		.map(([email]) => email);
}

export function initAuth(app, onAuthChange) {
	const auth = getAuth(app);

	onAuthStateChanged(auth, (user) => {
		if (user) {
			const person = getPersonFromEmail(user.email);
			if (person) {
				onAuthChange(true, person, user.email);
			} else {
				// Valid Firebase account but not in allowlist — strip session and kick to login.
				signOut(auth).finally(() => {
					onAuthChange(false, null, null, { denied: true });
				});
			}
		} else {
			onAuthChange(false, null, null);
		}
	});

	return auth;
}

export function login(auth, email, password) {
	return signInWithEmailAndPassword(auth, email.trim(), password);
}

export function logout(auth) {
	return signOut(auth);
}
