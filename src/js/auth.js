import {
	browserLocalPersistence,
	getAuth,
	indexedDBLocalPersistence,
	initializeAuth,
	onAuthStateChanged,
	setPersistence,
	signInWithCustomToken,
	signInWithEmailAndPassword,
	signOut,
} from "firebase/auth";
import { clearSessionToken, fetchFirebaseCustomToken, requestPersistentStorage } from "./session.js";

export const REQUIRE_AUTH = true;

export const ROLE_ADMIN = "admin";
export const ROLE_USER = "user";
export const ROLE_SUPER = "super";

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
let restoreInFlight = null;
let suppressRestore = false;

function createAuth(app) {
	try {
		return initializeAuth(app, {
			persistence: [indexedDBLocalPersistence, browserLocalPersistence],
		});
	} catch {
		return getAuth(app);
	}
}

async function tryRestoreFirebaseUser(auth) {
	if (suppressRestore || auth.currentUser) return false;
	if (!restoreInFlight) {
		restoreInFlight = (async () => {
			const customToken = await fetchFirebaseCustomToken();
			if (!customToken || suppressRestore) return false;
			await signInWithCustomToken(auth, customToken);
			await requestPersistentStorage();
			return true;
		})().finally(() => {
			restoreInFlight = null;
		});
	}
	try {
		return await restoreInFlight;
	} catch (err) {
		console.error("Session restore failed:", err);
		return false;
	}
}

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

export function canEditLocation(email, _locationId) {
	return isEditor(email);
}

export function isAdminUser(email) {
	const role = currentSession?.role || getUserRole(email);
	return role === ROLE_SUPER;
}

export function initAuth(app, onAuthChange) {
	const auth = createAuth(app);
	void setPersistence(auth, indexedDBLocalPersistence).catch(() =>
		setPersistence(auth, browserLocalPersistence).catch(() => {}),
	);

	onAuthStateChanged(auth, (user) => {
		void (async () => {
			if (!user) {
				const restored = await tryRestoreFirebaseUser(auth);
				if (restored || auth.currentUser) return;

				currentSession = null;
				onAuthChange(false, null, null);
				return;
			}

			const record = getUserRecord(user.email);
			if (record) {
				currentSession = {
					email: user.email.toLowerCase(),
					name: record.name,
					role: record.role,
				};
				void requestPersistentStorage();
				onAuthChange(true, record.name, user.email);
			} else {
				currentSession = null;
				suppressRestore = true;
				void clearSessionToken()
					.catch(() => {})
					.finally(() => {
						signOut(auth).finally(() => {
							onAuthChange(false, null, null, { denied: true });
						});
					});
			}
		})();
	});

	return auth;
}

export function login(auth, email, password) {
	suppressRestore = false;
	return signInWithEmailAndPassword(auth, email.trim(), password);
}

export function logout(auth) {
	currentSession = null;
	suppressRestore = true;
	return signOut(auth);
}
