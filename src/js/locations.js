export const OLDS_LOCATION_ID = "olds";
export const SIKSIKA_LOCATION_ID = "siksika";
export const SIMPLY_LOCATION_ID = "simply";

export const LOCATION_IDS = [OLDS_LOCATION_ID, SIKSIKA_LOCATION_ID, SIMPLY_LOCATION_ID];

export const DEFAULT_MAX_BALES_PER_BAY = 1400;

/** @type {Record<string, import('./locations.js').LocationConfig>} */
export const LOCATIONS = {
	[OLDS_LOCATION_ID]: {
		id: OLDS_LOCATION_ID,
		label: "Olds",
		sheds: ["west", "north", "east"],
		bayCount: 12,
		maxBalesPerBay: 1600,
		shedBayStart: {
			west: 1,
			north: 25,
			east: 49,
		},
		shedLabels: {
			west: "West Shed",
			north: "North Shed",
			east: "East Shed",
		},
		defaultShed: "west",
	},
	[SIKSIKA_LOCATION_ID]: {
		id: SIKSIKA_LOCATION_ID,
		label: "Siksika",
		sheds: ["south", "north"],
		bayCount: 10,
		bayLabelSpan: 1,
		shedBayStart: {
			south: 1,
			north: 11,
		},
		shedLabels: {
			south: "South Shed",
			north: "North Shed",
		},
		defaultShed: "south",
	},
	[SIMPLY_LOCATION_ID]: {
		id: SIMPLY_LOCATION_ID,
		label: "Simply",
		sheds: ["shed1", "shed2"],
		bayCount: 13,
		maxBalesPerBay: 1200,
		bayLabelSpan: 1,
		shedBayStart: {
			shed1: 1,
			shed2: 14,
		},
		shedLabels: {
			shed1: "West",
			shed2: "East",
		},
		reverseSheds: ["shed1"],
		disabledBays: { shed2: [9, 10, 11, 12] },
		defaultShed: "shed1",
	},
};

export function getLocationConfig(locationId) {
	return LOCATIONS[locationId] ?? LOCATIONS[OLDS_LOCATION_ID];
}

export function getLocationFirebasePath(locationId) {
	return `hayShedState/${locationId}`;
}

export function getMaxBalesPerBay(locationId = OLDS_LOCATION_ID) {
	return getLocationConfig(locationId).maxBalesPerBay ?? DEFAULT_MAX_BALES_PER_BAY;
}

export function getMaxBalesPerIsle(isle, locationId = OLDS_LOCATION_ID) {
	const bayMax = getMaxBalesPerBay(locationId);
	return isle === "both" ? bayMax : bayMax / 2;
}
