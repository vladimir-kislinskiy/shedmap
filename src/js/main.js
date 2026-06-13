import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";
import { initAuth, login, logout } from "./auth.js";
import { bindStackDrag, setStacksDraggable } from "./drag-drop.js";
import {
	capitalize,
	createHayStack,
	createLogRow,
	getStackType,
	restoreHayStack,
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
const SHEDS = ["north", "west", "east"];
const BAY_COUNT = 10;

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

function updateBayStats(colEl) {
	if (!colEl) return;
	const totalEl = colEl.closest(".shed__bay")?.querySelector(".shed__bay-total-val");
	if (!totalEl) return;

	let total = 0;
	colEl.querySelectorAll(".hay-stack").forEach((stack) => {
		total += parseInt(stack.dataset.bales, 10) || 0;
	});
	totalEl.textContent = total;
}

function makeStackDraggable(stackEl) {
	bindStackDrag(stackEl, {
		canDrag: () => isEditMode,
		onReorder: () => {
			updateBayStats(stackEl.parentElement);
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

	const colEl = getBayColumn(shed, bay);
	if (!colEl) return;

	const stackKey = `${type}-${contract}`;

	if (action === "add") {
		for (const stack of document.querySelectorAll(".hay-stack")) {
			const parts = stack.dataset.stackKey.split("-");
			const stackContract = parts.slice(1).join("-");
			if (stackContract === contract && parts[0] !== type) {
				alert(`Contract #${contract} is already registered as ${capitalize(parts[0])}. You cannot add it as ${capitalize(type)}.`);
				return;
			}
		}

		let totalBales = 0;
		let existingStack = null;
		colEl.querySelectorAll(".hay-stack").forEach((stack) => {
			totalBales += parseInt(stack.dataset.bales, 10) || 0;
			if (stack.dataset.stackKey === stackKey) existingStack = stack;
		});

		if (totalBales + baleCount > MAX_BALES_PER_BAY) {
			alert(`Cannot add more than ${MAX_BALES_PER_BAY} bales in this bay.`);
			return;
		}

		if (existingStack) {
			const newCount = parseInt(existingStack.dataset.bales, 10) + baleCount;
			updateHayStack(existingStack, type, contract, newCount, MAX_BALES_PER_BAY);
		} else {
			const stack = createHayStack(type, contract, baleCount, MAX_BALES_PER_BAY);
			colEl.appendChild(stack);
			makeStackDraggable(stack);
		}

		logChange(currentPerson, "Add", type, contract, parseInt(bay, 10) + 1, shed, baleCount);
	}

	if (action === "remove") {
		let foundStack = null;
		colEl.querySelectorAll(".hay-stack").forEach((stack) => {
			const contractPart = (stack.dataset.stackKey || "").split("-").slice(1).join("-");
			if (contractPart === contract) foundStack = stack;
		});

		if (!foundStack) {
			alert("Please double-check the contract number you are trying to remove.");
			return;
		}

		const foundType = getStackType(foundStack);
		const newCount = parseInt(foundStack.dataset.bales, 10) - baleCount;

		if (newCount < 0) {
			alert("Cannot remove more bales than are in the stack.");
			return;
		}

		if (newCount === 0) {
			foundStack.remove();
		} else {
			updateHayStack(foundStack, foundType, contract, newCount, MAX_BALES_PER_BAY);
		}

		logChange(currentPerson, "Remove", foundType, contract, parseInt(bay, 10) + 1, shed, baleCount);
	}

	updateBayStats(colEl);
	saveState();
	document.getElementById("contractNumber").value = "";
	document.getElementById("baleCount").value = "";
}

function logChange(person, action, type, contract, bay, shed, bales) {
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
		shed: capitalize(shed),
		bales,
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

			colsData[colId] = Array.from(colEl.querySelectorAll(".hay-stack")).map((stack) => ({
				type: getStackType(stack),
				stackKey: stack.dataset.stackKey,
				bales: stack.dataset.bales,
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
							const stack = restoreHayStack(stackData, MAX_BALES_PER_BAY);
							if (stack) {
								colEl.appendChild(stack);
								makeStackDraggable(stack);
							}
						});
					}

					updateBayStats(colEl);
				}
			});
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
	if (email) {
		email.value = "";
		email.readOnly = true;
	}
	if (password) {
		password.value = "";
		password.readOnly = true;
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

window.addEventListener("load", () => {
	initGrabToScroll();
	initAuthUI();
	initTabs();
	initInventoryForm();
});
