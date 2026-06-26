import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";
import {
	initAuth,
	login,
	logout,
	isAdminUser,
	canEditLocation,
} from "./auth.js";
import { bindStackDrag } from "./drag-drop.js";
import { getFirebaseConfig } from "./firebase-config.js";
import { openReportPdf } from "./report-pdf.js";
import {
	cacheHayShedState,
	formatCacheTimestamp,
	loadAllCachedHayShedStates,
	validateHayShedState,
	normalizeHayShedState,
	isLegacyHayShedRoot,
} from "./state-cache.js";
import { LOCATION_IDS, getLocationConfig, getLocationFirebasePath, OLDS_LOCATION_ID } from "./locations.js";
import {
	getCurrentLocationId,
	setCurrentLocationId,
	loc,
	locQuery,
	locQueryAll,
	getLocationPanel,
	getBayColumnEl,
	getBayDisplayNumberForLocation,
	getShedLabel,
	scopedId,
} from "./location-ui.js";
import {
	capitalize,
	applyStackComment,
	applyStackGrade,
	applyStackRejected,
	createHayStack,
	createLogRow,
	createReportRow,
	findStackInContainer,
	formatIsleLabel,
	formatStackCountLabel,
	formatStackKey,
	getBayStacks,
	getBayFillPercent,
	MAX_BALES_PER_BAY,
	getHayTypeLabel,
	getIsleContainer,
	getIsleMaxBales,
	getStackType,
	getStackGradeLabel,
	normalizeStackComment,
	normalizeStackGrade,
	parseStackKey,
	restoreHayStack,
	restoreStackPosition,
	STACK_GRADES,
	sumBalesInContainer,
	syncAllShedLayouts,
	syncAllShedLayoutsAfterPaint,
	sanitizeCommentInput,
	updateHayStack,
} from "./dom.js";

const app = initializeApp(getFirebaseConfig());
const db = getDatabase(app);
const auth = initAuth(app, handleAuthChange);

function buildEmptyShedState(locationId = getCurrentLocationId()) {
	const locationConfig = getLocationConfig(locationId);
	const sheds = {};

	locationConfig.sheds.forEach((shed) => {
		const colsData = {};
		for (let i = 0; i < locationConfig.bayCount; i++) {
			colsData[`${shed}-col-${i}`] = [];
		}
		sheds[shed] = colsData;
	});

	return { changeLog: [], sheds };
}

// Firebase removes nodes whose only content is empty arrays/objects, which would
// collapse a cleared location to null and make the reset invisible to other
// devices. Stamping updatedAt keeps the node alive so an empty state syncs.
function stampStateForWrite(state) {
	return { ...state, updatedAt: Date.now() };
}

function clearAllBaysUI(locationId = getCurrentLocationId()) {
	const locationConfig = getLocationConfig(locationId);
	locationConfig.sheds.forEach((shed) => {
		for (let i = 0; i < locationConfig.bayCount; i++) {
			const colEl = getBayColumnEl(shed, i, locationId);
			if (!colEl) continue;
			colEl.querySelectorAll(".hay-stack").forEach((stack) => stack.remove());
			updateBayStats(colEl);
		}
	});

	changeLogs[locationId] = [];
	updateLogTable(locationId);
	syncAllShedLayouts();
}

async function resetAllBays({ confirm = true, locationId = getCurrentLocationId() } = {}) {
	if (!canEdit(locationId)) {
		alert("Sign in to reset all bays.");
		return false;
	}

	const locationLabel = getLocationConfig(locationId).label;
	if (confirm && !window.confirm(`Clear all bays and the change log for ${locationLabel}?`)) {
		return false;
	}

	clearAllBaysUI(locationId);
	// Prevent stale local cache from resurrecting data later this session.
	hasRemoteStateByLocation[locationId] = true;

	try {
		const emptyState = buildEmptyShedState(locationId);
		await set(ref(db, getLocationFirebasePath(locationId)), stampStateForWrite(emptyState));
		await cacheHayShedState(locationId, emptyState);
		if (location.search.includes("reset=")) {
			history.replaceState(null, "", location.pathname);
		}
		return true;
	} catch (err) {
		console.error("Error resetting state:", err);
		alert("Failed to save cleared state.");
		return false;
	}
}

function getPendingResetLocation() {
	const value = new URLSearchParams(location.search).get("reset");
	if (!value) return null;
	if (value === "all") return getCurrentLocationId();
	if (LOCATION_IDS.includes(value)) return value;
	return null;
}

let pendingResetLocation = getPendingResetLocation();

const changeLogs = Object.fromEntries(LOCATION_IDS.map((locationId) => [locationId, []]));
let isAuthenticated = false;
let currentUserEmail = null;
let currentPerson = null;
let transferSource = null;
let firebaseConnected = true;
let currentTab = "Sheds";
let offlineBannerTimer = null;
const OFFLINE_BANNER_DELAY_MS = 4000;
let cacheSavedAtByLocation = Object.fromEntries(LOCATION_IDS.map((locationId) => [locationId, null]));
let hasRemoteStateByLocation = Object.fromEntries(LOCATION_IDS.map((locationId) => [locationId, false]));
let adminBackupModule = null;

function getCurrentLocation() {
	return getCurrentLocationId();
}

function getCurrentLocationConfig() {
	return getLocationConfig(getCurrentLocation());
}

function getLocationChangeLog(locationId = getCurrentLocation()) {
	if (!Array.isArray(changeLogs[locationId])) {
		changeLogs[locationId] = [];
	}
	return changeLogs[locationId];
}

function canEdit(locationId = getCurrentLocation()) {
	return isAuthenticated && canEditLocation(currentUserEmail, locationId);
}

function getScopedElement(id, locationId = getCurrentLocation()) {
	return loc(id, locationId) || document.getElementById(id);
}

async function syncAdminBackupUI(authenticated, email) {
	if (!authenticated || !isAdminUser(email)) {
		adminBackupModule?.unmountAdminBackup();
		adminBackupModule = null;
		return;
	}

	if (!adminBackupModule) {
		adminBackupModule = await import("./admin-backup.js");
	}

	adminBackupModule.mountAdminBackup(email, {
		collectAppState: collectAllAppState,
		restoreState: restoreAppStateToFirebase,
		exportedBy: currentPerson,
	});
}

function clearTransferSource() {
	transferSource = null;
}

function setTransferSource(stackEl) {
	const bayStack = stackEl?.closest(".shed__bay-stack");
	if (!bayStack) {
		clearTransferSource();
		return;
	}

	transferSource = {
		stackEl,
		locationId: bayStack.dataset.location || getCurrentLocation(),
		shed: bayStack.dataset.shed,
		bay: bayStack.dataset.bay,
		isle: stackEl.dataset.isle || "both",
	};
}

function setActiveTab(tabId) {
	currentTab = tabId;

	document.querySelectorAll(".tabs__group .tabs__btn").forEach((tabBtn) => {
		tabBtn.classList.toggle("tabs__btn--active", tabBtn.dataset.tab === tabId);
	});

	// Tab buttons are shared in the header, but each location keeps its own
	// panels — keep both locations in sync so switching location preserves the tab.
	LOCATION_IDS.forEach((locId) => {
		const panelRoot = getLocationPanel(locId);
		if (!panelRoot) return;
		const activePanel = loc(tabId, locId);
		panelRoot.querySelectorAll(".tabs__panel").forEach((panel) => {
			panel.classList.toggle("tabs__panel--active", panel === activePanel);
		});
	});

	if (tabId === "Sheds") {
		requestAnimationFrame(() => syncAllShedLayouts());
	}

	if (tabId === "Reports") {
		updateReportsTable(getCurrentLocation());
	}
}

function setActiveShedTab(panelId, btn, { bay } = {}, locationId = getCurrentLocation()) {
	const panelRoot = getLocationPanel(locationId);
	if (!panelRoot) return;

	panelRoot.querySelectorAll(".shed-tabs__panel").forEach((panel) => {
		panel.classList.remove("shed-tabs__panel--active");
	});
	panelRoot.querySelectorAll(".shed-tabs__btn").forEach((tabBtn) => {
		tabBtn.classList.remove("shed-tabs__btn--active");
	});
	document.getElementById(panelId)?.classList.add("shed-tabs__panel--active");
	btn?.classList.add("shed-tabs__btn--active");

	const shedSelect = getScopedElement("shedSelect", locationId);
	if (shedSelect && panelId) {
		const config = getLocationConfig(locationId);
		const shed = config.sheds.find((shedId) => panelId.endsWith(`${shedId}-shed-tab`)) || config.defaultShed;
		shedSelect.value = shed;
		updateBaySelectForShed(shed, selectedBayOrNull(bay), locationId);
	}

	requestAnimationFrame(() => syncAllShedLayouts());
}

function initGrabToScroll() {
	const useGrabScroll = window.matchMedia("(pointer: fine)").matches;

	document.querySelectorAll(".shed__columns").forEach((slider) => {
		if (!useGrabScroll) return;

		let isDown = false;
		let startX;
		let scrollLeft;
		let activePointerId = null;

		const shouldSkip = (e) =>
			e.target.closest(".hay-stack") ||
			document.body.classList.contains("page--dragging");

		const stopGrabMouse = () => {
			isDown = false;
			slider.classList.remove("shed__columns--grabbing");
		};

		slider.addEventListener("mousedown", (e) => {
			if (shouldSkip(e)) return;
			isDown = true;
			slider.classList.add("shed__columns--grabbing");
			startX = e.pageX - slider.offsetLeft;
			scrollLeft = slider.scrollLeft;
		});

		slider.addEventListener("mouseup", stopGrabMouse);
		slider.addEventListener("mouseleave", stopGrabMouse);

		slider.addEventListener("mousemove", (e) => {
			if (!isDown) return;
			e.preventDefault();
			const x = e.pageX - slider.offsetLeft;
			slider.scrollLeft = scrollLeft - (x - startX) * 2;
		});

		slider.addEventListener("pointerdown", (e) => {
			if (shouldSkip(e) || e.pointerType === "touch") return;
			isDown = true;
			activePointerId = e.pointerId;
			slider.classList.add("shed__columns--grabbing");
			startX = e.pageX - slider.offsetLeft;
			scrollLeft = slider.scrollLeft;
		});

		const stopGrab = (e) => {
			if (e.pointerId !== activePointerId) return;
			isDown = false;
			activePointerId = null;
			slider.classList.remove("shed__columns--grabbing");
		};

		slider.addEventListener("pointerup", stopGrab);
		slider.addEventListener("pointercancel", stopGrab);

		slider.addEventListener("pointermove", (e) => {
			if (!isDown || e.pointerId !== activePointerId || e.pointerType === "touch") return;
			e.preventDefault();
			const x = e.pageX - slider.offsetLeft;
			slider.scrollLeft = scrollLeft - (x - startX) * 2;
		});
	});
}

function selectedBayOrNull(bay) {
	return bay === undefined ? null : bay;
}

function getBayColumn(shed, bay) {
	return getBayColumnEl(shed, bay, getCurrentLocation());
}

function findRejectedStackInContainer(container, stackKey, excludeStack = null) {
	if (!container) return null;

	return [...container.children]
		.filter((el) => el.classList.contains("hay-stack"))
		.find(
			(stack) => stack.dataset.stackKey === stackKey
				&& stack.dataset.rejected === "true"
				&& stack !== excludeStack,
		) || null;
}

function getSelectedIsle(locationId = getCurrentLocation()) {
	const isle1 = getScopedElement("isle1", locationId)?.checked;
	const isle2 = getScopedElement("isle2", locationId)?.checked;

	if (!isle1 && !isle2) {
		alert("Select at least one isle.");
		return null;
	}
	if (isle1 && isle2) return "both";
	return isle1 ? "1" : "2";
}

function setIsleCheckboxes(isle, locationId = getCurrentLocation()) {
	const isle1 = getScopedElement("isle1", locationId);
	const isle2 = getScopedElement("isle2", locationId);
	if (!isle1 || !isle2) return;
	isle1.checked = isle === "both" || isle === "1";
	isle2.checked = isle === "both" || isle === "2";
}

function syncInventoryActionFields(locationId = getCurrentLocation()) {
	const action = getScopedElement("actionSelect", locationId)?.value;
	const baleCount = getScopedElement("baleCount", locationId);
	if (!baleCount) return;

	if (action === "update") {
		baleCount.value = "";
		baleCount.placeholder = "—";
		baleCount.disabled = true;
	} else if (action === "transfer") {
		baleCount.placeholder = "Bales to transfer";
		baleCount.disabled = false;
	} else {
		baleCount.placeholder = "Bales";
		baleCount.disabled = false;
	}
}

const GRADE_ELIGIBLE_TYPES = new Set(["alfalfa", "timothy"]);
const NO_TAGS_CONTRACT = "No Tags";

function isGradeEligibleType(type) {
	return GRADE_ELIGIBLE_TYPES.has(type);
}

function syncNoTagsState(locationId = getCurrentLocation()) {
	const noTags = getScopedElement("noTagsCheck", locationId)?.checked ?? false;
	const contractInput = getScopedElement("contractNumber", locationId);
	if (!contractInput) return;

	contractInput.disabled = noTags;
	if (noTags) {
		contractInput.value = "";
		contractInput.placeholder = NO_TAGS_CONTRACT;
	} else {
		contractInput.placeholder = "26-2222";
	}
}

function syncGradeFieldVisibility(type = getScopedElement("hayType")?.value || "", locationId = getCurrentLocation()) {
	const gradeEl = getScopedElement("stackGrade", locationId);
	if (!gradeEl) return;

	const show = isGradeEligibleType(type);
	gradeEl.hidden = !show;

	if (!show) {
		gradeEl.value = "";
	}
}

function resetInventoryFormFields() {
	const locationId = getCurrentLocation();
	const reportedBy = getScopedElement("reportedBy", locationId);
	if (reportedBy) reportedBy.value = "";

	const hayType = getScopedElement("hayType", locationId);
	if (hayType) hayType.value = "";

	const contractNumber = getScopedElement("contractNumber", locationId);
	if (contractNumber) contractNumber.value = "";

	const baleCount = getScopedElement("baleCount", locationId);
	if (baleCount) baleCount.value = "";

	const rejectCheck = getScopedElement("rejectCheck", locationId);
	if (rejectCheck) rejectCheck.checked = false;

	const noTagsCheck = getScopedElement("noTagsCheck", locationId);
	if (noTagsCheck) noTagsCheck.checked = false;
	syncNoTagsState(locationId);

	const stackComment = getScopedElement("stackComment", locationId);
	if (stackComment) stackComment.value = "";

	const stackGrade = getScopedElement("stackGrade", locationId);
	if (stackGrade) stackGrade.value = "";

	setIsleCheckboxes("both", locationId);

	const actionSelect = getScopedElement("actionSelect", locationId);
	if (actionSelect) actionSelect.value = "";

	syncInventoryActionFields(locationId);
	syncGradeFieldVisibility("", locationId);

	document.querySelectorAll(".hay-stack--selected").forEach((el) => {
		el.classList.remove("hay-stack--selected");
	});

	clearTransferSource();
	updateStackInteractionState();
}

function setInventoryShedAndBay(shed, bay, locationId = getCurrentLocation()) {
	const shedSelect = getScopedElement("shedSelect", locationId);
	if (shedSelect) shedSelect.value = shed;

	const tabBtn = locQuery(`.shed-tabs__btn[data-subtab$="${shed}-shed-tab"]`, locationId);
	if (tabBtn) {
		setActiveShedTab(tabBtn.dataset.subtab || scopedId(`${shed}-shed-tab`, locationId), tabBtn, { bay }, locationId);
	} else {
		updateBaySelectForShed(shed, bay, locationId);
	}
}

function resetInventoryForm() {
	resetInventoryFormFields();
}

function fillFormFromEmptyBay(bayStackEl) {
	const locationId = bayStackEl?.dataset.location || getCurrentLocation();
	if (!canEdit(locationId) || !bayStackEl) return;
	if (getBayStacks(bayStackEl).length > 0) return;

	const shed = bayStackEl.dataset.shed;
	const bay = bayStackEl.dataset.bay;
	if (!shed || bay === undefined) return;

	setCurrentLocationId(locationId);
	resetInventoryFormFields();
	setInventoryShedAndBay(shed, bay, locationId);
	clearTransferSource();
	setInventoryControlsOpen(true);
}

function fillFormFromStack(stackEl) {
	const bayStack = stackEl.closest(".shed__bay-stack");
	if (!bayStack) return;

	const locationId = bayStack.dataset.location || getCurrentLocation();
	if (!canEdit(locationId)) return;

	const type = getStackType(stackEl);
	const { contract } = parseStackKey(stackEl.dataset.stackKey || "");
	const bales = stackEl.dataset.bales || "";
	const isle = stackEl.dataset.isle || "both";
	const shed = bayStack.dataset.shed;
	const bay = bayStack.dataset.bay;

	setCurrentLocationId(locationId);
	getScopedElement("hayType", locationId).value = type;
	syncGradeFieldVisibility(type, locationId);

	const isNoTags = contract === NO_TAGS_CONTRACT;
	const noTagsCheck = getScopedElement("noTagsCheck", locationId);
	if (noTagsCheck) noTagsCheck.checked = isNoTags;
	syncNoTagsState(locationId);

	const contractInput = getScopedElement("contractNumber", locationId);
	if (contractInput && !isNoTags) contractInput.value = contract;

	getScopedElement("baleCount", locationId).value = bales;
	getScopedElement("shedSelect", locationId).value = shed;
	setIsleCheckboxes(isle, locationId);

	const rejected = stackEl.dataset.rejected === "true";
	const rejectCheck = getScopedElement("rejectCheck", locationId);
	if (rejectCheck) rejectCheck.checked = rejected;

	const stackCommentEl = getScopedElement("stackComment", locationId);
	if (stackCommentEl) stackCommentEl.value = stackEl.dataset.comment || "";

	const stackGradeEl = getScopedElement("stackGrade", locationId);
	if (stackGradeEl) stackGradeEl.value = stackEl.dataset.grade || "";

	const tabBtn = locQuery(`.shed-tabs__btn[data-subtab$="${shed}-shed-tab"]`, locationId);
	if (tabBtn) {
		setActiveShedTab(tabBtn.dataset.subtab || scopedId(`${shed}-shed-tab`, locationId), tabBtn, { bay }, locationId);
	} else {
		updateBaySelectForShed(shed, bay, locationId);
	}

	document.querySelectorAll(".hay-stack--selected").forEach((el) => {
		el.classList.remove("hay-stack--selected");
	});
	stackEl.classList.add("hay-stack--selected");
	setTransferSource(stackEl);

	const actionSelect = getScopedElement("actionSelect", locationId);
	if (actionSelect) actionSelect.value = "";
	syncInventoryActionFields(locationId);

	setInventoryControlsOpen(true);
}

function bindEmptyBaySelect(bayEl) {
	if (bayEl._emptyBayBound) return;
	bayEl._emptyBayBound = true;

	const bayStack = bayEl.matches(".shed__bay-stack")
		? bayEl
		: bayEl.querySelector(".shed__bay-stack");
	if (!bayStack) return;

	bayEl.addEventListener("click", (e) => {
		const locationId = bayStack?.dataset.location || getCurrentLocation();
		if (!canEdit(locationId) || e.target.closest(".hay-stack")) return;
		fillFormFromEmptyBay(bayStack);
	});
}

function initEmptyBaySelect(locationId = getCurrentLocation()) {
	locQueryAll(".shed__bay", locationId).forEach(bindEmptyBaySelect);
}

function bindStackSelect(stackEl) {
	if (stackEl._selectBound) return;
	stackEl._selectBound = true;
	stackEl.addEventListener("click", () => {
		const locationId = stackEl.closest(".shed__bay-stack")?.dataset.location || getCurrentLocation();
		if (!canEdit(locationId) || stackEl._justDragged) return;
		fillFormFromStack(stackEl);
	});
}

function updateStackInteractionState() {
	document.querySelectorAll(".hay-stack").forEach((stack) => {
		const locationId = stack.closest(".shed__bay-stack")?.dataset.location || getCurrentLocation();
		const editable = canEdit(locationId);
		stack.classList.toggle("hay-stack--selectable", editable);
		stack.classList.toggle("hay-stack--draggable", editable);
		if (!editable) stack.classList.remove("hay-stack--selected");
	});
}

function updateBayStats(bayStackEl) {
	if (!bayStackEl) return;
	const bayEl = bayStackEl.closest(".shed__bay");
	const totalEl = bayEl?.querySelector(".shed__bay-total-val");
	const fillEl = bayEl?.querySelector(".shed__bay-fill");
	const total = sumBalesInContainer(bayStackEl);

	if (totalEl) totalEl.textContent = total;
	if (fillEl) {
		fillEl.textContent = `${getBayFillPercent(total, MAX_BALES_PER_BAY)}% full`;
	}
}

function getReportedByValue(locationId = getCurrentLocation()) {
	return getScopedElement("reportedBy", locationId)?.value.trim() || "";
}

function canDragStack(stackEl) {
	const locationId = stackEl?.closest(".shed__bay-stack")?.dataset.location || getCurrentLocation();
	return canEdit(locationId);
}

function makeStackDraggable(stackEl) {
	bindStackSelect(stackEl);
	bindStackDrag(stackEl, {
		canDrag: () => canDragStack(stackEl),
		onReorder: ({ stackEl: movedStack, fromIsle, toIsle, origin }) => {
			const bayStack = movedStack.closest(".shed__bay-stack");
			const locationId = bayStack?.dataset.location || getCurrentLocation();

			if (!getReportedByValue(locationId)) {
				alert("Please select who reported this change (or N/A).");
				restoreStackPosition(movedStack, origin);
				if (bayStack) updateBayStats(bayStack);
				syncAllShedLayouts();
				return;
			}

			if (bayStack) updateBayStats(bayStack);
			syncAllShedLayouts();

			if (canEdit(locationId) && currentPerson && bayStack) {
				const type = getStackType(movedStack);
				const { contract } = parseStackKey(movedStack.dataset.stackKey || "");
				const bales = parseInt(movedStack.dataset.bales, 10) || 0;
				const shed = bayStack.dataset.shed;
				const bay = getBayDisplayNumberForLocation(shed, bayStack.dataset.bay, locationId);
				const typeLabel = getHayTypeLabel(type);
				const note = fromIsle !== toIsle
					? `${typeLabel} ${contract} (${bales} bales) moved from ${formatIsleLabel(fromIsle)} to ${formatIsleLabel(toIsle)}`
					: `${typeLabel} ${contract} (${bales} bales) reordered in ${formatIsleLabel(toIsle)}`;

				logChange(currentPerson, "Move", type, contract, bay, toIsle, shed, bales, note, locationId);
			}

			setCurrentLocationId(locationId);
			saveState(locationId);
			resetInventoryForm();
		},
	});
}

function handleHay() {
	const locationId = getCurrentLocation();
	if (!canEdit(locationId) || !currentPerson) return;

	const type = getScopedElement("hayType", locationId).value;
	const noTags = getScopedElement("noTagsCheck", locationId)?.checked ?? false;
	const contract = noTags ? NO_TAGS_CONTRACT : getScopedElement("contractNumber", locationId).value.trim();
	const baleCountRaw = getScopedElement("baleCount", locationId).value.trim();
	const baleCount = baleCountRaw === "" ? NaN : parseInt(baleCountRaw, 10);
	const shed = getScopedElement("shedSelect", locationId).value;
	const bay = getScopedElement("baySelect", locationId).value;
	const action = getScopedElement("actionSelect", locationId).value;
	const reportedBy = getReportedByValue(locationId);
	const rejected = getScopedElement("rejectCheck", locationId)?.checked ?? false;
	const stackComment = normalizeStackComment(getScopedElement("stackComment", locationId)?.value || "");
	const stackGrade = normalizeStackGrade(getScopedElement("stackGrade", locationId)?.value || "");

	if (!reportedBy) {
		alert("Please select who reported this change (or N/A).");
		return;
	}

	if (!type) {
		alert("Please select a product.");
		return;
	}

	if (!noTags && !isValidContract(contract)) {
		alert("Contract number must be in format: 26-2222 or 26-2222A");
		return;
	}

	if (!action) {
		alert("Please select an action.");
		return;
	}

	const bayStackEl = getBayColumn(shed, bay);
	if (!bayStackEl) return;

	const stackKey = formatStackKey(type, contract);

	if (action === "update") {
		const isle = getSelectedIsle();
		if (!isle) return;

		const targetContainer = getIsleContainer(bayStackEl, isle);
		let foundStack = findStackInContainer(targetContainer, stackKey);

		// Fall back to the stack the user selected, so Update can change the
		// contract or toggle "No tags" on an existing stack (its identity changes).
		if (!foundStack && transferSource?.stackEl?.isConnected && transferSource.locationId === locationId) {
			foundStack = transferSource.stackEl;
		}

		if (!foundStack) {
			alert("No matching stack found in the selected isle. Check product, contract, shed, bay, and isle.");
			return;
		}

		const stackBayEl = foundStack.closest(".shed__bay-stack") || bayStackEl;
		const foundIsle = foundStack.dataset.isle || "both";
		const currentBales = parseInt(foundStack.dataset.bales, 10) || 0;

		// Apply product/contract/no-tags identity in place, then the flags.
		updateHayStack(foundStack, type, contract, currentBales);
		applyStackRejected(foundStack, rejected);
		applyStackComment(foundStack, stackComment);
		applyStackGrade(foundStack, stackGrade);

		const updateNotes = [];
		if (rejected) updateNotes.push("Rejected");
		if (stackGrade) updateNotes.push(getStackGradeLabel(stackGrade));
		if (stackComment) updateNotes.push(stackComment);
		logChange(
			currentPerson,
			"Update",
			type,
			contract,
			getBayDisplayNumberForLocation(stackBayEl.dataset.shed, stackBayEl.dataset.bay, locationId),
			foundIsle,
			stackBayEl.dataset.shed,
			currentBales,
			updateNotes.join(" — ") || "Stack updated",
		);

		updateBayStats(stackBayEl);
		syncAllShedLayouts();
		saveState(locationId);
		resetInventoryForm();
		return;
	}

	if (action === "transfer") {
		if (!transferSource?.stackEl?.isConnected) {
			alert("Select a stack on the map to transfer from.");
			return;
		}
		if (transferSource.locationId !== locationId) {
			alert("Select a source stack from the active location.");
			return;
		}

		if (!Number.isFinite(baleCount) || baleCount < 1) {
			alert("Please enter at least 1 bale to transfer.");
			return;
		}

		const sourceStack = transferSource.stackEl;
		const sourceShed = transferSource.shed;
		const sourceBay = transferSource.bay;
		const sourceIsle = transferSource.isle;
		const sourceBayStackEl = getBayColumn(sourceShed, sourceBay);
		if (!sourceBayStackEl) return;

		const sourceType = getStackType(sourceStack);
		const { contract: sourceContract } = parseStackKey(sourceStack.dataset.stackKey || "");
		if (type !== sourceType || contract !== sourceContract) {
			alert("Product and contract must match the selected source stack.");
			return;
		}

		const destIsle = getSelectedIsle();
		if (!destIsle) return;

		const isSameBay = sourceShed === shed && sourceBay === bay;
		const isSameIsle = sourceIsle === destIsle;

		if (isSameBay && isSameIsle && !rejected) {
			alert("Choose a different bay or isle for the transfer destination.");
			return;
		}

		const sourceContainer = getIsleContainer(sourceBayStackEl, sourceIsle);
		const foundSource = findStackInContainer(sourceContainer, stackKey);
		if (!foundSource || foundSource !== sourceStack) {
			alert("Source stack not found. Reselect the stack to transfer.");
			return;
		}

		const currentSourceBales = parseInt(foundSource.dataset.bales, 10) || 0;
		if (baleCount > currentSourceBales) {
			alert(`Cannot transfer more than ${currentSourceBales} bales from this stack.`);
			return;
		}

		const destBayStackEl = getBayColumn(shed, bay);
		if (!destBayStackEl) return;

		const destContainer = getIsleContainer(destBayStackEl, destIsle);
		const isRejectSplitInPlace = isSameBay && isSameIsle && rejected;

		if (!isRejectSplitInPlace) {
			const destBayTotal = sumBalesInContainer(destBayStackEl);
			const destIsleTotal = destIsle === "both" ? destBayTotal : sumBalesInContainer(destContainer);
			const destIsleMax = getIsleMaxBales(destIsle);

			if (destBayTotal + baleCount > MAX_BALES_PER_BAY) {
				alert(`Cannot add more than ${MAX_BALES_PER_BAY} bales in the destination bay.`);
				return;
			}

			if (destIsleTotal + baleCount > destIsleMax) {
				alert(`Cannot add more than ${destIsleMax} bales in the destination isle.`);
				return;
			}
		} else if (isSameBay && !isSameIsle) {
			const destIsleTotal = destIsle === "both"
				? sumBalesInContainer(destBayStackEl)
				: sumBalesInContainer(destContainer);
			const destIsleMax = getIsleMaxBales(destIsle);

			if (destIsleTotal + baleCount > destIsleMax) {
				alert(`Cannot add more than ${destIsleMax} bales in the destination isle.`);
				return;
			}
		}

		const sourceGrade = foundSource.dataset.grade || "";
		const sourceComment = foundSource.dataset.comment || "";
		const transferGrade = stackGrade || sourceGrade;
		const transferComment = stackComment || sourceComment;

		const newSourceCount = currentSourceBales - baleCount;
		if (newSourceCount === 0) {
			foundSource.remove();
		} else {
			updateHayStack(foundSource, sourceType, contract, newSourceCount);
		}
		updateBayStats(sourceBayStackEl);

		let existingDest = null;
		if (isRejectSplitInPlace) {
			existingDest = findRejectedStackInContainer(destContainer, stackKey, foundSource);
		} else {
			existingDest = findStackInContainer(destContainer, stackKey);
		}

		if (existingDest) {
			const newDestCount = (parseInt(existingDest.dataset.bales, 10) || 0) + baleCount;
			updateHayStack(existingDest, type, contract, newDestCount);
			if (rejected) applyStackRejected(existingDest, true);
			if (transferComment) applyStackComment(existingDest, transferComment);
			if (transferGrade) applyStackGrade(existingDest, transferGrade);
		} else {
			const stack = createHayStack(type, contract, baleCount, destIsle, destBayStackEl, {
				rejected,
				comment: transferComment,
				grade: transferGrade,
			});
			makeStackDraggable(stack);
		}
		updateBayStats(destBayStackEl);

		const sourceBayLabel = getBayDisplayNumberForLocation(sourceShed, sourceBay, locationId);
		const destBayLabel = getBayDisplayNumberForLocation(shed, bay, locationId);
		const transferNotes = [
			isRejectSplitInPlace
				? `Rejected split in ${capitalize(sourceShed)} bay ${sourceBayLabel} (${formatIsleLabel(sourceIsle)})`
				: `From ${capitalize(sourceShed)} bay ${sourceBayLabel} (${formatIsleLabel(sourceIsle)})`,
		];
		if (rejected) transferNotes.push("Rejected");
		if (transferGrade) transferNotes.push(getStackGradeLabel(transferGrade));
		if (transferComment) transferNotes.push(transferComment);
		logChange(
			currentPerson,
			"Transfer",
			type,
			contract,
			`${sourceBayLabel} → ${destBayLabel}`,
			destIsle,
			shed,
			baleCount,
			transferNotes.join(" — "),
		);

		syncAllShedLayouts();
		saveState(locationId);
		updateReportsTable();
		resetInventoryForm();
		return;
	}

	if (!Number.isFinite(baleCount) || baleCount < 1) {
		alert("Please enter at least 1 bale.");
		return;
	}

	if (action === "add") {
		const isle = getSelectedIsle();
		if (!isle) return;

		if (!noTags) {
			for (const stack of locQueryAll(".hay-stack", locationId)) {
				const { type: stackType, contract: stackContract } = parseStackKey(stack.dataset.stackKey);
				if (stackContract === contract && stackType !== type) {
					alert(`Contract #${contract} is already registered as ${getHayTypeLabel(stackType)}. You cannot add it as ${getHayTypeLabel(type)}.`);
					return;
				}
			}
		}

		const targetContainer = getIsleContainer(bayStackEl, isle);
		const bayTotal = sumBalesInContainer(bayStackEl);
		const isleTotal = isle === "both" ? bayTotal : sumBalesInContainer(targetContainer);
		const isleMax = getIsleMaxBales(isle);

		if (bayTotal + baleCount > MAX_BALES_PER_BAY) {
			alert(`Cannot add more than ${MAX_BALES_PER_BAY} bales in this bay.`);
			return;
		}

		if (isleTotal + baleCount > isleMax) {
			alert(`Cannot add more than ${isleMax} bales in this isle.`);
			return;
		}

		const existingStack = findStackInContainer(targetContainer, stackKey);

		if (existingStack) {
			const newCount = parseInt(existingStack.dataset.bales, 10) + baleCount;
			updateHayStack(existingStack, type, contract, newCount);
			if (rejected) applyStackRejected(existingStack, true);
			if (stackComment) applyStackComment(existingStack, stackComment);
			if (stackGrade) applyStackGrade(existingStack, stackGrade);
		} else {
			const stack = createHayStack(type, contract, baleCount, isle, bayStackEl, {
				rejected,
				comment: stackComment,
				grade: stackGrade,
			});
			makeStackDraggable(stack);
		}

		const addNotes = [];
		if (rejected) addNotes.push("Rejected");
		if (stackGrade) addNotes.push(getStackGradeLabel(stackGrade));
		if (stackComment) addNotes.push(stackComment);
		logChange(currentPerson, "Add", type, contract, getBayDisplayNumberForLocation(shed, bay, locationId), isle, shed, baleCount, addNotes.join(" — "));
	}

	if (action === "remove") {
		const isle = getSelectedIsle();
		if (!isle) return;

		const targetContainer = getIsleContainer(bayStackEl, isle);
		const foundStack = findStackInContainer(targetContainer, stackKey);

		if (!foundStack) {
			alert("No matching stack found in the selected isle. Check contract, hay type, and isle selection.");
			return;
		}

		const foundType = getStackType(foundStack);
		const foundIsle = foundStack.dataset.isle || "both";
		const currentBales = parseInt(foundStack.dataset.bales, 10) || 0;
		const newCount = currentBales - baleCount;

		if (newCount < 0) {
			alert(`Cannot remove more than ${currentBales} bales from this stack.`);
			return;
		}

		if (newCount === 0) {
			foundStack.remove();
		} else {
			updateHayStack(foundStack, foundType, contract, newCount);
		}

		logChange(currentPerson, "Remove", foundType, contract, getBayDisplayNumberForLocation(shed, bay, locationId), foundIsle, shed, baleCount);
	}

	updateBayStats(bayStackEl);
	syncAllShedLayouts();
	saveState(locationId);
	updateReportsTable();
	resetInventoryForm();
}

function logChange(person, action, type, contract, bay, isle, shed, bales, note = "", locationId = getCurrentLocation()) {
	const d = new Date();
	const date = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
	const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });

	getLocationChangeLog(locationId).push({
		timestamp: d.getTime(),
		dateTime: `${date}, ${time}`,
		person,
		reportedBy: getReportedByValue(locationId) || "—",
		action,
		type: getHayTypeLabel(type),
		contract,
		bay,
		isle,
		shed: getShedLabel(shed, locationId),
		bales,
		note,
	});
	updateLogTable(locationId);
}

function parseLogTimestamp(entry) {
	if (entry.timestamp) return entry.timestamp;

	const match = String(entry.dateTime || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
	if (!match) return null;

	const month = Number(match[1]);
	const day = Number(match[2]);
	const year = Number(match[3]);
	return new Date(year, month - 1, day).getTime();
}

function getLogEntryDateParts(entry) {
	const timestamp = parseLogTimestamp(entry);
	if (!timestamp) return null;

	const d = new Date(timestamp);
	return {
		year: d.getFullYear(),
		month: d.getMonth() + 1,
		day: d.getDate(),
	};
}

function getLogFilterValues(locationId = getCurrentLocation()) {
	const monthVal = getScopedElement("logFilterMonth", locationId)?.value ?? "";
	const dayVal = getScopedElement("logFilterDay", locationId)?.value ?? "";

	return {
		year: Number(getScopedElement("logFilterYear", locationId)?.value) || null,
		month: monthVal === "all" ? null : Number(monthVal),
		day: dayVal === "all" ? null : Number(dayVal),
	};
}

function matchesLogFilter(entry, filters) {
	const parts = getLogEntryDateParts(entry);
	if (!parts || !filters.year) return false;

	if (parts.year !== filters.year) return false;
	if (filters.month !== null && parts.month !== filters.month) return false;
	if (filters.day !== null && parts.day !== filters.day) return false;

	return true;
}

function updateLogTable(locationId = getCurrentLocation()) {
	const logBody = getScopedElement("logBody", locationId);
	if (!logBody) return;

	const filters = getLogFilterValues(locationId);
	const locationLog = getLocationChangeLog(locationId);
	logBody.replaceChildren();

	for (let i = locationLog.length - 1; i >= 0; i--) {
		const entry = locationLog[i];
		if (!matchesLogFilter(entry, filters)) continue;

		const row = createLogRow(entry);
		if (row) logBody.appendChild(row);
	}
}

const LOG_START_YEAR = 2026;

function getLogYearRange() {
	const currentYear = new Date().getFullYear();
	const endYear = Math.max(LOG_START_YEAR, currentYear);
	return { start: LOG_START_YEAR, end: endYear };
}

function cloneLogFilterYearOption(year) {
	const tpl = document.getElementById("logFilterYearOptionTemplate");
	if (!tpl) return null;
	const option = tpl.content.firstElementChild.cloneNode(true);
	option.value = String(year);
	option.textContent = String(year);
	return option;
}

function updateLogDayOptions(locationId = getCurrentLocation()) {
	const yearEl = getScopedElement("logFilterYear", locationId);
	const monthEl = getScopedElement("logFilterMonth", locationId);
	const dayEl = getScopedElement("logFilterDay", locationId);
	if (!yearEl || !monthEl || !dayEl) return;

	const monthVal = monthEl.value;
	const prevDay = dayEl.value;

	if (monthVal === "all") {
		dayEl.value = "all";
		dayEl.disabled = true;
		for (const option of dayEl.options) {
			if (option.value === "all") continue;
			option.hidden = false;
		}
		return;
	}

	dayEl.disabled = false;
	const year = Number(yearEl.value);
	const month = Number(monthVal);
	const maxDay = new Date(year, month, 0).getDate();

	for (const option of dayEl.options) {
		if (option.value === "all") continue;
		const day = Number(option.value);
		option.hidden = day > maxDay;
	}

	if (prevDay === "all") {
		dayEl.value = "all";
	} else {
		const prev = Number(prevDay) || 1;
		dayEl.value = String(Math.min(prev, maxDay));
	}
}

function populateLogFilterOptions(locationId = getCurrentLocation()) {
	const yearEl = getScopedElement("logFilterYear", locationId);
	if (!yearEl) return;

	const tpl = document.getElementById("logFilterYearOptionTemplate");
	if (!tpl) return;

	const { start, end } = getLogYearRange();
	yearEl.replaceChildren();
	for (let year = start; year <= end; year++) {
		const option = cloneLogFilterYearOption(year);
		if (option) yearEl.append(option);
	}
}

function resetLogFilters(locationId = getCurrentLocation()) {
	const now = new Date();
	const yearEl = getScopedElement("logFilterYear", locationId);
	const monthEl = getScopedElement("logFilterMonth", locationId);
	const dayEl = getScopedElement("logFilterDay", locationId);
	if (!yearEl || !monthEl || !dayEl) return;

	populateLogFilterOptions(locationId);

	const year = Math.min(Math.max(now.getFullYear(), LOG_START_YEAR), getLogYearRange().end);
	yearEl.value = String(year);
	monthEl.value = String(now.getMonth() + 1);
	updateLogDayOptions(locationId);
	dayEl.value = "all";
}

function getGradeSortIndex(gradeId = "") {
	if (!gradeId) return STACK_GRADES.length;
	const index = STACK_GRADES.findIndex((entry) => entry.id === gradeId);
	return index === -1 ? STACK_GRADES.length : index;
}

function getReportFilterOptions(locationId = getCurrentLocation()) {
	return {
		gradeFilter: getScopedElement("reportGradeFilter", locationId)?.value || "all",
		includeRejected: getScopedElement("reportIncludeRejected", locationId)?.checked ?? false,
	};
}

function syncReportGradeFilterVisibility(
	productId = getScopedElement("reportProductFilter")?.value || "",
	locationId = getCurrentLocation(),
) {
	const wrap = getScopedElement("reportGradeFilterWrap", locationId);
	const gradeEl = getScopedElement("reportGradeFilter", locationId);
	if (!wrap || !gradeEl) return;

	const show = isGradeEligibleType(productId);
	wrap.hidden = !show;
	if (!show) gradeEl.value = "all";
}

function setReportGradeColumnVisible(show, locationId = getCurrentLocation()) {
	locQueryAll(".reports__col-grade", locationId).forEach((el) => {
		el.hidden = !show;
	});
}

function collectProductReport(typeId, { gradeFilter = "all", includeRejected = false } = {}, locationId = getCurrentLocation()) {
	const rows = [];
	const sortByGrade = isGradeEligibleType(typeId);
	const locationConfig = getLocationConfig(locationId);

	locationConfig.sheds.forEach((shed, shedOrder) => {
		for (let bayIndex = 0; bayIndex < locationConfig.bayCount; bayIndex++) {
			const colEl = getBayColumnEl(shed, bayIndex, locationId);
			if (!colEl) continue;

			getBayStacks(colEl).forEach((stack) => {
				if (getStackType(stack) !== typeId) return;

				const rejected = stack.dataset.rejected === "true";
				if (!includeRejected && rejected) return;

				const grade = stack.dataset.grade || "";
				if (sortByGrade && gradeFilter !== "all" && grade !== gradeFilter) return;

				const { contract } = parseStackKey(stack.dataset.stackKey || "");
				const bales = parseInt(stack.dataset.bales, 10) || 0;
				if (bales <= 0) return;

				rows.push({
					contract,
					shed: getShedLabel(shed, locationId),
					bay: getBayDisplayNumberForLocation(shed, bayIndex, locationId),
					bales,
					grade,
					rejected,
					shedOrder,
					bayIndex,
				});
			});
		}
	});

	rows.sort((a, b) => {
		if (sortByGrade) {
			const gradeDiff = getGradeSortIndex(a.grade) - getGradeSortIndex(b.grade);
			if (gradeDiff !== 0) return gradeDiff;
		}
		if (a.shedOrder !== b.shedOrder) return a.shedOrder - b.shedOrder;
		if (a.bayIndex !== b.bayIndex) return a.bayIndex - b.bayIndex;
		return a.contract.localeCompare(b.contract, undefined, { numeric: true });
	});

	return rows;
}

function syncReportPrintButton(productId, locationId = getCurrentLocation()) {
	const printBtn = getScopedElement("reportPrintPdf", locationId);
	if (!printBtn) return;
	printBtn.disabled = !productId;
	printBtn.setAttribute("aria-disabled", productId ? "false" : "true");
	printBtn.title = productId
		? "Open current report as PDF in a new tab"
		: "Select a product to export a PDF report";
}

function updateReportsTable(locationId = getCurrentLocation()) {
	const filterEl = getScopedElement("reportProductFilter", locationId);
	const productId = filterEl?.value ?? "";
	const reportBody = getScopedElement("reportBody", locationId);
	const reportSummary = getScopedElement("reportSummary", locationId);
	const reportTableWrap = getScopedElement("reportTableWrap", locationId);
	const reportEmpty = getScopedElement("reportEmpty", locationId);
	if (!filterEl || !reportBody || !reportSummary || !reportTableWrap || !reportEmpty) return;

	syncReportGradeFilterVisibility(productId, locationId);
	const showGrade = isGradeEligibleType(productId);
	setReportGradeColumnVisible(showGrade, locationId);

	reportBody.replaceChildren();

	if (!productId) {
		reportSummary.hidden = true;
		reportTableWrap.hidden = true;
		reportEmpty.hidden = false;
		reportEmpty.textContent = "Select a product to view inventory locations.";
		syncReportPrintButton("", locationId);
		return;
	}

	const { gradeFilter, includeRejected } = getReportFilterOptions(locationId);
	const rows = collectProductReport(productId, { gradeFilter, includeRejected }, locationId);
	const totalBales = rows.reduce((sum, row) => sum + row.bales, 0);
	const productLabel = getHayTypeLabel(productId);
	syncReportPrintButton(productId, locationId);

	if (rows.length === 0) {
		reportSummary.hidden = true;
		reportTableWrap.hidden = true;
		reportEmpty.hidden = false;
		const gradeLabel = gradeFilter !== "all" ? getStackGradeLabel(gradeFilter) : "";
		const filterNote = gradeLabel ? ` for ${gradeLabel}` : "";
		const rejectNote = includeRejected ? "" : " (rejected excluded)";
		reportEmpty.textContent = `No ${productLabel} found${filterNote}${rejectNote}.`;
		return;
	}

	reportEmpty.hidden = true;
	reportSummary.hidden = false;
	reportSummary.textContent = `${productLabel}: ${totalBales.toLocaleString()} bales in ${rows.length} location${rows.length === 1 ? "" : "s"}`;
	reportTableWrap.hidden = false;

	rows.forEach((entry) => {
		const row = createReportRow(entry, { showGrade });
		if (row) reportBody.appendChild(row);
	});
}

function printCurrentReportPdf(locationId = getCurrentLocation()) {
	const filterEl = getScopedElement("reportProductFilter", locationId);
	const productId = filterEl?.value ?? "";
	if (!productId) {
		alert("Select a product to export a PDF report.");
		return;
	}

	const { gradeFilter, includeRejected } = getReportFilterOptions(locationId);
	const productLabel = getHayTypeLabel(productId);
	const rows = collectProductReport(productId, { gradeFilter, includeRejected }, locationId);
	openReportPdf({
		productLabel,
		rows,
		showGrade: isGradeEligibleType(productId),
		gradeFilter,
		includeRejected,
	});
}

function initReports(locationId = getCurrentLocation()) {
	const filterEl = getScopedElement("reportProductFilter", locationId);
	if (!filterEl) return;

	const refresh = () => updateReportsTable(locationId);
	filterEl.addEventListener("change", refresh);
	filterEl.addEventListener("input", refresh);
	getScopedElement("reportGradeFilter", locationId)?.addEventListener("change", refresh);
	getScopedElement("reportIncludeRejected", locationId)?.addEventListener("change", refresh);
	getScopedElement("reportPrintPdf", locationId)?.addEventListener("click", () => printCurrentReportPdf(locationId));
	refresh();
}

function initLogFilters(locationId = getCurrentLocation()) {
	populateLogFilterOptions(locationId);
	resetLogFilters(locationId);

	const yearEl = getScopedElement("logFilterYear", locationId);
	const monthEl = getScopedElement("logFilterMonth", locationId);
	const dayEl = getScopedElement("logFilterDay", locationId);
	const resetBtn = getScopedElement("logFilterReset", locationId);

	const refresh = () => updateLogTable(locationId);

	yearEl?.addEventListener("change", () => {
		updateLogDayOptions(locationId);
		refresh();
	});

	monthEl?.addEventListener("change", () => {
		updateLogDayOptions(locationId);
		refresh();
	});

	dayEl?.addEventListener("change", refresh);

	resetBtn?.addEventListener("click", () => {
		resetLogFilters(locationId);
		updateLogTable(locationId);
	});

	updateLogTable(locationId);
}

function collectAppState(locationId = getCurrentLocation()) {
	const locationConfig = getLocationConfig(locationId);
	const state = { changeLog: [...getLocationChangeLog(locationId)], sheds: {} };

	locationConfig.sheds.forEach((shed) => {
		const colsData = {};
		for (let i = 0; i < locationConfig.bayCount; i++) {
			const colId = `${shed}-col-${i}`;
			const colEl = getBayColumnEl(shed, i, locationId);
			if (!colEl) continue;

			colsData[colId] = Array.from(getBayStacks(colEl)).map((stack) => ({
				type: getStackType(stack),
				stackKey: stack.dataset.stackKey,
				bales: stack.dataset.bales,
				isle: stack.dataset.isle || "both",
				rejected: stack.dataset.rejected === "true",
				comment: stack.dataset.comment || "",
				grade: stack.dataset.grade || "",
			}));
		}
		state.sheds[shed] = colsData;
	});

	return state;
}

function collectAllAppState() {
	const fullState = {};
	LOCATION_IDS.forEach((locationId) => {
		fullState[locationId] = collectAppState(locationId);
	});
	return fullState;
}

function applyAppState(locationId, state) {
	const normalized = normalizeHayShedState(state, locationId);
	const locationConfig = getLocationConfig(locationId);

	if (Array.isArray(normalized.changeLog)) {
		changeLogs[locationId] = [...normalized.changeLog];
		updateLogTable(locationId);
	}

	if (normalized.sheds) {
		locationConfig.sheds.forEach((shed) => {
			if (!normalized.sheds[shed]) return;

			for (let i = 0; i < locationConfig.bayCount; i++) {
				const colId = `${shed}-col-${i}`;
				const colEl = getBayColumnEl(shed, i, locationId);
				const savedStacks = normalized.sheds[shed][colId];
				if (!colEl) continue;

				colEl.querySelectorAll(".hay-stack").forEach((stack) => stack.remove());

				if (Array.isArray(savedStacks)) {
					savedStacks.forEach((stackData) => {
						const stack = restoreHayStack(stackData, colEl);
						if (stack) makeStackDraggable(stack);
					});
				}

				updateBayStats(colEl);
			}
		});
		syncAllShedLayoutsAfterPaint();
	}

	updateReportsTable(locationId);
}

function renderSyncBanner() {
	const banner = document.getElementById("syncBanner");
	const textEl = document.getElementById("syncBannerText");
	if (!banner || !textEl) return;

	if (!firebaseConnected) {
		const activeLocation = getCurrentLocation();
		const cacheSavedAt = cacheSavedAtByLocation[activeLocation];
		const hasRemoteState = hasRemoteStateByLocation[activeLocation];
		const cacheHint = cacheSavedAt
			? ` Showing data cached at ${formatCacheTimestamp(cacheSavedAt)}.`
			: hasRemoteState
				? ""
				: " No cached data is available yet.";

		textEl.textContent = `Firebase is unreachable.${cacheHint} Viewing works; saving changes requires a connection.`;
		banner.hidden = false;
		document.body.classList.add("page--offline");
		return;
	}

	banner.hidden = true;
	document.body.classList.remove("page--offline");
}

function updateSyncBanner() {
	if (firebaseConnected) {
		if (offlineBannerTimer) {
			clearTimeout(offlineBannerTimer);
			offlineBannerTimer = null;
		}
		renderSyncBanner();
		return;
	}

	// Firebase reports "disconnected" on initial load before the socket opens.
	// Wait out a grace period so the banner only appears on a genuine outage.
	if (offlineBannerTimer) return;
	offlineBannerTimer = setTimeout(() => {
		offlineBannerTimer = null;
		if (!firebaseConnected) renderSyncBanner();
	}, OFFLINE_BANNER_DELAY_MS);
}

async function initLocalCache() {
	const cachedByLocation = await loadAllCachedHayShedStates();
	LOCATION_IDS.forEach((locationId) => {
		if (hasRemoteStateByLocation[locationId]) return;

		const cached = cachedByLocation[locationId];
		if (!cached?.state || !validateHayShedState(cached.state, locationId)) return;
		cacheSavedAtByLocation[locationId] = cached.savedAt;
		applyAppState(locationId, cached.state);
	});
}

function applyRemoteState(locationId, state) {
	if (!state || !validateHayShedState(state, locationId)) {
		console.warn(`Ignoring invalid remote state for ${locationId}`, state);
		return;
	}

	hasRemoteStateByLocation[locationId] = true;
	applyAppState(locationId, state);
	cacheHayShedState(locationId, state).then(() => {
		cacheSavedAtByLocation[locationId] = Date.now();
		updateSyncBanner();
	});
}

function initFirebaseSync() {
	// Legacy flat data at hayShedState root (changeLog + sheds at top level)
	onValue(
		ref(db, "hayShedState"),
		(snapshot) => {
			const root = snapshot.val();
			if (!root) return;

			try {
				if (isLegacyHayShedRoot(root)) {
					applyRemoteState(OLDS_LOCATION_ID, root);
					return;
				}

				// Hybrid: legacy Olds data at root alongside nested location nodes
				if (root.sheds && Array.isArray(root.changeLog) && !root.olds) {
					applyRemoteState(OLDS_LOCATION_ID, {
						changeLog: root.changeLog,
						sheds: root.sheds,
					});
				}
			} catch (e) {
				console.error("Error syncing legacy root state:", e);
			}
		},
		(err) => console.error("Firebase legacy read error:", err),
	);

	// Per-location paths — reliable sync for Olds and Siksika independently
	LOCATION_IDS.forEach((locationId) => {
		onValue(
			ref(db, getLocationFirebasePath(locationId)),
			(snapshot) => {
				const state = snapshot.val();
				if (!state) return;

				try {
					applyRemoteState(locationId, state);
				} catch (e) {
					console.error(`Error syncing ${locationId} state:`, e);
				}
			},
			(err) => console.error(`Firebase read error (${locationId}):`, err),
		);
	});
}

function initSyncStatus() {
	onValue(
		ref(db, ".info/connected"),
		(snap) => {
			firebaseConnected = snap.val() === true;
			updateSyncBanner();
		},
		(err) => console.error("Connection status error:", err),
	);
}

async function saveState(locationId = getCurrentLocation()) {
	if (!canEdit(locationId)) return;

	const state = collectAppState(locationId);

	try {
		await set(ref(db, getLocationFirebasePath(locationId)), stampStateForWrite(state));
	} catch (err) {
		console.error(`Error saving ${locationId} state:`, err);
		alert(
			"Failed to save changes to the server. Data is cached on this device but may not appear on other devices until sync works.",
		);
	}

	await cacheHayShedState(locationId, state);
}

function setInventoryControlsOpen(open) {
	const locationId = getCurrentLocation();
	const controls = loc("inventoryControls", locationId);
	const toggleBtn = document.getElementById("toggleControls");
	if (!controls || !toggleBtn) return;

	if (open && currentTab !== "Sheds") {
		setActiveTab("Sheds");
	}

	controls.hidden = !open;
	controls.classList.toggle("inventory__form--hidden", !open);
	toggleBtn.classList.toggle("inventory-settings--active", open);
	toggleBtn.setAttribute("aria-pressed", open ? "true" : "false");
	const label = open ? "Close inventory management" : "Manage inventory";
	toggleBtn.setAttribute("aria-label", label);
	toggleBtn.title = label;
}

function refreshEditAccess() {
	const editable = canEdit();
	document.body.classList.toggle("page--view-only", !editable);

	const toggleBtn = document.getElementById("toggleControls");
	if (toggleBtn) toggleBtn.hidden = !editable;

	if (!editable) setInventoryControlsOpen(false);
	updateStackInteractionState();
}

function setEditMode(authenticated, person = null, email = null) {
	isAuthenticated = authenticated;
	currentPerson = person;
	currentUserEmail = email;

	document.querySelectorAll(".hay-stack").forEach((stack) => makeStackDraggable(stack));
	refreshEditAccess();
}

async function restoreAppStateToFirebase(state) {
	const rootState = isLegacyHayShedRoot(state) ? { olds: state } : state;
	const targets = LOCATION_IDS.filter((locationId) => rootState?.[locationId]);
	for (const locationId of targets) {
		const locationState = normalizeHayShedState(rootState[locationId], locationId);
		await set(ref(db, getLocationFirebasePath(locationId)), stampStateForWrite(locationState));
		await cacheHayShedState(locationId, locationState);
		hasRemoteStateByLocation[locationId] = true;
		cacheSavedAtByLocation[locationId] = Date.now();
		applyAppState(locationId, locationState);
	}
	updateSyncBanner();
}

function handleAuthChange(authenticated, person, email = null) {
	setEditMode(authenticated, person, email);
	updateAuthUI(authenticated, person);
	syncAdminBackupUI(authenticated, email);

	if (authenticated && pendingResetLocation) {
		const locationId = pendingResetLocation;
		pendingResetLocation = null;
		resetAllBays({ confirm: false, locationId });
	}
}

function updateAuthUI(authenticated, person) {
	const authBar = document.getElementById("authBar");
	const authUserName = document.getElementById("authUserName");
	const authBtn = document.getElementById("authBtn");
	if (!authBar || !authUserName || !authBtn) return;

	authBar.classList.toggle("auth-bar--guest", !authenticated);
	authBar.classList.toggle("auth-bar--authenticated", authenticated && !!person);

	if (authenticated && person) {
		authUserName.textContent = `Hi, ${person}`;
		authBtn.setAttribute("aria-label", "Sign out");
		authBtn.title = "Sign out";
		authBtn.classList.remove("auth-action--sign-in");
		authBtn.classList.add("auth-action--sign-out");
		closeAuthModal();
	} else {
		authUserName.textContent = "";
		authBtn.setAttribute("aria-label", "Sign in");
		authBtn.title = "Sign in";
		authBtn.classList.add("auth-action--sign-in");
		authBtn.classList.remove("auth-action--sign-out");
	}
}

function clearAuthFields() {
	const email = document.getElementById("authEmail");
	const password = document.getElementById("authPassword");
	const toggle = document.getElementById("authPasswordToggle");
	if (email) {
		email.value = "";
		email.readOnly = true;
	}
	if (password) {
		password.value = "";
		password.type = "password";
		password.readOnly = true;
	}
	if (toggle) {
		toggle.setAttribute("aria-pressed", "false");
		toggle.setAttribute("aria-label", "Show password");
	}
}

function enableAuthFields() {
	document.getElementById("authEmail").readOnly = false;
	document.getElementById("authPassword").readOnly = false;
}

let authModalReturnFocus = null;

function openAuthModal() {
	const modal = document.getElementById("authModal");
	const dialog = modal?.querySelector(".auth-modal__dialog");
	const errorEl = document.getElementById("authError");
	if (!modal) return;

	authModalReturnFocus = document.activeElement;

	modal.classList.add("auth-modal--open");
	modal.removeAttribute("inert");
	modal.setAttribute("aria-hidden", "false");
	dialog?.setAttribute("aria-modal", "true");
	if (errorEl) {
		errorEl.hidden = true;
		errorEl.textContent = "";
	}
	clearAuthFields();
	requestAnimationFrame(() => {
		enableAuthFields();
		document.getElementById("authEmail")?.focus();
	});
}

function closeAuthModal() {
	const modal = document.getElementById("authModal");
	if (!modal) return;

	const dialog = modal.querySelector(".auth-modal__dialog");
	const returnFocus = authModalReturnFocus || document.getElementById("authBtn");
	const focused = document.activeElement;

	modal.classList.remove("auth-modal--open");
	modal.setAttribute("inert", "");
	clearAuthFields();

	requestAnimationFrame(() => {
		if (focused instanceof HTMLElement && modal.contains(focused)) {
			focused.blur();
		}

		if (returnFocus instanceof HTMLElement) {
			returnFocus.focus();
		}

		modal.setAttribute("aria-hidden", "true");
		dialog?.removeAttribute("aria-modal");
		authModalReturnFocus = null;
	});
}

function initAuthUI() {
	document.getElementById("authBtn")?.addEventListener("click", () => {
		if (isAuthenticated) {
			logout(auth).catch((err) => console.error("Sign out error:", err));
		} else {
			openAuthModal();
		}
	});

	document.getElementById("authForm")?.addEventListener("submit", async (e) => {
		e.preventDefault();
		const errorEl = document.getElementById("authError");
		try {
			await login(auth, document.getElementById("authEmail").value, document.getElementById("authPassword").value);
		} catch (err) {
			if (errorEl) {
				errorEl.hidden = false;
				errorEl.textContent = "Invalid credentials. Please try again.";
			}
			console.error("Sign in error:", err);
		}
	});

	document.getElementById("authModalClose")?.addEventListener("click", closeAuthModal);
	document.getElementById("authModalOverlay")?.addEventListener("click", closeAuthModal);

	document.getElementById("authPasswordToggle")?.addEventListener("click", () => {
		const input = document.getElementById("authPassword");
		const btn = document.getElementById("authPasswordToggle");
		if (!input || !btn) return;
		const show = input.type === "password";
		input.type = show ? "text" : "password";
		btn.setAttribute("aria-pressed", show ? "true" : "false");
		btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
	});

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") closeAuthModal();
	});
}

const LOCATION_STORAGE_KEY = "hayShedLocation";

function getSavedLocationId() {
	try {
		const saved = localStorage.getItem(LOCATION_STORAGE_KEY);
		if (saved && LOCATION_IDS.includes(saved)) return saved;
	} catch {
		// localStorage unavailable (private mode, etc.)
	}
	return OLDS_LOCATION_ID;
}

function saveLocationPreference(locationId) {
	try {
		localStorage.setItem(LOCATION_STORAGE_KEY, locationId);
	} catch {
		// ignore
	}
}

function setActiveLocation(locationId, btn) {
	document.querySelectorAll(".location-tabs__btn[data-location]").forEach((tabBtn) => {
		tabBtn.classList.toggle("location-tabs__btn--active", tabBtn.dataset.location === locationId);
	});
	setCurrentLocationId(locationId);
	saveLocationPreference(locationId);

	document.querySelectorAll(".location-panel").forEach((panel) => {
		const isActive = panel.id === `location-${locationId}`;
		panel.classList.toggle("location-panel--active", isActive);
		panel.hidden = !isActive;
		if (isActive) {
			panel.removeAttribute("inert");
		} else {
			panel.setAttribute("inert", "");
		}
	});

	syncAllShedLayoutsAfterPaint();
	refreshEditAccess();
	setInventoryControlsOpen(false);
	updateLogTable(locationId);
	updateReportsTable(locationId);
}

function initLocationTabs() {
	document.querySelectorAll(".location-tabs__btn[data-location]").forEach((btn) => {
		btn.addEventListener("click", () => setActiveLocation(btn.dataset.location, btn));
	});

	const savedLocation = getSavedLocationId();
	const savedBtn = document.querySelector(`.location-tabs__btn[data-location="${savedLocation}"]`);
	setActiveLocation(savedLocation, savedBtn);
}

function initMainTabs() {
	document.querySelectorAll(".tabs__group .tabs__btn").forEach((btn) => {
		btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
	});
	setActiveTab(currentTab);
}

function initTabs(locationId = getCurrentLocation()) {
	const panelRoot = getLocationPanel(locationId);
	if (!panelRoot) return;

	panelRoot.querySelectorAll(".shed-tabs__btn").forEach((btn) => {
		btn.addEventListener("click", () => setActiveShedTab(btn.dataset.subtab, btn, {}, locationId));
	});

	getScopedElement("shedSelect", locationId)?.addEventListener("change", (e) => {
		updateBaySelectForShed(e.target.value, null, locationId);
		const tabBtn = panelRoot.querySelector(`.shed-tabs__btn[data-subtab$="${e.target.value}-shed-tab"]`);
		if (tabBtn) setActiveShedTab(tabBtn.dataset.subtab, tabBtn, {}, locationId);
	});

	initEmptyBaySelect(locationId);
	updateBaySelectForShed(
		getScopedElement("shedSelect", locationId)?.value || getLocationConfig(locationId).defaultShed,
		null,
		locationId,
	);
}

function bindDigitsOnlyInput(input, { maxDigits, format, minValue } = {}) {
	if (!input) return;

	const applyFormat = () => {
		let digits = input.value.replace(/\D/g, "").slice(0, maxDigits);
		if (minValue !== undefined) {
			digits = digits.replace(/^0+/, "");
		}
		input.value = format ? format(digits) : digits;
	};

	const wouldStartWithZero = () => {
		const start = input.selectionStart ?? input.value.length;
		const end = input.selectionEnd ?? input.value.length;
		const before = `${input.value.slice(0, start)}${input.value.slice(end)}`.replace(/\D/g, "");
		return before.length === 0;
	};

	input.addEventListener("beforeinput", (e) => {
		if (e.isComposing) return;
		if (e.inputType === "insertText" && e.data && !/^\d$/.test(e.data)) {
			e.preventDefault();
			return;
		}
		if (minValue !== undefined && e.inputType === "insertText" && e.data === "0" && wouldStartWithZero()) {
			e.preventDefault();
		}
	});

	input.addEventListener("keydown", (e) => {
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		const allowed = ["Backspace", "Delete", "Tab", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"];
		if (allowed.includes(e.key)) return;
		if (minValue !== undefined && e.key === "0" && wouldStartWithZero()) {
			e.preventDefault();
			return;
		}
		if (!/^\d$/.test(e.key)) e.preventDefault();
	});

	input.addEventListener("paste", (e) => {
		e.preventDefault();
		const pasted = (e.clipboardData?.getData("text") || "").replace(/\D/g, "");
		const start = input.selectionStart ?? input.value.length;
		const end = input.selectionEnd ?? input.value.length;
		const merged = `${input.value.slice(0, start)}${pasted}${input.value.slice(end)}`;
		input.value = merged;
		applyFormat();
	});

	input.addEventListener("input", applyFormat);
}

function isValidContract(contract) {
	return /^\d{2}-\d{4}[A-Z]?$/.test(contract.trim());
}

function formatContractValue(value) {
	const cleaned = value.toUpperCase().replace(/[^0-9A-Z]/g, "");
	const digits = cleaned.replace(/\D/g, "").slice(0, 6);
	let letter = "";

	if (digits.length === 6) {
		const letters = cleaned.replace(/[^A-Z]/g, "");
		if (letters) letter = letters.slice(-1);
	}

	if (digits.length <= 2) return digits;
	return `${digits.slice(0, 2)}-${digits.slice(2)}${letter}`;
}

function bindContractInput(input) {
	if (!input) return;

	const applyFormat = () => {
		input.value = formatContractValue(input.value);
	};

	const getDigitCount = () => input.value.replace(/\D/g, "").length;

	input.addEventListener("beforeinput", (e) => {
		if (e.isComposing) return;

		if (e.inputType === "insertText" && e.data) {
			if (/^\d$/.test(e.data)) return;

			if (/^[a-zA-Z]$/.test(e.data)) {
				if (getDigitCount() !== 6) {
					e.preventDefault();
				}
				return;
			}

			e.preventDefault();
		}
	});

	input.addEventListener("keydown", (e) => {
		if (e.ctrlKey || e.metaKey || e.altKey) return;

		const allowed = ["Backspace", "Delete", "Tab", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"];
		if (allowed.includes(e.key)) return;

		if (/^\d$/.test(e.key)) {
			if (getDigitCount() >= 6 && !input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0).replace(/\D/g, "").length) {
				const suffix = input.value.replace(/^[\d-]+/, "");
				if (suffix) e.preventDefault();
			}
			return;
		}

		if (/^[a-zA-Z]$/.test(e.key)) {
			if (getDigitCount() !== 6) {
				e.preventDefault();
				return;
			}
			const suffix = input.value.replace(/^[\d-]+/, "");
			if (suffix) e.preventDefault();
			return;
		}

		e.preventDefault();
	});

	input.addEventListener("paste", (e) => {
		e.preventDefault();
		const pasted = (e.clipboardData?.getData("text") || "").toUpperCase();
		const start = input.selectionStart ?? input.value.length;
		const end = input.selectionEnd ?? input.value.length;
		const merged = `${input.value.slice(0, start)}${pasted}${input.value.slice(end)}`;
		input.value = merged;
		applyFormat();
	});

	input.addEventListener("input", applyFormat);
}

function updateBaySelectForShed(shed, selectedBay = null, locationId = getCurrentLocation()) {
	const select = getScopedElement("baySelect", locationId);
	if (!select) return;
	const locationConfig = getLocationConfig(locationId);

	for (let index = 0; index < locationConfig.bayCount; index++) {
		const option = select.options[index];
		if (!option) continue;
		option.value = String(index);
		option.textContent = `Bay ${getBayDisplayNumberForLocation(shed, index, locationId)}`;
	}

	if (selectedBay !== null && selectedBay !== undefined && selectedBay !== "") {
		select.value = String(selectedBay);
	}
}

function bindStackCommentInput(input) {
	if (!input) return;

	input.addEventListener("input", () => {
		const sanitized = sanitizeCommentInput(input.value);
		if (input.value !== sanitized) {
			input.value = sanitized;
		}
	});
}

function initInventoryForm(locationId = getCurrentLocation()) {
	getScopedElement("submitHay", locationId)?.addEventListener("click", () => {
		setCurrentLocationId(locationId);
		handleHay();
	});

	bindContractInput(getScopedElement("contractNumber", locationId));

	bindDigitsOnlyInput(getScopedElement("baleCount", locationId), {
		maxDigits: 4,
		minValue: 1,
	});

	bindStackCommentInput(getScopedElement("stackComment", locationId));

	getScopedElement("hayType", locationId)?.addEventListener("change", (e) => {
		syncGradeFieldVisibility(e.target.value, locationId);
	});

	getScopedElement("noTagsCheck", locationId)?.addEventListener("change", () => syncNoTagsState(locationId));
	syncNoTagsState(locationId);

	syncGradeFieldVisibility("", locationId);

	getScopedElement("actionSelect", locationId)?.addEventListener("change", () => syncInventoryActionFields(locationId));
	syncInventoryActionFields(locationId);

	if (locationId === getCurrentLocation()) {
		setInventoryControlsOpen(false);
	}
}

function initToggleControls() {
	const toggleBtn = document.getElementById("toggleControls");
	toggleBtn?.addEventListener("click", () => {
		if (!canEdit()) return;
		const controls = loc("inventoryControls", getCurrentLocation());
		setInventoryControlsOpen(Boolean(controls?.hidden));
	});
}

window.resetAllBays = resetAllBays;
window.resetOlds = () => resetAllBays({ locationId: "olds" });
window.resetSiksika = () => resetAllBays({ locationId: "siksika" });

window.addEventListener("load", async () => {
	initGrabToScroll();
	initAuthUI();
	initToggleControls();
	initLocationTabs();
	initMainTabs();
	LOCATION_IDS.forEach((locationId) => {
		initTabs(locationId);
		initReports(locationId);
		initInventoryForm(locationId);
		initLogFilters(locationId);
	});
	initSyncStatus();
	initFirebaseSync();
	await initLocalCache();
	document.querySelectorAll(".hay-stack").forEach((stack) => bindStackSelect(stack));
	updateStackInteractionState();
	syncAllShedLayoutsAfterPaint();
	updateLogTable(getCurrentLocation());
	updateReportsTable(getCurrentLocation());
	updateSyncBanner();
});

let resizeTimer;
window.addEventListener("resize", () => {
	clearTimeout(resizeTimer);
	resizeTimer = setTimeout(() => syncAllShedLayouts(), 150);
});
