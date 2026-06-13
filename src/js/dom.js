export function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

export function getIsleMaxBales(isle) {
	return isle === "both" ? 2000 : 1000;
}

const LAYOUT = {
	stackGap: 6,
	stackPadding: 12,
	bayChrome: 60,
	minStack: 44,
};

export function getBaseColumnHeight() {
	return window.matchMedia("(max-width: 768px)").matches ? 320 : 380;
}

function getBaseStackAreaHeight() {
	return getBaseColumnHeight() - LAYOUT.bayChrome;
}

export function getStackHeightPx(baleCount, maxBales) {
	const proportional = (baleCount / maxBales) * getBaseStackAreaHeight();
	return Math.max(LAYOUT.minStack, Math.round(proportional));
}

function getDirectStacks(container) {
	if (!container) return [];
	return [...container.children].filter((el) => el.classList.contains("hay-stack"));
}

function getContainerMaxBales(container) {
	if (!container) return 2000;
	if (container.classList.contains("shed__isle")) return 1000;
	return 2000;
}

function computeContainerStackHeight(container) {
	const stacks = getDirectStacks(container);
	if (!stacks.length) return 0;

	const totalBales = stacks.reduce((sum, s) => sum + (parseInt(s.dataset.bales, 10) || 0), 0);
	if (!totalBales) return 0;

	const maxBales = getContainerMaxBales(container);
	const baseHeight = getBaseStackAreaHeight();
	const gaps = (stacks.length - 1) * LAYOUT.stackGap;
	const proportionalHeight = (totalBales / maxBales) * baseHeight;
	const minRequired = stacks.length * LAYOUT.minStack + gaps;

	return Math.max(proportionalHeight, minRequired);
}

function distributeContainerStackHeights(container) {
	const stacks = getDirectStacks(container);
	if (!stacks.length) return 0;

	const totalBales = stacks.reduce((sum, s) => sum + (parseInt(s.dataset.bales, 10) || 0), 0);
	if (!totalBales) return 0;

	const containerHeight = computeContainerStackHeight(container);
	const gaps = (stacks.length - 1) * LAYOUT.stackGap;
	const usable = containerHeight - gaps;

	stacks.forEach((stack) => {
		const bales = parseInt(stack.dataset.bales, 10) || 0;
		const px = Math.max(LAYOUT.minStack, Math.round((bales / totalBales) * usable));
		stack.style.setProperty("--stack-height", `${px}px`);
	});

	return containerHeight;
}

function sumStacksHeight(stacks) {
	if (!stacks.length) return 0;
	const container = stacks[0].parentElement;
	return computeContainerStackHeight(container);
}

export function measureBayStackContent(bayStackEl) {
	if (!bayStackEl) return 0;

	const fullStacks = getDirectStacks(bayStackEl);
	const isle1Stacks = getDirectStacks(bayStackEl.querySelector(".shed__isle--1"));
	const isle2Stacks = getDirectStacks(bayStackEl.querySelector(".shed__isle--2"));

	const fullHeight = sumStacksHeight(fullStacks);
	const islesHeight = Math.max(sumStacksHeight(isle1Stacks), sumStacksHeight(isle2Stacks));

	if (!fullHeight && !islesHeight) return 0;

	let total = fullHeight + islesHeight;
	if (fullHeight && islesHeight) total += LAYOUT.stackGap;
	return total + LAYOUT.stackPadding;
}

function measureBayColumnHeight(bayEl) {
	const baseHeight = getBaseColumnHeight();
	const stackContent = measureBayStackContent(bayEl.querySelector(".shed__bay-stack"));
	if (!stackContent) return baseHeight;
	return Math.max(baseHeight, stackContent + LAYOUT.bayChrome);
}

export function refreshAllStackHeights() {
	document.querySelectorAll(".shed__bay-stack").forEach((bayStack) => {
		distributeContainerStackHeights(bayStack);
		distributeContainerStackHeights(bayStack.querySelector(".shed__isle--1"));
		distributeContainerStackHeights(bayStack.querySelector(".shed__isle--2"));
	});
}

export function syncAllShedLayouts() {
	refreshAllStackHeights();

	let maxHeight = getBaseColumnHeight();

	document.querySelectorAll(".shed__bay").forEach((bay) => {
		maxHeight = Math.max(maxHeight, measureBayColumnHeight(bay));
	});

	document.querySelectorAll(".shed__columns").forEach((columns) => {
		columns.style.height = `${maxHeight}px`;
	});
}

export function setStackHeight(stackEl, baleCount, maxBales) {
	const px = getStackHeightPx(baleCount, maxBales);
	stackEl.style.setProperty("--stack-height", `${px}px`);
}

export function applyIsleLayout(stackEl, isle, bayStackEl) {
	stackEl.dataset.isle = isle;
	stackEl.classList.remove("hay-stack--full", "hay-stack--isle-1", "hay-stack--isle-2");

	if (isle === "both") {
		stackEl.classList.add("hay-stack--full");
		const islesRow = bayStackEl.querySelector(".shed__isles");
		bayStackEl.insertBefore(stackEl, islesRow);
		return;
	}

	stackEl.classList.add(`hay-stack--isle-${isle}`);
	const isleEl = bayStackEl.querySelector(`.shed__isle--${isle}`);
	isleEl?.appendChild(stackEl);
}

export function placeStackInContainer(stackEl, container, beforeStack, clientY) {
	if (!container) return false;

	if (beforeStack && beforeStack !== stackEl && beforeStack.parentElement === container) {
		const rect = beforeStack.getBoundingClientRect();
		const insertBefore = clientY < rect.top + rect.height / 2;
		if (insertBefore) {
			container.insertBefore(stackEl, beforeStack);
		} else {
			beforeStack.after(stackEl);
		}
		return true;
	}

	container.appendChild(stackEl);
	return true;
}

export function createHayStack(type, contract, baleCount, isle, bayStackEl) {
	const tpl = document.getElementById("hayStackTemplate");
	if (!tpl || !bayStackEl) return null;

	const stack = tpl.content.firstElementChild.cloneNode(true);
	stack.classList.add(`hay-stack--${type}`);
	stack.dataset.stackKey = `${type}-${contract}`;
	stack.dataset.bales = String(baleCount);
	stack.querySelector(".hay-stack__type").textContent = capitalize(type);
	stack.querySelector(".hay-stack__contract").textContent = contract;
	stack.querySelector(".hay-stack__count").textContent = baleCount;
	setStackHeight(stack, baleCount, getIsleMaxBales(isle));
	applyIsleLayout(stack, isle, bayStackEl);
	return stack;
}

export function updateHayStack(stackEl, type, contract, baleCount) {
	const isle = stackEl.dataset.isle || "both";
	stackEl.dataset.bales = String(baleCount);
	stackEl.querySelector(".hay-stack__type").textContent = capitalize(type);
	stackEl.querySelector(".hay-stack__contract").textContent = contract;
	stackEl.querySelector(".hay-stack__count").textContent = baleCount;
	setStackHeight(stackEl, baleCount, getIsleMaxBales(isle));
}

export function getStackType(stackEl) {
	if (stackEl.classList.contains("hay-stack--alfalfa")) return "alfalfa";
	if (stackEl.classList.contains("hay-stack--timothy")) return "timothy";
	return "";
}

export function getBayStacks(bayStackEl) {
	return bayStackEl.querySelectorAll(".hay-stack");
}

export function getIsleContainer(bayStackEl, isle) {
	if (isle === "both") return bayStackEl;
	return bayStackEl.querySelector(`.shed__isle--${isle}`);
}

export function findStackInContainer(container, stackKey) {
	if (!container) return null;
	const stacks = [...container.children].filter((el) => el.classList.contains("hay-stack"));
	return stacks.find((s) => s.dataset.stackKey === stackKey) || null;
}

export function sumBalesInContainer(container) {
	if (!container) return 0;
	let total = 0;

	if (container.classList.contains("shed__bay-stack")) {
		getBayStacks(container).forEach((stack) => {
			total += parseInt(stack.dataset.bales, 10) || 0;
		});
		return total;
	}

	container.querySelectorAll(":scope > .hay-stack").forEach((stack) => {
		total += parseInt(stack.dataset.bales, 10) || 0;
	});
	return total;
}

export function formatIsleLabel(isle) {
	if (isle === "both") return "Both";
	if (isle === "1") return "Isle 1";
	if (isle === "2") return "Isle 2";
	return isle;
}

export function createLogRow(entry) {
	const tpl = document.getElementById("logRowTemplate");
	if (!tpl) return null;

	const row = tpl.content.firstElementChild.cloneNode(true);
	const fields = {
		dateTime: entry.dateTime,
		person: entry.person,
		action: entry.action,
		type: entry.type,
		contract: entry.contract,
		bay: entry.bay ?? entry.row,
		isle: entry.isle ? formatIsleLabel(entry.isle) : "—",
		shed: entry.shed,
		bales: entry.bales,
	};

	row.querySelectorAll("[data-field]").forEach((cell) => {
		const key = cell.dataset.field;
		if (key in fields) cell.textContent = fields[key];
	});

	return row;
}

export function restoreHayStack(stackData, bayStackEl) {
	const parts = stackData.stackKey?.split("-") || [];
	const type = stackData.type || parts[0] || "alfalfa";
	const contract = parts.slice(1).join("-") || "";
	const bales = parseInt(stackData.bales, 10) || 0;
	const isle = stackData.isle || "both";

	const stack = createHayStack(type, contract, bales, isle, bayStackEl);
	if (!stack) return null;

	if (stackData.desc && !contract) {
		const match = stackData.desc.match(/^([A-Za-z]+)\s*\((.+)\)$/);
		if (match) {
			stack.querySelector(".hay-stack__type").textContent = match[1];
			stack.querySelector(".hay-stack__contract").textContent = match[2];
		}
	}

	return stack;
}
