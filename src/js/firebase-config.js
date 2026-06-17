const firebaseConfig = {
	apiKey: __FIREBASE_API_KEY__,
	authDomain: __FIREBASE_AUTH_DOMAIN__,
	databaseURL: __FIREBASE_DATABASE_URL__,
	projectId: __FIREBASE_PROJECT_ID__,
	storageBucket: __FIREBASE_STORAGE_BUCKET__,
	messagingSenderId: __FIREBASE_MESSAGING_SENDER_ID__,
	appId: __FIREBASE_APP_ID__,
};

function getMissingFirebaseKeys() {
	return Object.entries(firebaseConfig)
		.filter(([, value]) => !value)
		.map(([key]) => key);
}

export function getFirebaseConfig() {
	const missing = getMissingFirebaseKeys();
	if (missing.length) {
		throw new Error(
			`Missing Firebase config: ${missing.join(", ")}. Copy .env.example to .env and set FIREBASE_* variables.`,
		);
	}

	return firebaseConfig;
}
