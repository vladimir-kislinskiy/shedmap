const IDB_NAME = "hay-shed-map";
const IDB_VERSION = 1;
const IDB_STORE = "cache";
const CACHE_KEY = "hayShedState";
const SHED_IDS = ["west", "north", "east"];

function openCacheDb() {
	return new Promise((resolve, reject) => {
		if (!globalThis.indexedDB) {
			reject(new Error("IndexedDB unavailable"));
			return;
		}

		const request = indexedDB.open(IDB_NAME, IDB_VERSION);

		request.onupgradeneeded = () => {
			request.result.createObjectStore(IDB_STORE);
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function idbRequestToPromise(request) {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function cacheHayShedState(state) {
	if (!state) return;

	try {
		const db = await openCacheDb();
		const tx = db.transaction(IDB_STORE, "readwrite");
		const payload = {
			savedAt: Date.now(),
			state: normalizeHayShedState(state),
		};
		tx.objectStore(IDB_STORE).put(payload, CACHE_KEY);

		await new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});

		db.close();
	} catch (err) {
		console.warn("Could not cache state locally:", err);
	}
}

export async function loadCachedHayShedState() {
	try {
		const db = await openCacheDb();
		const tx = db.transaction(IDB_STORE, "readonly");
		const payload = await idbRequestToPromise(tx.objectStore(IDB_STORE).get(CACHE_KEY));

		db.close();

		if (!payload?.state) return null;
		return payload;
	} catch (err) {
		console.warn("Could not read cached state:", err);
		return null;
	}
}

export function normalizeHayShedState(state) {
	return {
		changeLog: Array.isArray(state?.changeLog) ? state.changeLog : [],
		sheds: state?.sheds && typeof state.sheds === "object" ? state.sheds : {},
	};
}

export function validateHayShedState(state) {
	const normalized = normalizeHayShedState(state);

	if (!Array.isArray(normalized.changeLog)) return false;
	if (!normalized.sheds || typeof normalized.sheds !== "object") return false;

	for (const shedId of SHED_IDS) {
		const shed = normalized.sheds[shedId];
		if (!shed || typeof shed !== "object") return false;

		for (const stacks of Object.values(shed)) {
			if (!Array.isArray(stacks)) return false;

			for (const stack of stacks) {
				if (!stack || typeof stack !== "object") return false;
				if (typeof stack.type !== "string" || !stack.type) return false;
				if (stack.bales === undefined || stack.bales === null) return false;
			}
		}
	}

	return true;
}

export function formatCacheTimestamp(savedAt) {
	if (!savedAt) return "unknown time";

	try {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(savedAt));
	} catch {
		return new Date(savedAt).toLocaleString();
	}
}
