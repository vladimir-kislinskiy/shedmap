import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";
import { initAuth, login, logout } from "./auth.js";

const firebaseConfig = {
	apiKey: "AIzaSyAUqIkZ2dvmKSBzuZH6yfaGfhDCmjalOSQ",
	authDomain: "hayshed-f65b3.firebaseapp.com",
	projectId: "hayshed-f65b3",
	storageBucket: "hayshed-f65b3.firebasestorage.app",
	messagingSenderId: "1007336867353",
	appId: "1:1007336867353:web:a092aa900b3aa6f32a8c88"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = initAuth(app, handleAuthChange);

const MAX_BALES_PER_ROW = 2000;
const changeLog = [];
let draggedStackSourceColId = null;
let isEditMode = false;
let currentPerson = null;

// Generate rows dynamically
function populateRows() {
	const rowSelect = document.getElementById("rowSelect");
	for (let i = 0; i < 10; i++) {
		const option = document.createElement("option");
		option.value = i;
		option.textContent = `Row ${i + 1}`;
		rowSelect.appendChild(option);
	}

	["north", "west", "east"].forEach((shed) => {
		const shedCols = document.getElementById(`${shed}-cols`);
		if (!shedCols) return;
		for (let i = 0; i < 10; i++) {
			const wrapper = document.createElement("div");
			wrapper.className = "shed-column-wrapper";

			const label = document.createElement("div");
			label.className = "shed-column-label";
			label.textContent = `Row ${i + 1}`;
			wrapper.appendChild(label);

			const col = document.createElement("div");
			col.className = "shed-column";
			col.id = `${shed}-col-${i}`;
			wrapper.appendChild(col);
			makeColumnDroppable(col);

			const stats = document.createElement("div");
			stats.className = "shed-column-stats";
			stats.innerHTML = `<div class="stats-total"><span class="val">0</span> / ${MAX_BALES_PER_ROW}</div>`;
			wrapper.appendChild(stats);

			shedCols.appendChild(wrapper);
		}
	});
}

// Tab functionality
function openTab(tabName, btn) {
	const tabcontent = document.getElementsByClassName("tabcontent");
	for (let i = 0; i < tabcontent.length; i++) {
		tabcontent[i].style.display = "none";
	}
	const tablinks = document.getElementsByClassName("tablinks");
	for (let i = 0; i < tablinks.length; i++) {
		tablinks[i].classList.remove("active");
	}
	document.getElementById(tabName).style.display = "block";
	btn.classList.add("active");
}

function openSubTab(tabName, btn) {
	const tabcontent = document.getElementsByClassName("sub-tabcontent");
	for (let i = 0; i < tabcontent.length; i++) {
		tabcontent[i].style.display = "none";
	}
	const tablinks = document.getElementsByClassName("sub-tablinks");
	for (let i = 0; i < tablinks.length; i++) {
		tablinks[i].classList.remove("active");
	}
	document.getElementById(tabName).style.display = "block";
	btn.classList.add("active");

	const select = document.getElementById("shedSelect");
	if(select) {
		const val = tabName.replace("-shed-tab", "");
		select.value = val;
	}
}

function initGrabToScroll() {
	const scrollContainers = document.querySelectorAll('.shed-columns');
	
	scrollContainers.forEach(slider => {
		let isDown = false;
		let startX;
		let scrollLeft;

		slider.addEventListener('mousedown', (e) => {
			isDown = true;
			slider.classList.add('active');
			startX = e.pageX - slider.offsetLeft;
			scrollLeft = slider.scrollLeft;
		});

		slider.addEventListener('mouseleave', () => {
			isDown = false;
			slider.classList.remove('active');
		});

		slider.addEventListener('mouseup', () => {
			isDown = false;
			slider.classList.remove('active');
		});

		slider.addEventListener('mousemove', (e) => {
			if(!isDown) return;
			e.preventDefault();
			const x = e.pageX - slider.offsetLeft;
			const walk = (x - startX) * 2; // scroll-fast
			slider.scrollLeft = scrollLeft - walk;
		});
	});
}

// Handle hay add/remove
function handleHay() {
	if (!isEditMode || !currentPerson) return;

	const type = document.getElementById("hayType").value;
	const contract = document.getElementById("contractNumber").value.trim();
	const baleCount = parseInt(document.getElementById("baleCount").value);
	const shed = document.getElementById("shedSelect").value;
	const row = document.getElementById("rowSelect").value;
	const action = document.getElementById("actionSelect").value;
	const person = currentPerson;

	const contractPattern = /^\d{2}-\d{4}$/;
	if (!contractPattern.test(contract)) {
		alert("Contract number must be in format: 25-6651");
		return;
	}

	if (!baleCount) {
		alert("Please fill in all fields.");
		return;
	}

	const colEl = document.getElementById(`${shed}-col-${row}`);
	const stackKey = `${type}-${contract}`;
	let existingStack = null;
	let totalBales = 0;

	if (action === "add") {
		const allStacks = document.querySelectorAll(".hay-stack");
		for (const stack of allStacks) {
			const parts = stack.dataset.stackKey.split("-");
			const stackType = parts[0];
			const stackContract = parts.slice(1).join("-");
			if (stackContract === contract && stackType !== type) {
				alert(`Contract #${contract} is already registered as ${capitalize(stackType)}. You cannot add it as ${capitalize(type)}.`);
				return;
			}
		}

		for (const child of colEl.children) {
			if (child.classList.contains("hay-stack")) {
				totalBales += parseInt(child.dataset.bales);
				if (child.dataset.stackKey === stackKey) {
					existingStack = child;
				}
			}
		}

		if (totalBales + baleCount > MAX_BALES_PER_ROW) {
			alert(`Cannot add more than ${MAX_BALES_PER_ROW} bales in this row.`);
			return;
		}

		if (existingStack) {
			const current = parseInt(existingStack.dataset.bales);
			const newCount = current + baleCount;
			existingStack.dataset.bales = newCount;
			updateStackHeight(existingStack, newCount);
			existingStack.querySelector(".desc").innerHTML = `<span>${capitalize(type)}</span><br><span>${contract}</span>`;
			existingStack.querySelector(".bale-count").innerText = newCount;
		} else {
			const div = document.createElement("div");
			div.className = `hay-stack ${type}`;
			div.dataset.stackKey = stackKey;
			div.dataset.bales = baleCount;

			const desc = document.createElement("div");
			desc.className = "desc";
			desc.innerHTML = `<span>${capitalize(type)}</span><br><span>${contract}</span>`;
			div.appendChild(desc);

			const baleDiv = document.createElement("div");
			baleDiv.className = "bale-count";
			baleDiv.innerText = baleCount;
			div.appendChild(baleDiv);

			updateStackHeight(div, baleCount);
			colEl.appendChild(div);
			makeStackDraggable(div);
		}

		logChange(
			person,
			"Add",
			type,
			contract,
			parseInt(row) + 1,
			shed,
			baleCount,
		);
	}

	if (action === "remove") {
		let foundStack = null;
		for (const child of colEl.children) {
			if (child.classList.contains("hay-stack")) {
				const parts = (child.dataset.stackKey || "").split("-");
				const childType = parts[0];
				const childContract = parts.slice(1).join("-");
				if (childContract === contract) {
					foundStack = child;
					break;
				}
			}
		}

		if (foundStack) {
			const current = parseInt(foundStack.dataset.bales);
			const newCount = current - baleCount;
			if (newCount < 0) {
				alert("Cannot remove more bales than are in the stack.");
				return;
			}
			if (newCount === 0) {
				foundStack.remove();
			} else {
				foundStack.dataset.bales = newCount;
				updateStackHeight(foundStack, newCount);
				foundStack.querySelector(".bale-count").innerText = newCount;
			}

			const parts = foundStack.dataset.stackKey.split("-");
			const foundType = parts[0];
			logChange(
				person,
				"Remove",
				foundType, // Use the actual type of the stack found, not what's in dropdown
				contract,
				parseInt(row) + 1,
				shed,
				baleCount,
			);
		} else {
			alert(
				"Please double-check the contract number you are trying to remove.",
			);
			return;
		}
	}

	updateRowStats(colEl);
	saveState();

	document.getElementById("contractNumber").value = "";
	document.getElementById("baleCount").value = "";
}

function updateRowStats(colEl) {
	if (!colEl) return;
	const wrapper = colEl.parentElement;
	if (!wrapper || !wrapper.classList.contains("shed-column-wrapper")) return;
	
	const statsDiv = wrapper.querySelector(".shed-column-stats");
	if (!statsDiv) return;

	let total = 0;

	for (const child of colEl.children) {
		if (child.classList.contains("hay-stack")) {
			total += parseInt(child.dataset.bales) || 0;
		}
	}

	const totalEl = statsDiv.querySelector(".stats-total .val");
	if (totalEl) totalEl.textContent = total;
}

function updateStackHeight(stackEl, baleCount) {
	const percent = (baleCount / MAX_BALES_PER_ROW) * 100;
	stackEl.style.height = `${percent}%`;
}

function logChange(person, action, type, contract, row, shed, bales) {
	const d = new Date();
	const date = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
	const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
	const now = `${date}, ${time}`;
	const entry = {
		dateTime: now,
		person,
		action,
		type: capitalize(type),
		contract,
		row,
		shed: capitalize(shed),
		bales,
	};
	changeLog.push(entry);
	updateLogTable();
}

function updateLogTable() {
	const logBody = document.getElementById("logBody");
	if (!logBody) return;
	logBody.innerHTML = "";
	for (let i = changeLog.length - 1; i >= 0; i--) {
		const entry = changeLog[i];
		const tr = document.createElement("tr");
		tr.innerHTML = `
            <td>${entry.dateTime}</td>
            <td>${entry.person}</td>
            <td>${entry.action}</td>
            <td>${entry.type}</td>
            <td>${entry.contract}</td>
            <td>${entry.row}</td>
            <td>${entry.shed}</td>
            <td>${entry.bales}</td>
        `;
		logBody.appendChild(tr);
	}
}

// Make columns droppable
function makeColumnDroppable(colEl) {
	colEl.addEventListener("dragover", (e) => {
		if (!isEditMode || draggedStackSourceColId !== colEl.id) return;
		e.preventDefault();
		colEl.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
	});

	colEl.addEventListener("dragleave", () => {
		colEl.style.backgroundColor = "";
	});

	colEl.addEventListener("drop", (e) => {
		if (!isEditMode || draggedStackSourceColId !== colEl.id) return;
		e.preventDefault();
		colEl.style.backgroundColor = "";
		const droppedStackKey = e.dataTransfer.getData("text");
		const droppedStack = document.querySelector(
			`[data-stack-key="${droppedStackKey}"]`,
		);

		if (!droppedStack) return;

		const sourceCol = droppedStack.parentElement;
		
		if (colEl !== sourceCol) {
			colEl.appendChild(droppedStack);
			updateRowStats(sourceCol);
			updateRowStats(colEl);
			saveState();
		}
	});
}

function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

function saveState() {
	if (!isEditMode) return;

	const state = {
		changeLog: changeLog,
		sheds: {}
	};

	["north", "west", "east"].forEach((shed) => {
		const colsData = {};
		for (let i = 0; i < 10; i++) {
			const colId = `${shed}-col-${i}`;
			const colEl = document.getElementById(colId);
			if (colEl) {
				const stacks = [];
				for (const child of colEl.children) {
					if (child.classList.contains("hay-stack")) {
						stacks.push({
							type: Array.from(child.classList).find(c => c !== "hay-stack"),
							stackKey: child.dataset.stackKey,
							bales: child.dataset.bales,
							desc: child.querySelector(".desc").innerHTML // Save innerHTML for new format
						});
					}
				}
				colsData[colId] = stacks;
			}
		}
		state.sheds[shed] = colsData;
	});

	set(ref(db, "hayShedState"), state).catch(err => console.error("Error saving state:", err));
}

// Replaces the old loadState with real-time sync
onValue(ref(db, "hayShedState"), (snapshot) => {
	const state = snapshot.val();
	if (!state) return;
	
	try {
		if (state.changeLog && Array.isArray(state.changeLog)) {
			changeLog.length = 0;
			changeLog.push(...state.changeLog);
			updateLogTable();
		}

		if (state.sheds) {
			["north", "west", "east"].forEach((shed) => {
				if (!state.sheds[shed]) return;
				for (let i = 0; i < 10; i++) {
					const colId = `${shed}-col-${i}`;
					const colEl = document.getElementById(colId);
					const savedStacks = state.sheds[shed][colId];
					
					if (colEl) {
						// Clean existing stacks before rendering server state
						Array.from(colEl.children).forEach(child => {
							if (child.classList.contains("hay-stack")) child.remove();
						});

						if (savedStacks && Array.isArray(savedStacks)) {
							savedStacks.forEach(stackData => {
								const div = document.createElement("div");
								div.className = `hay-stack ${stackData.type}`;
								div.dataset.stackKey = stackData.stackKey;
								div.dataset.bales = stackData.bales;

								const desc = document.createElement("div");
								desc.className = "desc";
								// If saved as a string like "Alfalfa (25-1111)", parse it or use structured data if available
								const parts = stackData.desc ? stackData.desc.match(/^([A-Za-z]+)\s*\((.+)\)$/) || [] : [];
								if (parts.length === 3) {
									const typeVal = parts[1];
									const contractVal = parts[2];
									desc.innerHTML = `<span>${typeVal}</span><br><span>${contractVal}</span>`;
								} else {
									// Fallback if the format is different or already new format
									desc.innerHTML = stackData.desc.includes('<br>') ? stackData.desc.replace('<br>Contract #<br>', '<br>') : stackData.desc.replace(' (', '<br>').replace(')', '');
								}
								div.appendChild(desc);

								const baleDiv = document.createElement("div");
								baleDiv.className = "bale-count";
								baleDiv.innerText = stackData.bales;
								div.appendChild(baleDiv);

								updateStackHeight(div, parseInt(stackData.bales));
								colEl.appendChild(div);
								makeStackDraggable(div);
							});
						}
						updateRowStats(colEl);
					}
				}
			});
		}
	} catch (e) {
		console.error("Error syncing state:", e);
	}
});

// Make stacks draggable
function makeStackDraggable(stackEl) {
	if (stackEl._dragBound) {
		stackEl.setAttribute("draggable", isEditMode ? "true" : "false");
		return;
	}
	stackEl._dragBound = true;
	stackEl.setAttribute("draggable", isEditMode ? "true" : "false");

	stackEl.addEventListener("dragstart", (e) => {
		if (!isEditMode) {
			e.preventDefault();
			return;
		}
		draggedStackSourceColId = stackEl.parentElement.id;
		e.dataTransfer.setData("text", stackEl.dataset.stackKey);
	});

	stackEl.addEventListener("dragend", () => {
		draggedStackSourceColId = null;
	});

	stackEl.addEventListener("dragover", (e) => {
		if (!isEditMode || draggedStackSourceColId !== stackEl.parentElement.id) return;
		e.preventDefault();
		stackEl.style.border = "3px solid #ff4444";
	});

	stackEl.addEventListener("dragleave", () => {
		stackEl.style.border = "none";
	});

	stackEl.addEventListener("drop", (e) => {
		if (!isEditMode || draggedStackSourceColId !== stackEl.parentElement.id) return;
		e.preventDefault();
		const droppedStackKey = e.dataTransfer.getData("text");
		const colEl = stackEl.parentElement;
		
		// Find within current column
		const droppedStack = colEl.querySelector(`[data-stack-key="${droppedStackKey}"]`);
		if (!droppedStack) return;

		const sourceCol = droppedStack.parentElement;
		
		if (colEl === sourceCol) {
			const stacks = Array.from(colEl.children);
			const targetIndex = stacks.indexOf(stackEl);
			const droppedIndex = stacks.indexOf(droppedStack);

			if (targetIndex !== droppedIndex) {
				const temp = stacks[targetIndex];
				stacks[targetIndex] = stacks[droppedIndex];
				stacks[droppedIndex] = temp;
				stacks.forEach((stack) => colEl.appendChild(stack));
			}
		} 

		updateRowStats(colEl);
		stackEl.style.border = "none";
		saveState();
	});
}

function setEditMode(enabled, person = null) {
	isEditMode = enabled;
	currentPerson = person;
	document.body.classList.toggle("view-only", !enabled);

	const toggleWrapper = document.querySelector(".controls-toggle-wrapper");
	if (toggleWrapper) {
		toggleWrapper.hidden = !enabled;
	}

	if (!enabled) {
		const controls = document.getElementById("inventoryControls");
		const toggleBtn = document.getElementById("toggleControls");
		if (controls) {
			controls.classList.add("hidden");
			controls.hidden = true;
		}
		if (toggleBtn) {
			toggleBtn.classList.remove("active");
			const label = toggleBtn.querySelector("span");
			if (label) label.textContent = "Manage Inventory";
		}
	}

	document.querySelectorAll(".hay-stack").forEach((stack) => makeStackDraggable(stack));
}

function handleAuthChange(authenticated, person) {
	setEditMode(authenticated, person);
	updateAuthUI(authenticated, person);
}

function updateAuthUI(authenticated, person) {
	const viewOnlyBadge = document.getElementById("viewOnlyBadge");
	const authUserName = document.getElementById("authUserName");
	const authBtn = document.getElementById("authBtn");

	if (!viewOnlyBadge || !authUserName || !authBtn) return;

	if (authenticated && person) {
		viewOnlyBadge.hidden = true;
		authUserName.hidden = false;
		authUserName.textContent = `Signed in as ${person}`;
		authBtn.textContent = "Sign Out";
		authBtn.classList.add("auth-bar__btn--out");
		closeAuthModal();
	} else {
		viewOnlyBadge.hidden = false;
		authUserName.hidden = true;
		authUserName.textContent = "";
		authBtn.textContent = "Sign In";
		authBtn.classList.remove("auth-bar__btn--out");
	}
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
	document.getElementById("authPassword")?.focus();
}

function closeAuthModal() {
	const modal = document.getElementById("authModal");
	if (!modal) return;
	modal.classList.remove("auth-modal--open");
	modal.setAttribute("aria-hidden", "true");
	document.getElementById("authForm")?.reset();
}

function initAuthUI() {
	const authBtn = document.getElementById("authBtn");
	const authForm = document.getElementById("authForm");
	const authModalClose = document.getElementById("authModalClose");
	const authModalOverlay = document.getElementById("authModalOverlay");

	authBtn?.addEventListener("click", () => {
		if (isEditMode) {
			logout(auth).catch((err) => console.error("Sign out error:", err));
		} else {
			openAuthModal();
		}
	});

	authForm?.addEventListener("submit", async (e) => {
		e.preventDefault();
		const person = document.getElementById("authPerson").value;
		const password = document.getElementById("authPassword").value;
		const errorEl = document.getElementById("authError");

		try {
			await login(auth, person, password);
		} catch (err) {
			if (errorEl) {
				errorEl.hidden = false;
				errorEl.textContent = "Invalid credentials. Please try again.";
			}
			console.error("Sign in error:", err);
		}
	});

	authModalClose?.addEventListener("click", closeAuthModal);
	authModalOverlay?.addEventListener("click", closeAuthModal);

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") closeAuthModal();
	});
}

// Initialize on load
window.addEventListener("load", () => {
	populateRows();
	initGrabToScroll();
	initAuthUI();

	document.querySelectorAll(".tablinks").forEach((btn) => {
		btn.addEventListener("click", (e) => openTab(btn.dataset.tab, btn));
	});

	document.querySelectorAll(".sub-tablinks").forEach((btn) => {
		btn.addEventListener("click", (e) => openSubTab(btn.dataset.subtab, btn));
	});

	document.getElementById("shedSelect").addEventListener("change", (e) => {
		const val = e.target.value;
		const tabBtn = document.querySelector(`.sub-tablinks[data-subtab="${val}-shed-tab"]`);
		if(tabBtn) {
			openSubTab(`${val}-shed-tab`, tabBtn);
		}
	});

	document.getElementById("submitHay").addEventListener("click", handleHay);

	const contractInput = document.getElementById("contractNumber");
	contractInput.addEventListener("input", function (e) {
		let val = e.target.value.replace(/\D/g, "");
		if (val.length > 2) {
			val = val.substring(0, 2) + "-" + val.substring(2, 6);
		}
		e.target.value = val;
	});

	const baleInput = document.getElementById("baleCount");
	baleInput.addEventListener("input", function (e) {
		if (e.target.value.length > 4) {
			e.target.value = e.target.value.slice(0, 4);
		}
	});

	// Toggle controls
	const toggleBtn = document.getElementById("toggleControls");
	const controls = document.getElementById("inventoryControls");
	if (toggleBtn && controls) {
		toggleBtn.addEventListener("click", () => {
			if (!isEditMode) return;

			const isHidden = controls.classList.contains("hidden");
			if (isHidden) {
				controls.classList.remove("hidden");
				controls.hidden = false;
				toggleBtn.classList.add("active");
				toggleBtn.querySelector("span").innerText = "Close Management";
			} else {
				controls.classList.add("hidden");
				controls.hidden = true;
				toggleBtn.classList.remove("active");
				toggleBtn.querySelector("span").innerText = "Manage Inventory";
			}
		});

		// Set initial state
		controls.classList.add("hidden");
		controls.hidden = true;
	}
});
