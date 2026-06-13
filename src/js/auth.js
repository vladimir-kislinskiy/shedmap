import {
	getAuth,
	signInWithEmailAndPassword,
	signOut,
	onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

/** Map display names to Firebase Auth emails. Create matching users in Firebase Console. */
export const USERS = {
	Vlad: "vlad@hayshed.app",
	Tyler: "tyler@hayshed.app",
	Natalie: "natalie@hayshed.app",
	Taylor: "taylor@hayshed.app",
	Ryley: "ryley@hayshed.app",
};

export function getPersonFromEmail(email) {
	if (!email) return null;
	for (const [name, userEmail] of Object.entries(USERS)) {
		if (userEmail === email) return name;
	}
	return null;
}

export function initAuth(app, onAuthChange) {
	const auth = getAuth(app);

	onAuthStateChanged(auth, (user) => {
		if (user) {
			onAuthChange(true, getPersonFromEmail(user.email));
		} else {
			onAuthChange(false, null);
		}
	});

	return auth;
}

export function login(auth, person, password) {
	const email = USERS[person];
	if (!email) return Promise.reject(new Error("Unknown person"));
	return signInWithEmailAndPassword(auth, email, password);
}

export function logout(auth) {
	return signOut(auth);
}
