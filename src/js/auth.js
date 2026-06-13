import {
	getAuth,
	signInWithEmailAndPassword,
	signOut,
	onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

/** Emails allowed to edit inventory. Must exist in Firebase Authentication. */
export const AUTHORIZED_EMAILS = [
	"operations@barr-ag.com",
];

export function isAuthorizedEmail(email) {
	if (!email) return false;
	return AUTHORIZED_EMAILS.includes(email.toLowerCase());
}

export function getDisplayName(user) {
	if (!user) return null;
	if (user.displayName) return user.displayName;
	const localPart = user.email.split("@")[0];
	return localPart.charAt(0).toUpperCase() + localPart.slice(1);
}

export function initAuth(app, onAuthChange) {
	const auth = getAuth(app);

	onAuthStateChanged(auth, (user) => {
		if (user && isAuthorizedEmail(user.email)) {
			onAuthChange(true, getDisplayName(user));
		} else {
			if (user) signOut(auth);
			onAuthChange(false, null);
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
