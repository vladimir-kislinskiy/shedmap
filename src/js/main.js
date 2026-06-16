import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";
import { initAuth, login, logout } from "./auth.js";
import { bindStackDrag, setStacksDraggable } from "./drag-drop.js";
import {
	capitalize,
	createHayStack,
	createLogRow,
	findStackInContainer,
	formatIsleLabel,
	getBayStacks,
	getIsleContainer,
	getIsleMaxBales,
	getStackType,
	restoreHayStack,
	sumBalesInContainer,
	syncAllShedLayouts,
	updateHayStack,
} from "./dom.js";

const firebaseConfig = {
	apiKey: "AIzaSyAUqIkZ2dvmKSBzuZH6yfaGfhDCmjalOSQ",
	authDomain: "hayshed-f65b3.firebaseapp.com",
	projectId: "hayshed-f65b3",
	storageBucket: "hayshed-f65b3.firebasestorage.app",
	messagingSenderId: "1007336867353",
	appId: "1:1007336867353:web:a092aa900b3aa6f32a8c88",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = initAuth(app, handleAuthChange);

const MAX_BALES_PER_BAY = 2000;
const MAX_BALES_PER_ISLE = 1000;
const SHEDS = ["north", "west", "east"];
const BAY_COUNT = 10;

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

function setActiveTab(panelId, btn) {
	document.querySelectorAll(".tabs__panel").forEach((panel) => {
		panel.classList.remove("tabs__panel--active");
	});
	document.querySelectorAll(".tabs__btn").forEach((tabBtn) => {
		tabBtn.classList.remove("tabs__btn--active");
	});
	document.getElementById(panelId)?.classList.add("tabs__panel--active");
	btn?.classList.add("tabs__btn--active");
}

function setActiveShedTab(panelId, btn) {
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
		shedSelect.value = panelId.replace("-shed-tab", "");
	}
}

function initGrabToScroll() {
	document.querySelectorAll(".shed__columns").forEach((slider) => {
		let isDown = false;
		let startX;
		let scrollLeft;
		let activePointerId = null;

		const shouldSkip = (e) =>
			e.target.closest(".hay-stack") ||
			document.body.classList.contains("page--dragging");

		slider.addEventListener("pointerdown", (e) => {
			if (shouldSkip(e)) return;
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
			if (!isDown || e.pointerId !== activePointerId) return;
			e.preventDefault();
			const x = e.pageX - slider.offsetLeft;
			slider.scrollLeft = scrollLeft - (x - startX) * 2;
		});
	});
}

function getBayColumn(shed, bay) {
	return document.getElementById(`${shed}-col-${bay}`);
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

function fillFormFromStack(stackEl) {
	const bayStack = stackEl.closest(".shed__bay-stack");
	if (!bayStack) return;

	const type = getStackType(stackEl);
	const parts = (stackEl.dataset.stackKey || "").split("-");
	const contract = parts.slice(1).join("-");
	const bales = stackEl.dataset.bales || "";
	const isle = stackEl.dataset.isle || "both";
	const shed = bayStack.dataset.shed;
	const bay = bayStack.dataset.bay;

	document.getElementById("hayType").value = type;
	document.getElementById("contractNumber").value = contract;
	document.getElementById("baleCount").value = bales;
	document.getElementById("shedSelect").value = shed;
	document.getElementById("baySelect").value = bay;
	setIsleCheckboxes(isle);

	const tabBtn = document.querySelector(`.shed-tabs__btn[data-subtab="${shed}-shed-tab"]`);
	if (tabBtn) setActiveShedTab(`${shed}-shed-tab`, tabBtn);

	document.querySelectorAll(".hay-stack--selected").forEach((el) => {
		el.classList.remove("hay-stack--selected");
	});
	stackEl.classList.add("hay-stack--selected");

	if (isEditMode) setInventoryControlsOpen(true);
}

function bindStackSelect(stackEl) {
	if (stackEl._selectBound) return;
	stackEl._selectBound = true;
	stackEl.classList.add("hay-stack--selectable");
	stackEl.addEventListener("click", () => {
		if (stackEl._justDragged) return;
		fillFormFromStack(stackEl);
	});
}

function updateBayStats(bayStackEl) {
	if (!bayStackEl) return;
	const totalEl = bayStackEl.closest(".shed__bay")?.querySelector(".shed__bay-total-val");
	if (!totalEl) return;
	totalEl.textContent = sumBalesInContainer(bayStackEl);
}

function makeStackDraggable(stackEl) {
	bindStackSelect(stackEl);
	bindStackDrag(stackEl, {
		canDrag: () => isEditMode,
		onReorder: ({ stackEl: movedStack, fromIsle, toIsle }) => {
			const bayStack = movedStack.closest(".shed__bay-stack");
			updateBayStats(bayStack);
			syncAllShedLayouts();

			if (isEditMode && currentPerson && bayStack) {
				const type = getStackType(movedStack);
				const parts = (movedStack.dataset.stackKey || "").split("-");
				const contract = parts.slice(1).join("-");
				const bales = parseInt(movedStack.dataset.bales, 10) || 0;
				const shed = bayStack.dataset.shed;
				const bay = parseInt(bayStack.dataset.bay, 10) + 1;
				const typeLabel = capitalize(type);
				const note = fromIsle !== toIsle
					? `${typeLabel} ${contract} (${bales} bales) moved from ${formatIsleLabel(fromIsle)} to ${formatIsleLabel(toIsle)}`
					: `${typeLabel} ${contract} (${bales} bales) reordered in ${formatIsleLabel(toIsle)}`;

				logChange(currentPerson, "Move", type, contract, bay, toIsle, shed, bales, note);
			}

			saveState();
		},
	});
	stackEl.classList.toggle("hay-stack--draggable", isEditMode);
}

function handleHay() {
	if (!isEditMode || !currentPerson) return;

	const type = document.getElementById("hayType").value;
	const contract = document.getElementById("contractNumber").value.trim();
	const baleCount = parseInt(document.getElementById("baleCount").value, 10);
	const shed = document.getElementById("shedSelect").value;
	const bay = document.getElementById("baySelect").value;
	const action = document.getElementById("actionSelect").value;

	if (!/^\d{2}-\d{4}$/.test(contract)) {
		alert("Contract number must be in format: 25-6651");
		return;
	}

	if (!baleCount) {
		alert("Please fill in all fields.");
		return;
	}

	const bayStackEl = getBayColumn(shed, bay);
	if (!bayStackEl) return;

	const stackKey = `${type}-${contract}`;

	if (action === "add") {
		const isle = getSelectedIsle();
		if (!isle) return;

		for (const stack of document.querySelectorAll(".hay-stack")) {
			const parts = stack.dataset.stackKey.split("-");
			const stackContract = parts.slice(1).join("-");
			if (stackContract === contract && parts[0] !== type) {
				alert(`Contract #${contract} is already registered as ${capitalize(parts[0])}. You cannot add it as ${capitalize(type)}.`);
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
		} else {
			const stack = createHayStack(type, contract, baleCount, isle, bayStackEl);
			makeStackDraggable(stack);
		}

		logChange(currentPerson, "Add", type, contract, parseInt(bay, 10) + 1, isle, shed, baleCount);
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

		logChange(currentPerson, "Remove", foundType, contract, parseInt(bay, 10) + 1, foundIsle, shed, baleCount);
	}

	updateBayStats(bayStackEl);
	syncAllShedLayouts();
	saveState();
	document.getElementById("contractNumber").value = "";
	document.getElementById("baleCount").value = "";
}

function logChange(person, action, type, contract, bay, isle, shed, bales, note = "") {
	const d = new Date();
	const date = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
	const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });

	changeLog.push({
		dateTime: `${date}, ${time}`,
		person,
		action,
		type: capitalize(type),
		contract,
		bay,
		isle,
		shed: capitalize(shed),
		bales,
		note,
	});
	updateLogTable();
}

function updateLogTable() {
	const logBody = document.getElementById("logBody");
	if (!logBody) return;

	logBody.replaceChildren();
	for (let i = changeLog.length - 1; i >= 0; i--) {
		const row = createLogRow(changeLog[i]);
		if (row) logBody.appendChild(row);
	}
}

function saveState() {
	if (!isEditMode) return;

	const state = { changeLog, sheds: {} };

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
			}));
		}
		state.sheds[shed] = colsData;
	});

	set(ref(db, "hayShedState"), state).catch((err) => console.error("Error saving state:", err));
}

onValue(ref(db, "hayShedState"), (snapshot) => {
	const state = snapshot.val();
	if (!state) return;

	try {
		if (Array.isArray(state.changeLog)) {
			changeLog.length = 0;
			changeLog.push(...state.changeLog);
			updateLogTable();
		}

		if (state.sheds) {
			SHEDS.forEach((shed) => {
				if (!state.sheds[shed]) return;

				for (let i = 0; i < BAY_COUNT; i++) {
					const colId = `${shed}-col-${i}`;
					const colEl = document.getElementById(colId);
					const savedStacks = state.sheds[shed][colId];
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
			syncAllShedLayouts();
		}
	} catch (e) {
		console.error("Error syncing state:", e);
	}
});

function setInventoryControlsOpen(open) {
	const controls = document.getElementById("inventoryControls");
	const toggleBtn = document.getElementById("toggleControls");
	if (!controls || !toggleBtn) return;

	controls.hidden = !open;
	controls.classList.toggle("inventory__form--hidden", !open);
	toggleBtn.classList.toggle("inventory__toggle--active", open);
	const label = toggleBtn.querySelector(".inventory__toggle-label");
	if (label) label.textContent = open ? "Close Management" : "Manage Inventory";
}

function setEditMode(enabled, person = null) {
	isEditMode = enabled;
	currentPerson = person;
	document.body.classList.toggle("page--view-only", !enabled);

	const toggleWrap = document.getElementById("inventoryToggleWrap");
	if (toggleWrap) toggleWrap.hidden = !enabled;

	if (!enabled) setInventoryControlsOpen(false);

	setStacksDraggable(enabled);
	document.querySelectorAll(".hay-stack").forEach((stack) => makeStackDraggable(stack));
}

function handleAuthChange(authenticated, person) {
	setEditMode(authenticated, person);
	updateAuthUI(authenticated, person);

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
		authUserName.textContent = `Signed in as ${person}`;
		authBtn.textContent = "Sign Out";
		authBtn.classList.add("auth-bar__btn--out");
		closeAuthModal();
	} else {
		authUserName.textContent = "";
		authBtn.textContent = "Sign In";
		authBtn.classList.remove("auth-bar__btn--out");
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

function openAuthModal() {
	const modal = document.getElementById("authModal");
	const errorEl = document.getElementById("authError");
	if (!modal) return;

	modal.classList.add("auth-modal--open");
	modal.setAttribute("aria-hidden", "false");
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
	modal.classList.remove("auth-modal--open");
	modal.setAttribute("aria-hidden", "true");
	clearAuthFields();
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

function initTabs() {
	document.querySelectorAll(".tabs__btn").forEach((btn) => {
		btn.addEventListener("click", () => setActiveTab(btn.dataset.tab, btn));
	});

	document.querySelectorAll(".shed-tabs__btn").forEach((btn) => {
		btn.addEventListener("click", () => setActiveShedTab(btn.dataset.subtab, btn));
	});

	document.getElementById("shedSelect")?.addEventListener("change", (e) => {
		const tabBtn = document.querySelector(`.shed-tabs__btn[data-subtab="${e.target.value}-shed-tab"]`);
		if (tabBtn) setActiveShedTab(`${e.target.value}-shed-tab`, tabBtn);
	});
}

function initInventoryForm() {
	document.getElementById("submitHay")?.addEventListener("click", handleHay);

	document.getElementById("contractNumber")?.addEventListener("input", (e) => {
		let val = e.target.value.replace(/\D/g, "");
		if (val.length > 2) val = `${val.substring(0, 2)}-${val.substring(2, 6)}`;
		e.target.value = val;
	});

	document.getElementById("baleCount")?.addEventListener("input", (e) => {
		if (e.target.value.length > 4) e.target.value = e.target.value.slice(0, 4);
	});

	const toggleBtn = document.getElementById("toggleControls");
	const controls = document.getElementById("inventoryControls");
	toggleBtn?.addEventListener("click", () => {
		if (!isEditMode) return;
		setInventoryControlsOpen(controls.hidden);
	});
	setInventoryControlsOpen(false);
}

window.resetAllBays = resetAllBays;

window.addEventListener("load", () => {
	initGrabToScroll();
	initAuthUI();
	initTabs();
	initInventoryForm();
	document.querySelectorAll(".hay-stack").forEach((stack) => bindStackSelect(stack));
	syncAllShedLayouts();
});

let resizeTimer;
window.addEventListener("resize", () => {
	clearTimeout(resizeTimer);
	resizeTimer = setTimeout(() => syncAllShedLayouts(), 150);
});
