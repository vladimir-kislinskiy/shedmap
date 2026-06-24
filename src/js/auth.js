import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

/** Barr-ag team — edit access to Olds and Siksika */
export const OLDS_EDITORS = {
	"operations@barr-ag.com": "Vlad",
	"tschmitt@barr-ag.com": "Tyler",
	"rschmitt@barr-ag.com": "Ryley",
	"tbeschmitt@barr-ag.com": "Taylor",
	"nmathis@barr-ag.com": "Natalie",
};

/** Siksika-only users — view Olds, edit Siksika. Add emails here and in database.rules.json */
export const SIKSIKA_EDITORS = {
	"siksika@barr-ag.com": "Siksika",
};

export const USERS = { ...OLDS_EDITORS, ...SIKSIKA_EDITORS };

export function getPersonFromEmail(email) {
	if (!email) return null;
	return USERS[email.toLowerCase()] || null;
}

export function isAuthorizedEmail(email) {
	return !!getPersonFromEmail(email);
}

export function isOldsEditor(email) {
	return !!OLDS_EDITORS[email?.toLowerCase()];
}

export function isSiksikaEditor(email) {
	const key = email?.toLowerCase();
	return !!(OLDS_EDITORS[key] || SIKSIKA_EDITORS[key]);
}

export function canEditLocation(email, locationId) {
	if (!email) return false;
	if (locationId === "olds") return isOldsEditor(email);
	if (locationId === "siksika") return isSiksikaEditor(email);
	return false;
}

export function isAdminUser(email) {
	return email?.toLowerCase() === "operations@barr-ag.com";
}

export function initAuth(app, onAuthChange) {
	const auth = getAuth(app);

	onAuthStateChanged(auth, (user) => {
		if (user) {
			const person = getPersonFromEmail(user.email);
			if (person) {
				onAuthChange(true, person, user.email);
			} else {
				signOut(auth);
				onAuthChange(false, null, null);
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
