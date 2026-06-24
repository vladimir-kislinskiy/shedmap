import { LOCATION_IDS } from "./locations.js";
import {
	normalizeHayShedState,
	validateHayShedState,
	isLegacyHayShedRoot,
} from "./state-cache.js";

const BACKUP_VERSION = 2;

function isMultiLocationBackup(state) {
	return LOCATION_IDS.some((locationId) => state?.[locationId] && typeof state[locationId] === "object");
}

function normalizeBackupState(state) {
	if (isLegacyHayShedRoot(state)) {
		return { olds: normalizeHayShedState(state, "olds") };
	}

	if (isMultiLocationBackup(state)) {
		const normalized = {};
		for (const locationId of LOCATION_IDS) {
			if (!state?.[locationId]) continue;
			normalized[locationId] = normalizeHayShedState(state[locationId], locationId);
		}
		return normalized;
	}

	return { olds: normalizeHayShedState(state, "olds") };
}

export function validateBackupState(state) {
	const normalized = normalizeBackupState(state);
	const targets = Object.keys(normalized);

	if (!targets.length) return false;

	return targets.every((locationId) => validateHayShedState(normalized[locationId], locationId));
}

export function parseHayShedStateFromJson(text) {
	const parsed = JSON.parse(text);
	const state = parsed?.state && typeof parsed.state === "object" ? parsed.state : parsed;

	if (!validateBackupState(state)) {
		throw new Error("Invalid backup file format.");
	}

	return normalizeBackupState(state);
}

export function readHayShedStateFile(file) {
	return new Promise((resolve, reject) => {
		if (!file) {
			reject(new Error("No file selected."));
			return;
		}

		const reader = new FileReader();

		reader.onload = () => {
			try {
				resolve(parseHayShedStateFromJson(String(reader.result || "")));
			} catch (err) {
				reject(err);
			}
		};

		reader.onerror = () => reject(reader.error || new Error("Could not read file."));
		reader.readAsText(file);
	});
}

export function buildBackupPayload(state, { exportedBy = null } = {}) {
	return {
		version: BACKUP_VERSION,
		exportedAt: new Date().toISOString(),
		exportedBy,
		state: normalizeBackupState(state),
	};
}

export function getBackupFilename(date = new Date()) {
	const stamp = date.toISOString().slice(0, 10);
	return `hay-shed-backup-${stamp}.json`;
}

export function downloadHayShedStateBackup(state, { exportedBy = null } = {}) {
	const payload = buildBackupPayload(state, { exportedBy });
	const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = getBackupFilename();
	link.click();
	URL.revokeObjectURL(url);
}
