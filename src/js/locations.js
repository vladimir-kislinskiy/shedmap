export const OLDS_LOCATION_ID = "olds";
export const SIKSIKA_LOCATION_ID = "siksika";

export const LOCATION_IDS = [OLDS_LOCATION_ID, SIKSIKA_LOCATION_ID];

/** @type {Record<string, import('./locations.js').LocationConfig>} */
export const LOCATIONS = {
	[OLDS_LOCATION_ID]: {
		id: OLDS_LOCATION_ID,
		label: "Olds",
		sheds: ["west", "north", "east"],
		bayCount: 12,
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
};

export function getLocationConfig(locationId) {
	return LOCATIONS[locationId] ?? LOCATIONS[OLDS_LOCATION_ID];
}

export function getLocationFirebasePath(locationId) {
	return `hayShedState/${locationId}`;
}
