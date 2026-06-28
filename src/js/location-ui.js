import { getLocationConfig, OLDS_LOCATION_ID } from "./locations.js";

let currentLocationId = OLDS_LOCATION_ID;

export function getCurrentLocationId() {
	return currentLocationId;
}

export function setCurrentLocationId(locationId) {
	currentLocationId = locationId;
}

export function getLocationPrefix(locationId = currentLocationId) {
	return locationId === OLDS_LOCATION_ID ? "" : `${locationId}-`;
}

export function scopedId(id, locationId = currentLocationId) {
	return `${getLocationPrefix(locationId)}${id}`;
}

export function getLocationPanel(locationId = currentLocationId) {
	return document.getElementById(`location-${locationId}`);
}

export function loc(id, locationId = currentLocationId) {
	return document.getElementById(scopedId(id, locationId));
}

export function locQuery(selector, locationId = currentLocationId) {
	return getLocationPanel(locationId)?.querySelector(selector) ?? null;
}

export function locQueryAll(selector, locationId = currentLocationId) {
	return getLocationPanel(locationId)
		? [...getLocationPanel(locationId).querySelectorAll(selector)]
		: [];
}

export function getColDomId(shed, bayIndex, locationId = currentLocationId) {
	return `${getLocationPrefix(locationId)}${shed}-col-${bayIndex}`;
}

export function getBayColumnEl(shed, bayIndex, locationId = currentLocationId) {
	return document.getElementById(getColDomId(shed, bayIndex, locationId));
}

export function getBayDisplayNumberForLocation(shed, bayIndex, locationId = currentLocationId) {
	const config = getLocationConfig(locationId);
	const colIndex = parseInt(bayIndex, 10);
	const span = config.bayLabelSpan ?? 2;
	const reversed = !!config.reverseSheds?.includes(shed);
	const effectiveIndex = reversed ? config.bayCount - 1 - colIndex : colIndex;
	const start = (config.shedBayStart[shed] ?? 1) + effectiveIndex * span;

	if (span === 1) {
		return String(start);
	}

	return `${start}-${start + 1}`;
}

export function getShedLabel(shedId, locationId = currentLocationId) {
	return getLocationConfig(locationId).shedLabels[shedId] ?? shedId;
}
