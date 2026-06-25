import { getLocationConfig, LOCATION_IDS } from "./locations.js";

const IDB_NAME = "hay-shed-map";
const IDB_VERSION = 2;
const IDB_STORE = "cache";

function openCacheDb() {
	return new Promise((resolve, reject) => {
		if (!globalThis.indexedDB) {
			reject(new Error("IndexedDB unavailable"));
			return;
		}

		const request = indexedDB.open(IDB_NAME, IDB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(IDB_STORE)) {
				db.createObjectStore(IDB_STORE);
			}
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

function getCacheKey(locationId) {
	return `hayShedState:${locationId}`;
}

export async function cacheHayShedState(locationId, state) {
	if (!state || !locationId) return;

	try {
		const db = await openCacheDb();
		const tx = db.transaction(IDB_STORE, "readwrite");
		const payload = {
			savedAt: Date.now(),
			state: normalizeHayShedState(state, locationId),
		};
		tx.objectStore(IDB_STORE).put(payload, getCacheKey(locationId));

		await new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});

		db.close();
	} catch (err) {
		console.warn(`Could not cache state for ${locationId}:`, err);
	}
}

export async function loadCachedHayShedState(locationId) {
	try {
		const db = await openCacheDb();
		const tx = db.transaction(IDB_STORE, "readonly");
		const payload = await idbRequestToPromise(tx.objectStore(IDB_STORE).get(getCacheKey(locationId)));

		db.close();

		if (!payload?.state) return null;
		return payload;
	} catch (err) {
		console.warn(`Could not read cached state for ${locationId}:`, err);
		return null;
	}
}

export async function loadAllCachedHayShedStates() {
	const results = {};
	for (const locationId of LOCATION_IDS) {
		results[locationId] = await loadCachedHayShedState(locationId);
	}
	return results;
}

export function normalizeHayShedState(state, locationId = "olds") {
	const config = getLocationConfig(locationId);
	const sheds = { ...(state?.sheds && typeof state.sheds === "object" ? state.sheds : {}) };

	config.sheds.forEach((shedId) => {
		if (!sheds[shedId] || typeof sheds[shedId] !== "object") {
			sheds[shedId] = {};
		}

		for (let i = 0; i < config.bayCount; i++) {
			const colId = `${shedId}-col-${i}`;
			if (!Array.isArray(sheds[shedId][colId])) {
				sheds[shedId][colId] = [];
			}
		}
	});

	return {
		changeLog: Array.isArray(state?.changeLog) ? state.changeLog : [],
		sheds,
		locationId,
	};
}

export function validateHayShedState(state, locationId = "olds") {
	const normalized = normalizeHayShedState(state, locationId);
	const config = getLocationConfig(locationId);

	if (!Array.isArray(normalized.changeLog)) return false;
	if (!normalized.sheds || typeof normalized.sheds !== "object") return false;

	for (const shedId of config.sheds) {
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

export function isLegacyHayShedRoot(state) {
	return !!(state?.sheds && Array.isArray(state?.changeLog) && !state?.olds && !state?.siksika);
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
