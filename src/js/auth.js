import {
	getAuth,
	signInWithEmailAndPassword,
	signOut,
	onAuthStateChanged,
} from "firebase/auth";

/** Firebase Auth email → person name for change log. Keep in sync with database.rules.json */
export const USERS = {
	"operations@barr-ag.com": "Vlad",
	"tschmitt@barr-ag.com": "Tyler",
	"rschmitt@barr-ag.com": "Ryley",
	"tbeschmitt@barr-ag.com": "Taylor",
	"nmathis@barr-ag.com": "Natalie",
};

export function getPersonFromEmail(email) {
	if (!email) return null;
	return USERS[email.toLowerCase()] || null;
}

export function isAuthorizedEmail(email) {
	return !!getPersonFromEmail(email);
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
