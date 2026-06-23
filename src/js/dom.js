export function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

export const HAY_TYPES = [
	{ id: "alfalfa", label: "Alfalfa Hay", stackLabel: "Alfalfa" },
	{ id: "timothy-straw", label: "Timothy Straw", stackLabel: "Tim Str" },
	{ id: "dehy-timothy", label: "Dehy Timothy", stackLabel: "Dehy Tim" },
	{ id: "timothy", label: "Timothy Hay", stackLabel: "Timothy" },
	{ id: "wheat-straw", label: "Wheat Straw", stackLabel: "Wht Str" },
	{ id: "barley-straw", label: "Barley Straw", stackLabel: "Barl Str" },
	{ id: "mixed-hay", label: "Mixed Hay", stackLabel: "Mix Hay" },
	{ id: "tmr", label: "TMR", stackLabel: "TMR" },
];

export function getHayTypeLabel(type) {
	return HAY_TYPES.find((entry) => entry.id === type)?.label ?? capitalize(type.replace(/-/g, " "));
}

export function getHayTypeStackLabel(type) {
	const entry = HAY_TYPES.find((item) => item.id === type);
	return entry?.stackLabel ?? entry?.label ?? capitalize(type.replace(/-/g, " "));
}

export function formatStackKey(type, contract) {
	return `${type}-${contract}`;
}

export function parseStackKey(stackKey = "") {
	const known = HAY_TYPES.find((entry) => stackKey.startsWith(`${entry.id}-`));
	if (known) {
		return { type: known.id, contract: stackKey.slice(known.id.length + 1) };
	}

	const parts = stackKey.split("-");
	return { type: parts[0] || "", contract: parts.slice(1).join("-") };
}

export const BAYS_PER_SHED = 12;

export const MAX_BALES_PER_BAY = 1400;
export const MAX_BALES_PER_ISLE = MAX_BALES_PER_BAY / 2;

export const SHED_BAY_START = {
	west: 1,
	north: 25,
	east: 49,
};

export function getBayDisplayNumber(shed, bayIndex) {
	const colIndex = parseInt(bayIndex, 10);
	const start = (SHED_BAY_START[shed] ?? 1) + colIndex * 2;
	return `${start}-${start + 1}`;
}

export function getIsleMaxBales(isle) {
	return isle === "both" ? MAX_BALES_PER_BAY : MAX_BALES_PER_ISLE;
}

const LAYOUT = {
	stackGap: 6,
	stackPaddingTop: 10,
	stackPaddingBottom: 10,
	stackAreaDesktop: 500,
	stackAreaMobile: 450,
	stackAreaMobileBreakpoint: 768,
	bayChrome: 64,
	minStack: 48,
	baleStep: 10,
	baleSegmentMax: MAX_BALES_PER_ISLE,
	textBasePx: 10.4,
};

function isMobileStackLayout() {
	return window.matchMedia(`(max-width: ${LAYOUT.stackAreaMobileBreakpoint}px)`).matches;
}

export function getStackAreaBudgetValue() {
	return isMobileStackLayout() ? LAYOUT.stackAreaMobile : LAYOUT.stackAreaDesktop;
}

export function getStandardBayStackContentHeight() {
	const budget = getStackAreaBudgetValue();
	return budget + LAYOUT.stackPaddingTop + LAYOUT.stackPaddingBottom;
}

export function getBaseColumnHeight() {
	return getStandardBayStackContentHeight() + LAYOUT.bayChrome;
}

function getBayChromeForColumns(columns) {
	if (!columns) return LAYOUT.bayChrome;

	const stored = parseFloat(columns.dataset.bayChrome);
	if (!Number.isNaN(stored) && stored > 0) return stored;

	return LAYOUT.bayChrome;
}

function measureBayChromeForColumns(columns) {
	let maxChrome = LAYOUT.bayChrome;

	columns?.querySelectorAll(".shed__bay").forEach((bay) => {
		const label = bay.querySelector(".shed__bay-label");
		const stats = bay.querySelector(".shed__bay-stats");
		if (!label || !stats) return;

		const labelStyle = window.getComputedStyle(label);
		const marginBottom = parseFloat(labelStyle.marginBottom) || 0;
		const chrome = label.offsetHeight + marginBottom + stats.offsetHeight;

		if (chrome > maxChrome) maxChrome = chrome;
	});

	return maxChrome;
}

function getMinStackPercent(areaBudget) {
	return (LAYOUT.minStack / areaBudget) * 100;
}

function getTierInSegment(baleCount, segmentStart) {
	const offset = Math.max(0, baleCount - segmentStart);
	if (offset <= 0) return 0;
	return Math.min(Math.ceil(offset / LAYOUT.baleStep), LAYOUT.baleSegmentMax / LAYOUT.baleStep);
}

function percentForTiers(tier, maxTier, maxPercent, areaBudget) {
	if (tier <= 0) return 0;
	const pct = (tier / maxTier) * maxPercent;
	return Math.max(getMinStackPercent(areaBudget), Math.round(pct * 100) / 100);
}

/** % of shed__bay-stack area: 1400 bales = 100%, 700 bales = 50% */
export function getStackHeightPercent(baleCount, maxBales, areaBudget = LAYOUT.stackAreaDesktop) {
	if (baleCount <= 0) return 0;

	const tiersPerSegment = LAYOUT.baleSegmentMax / LAYOUT.baleStep;
	const halfPercent = 50;

	if (maxBales <= LAYOUT.baleSegmentMax || baleCount <= LAYOUT.baleSegmentMax) {
		const tier = getTierInSegment(baleCount, 0);
		return percentForTiers(tier, tiersPerSegment, halfPercent, areaBudget);
	}

	const tier = getTierInSegment(baleCount, LAYOUT.baleSegmentMax);
	return Math.round((halfPercent + (tier / tiersPerSegment) * halfPercent) * 100) / 100;
}

export function getStackHeightPx(baleCount, maxBales, areaBudget = LAYOUT.stackAreaDesktop) {
	const pct = getStackHeightPercent(baleCount, maxBales, areaBudget);
	return Math.round((pct / 100) * areaBudget);
}

export function getBayFillPercent(total, maxBales = getIsleMaxBales("both")) {
	if (total <= 0) return 0;
	if (total >= maxBales) return 100;
	const percent = Math.floor((total / maxBales) * 100);
	return Math.max(percent, 1);
}

function getDirectStacks(container) {
	if (!container) return [];
	return [...container.children].filter((el) => el.classList.contains("hay-stack"));
}

function resetStackText(stackEl) {
	stackEl.querySelectorAll(".hay-stack__type, .hay-stack__contract, .hay-stack__count").forEach((el) => {
		el.style.fontSize = `${LAYOUT.textBasePx}px`;
		el.style.lineHeight = "1.15";
		el.style.whiteSpace = "nowrap";
	});
}

function scheduleResetStackText() {
	requestAnimationFrame(() => {
		document.querySelectorAll(".shed-tabs__panel--active .hay-stack").forEach(resetStackText);
	});
}

function applyAllStackHeights(bayStackEl) {
	getDirectStacks(bayStackEl).forEach((stack) => {
		const bales = parseInt(stack.dataset.bales, 10) || 0;
		setStackHeight(stack, bales, getIsleMaxBales("both"));
	});

	["1", "2"].forEach((isleNum) => {
		getDirectStacks(bayStackEl.querySelector(`.shed__isle--${isleNum}`)).forEach((stack) => {
			const bales = parseInt(stack.dataset.bales, 10) || 0;
			setStackHeight(stack, bales, getIsleMaxBales(isleNum));
		});
	});
}

function getBayFillRatio(bayStackEl) {
	const totalBales = sumBalesInContainer(bayStackEl);
	return Math.min(1, totalBales / getIsleMaxBales("both"));
}

function redistributeBayStackHeights(bayStackEl) {
	applyAllStackHeights(bayStackEl);
}

function getBayStackPadding(bayStackEl) {
	const style = getComputedStyle(bayStackEl);
	return {
		top: parseFloat(style.paddingTop) || LAYOUT.stackPaddingTop,
		bottom: parseFloat(style.paddingBottom) || LAYOUT.stackPaddingBottom,
	};
}

function getStackAbsoluteHeightPx(stack, bayStackEl) {
	const bales = parseInt(stack.dataset.bales, 10) || 0;
	const isle = stack.dataset.isle || "both";
	const areaBudget = getStackAreaBudgetValue();
	return getStackHeightPx(bales, getIsleMaxBales(isle), areaBudget);
}

function measureStacksBlockHeight(stacks, bayStackEl) {
	if (!stacks.length) return 0;

	let total = 0;
	stacks.forEach((stack, index) => {
		total += getStackAbsoluteHeightPx(stack, bayStackEl);
		if (index < stacks.length - 1) total += LAYOUT.stackGap;
	});
	return total;
}

export function measureBayStackContent(bayStackEl) {
	if (!bayStackEl) return 0;

	const fullStacks = getDirectStacks(bayStackEl);
	const isle1Stacks = getDirectStacks(bayStackEl.querySelector(".shed__isle--1"));
	const isle2Stacks = getDirectStacks(bayStackEl.querySelector(".shed__isle--2"));

	const fullHeight = measureStacksBlockHeight(fullStacks, bayStackEl);
	const islesHeight = Math.max(
		measureStacksBlockHeight(isle1Stacks, bayStackEl),
		measureStacksBlockHeight(isle2Stacks, bayStackEl),
	);

	if (!fullHeight && !islesHeight) return 0;

	let total = fullHeight + islesHeight;

	if (fullStacks.length > 0) {
		total += fullStacks.length * LAYOUT.stackGap;
	}

	const { top, bottom } = getBayStackPadding(bayStackEl);
	const measured = total + top + bottom;

	if (getBayFillRatio(bayStackEl) >= 1) {
		const minFull = getStandardBayStackContentHeight() + (fullStacks.length > 0 ? LAYOUT.stackGap : 0);
		return Math.max(measured, minFull);
	}

	return measured;
}

function measureMaxBayStackContentHeight(columns) {
	let maxContent = getStandardBayStackContentHeight();

	columns.querySelectorAll(".shed__bay-stack").forEach((bayStack) => {
		maxContent = Math.max(maxContent, measureBayStackContent(bayStack));
	});

	return maxContent;
}

function applyStackAreaHeight(bayStack) {
	bayStack.style.setProperty("--stack-area-height", `${getStackAreaBudgetValue()}px`);
}

function applyUniformBayStackHeights(columns, contentHeight) {
	columns.querySelectorAll(".shed__bay-stack").forEach((bayStack) => {
		applyStackAreaHeight(bayStack);
		bayStack.style.height = `${contentHeight}px`;
		bayStack.style.minHeight = `${contentHeight}px`;
	});
}

function syncShedColumnsLayout(columns) {
	columns.dataset.bayChrome = String(measureBayChromeForColumns(columns));

	columns.querySelectorAll(".shed__bay-stack").forEach((bayStack) => {
		applyStackAreaHeight(bayStack);
		applyAllStackHeights(bayStack);
	});

	const maxStackContent = measureMaxBayStackContentHeight(columns);
	const chrome = getBayChromeForColumns(columns);
	const columnsHeight = Math.max(getBaseColumnHeight(), maxStackContent + chrome + 4);

	columns.style.height = `${Math.round(columnsHeight)}px`;
	columns.offsetHeight;

	applyUniformBayStackHeights(columns, maxStackContent);

	columns.querySelectorAll(".shed__bay-stack").forEach((bayStack) => {
		applyAllStackHeights(bayStack);
	});

	let tallestBay = 0;
	columns.querySelectorAll(".shed__bay").forEach((bay) => {
		tallestBay = Math.max(tallestBay, bay.offsetHeight);
	});

	if (tallestBay > columnsHeight) {
		columns.style.height = `${Math.round(tallestBay)}px`;
	}
}

export function refreshAllStackHeights() {
	document.querySelectorAll(".shed__bay-stack").forEach((bayStack) => {
		redistributeBayStackHeights(bayStack);
	});
}

export function syncAllShedLayouts() {
	repairAllBayLayouts();

	document.querySelectorAll(".shed__columns").forEach(syncShedColumnsLayout);

	scheduleResetStackText();
}

export function syncAllShedLayoutsAfterPaint() {
	syncAllShedLayouts();
	requestAnimationFrame(() => {
		syncAllShedLayouts();
	});
}

export function setStackHeight(stackEl, baleCount, maxBales) {
	const areaBudget = getStackAreaBudgetValue();
	const pct = getStackHeightPercent(baleCount, maxBales, areaBudget);
	stackEl.style.setProperty("--stack-height", String(pct));
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

function getStackIsle(stackEl) {
	const isle = stackEl.dataset.isle;
	if (isle === "1" || isle === "2") return isle;
	return "both";
}

export function repairBayLayout(bayStackEl) {
	const islesRow = bayStackEl.querySelector(".shed__isles");
	if (!islesRow) return;

	const ordered = [...bayStackEl.querySelectorAll(".hay-stack")];
	const groups = { both: [], "1": [], "2": [] };

	ordered.forEach((stack) => {
		groups[getStackIsle(stack)].push(stack);
	});

	groups.both.forEach((stack) => {
		stack.dataset.isle = "both";
		stack.classList.remove("hay-stack--isle-1", "hay-stack--isle-2");
		stack.classList.add("hay-stack--full");
		bayStackEl.insertBefore(stack, islesRow);
	});

	["1", "2"].forEach((isleNum) => {
		const isleEl = bayStackEl.querySelector(`.shed__isle--${isleNum}`);
		if (!isleEl) return;

		groups[isleNum].forEach((stack) => {
			stack.dataset.isle = isleNum;
			stack.classList.remove("hay-stack--full", "hay-stack--isle-1", "hay-stack--isle-2");
			stack.classList.add(`hay-stack--isle-${isleNum}`);
			isleEl.appendChild(stack);
		});
	});
}

export function repairAllBayLayouts() {
	document.querySelectorAll(".shed__bay-stack").forEach(repairBayLayout);
}

export function placeStackInContainer(stackEl, container, beforeStack, clientY) {
	if (!container) return false;

	const isle = getStackIsle(stackEl);
	const isIsleContainer = container.classList.contains("shed__isle");
	const isBayStack = container.classList.contains("shed__bay-stack");

	if (isle !== "both" && !isIsleContainer) return false;
	if (isle === "both" && isIsleContainer) return false;
	if (isle === "both" && !isBayStack) return false;

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

export function restoreStackPosition(stackEl, origin) {
	if (!stackEl || !origin?.bayStack) return;

	applyIsleLayout(stackEl, origin.fromIsle, origin.bayStack);
	const container = getIsleContainer(origin.bayStack, origin.fromIsle);
	if (!container) return;

	const stacks = [...container.querySelectorAll(":scope > .hay-stack")].filter((el) => el !== stackEl);
	const insertAt = Math.min(Math.max(origin.index ?? stacks.length, 0), stacks.length);

	if (insertAt >= stacks.length) {
		container.appendChild(stackEl);
	} else {
		container.insertBefore(stackEl, stacks[insertAt]);
	}
}

export function createHayStack(type, contract, baleCount, isle, bayStackEl) {
	const tpl = document.getElementById("hayStackTemplate");
	if (!tpl || !bayStackEl) return null;

	const stack = tpl.content.firstElementChild.cloneNode(true);
	stack.classList.add(`hay-stack--${type}`);
	stack.dataset.stackKey = formatStackKey(type, contract);
	stack.dataset.bales = String(baleCount);
	stack.querySelector(".hay-stack__type").textContent = getHayTypeStackLabel(type);
	stack.querySelector(".hay-stack__contract").textContent = contract;
	stack.querySelector(".hay-stack__count").textContent = baleCount;
	setStackHeight(stack, baleCount, getIsleMaxBales(isle));
	applyIsleLayout(stack, isle, bayStackEl);
	return stack;
}

export function updateHayStack(stackEl, type, contract, baleCount) {
	const isle = stackEl.dataset.isle || "both";
	HAY_TYPES.forEach((entry) => stackEl.classList.remove(`hay-stack--${entry.id}`));
	stackEl.classList.add(`hay-stack--${type}`);
	stackEl.dataset.stackKey = formatStackKey(type, contract);
	stackEl.dataset.bales = String(baleCount);
	stackEl.querySelector(".hay-stack__type").textContent = getHayTypeStackLabel(type);
	stackEl.querySelector(".hay-stack__contract").textContent = contract;
	stackEl.querySelector(".hay-stack__count").textContent = baleCount;
	setStackHeight(stackEl, baleCount, getIsleMaxBales(isle));
}

export function getStackType(stackEl) {
	return HAY_TYPES.find((entry) => stackEl.classList.contains(`hay-stack--${entry.id}`))?.id ?? "";
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

export function createReportRow(entry) {
	const tpl = document.getElementById("reportRowTemplate");
	if (!tpl) return null;

	const row = tpl.content.firstElementChild.cloneNode(true);
	const fields = {
		contract: entry.contract,
		shed: entry.shed,
		bay: entry.bay,
		bales: entry.bales,
	};

	row.querySelectorAll("[data-field]").forEach((cell) => {
		const key = cell.dataset.field;
		if (key in fields) cell.textContent = fields[key];
	});

	return row;
}

export function createLogRow(entry) {
	const tpl = document.getElementById("logRowTemplate");
	if (!tpl) return null;

	const row = tpl.content.firstElementChild.cloneNode(true);
	const fields = {
		dateTime: entry.dateTime,
		person: entry.person,
		reportedBy: entry.reportedBy || "—",
		action: entry.note ? `${entry.action} — ${entry.note}` : entry.action,
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
	const parsed = parseStackKey(stackData.stackKey || "");
	const type = stackData.type || parsed.type || "alfalfa";
	const contract = parsed.contract || "";
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
