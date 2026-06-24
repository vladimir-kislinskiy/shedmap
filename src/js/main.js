import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";
import { initAuth, login, logout, isAdminUser } from "./auth.js";
import { bindStackDrag } from "./drag-drop.js";
import { getFirebaseConfig } from "./firebase-config.js";
import { openReportPdf } from "./report-pdf.js";
import {
	cacheHayShedState,
	formatCacheTimestamp,
	loadCachedHayShedState,
	validateHayShedState,
	normalizeHayShedState,
} from "./state-cache.js";
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
	getBayDisplayNumber,
	BAYS_PER_SHED,
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

const SHEDS = ["west", "north", "east"];
const BAY_COUNT = BAYS_PER_SHED;

function buildEmptyShedState() {
	const sheds = {};

	SHEDS.forEach((shed) => {
		const colsData = {};
		for (let i = 0; i < BAY_COUNT; i++) {
			colsData[`${shed}-col-${i}`] = [];
		}
		sheds[shed] = colsData;
	});

	return { changeLog: [], sheds };
}

function clearAllBaysUI() {
	SHEDS.forEach((shed) => {
		for (let i = 0; i < BAY_COUNT; i++) {
			const colEl = document.getElementById(`${shed}-col-${i}`);
			if (!colEl) continue;
			colEl.querySelectorAll(".hay-stack").forEach((stack) => stack.remove());
			updateBayStats(colEl);
		}
	});

	changeLog.length = 0;
	updateLogTable();
	syncAllShedLayouts();
}

async function resetAllBays({ confirm = true } = {}) {
	if (!isEditMode) {
		alert("Sign in to reset all bays.");
		return false;
	}

	if (confirm && !window.confirm("Clear all bays in every shed and the change log?")) {
		return false;
	}

	clearAllBaysUI();

	try {
		await set(ref(db, "hayShedState"), buildEmptyShedState());
		if (location.search.includes("reset=all")) {
			history.replaceState(null, "", location.pathname);
		}
		return true;
	} catch (err) {
		console.error("Error resetting state:", err);
		alert("Failed to save cleared state.");
		return false;
	}
}

let pendingResetAll = new URLSearchParams(location.search).get("reset") === "all";

const changeLog = [];
let isEditMode = false;
let currentPerson = null;
let transferSource = null;
let firebaseConnected = true;
let cacheSavedAt = null;
let hasRemoteState = false;
let adminBackupModule = null;

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
		collectAppState,
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
		shed: bayStack.dataset.shed,
		bay: bayStack.dataset.bay,
		isle: stackEl.dataset.isle || "both",
	};
}

function setActiveTab(panelId, btn) {
	document.querySelectorAll(".tabs__panel").forEach((panel) => {
		panel.classList.remove("tabs__panel--active");
	});
	document.querySelectorAll(".tabs__btn").forEach((tabBtn) => {
		tabBtn.classList.remove("tabs__btn--active");
	});
	document.getElementById(panelId)?.classList.add("tabs__panel--active");
	btn?.classList.add("tabs__btn--active");

	if (panelId === "Sheds") {
		requestAnimationFrame(() => syncAllShedLayouts());
	}

	if (panelId === "Reports") {
		updateReportsTable();
	}
}

function setActiveShedTab(panelId, btn, { bay } = {}) {
	document.querySelectorAll(".shed-tabs__panel").forEach((panel) => {
		panel.classList.remove("shed-tabs__panel--active");
	});
	document.querySelectorAll(".shed-tabs__btn").forEach((tabBtn) => {
		tabBtn.classList.remove("shed-tabs__btn--active");
	});
	document.getElementById(panelId)?.classList.add("shed-tabs__panel--active");
	btn?.classList.add("shed-tabs__btn--active");

	const shedSelect = document.getElementById("shedSelect");
	if (shedSelect && panelId) {
		const shed = panelId.replace("-shed-tab", "");
		shedSelect.value = shed;
		updateBaySelectForShed(shed, bay);
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

function getBayColumn(shed, bay) {
	return document.getElementById(`${shed}-col-${bay}`);
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

function getSelectedIsle() {
	const isle1 = document.getElementById("isle1")?.checked;
	const isle2 = document.getElementById("isle2")?.checked;

	if (!isle1 && !isle2) {
		alert("Select at least one isle.");
		return null;
	}
	if (isle1 && isle2) return "both";
	return isle1 ? "1" : "2";
}

function setIsleCheckboxes(isle) {
	const isle1 = document.getElementById("isle1");
	const isle2 = document.getElementById("isle2");
	if (!isle1 || !isle2) return;
	isle1.checked = isle === "both" || isle === "1";
	isle2.checked = isle === "both" || isle === "2";
}

function syncInventoryActionFields() {
	const action = document.getElementById("actionSelect")?.value;
	const baleCount = document.getElementById("baleCount");
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

function isGradeEligibleType(type) {
	return GRADE_ELIGIBLE_TYPES.has(type);
}

function syncGradeFieldVisibility(type = document.getElementById("hayType")?.value || "") {
	const gradeEl = document.getElementById("stackGrade");
	if (!gradeEl) return;

	const show = isGradeEligibleType(type);
	gradeEl.hidden = !show;

	if (!show) {
		gradeEl.value = "";
	}
}

function resetInventoryFormFields() {
	const reportedBy = document.getElementById("reportedBy");
	if (reportedBy) reportedBy.value = "";

	const hayType = document.getElementById("hayType");
	if (hayType) hayType.value = "";

	const contractNumber = document.getElementById("contractNumber");
	if (contractNumber) contractNumber.value = "";

	const baleCount = document.getElementById("baleCount");
	if (baleCount) baleCount.value = "";

	const rejectCheck = document.getElementById("rejectCheck");
	if (rejectCheck) rejectCheck.checked = false;

	const stackComment = document.getElementById("stackComment");
	if (stackComment) stackComment.value = "";

	const stackGrade = document.getElementById("stackGrade");
	if (stackGrade) stackGrade.value = "";

	setIsleCheckboxes("both");

	const actionSelect = document.getElementById("actionSelect");
	if (actionSelect) actionSelect.value = "";

	syncInventoryActionFields();
	syncGradeFieldVisibility("");

	document.querySelectorAll(".hay-stack--selected").forEach((el) => {
		el.classList.remove("hay-stack--selected");
	});

	clearTransferSource();
	updateStackInteractionState();
}

function setInventoryShedAndBay(shed, bay) {
	const shedSelect = document.getElementById("shedSelect");
	if (shedSelect) shedSelect.value = shed;

	const tabBtn = document.querySelector(`.shed-tabs__btn[data-subtab="${shed}-shed-tab"]`);
	if (tabBtn) {
		setActiveShedTab(`${shed}-shed-tab`, tabBtn, { bay });
	} else {
		updateBaySelectForShed(shed, bay);
	}
}

function resetInventoryForm() {
	resetInventoryFormFields();
}

function fillFormFromEmptyBay(bayStackEl) {
	if (!isEditMode || !bayStackEl) return;
	if (getBayStacks(bayStackEl).length > 0) return;

	const shed = bayStackEl.dataset.shed;
	const bay = bayStackEl.dataset.bay;
	if (!shed || bay === undefined) return;

	resetInventoryFormFields();
	setInventoryShedAndBay(shed, bay);
	clearTransferSource();
	setInventoryControlsOpen(true);
}

function fillFormFromStack(stackEl) {
	if (!isEditMode) return;

	const bayStack = stackEl.closest(".shed__bay-stack");
	if (!bayStack) return;

	const type = getStackType(stackEl);
	const { contract } = parseStackKey(stackEl.dataset.stackKey || "");
	const bales = stackEl.dataset.bales || "";
	const isle = stackEl.dataset.isle || "both";
	const shed = bayStack.dataset.shed;
	const bay = bayStack.dataset.bay;

	document.getElementById("hayType").value = type;
	syncGradeFieldVisibility(type);
	document.getElementById("contractNumber").value = contract;
	document.getElementById("baleCount").value = bales;
	document.getElementById("shedSelect").value = shed;
	setIsleCheckboxes(isle);

	const rejected = stackEl.dataset.rejected === "true";
	const rejectCheck = document.getElementById("rejectCheck");
	if (rejectCheck) rejectCheck.checked = rejected;

	const stackCommentEl = document.getElementById("stackComment");
	if (stackCommentEl) stackCommentEl.value = stackEl.dataset.comment || "";

	const stackGradeEl = document.getElementById("stackGrade");
	if (stackGradeEl) stackGradeEl.value = stackEl.dataset.grade || "";

	const tabBtn = document.querySelector(`.shed-tabs__btn[data-subtab="${shed}-shed-tab"]`);
	if (tabBtn) {
		setActiveShedTab(`${shed}-shed-tab`, tabBtn, { bay });
	} else {
		updateBaySelectForShed(shed, bay);
	}

	document.querySelectorAll(".hay-stack--selected").forEach((el) => {
		el.classList.remove("hay-stack--selected");
	});
	stackEl.classList.add("hay-stack--selected");
	setTransferSource(stackEl);

	const actionSelect = document.getElementById("actionSelect");
	if (actionSelect) actionSelect.value = "";
	syncInventoryActionFields();

	if (isEditMode) setInventoryControlsOpen(true);
}

function bindEmptyBaySelect(bayEl) {
	if (bayEl._emptyBayBound) return;
	bayEl._emptyBayBound = true;

	const bayStack = bayEl.matches(".shed__bay-stack")
		? bayEl
		: bayEl.querySelector(".shed__bay-stack");
	if (!bayStack) return;

	bayEl.addEventListener("click", (e) => {
		if (!isEditMode || e.target.closest(".hay-stack")) return;
		fillFormFromEmptyBay(bayStack);
	});
}

function initEmptyBaySelect() {
	document.querySelectorAll(".shed__bay").forEach(bindEmptyBaySelect);
}

function bindStackSelect(stackEl) {
	if (stackEl._selectBound) return;
	stackEl._selectBound = true;
	stackEl.addEventListener("click", () => {
		if (!isEditMode || stackEl._justDragged) return;
		fillFormFromStack(stackEl);
	});
}

function updateStackInteractionState() {
	document.querySelectorAll(".hay-stack").forEach((stack) => {
		stack.classList.toggle("hay-stack--selectable", isEditMode);
		stack.classList.toggle("hay-stack--draggable", isEditMode);
		if (!isEditMode) stack.classList.remove("hay-stack--selected");
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

function getReportedByValue() {
	return document.getElementById("reportedBy")?.value.trim() || "";
}

function canDragStack() {
	return isEditMode;
}

function makeStackDraggable(stackEl) {
	bindStackSelect(stackEl);
	bindStackDrag(stackEl, {
		canDrag: canDragStack,
		onReorder: ({ stackEl: movedStack, fromIsle, toIsle, origin }) => {
			const bayStack = movedStack.closest(".shed__bay-stack");

			if (!getReportedByValue()) {
				alert("Please select who reported this change (or N/A).");
				restoreStackPosition(movedStack, origin);
				if (bayStack) updateBayStats(bayStack);
				syncAllShedLayouts();
				return;
			}

			if (bayStack) updateBayStats(bayStack);
			syncAllShedLayouts();

			if (isEditMode && currentPerson && bayStack) {
				const type = getStackType(movedStack);
				const { contract } = parseStackKey(movedStack.dataset.stackKey || "");
				const bales = parseInt(movedStack.dataset.bales, 10) || 0;
				const shed = bayStack.dataset.shed;
				const bay = getBayDisplayNumber(shed, bayStack.dataset.bay);
				const typeLabel = getHayTypeLabel(type);
				const note = fromIsle !== toIsle
					? `${typeLabel} ${contract} (${bales} bales) moved from ${formatIsleLabel(fromIsle)} to ${formatIsleLabel(toIsle)}`
					: `${typeLabel} ${contract} (${bales} bales) reordered in ${formatIsleLabel(toIsle)}`;

				logChange(currentPerson, "Move", type, contract, bay, toIsle, shed, bales, note);
			}

			saveState();
			resetInventoryForm();
		},
	});
}

function handleHay() {
	if (!isEditMode || !currentPerson) return;

	const type = document.getElementById("hayType").value;
	const contract = document.getElementById("contractNumber").value.trim();
	const baleCountRaw = document.getElementById("baleCount").value.trim();
	const baleCount = baleCountRaw === "" ? NaN : parseInt(baleCountRaw, 10);
	const shed = document.getElementById("shedSelect").value;
	const bay = document.getElementById("baySelect").value;
	const action = document.getElementById("actionSelect").value;
	const reportedBy = getReportedByValue();
	const rejected = document.getElementById("rejectCheck")?.checked ?? false;
	const stackComment = normalizeStackComment(document.getElementById("stackComment")?.value || "");
	const stackGrade = normalizeStackGrade(document.getElementById("stackGrade")?.value || "");

	if (!reportedBy) {
		alert("Please select who reported this change (or N/A).");
		return;
	}

	if (!type) {
		alert("Please select a product.");
		return;
	}

	if (!isValidContract(contract)) {
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
		const foundStack = findStackInContainer(targetContainer, stackKey);

		if (!foundStack) {
			alert("No matching stack found in the selected isle. Check product, contract, shed, bay, and isle.");
			return;
		}

		const foundIsle = foundStack.dataset.isle || "both";
		const currentBales = parseInt(foundStack.dataset.bales, 10) || 0;

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
			getBayDisplayNumber(shed, bay),
			foundIsle,
			shed,
			currentBales,
			updateNotes.join(" — ") || "Stack updated",
		);

		updateBayStats(bayStackEl);
		syncAllShedLayouts();
		saveState();
		resetInventoryForm();
		return;
	}

	if (action === "transfer") {
		if (!transferSource?.stackEl?.isConnected) {
			alert("Select a stack on the map to transfer from.");
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

		const sourceBayLabel = getBayDisplayNumber(sourceShed, sourceBay);
		const destBayLabel = getBayDisplayNumber(shed, bay);
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
		saveState();
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

		for (const stack of document.querySelectorAll(".hay-stack")) {
			const { type: stackType, contract: stackContract } = parseStackKey(stack.dataset.stackKey);
			if (stackContract === contract && stackType !== type) {
				alert(`Contract #${contract} is already registered as ${getHayTypeLabel(stackType)}. You cannot add it as ${getHayTypeLabel(type)}.`);
				return;
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
		logChange(currentPerson, "Add", type, contract, getBayDisplayNumber(shed, bay), isle, shed, baleCount, addNotes.join(" — "));
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

		logChange(currentPerson, "Remove", foundType, contract, getBayDisplayNumber(shed, bay), foundIsle, shed, baleCount);
	}

	updateBayStats(bayStackEl);
	syncAllShedLayouts();
	saveState();
	updateReportsTable();
	resetInventoryForm();
}

function logChange(person, action, type, contract, bay, isle, shed, bales, note = "") {
	const d = new Date();
	const date = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
	const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });

	changeLog.push({
		timestamp: d.getTime(),
		dateTime: `${date}, ${time}`,
		person,
		reportedBy: getReportedByValue() || "—",
		action,
		type: getHayTypeLabel(type),
		contract,
		bay,
		isle,
		shed: capitalize(shed),
		bales,
		note,
	});
	updateLogTable();
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

function getLogFilterValues() {
	const monthVal = document.getElementById("logFilterMonth")?.value ?? "";
	const dayVal = document.getElementById("logFilterDay")?.value ?? "";

	return {
		year: Number(document.getElementById("logFilterYear")?.value) || null,
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

function updateLogTable() {
	const logBody = document.getElementById("logBody");
	if (!logBody) return;

	const filters = getLogFilterValues();
	logBody.replaceChildren();

	for (let i = changeLog.length - 1; i >= 0; i--) {
		const entry = changeLog[i];
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

function updateLogDayOptions() {
	const yearEl = document.getElementById("logFilterYear");
	const monthEl = document.getElementById("logFilterMonth");
	const dayEl = document.getElementById("logFilterDay");
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

function populateLogFilterOptions() {
	const yearEl = document.getElementById("logFilterYear");
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

function resetLogFilters() {
	const now = new Date();
	const yearEl = document.getElementById("logFilterYear");
	const monthEl = document.getElementById("logFilterMonth");
	const dayEl = document.getElementById("logFilterDay");
	if (!yearEl || !monthEl || !dayEl) return;

	populateLogFilterOptions();

	const year = Math.min(Math.max(now.getFullYear(), LOG_START_YEAR), getLogYearRange().end);
	yearEl.value = String(year);
	monthEl.value = String(now.getMonth() + 1);
	updateLogDayOptions();
	dayEl.value = "all";
}

function getGradeSortIndex(gradeId = "") {
	if (!gradeId) return STACK_GRADES.length;
	const index = STACK_GRADES.findIndex((entry) => entry.id === gradeId);
	return index === -1 ? STACK_GRADES.length : index;
}

function getReportFilterOptions() {
	return {
		gradeFilter: document.getElementById("reportGradeFilter")?.value || "all",
		includeRejected: document.getElementById("reportIncludeRejected")?.checked ?? false,
	};
}

function syncReportGradeFilterVisibility(productId = document.getElementById("reportProductFilter")?.value || "") {
	const wrap = document.getElementById("reportGradeFilterWrap");
	const gradeEl = document.getElementById("reportGradeFilter");
	if (!wrap || !gradeEl) return;

	const show = isGradeEligibleType(productId);
	wrap.hidden = !show;
	if (!show) gradeEl.value = "all";
}

function setReportGradeColumnVisible(show) {
	document.querySelectorAll(".reports__col-grade").forEach((el) => {
		el.hidden = !show;
	});
}

function collectProductReport(typeId, { gradeFilter = "all", includeRejected = false } = {}) {
	const rows = [];
	const sortByGrade = isGradeEligibleType(typeId);

	SHEDS.forEach((shed, shedOrder) => {
		for (let bayIndex = 0; bayIndex < BAY_COUNT; bayIndex++) {
			const colEl = document.getElementById(`${shed}-col-${bayIndex}`);
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
					shed: `${capitalize(shed)} Shed`,
					bay: getBayDisplayNumber(shed, bayIndex),
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

function syncReportPrintButton(productId) {
	const printBtn = document.getElementById("reportPrintPdf");
	if (!printBtn) return;
	printBtn.disabled = !productId;
	printBtn.setAttribute("aria-disabled", productId ? "false" : "true");
	printBtn.title = productId
		? "Open current report as PDF in a new tab"
		: "Select a product to export a PDF report";
}

function updateReportsTable() {
	const filterEl = document.getElementById("reportProductFilter");
	const productId = filterEl?.value ?? "";
	const reportBody = document.getElementById("reportBody");
	const reportSummary = document.getElementById("reportSummary");
	const reportTableWrap = document.getElementById("reportTableWrap");
	const reportEmpty = document.getElementById("reportEmpty");
	if (!filterEl || !reportBody || !reportSummary || !reportTableWrap || !reportEmpty) return;

	syncReportGradeFilterVisibility(productId);
	const showGrade = isGradeEligibleType(productId);
	setReportGradeColumnVisible(showGrade);

	reportBody.replaceChildren();

	if (!productId) {
		reportSummary.hidden = true;
		reportTableWrap.hidden = true;
		reportEmpty.hidden = false;
		reportEmpty.textContent = "Select a product to view inventory locations.";
		syncReportPrintButton("");
		return;
	}

	const { gradeFilter, includeRejected } = getReportFilterOptions();
	const rows = collectProductReport(productId, { gradeFilter, includeRejected });
	const totalBales = rows.reduce((sum, row) => sum + row.bales, 0);
	const productLabel = getHayTypeLabel(productId);
	syncReportPrintButton(productId);

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

function printCurrentReportPdf() {
	const filterEl = document.getElementById("reportProductFilter");
	const productId = filterEl?.value ?? "";
	if (!productId) {
		alert("Select a product to export a PDF report.");
		return;
	}

	const { gradeFilter, includeRejected } = getReportFilterOptions();
	const productLabel = getHayTypeLabel(productId);
	const rows = collectProductReport(productId, { gradeFilter, includeRejected });
	openReportPdf({
		productLabel,
		rows,
		showGrade: isGradeEligibleType(productId),
		gradeFilter,
		includeRejected,
	});
}

function initReports() {
	const filterEl = document.getElementById("reportProductFilter");
	if (!filterEl) return;

	const refresh = () => updateReportsTable();
	filterEl.addEventListener("change", refresh);
	filterEl.addEventListener("input", refresh);
	document.getElementById("reportGradeFilter")?.addEventListener("change", refresh);
	document.getElementById("reportIncludeRejected")?.addEventListener("change", refresh);
	document.getElementById("reportPrintPdf")?.addEventListener("click", printCurrentReportPdf);
	refresh();
}

function initLogFilters() {
	populateLogFilterOptions();
	resetLogFilters();

	const yearEl = document.getElementById("logFilterYear");
	const monthEl = document.getElementById("logFilterMonth");
	const dayEl = document.getElementById("logFilterDay");
	const resetBtn = document.getElementById("logFilterReset");

	const refresh = () => updateLogTable();

	yearEl?.addEventListener("change", () => {
		updateLogDayOptions();
		refresh();
	});

	monthEl?.addEventListener("change", () => {
		updateLogDayOptions();
		refresh();
	});

	dayEl?.addEventListener("change", refresh);

	resetBtn?.addEventListener("click", () => {
		resetLogFilters();
		updateLogTable();
	});

	updateLogTable();
}

function collectAppState() {
	const state = { changeLog: [...changeLog], sheds: {} };

	SHEDS.forEach((shed) => {
		const colsData = {};
		for (let i = 0; i < BAY_COUNT; i++) {
			const colId = `${shed}-col-${i}`;
			const colEl = document.getElementById(colId);
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

function applyAppState(state) {
	const normalized = normalizeHayShedState(state);

	if (Array.isArray(normalized.changeLog)) {
		changeLog.length = 0;
		changeLog.push(...normalized.changeLog);
		updateLogTable();
	}

	if (normalized.sheds) {
		SHEDS.forEach((shed) => {
			if (!normalized.sheds[shed]) return;

			for (let i = 0; i < BAY_COUNT; i++) {
				const colId = `${shed}-col-${i}`;
				const colEl = document.getElementById(colId);
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

	updateReportsTable();
}

function updateSyncBanner() {
	const banner = document.getElementById("syncBanner");
	const textEl = document.getElementById("syncBannerText");
	if (!banner || !textEl) return;

	if (!firebaseConnected) {
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

async function initLocalCache() {
	const cached = await loadCachedHayShedState();
	if (!cached?.state || !validateHayShedState(cached.state)) return;

	cacheSavedAt = cached.savedAt;
	applyAppState(cached.state);
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

function saveState() {
	if (!isEditMode) return;

	const state = collectAppState();

	set(ref(db, "hayShedState"), state).catch((err) => {
		console.error("Error saving state:", err);
	});
	cacheHayShedState(state);
}

onValue(
	ref(db, "hayShedState"),
	(snapshot) => {
		const state = snapshot.val();
		if (!state) return;

		try {
			hasRemoteState = true;
			applyAppState(state);
			cacheHayShedState(state).then(() => {
				cacheSavedAt = Date.now();
				updateSyncBanner();
			});
		} catch (e) {
			console.error("Error syncing state:", e);
		}
	},
	(err) => {
		console.error("Firebase read error:", err);
		updateSyncBanner();
	},
);

function setInventoryControlsOpen(open) {
	const controls = document.getElementById("inventoryControls");
	const toggleBtn = document.getElementById("toggleControls");
	if (!controls || !toggleBtn) return;

	if (open) {
		const shedsBtn = document.querySelector('.tabs__btn[data-tab="Sheds"]');
		if (shedsBtn && !shedsBtn.classList.contains("tabs__btn--active")) {
			setActiveTab("Sheds", shedsBtn);
		}
	}

	controls.hidden = !open;
	controls.classList.toggle("inventory__form--hidden", !open);
	toggleBtn.classList.toggle("inventory-settings--active", open);
	toggleBtn.setAttribute("aria-pressed", open ? "true" : "false");
	const label = open ? "Close inventory management" : "Manage inventory";
	toggleBtn.setAttribute("aria-label", label);
	toggleBtn.title = label;
}

function setEditMode(enabled, person = null) {
	isEditMode = enabled;
	currentPerson = person;
	document.body.classList.toggle("page--view-only", !enabled);

	const toggleBtn = document.getElementById("toggleControls");
	if (toggleBtn) toggleBtn.hidden = !enabled;

	if (!enabled) setInventoryControlsOpen(false);

	document.querySelectorAll(".hay-stack").forEach((stack) => makeStackDraggable(stack));
	updateStackInteractionState();
}

async function restoreAppStateToFirebase(state) {
	await set(ref(db, "hayShedState"), state);
	await cacheHayShedState(state);
	hasRemoteState = true;
	cacheSavedAt = Date.now();
	applyAppState(state);
	updateSyncBanner();
}

function handleAuthChange(authenticated, person, email = null) {
	setEditMode(authenticated, person);
	updateAuthUI(authenticated, person);
	syncAdminBackupUI(authenticated, email);

	if (authenticated && pendingResetAll) {
		pendingResetAll = false;
		resetAllBays({ confirm: false });
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
		if (isEditMode) {
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

function setActiveLocation(locationId, btn) {
	document.querySelectorAll(".location-tabs__btn[data-location]").forEach((tabBtn) => {
		tabBtn.classList.remove("location-tabs__btn--active");
	});
	btn?.classList.add("location-tabs__btn--active");

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

	if (locationId === "olds") {
		syncAllShedLayoutsAfterPaint();
	}
}

function initLocationTabs() {
	document.querySelectorAll(".location-tabs__btn[data-location]").forEach((btn) => {
		btn.addEventListener("click", () => setActiveLocation(btn.dataset.location, btn));
	});
}

function initTabs() {
	document.querySelectorAll(".tabs__btn").forEach((btn) => {
		btn.addEventListener("click", () => setActiveTab(btn.dataset.tab, btn));
	});

	document.querySelectorAll(".shed-tabs__btn").forEach((btn) => {
		btn.addEventListener("click", () => setActiveShedTab(btn.dataset.subtab, btn));
	});

	document.getElementById("shedSelect")?.addEventListener("change", (e) => {
		updateBaySelectForShed(e.target.value);
		const tabBtn = document.querySelector(`.shed-tabs__btn[data-subtab="${e.target.value}-shed-tab"]`);
		if (tabBtn) setActiveShedTab(`${e.target.value}-shed-tab`, tabBtn);
	});

	initEmptyBaySelect();
	updateBaySelectForShed(document.getElementById("shedSelect")?.value || "west");
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

function updateBaySelectForShed(shed, selectedBay = null) {
	const select = document.getElementById("baySelect");
	if (!select) return;

	for (let index = 0; index < BAY_COUNT; index++) {
		const option = select.options[index];
		if (!option) continue;
		option.value = String(index);
		option.textContent = `Bay ${getBayDisplayNumber(shed, index)}`;
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

function initInventoryForm() {
	document.getElementById("submitHay")?.addEventListener("click", handleHay);

	bindContractInput(document.getElementById("contractNumber"));

	bindDigitsOnlyInput(document.getElementById("baleCount"), {
		maxDigits: 4,
		minValue: 1,
	});

	bindStackCommentInput(document.getElementById("stackComment"));

	document.getElementById("hayType")?.addEventListener("change", (e) => {
		syncGradeFieldVisibility(e.target.value);
	});

	syncGradeFieldVisibility("");

	document.getElementById("actionSelect")?.addEventListener("change", syncInventoryActionFields);
	syncInventoryActionFields();

	const toggleBtn = document.getElementById("toggleControls");
	const controls = document.getElementById("inventoryControls");
	toggleBtn?.addEventListener("click", () => {
		if (!isEditMode) return;
		setInventoryControlsOpen(controls.hidden);
	});
	setInventoryControlsOpen(false);
}

window.resetAllBays = resetAllBays;

window.addEventListener("load", async () => {
	initGrabToScroll();
	initAuthUI();
	initLocationTabs();
	initTabs();
	initReports();
	initInventoryForm();
	initLogFilters();
	initSyncStatus();
	await initLocalCache();
	document.querySelectorAll(".hay-stack").forEach((stack) => bindStackSelect(stack));
	updateStackInteractionState();
	syncAllShedLayoutsAfterPaint();
	updateSyncBanner();
});

let resizeTimer;
window.addEventListener("resize", () => {
	clearTimeout(resizeTimer);
	resizeTimer = setTimeout(() => syncAllShedLayouts(), 150);
});
