import {
	DEFAULT_MAX_BALES_PER_BAY,
	getMaxBalesPerBay,
	getMaxBalesPerIsle,
	OLDS_LOCATION_ID,
} from "./locations.js";

export function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

export const HAY_TYPES = [
	{ id: "alfalfa", label: "Alfalfa Hay", stackLabel: "Alfalfa" },
	{ id: "dehy-alfalfa", label: "Dehy Alfalfa", stackLabel: "Dehy Alf" },
	{ id: "timothy-straw", label: "Timothy Straw" },
	{ id: "dehy-timothy", label: "Dehy Timothy", stackLabel: "Dehy Tim" },
	{ id: "timothy", label: "Timothy Hay", stackLabel: "Timothy" },
	{ id: "wheat-straw", label: "Wheat Straw" },
	{ id: "barley-straw", label: "Barley Straw" },
	{ id: "canola-straw", label: "Canola Straw" },
	{ id: "corn-stalks", label: "Corn Stalks", stackLabel: "Corn Stalks" },
	{ id: "mixed-hay", label: "Mixed Hay", stackLabel: "Mix Hay" },
	{ id: "tmr", label: "TMR", stackLabel: "TMR" },
	{ id: "orchard", label: "Orchard", stackLabel: "Orchard" },
];

export function getHayTypeLabel(type) {
	return HAY_TYPES.find((entry) => entry.id === type)?.label ?? capitalize(type.replace(/-/g, " "));
}

export function getHayTypeStackLabel(type) {
	const entry = HAY_TYPES.find((item) => item.id === type);
	const label = entry?.label ?? capitalize(type.replace(/-/g, " "));

	if (/\bstraw\b/i.test(label)) {
		return label.replace(/\bStraw\b/, "Str");
	}

	return entry?.stackLabel ?? label;
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

export const MAX_BALES_PER_BAY = DEFAULT_MAX_BALES_PER_BAY;
export const MAX_BALES_PER_ISLE = MAX_BALES_PER_BAY / 2;

function getBayStackLocationId(bayStackEl) {
	return bayStackEl?.dataset?.location || OLDS_LOCATION_ID;
}

export function getIsleMaxBales(isle, locationId = OLDS_LOCATION_ID) {
	return getMaxBalesPerIsle(isle, locationId);
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
		const exit = bay.querySelector(".shed__bay-exit");
		const exitHeight = exit ? exit.offsetHeight : 0;
		const chrome = label.offsetHeight + marginBottom + exitHeight + stats.offsetHeight;

		if (chrome > maxChrome) maxChrome = chrome;
	});

	return maxChrome;
}

function getMinStackPercent(areaBudget) {
	return (LAYOUT.minStack / areaBudget) * 100;
}

function getTierInSegment(baleCount, segmentStart, segmentMax = LAYOUT.baleSegmentMax) {
	const offset = Math.max(0, baleCount - segmentStart);
	if (offset <= 0) return 0;
	return Math.min(Math.ceil(offset / LAYOUT.baleStep), segmentMax / LAYOUT.baleStep);
}

function percentForTiers(tier, maxTier, maxPercent, areaBudget) {
	if (tier <= 0) return 0;
	const pct = (tier / maxTier) * maxPercent;
	return Math.max(getMinStackPercent(areaBudget), Math.round(pct * 100) / 100);
}

export function getStackHeightPercent(baleCount, maxBales, areaBudget = LAYOUT.stackAreaDesktop, bayMax = MAX_BALES_PER_BAY) {
	if (baleCount <= 0) return 0;

	const segmentMax = maxBales >= bayMax ? bayMax / 2 : maxBales;
	const tiersPerSegment = segmentMax / LAYOUT.baleStep;
	const halfPercent = 50;

	if (maxBales <= segmentMax || baleCount <= segmentMax) {
		const tier = getTierInSegment(baleCount, 0, segmentMax);
		return percentForTiers(tier, tiersPerSegment, halfPercent, areaBudget);
	}

	const tier = getTierInSegment(baleCount, segmentMax, segmentMax);
	return Math.round((halfPercent + (tier / tiersPerSegment) * halfPercent) * 100) / 100;
}

export function getStackHeightPx(baleCount, maxBales, areaBudget = LAYOUT.stackAreaDesktop, bayMax = MAX_BALES_PER_BAY) {
	const pct = getStackHeightPercent(baleCount, maxBales, areaBudget, bayMax);
	return Math.round((pct / 100) * areaBudget);
}

export function getBayFillPercent(total, maxBales = DEFAULT_MAX_BALES_PER_BAY) {
	if (total <= 0) return 0;
	if (total >= maxBales) return 100;
	const percent = Math.floor((total / maxBales) * 100);
	return Math.max(percent, 1);
}

function getDirectStacks(container) {
	if (!container) return [];
	return [...container.children].filter((el) => el.classList.contains("hay-stack"));
}

function applyAllStackHeights(bayStackEl) {
	const locationId = getBayStackLocationId(bayStackEl);

	getDirectStacks(bayStackEl).forEach((stack) => {
		const bales = parseInt(stack.dataset.bales, 10) || 0;
		setStackHeight(stack, bales, getIsleMaxBales("both", locationId));
	});

	["1", "2"].forEach((isleNum) => {
		getDirectStacks(bayStackEl.querySelector(`.shed__isle--${isleNum}`)).forEach((stack) => {
			const bales = parseInt(stack.dataset.bales, 10) || 0;
			setStackHeight(stack, bales, getIsleMaxBales(isleNum, locationId));
		});
	});
}

function getBayFillRatio(bayStackEl) {
	const locationId = getBayStackLocationId(bayStackEl);
	const totalBales = sumBalesInContainer(bayStackEl);
	return Math.min(1, totalBales / getIsleMaxBales("both", locationId));
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

function getStackAreaBudgetForBay(bayStackEl) {
	if (!bayStackEl) return getStackAreaBudgetValue();

	const val = getComputedStyle(bayStackEl).getPropertyValue("--stack-area-height").trim();
	const parsed = parseFloat(val);
	return parsed > 0 ? parsed : getStackAreaBudgetValue();
}

function getStackAreaBudgetForStack(stackEl) {
	if (!stackEl) return getStackAreaBudgetValue();

	const own = stackEl.style.getPropertyValue("--stack-area-height").trim();
	const ownParsed = parseFloat(own);
	if (ownParsed > 0) return ownParsed;

	return getStackAreaBudgetForBay(stackEl.closest(".shed__bay-stack"));
}

function getVerticalStackGaps(stackCount) {
	return Math.max(0, stackCount - 1) * LAYOUT.stackGap;
}

function applyBayStackAreaBudget(bayStackEl) {
	if (!bayStackEl || bayStackEl.clientHeight <= 0) return;

	bayStackEl.querySelectorAll(".hay-stack").forEach((stack) => {
		stack.style.removeProperty("--stack-area-height");
	});

	const base = getStackAreaBudgetValue();
	if (getBayFillRatio(bayStackEl) < 1) {
		bayStackEl.style.setProperty("--stack-area-height", `${base}px`);
		return;
	}

	const { top, bottom } = getBayStackPadding(bayStackEl);
	const inner = Math.max(LAYOUT.minStack, bayStackEl.clientHeight - top - bottom);

	const fullStacks = getDirectStacks(bayStackEl);
	const isle1Stacks = getDirectStacks(bayStackEl.querySelector(".shed__isle--1"));
	const isle2Stacks = getDirectStacks(bayStackEl.querySelector(".shed__isle--2"));
	const hasIsleStacks = isle1Stacks.length > 0 || isle2Stacks.length > 0;

	if (fullStacks.length && hasIsleStacks) {
		const fullGaps = getVerticalStackGaps(fullStacks.length);
		const isleGaps = Math.max(getVerticalStackGaps(isle1Stacks.length), getVerticalStackGaps(isle2Stacks.length));
		const sectionGap = LAYOUT.stackGap;

		const fullIdeal = fullStacks.reduce((total, stack) => {
			const bales = parseInt(stack.dataset.bales, 10) || 0;
			const locationId = getBayStackLocationId(bayStackEl);
			const bayMax = getMaxBalesPerBay(locationId);
			return total + getStackHeightPx(bales, getIsleMaxBales("both", locationId), base, bayMax);
		}, 0);

		const isleIdeal = Math.max(
			measureStacksBlockHeight(isle1Stacks, bayStackEl),
			measureStacksBlockHeight(isle2Stacks, bayStackEl),
		);

		const contentIdeal = fullIdeal + isleIdeal;
		const usable = inner - fullGaps - sectionGap - isleGaps;

		if (contentIdeal > 0 && usable > 0) {
			const scale = usable / contentIdeal;
			const fullArea = Math.max(LAYOUT.minStack, fullIdeal * scale);
			const isleArea = Math.max(LAYOUT.minStack, isleIdeal * scale);

			bayStackEl.style.setProperty("--stack-area-height", `${fullArea}px`);
			const isleBudget = Math.max(LAYOUT.minStack, isleArea);
			[...isle1Stacks, ...isle2Stacks].forEach((stack) => {
				stack.style.setProperty("--stack-area-height", `${isleBudget}px`);
			});
			return;
		}
	}

	let verticalGaps = 0;
	if (fullStacks.length && !hasIsleStacks) {
		verticalGaps = getVerticalStackGaps(fullStacks.length);
	} else if (hasIsleStacks && !fullStacks.length) {
		verticalGaps = Math.max(getVerticalStackGaps(isle1Stacks.length), getVerticalStackGaps(isle2Stacks.length));
	}

	bayStackEl.style.setProperty("--stack-area-height", `${Math.max(LAYOUT.minStack, inner - verticalGaps)}px`);
}

function measureStackRequiredHeight(stackEl) {
	const style = getComputedStyle(stackEl);
	const paddingY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
	const gap = parseFloat(style.gap) || 0;
	const prevPct = stackEl.style.getPropertyValue("--stack-height");

	stackEl.style.setProperty("--stack-height", "200");

	const visibleChildren = [...stackEl.children].filter((child) => !child.hidden);
	let childrenHeight = 0;
	visibleChildren.forEach((child, index) => {
		childrenHeight += child.offsetHeight;
		if (index > 0) childrenHeight += gap;
	});

	if (prevPct) {
		stackEl.style.setProperty("--stack-height", prevPct);
	} else {
		stackEl.style.removeProperty("--stack-height");
	}

	return Math.ceil(childrenHeight + paddingY);
}

function ensureStackFitsContent(stackEl) {
	const bayStack = stackEl.closest(".shed__bay-stack");
	if (!bayStack) return false;

	const bales = parseInt(stackEl.dataset.bales, 10) || 0;
	const locationId = getBayStackLocationId(bayStack);
	const maxBales = getIsleMaxBales(stackEl.dataset.isle || "both", locationId);
	setStackHeight(stackEl, bales, maxBales);

	const renderedHeight = stackEl.getBoundingClientRect().height;
	const requiredHeight = measureStackRequiredHeight(stackEl);

	if (requiredHeight <= renderedHeight + 1) {
		stackEl.style.removeProperty("min-height");
		delete stackEl.dataset.contentMinHeight;
		return false;
	}

	stackEl.style.minHeight = `${requiredHeight}px`;
	stackEl.dataset.contentMinHeight = String(requiredHeight);
	return true;
}

function finalizeBayStackLayout(bayStackEl) {
	applyBayStackAreaBudget(bayStackEl);
	applyAllStackHeights(bayStackEl);
	getBayStacks(bayStackEl).forEach((stack) => ensureStackFitsContent(stack));
}

function getStackAbsoluteHeightPx(stack, bayStackEl) {
	const bales = parseInt(stack.dataset.bales, 10) || 0;
	const isle = stack.dataset.isle || "both";
	const locationId = getBayStackLocationId(bayStackEl);
	const bayMax = getMaxBalesPerBay(locationId);
	const areaBudget = getStackAreaBudgetForStack(stack);
	const pct = getStackHeightPercent(bales, getIsleMaxBales(isle, locationId), areaBudget, bayMax);
	const pctHeight = Math.round((pct / 100) * areaBudget);
	const minHeight = parseFloat(stack.dataset.contentMinHeight) || 0;
	return Math.max(pctHeight, minHeight);
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

	if (fullHeight > 0 && islesHeight > 0) {
		total += LAYOUT.stackGap;
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

function measureBayStackRenderedHeight(bayStackEl) {
	if (!bayStackEl) return 0;
	return Math.max(bayStackEl.scrollHeight, measureBayStackContent(bayStackEl));
}

function measureMaxBayStackRenderedHeight(columns) {
	let maxContent = getStandardBayStackContentHeight();

	columns.querySelectorAll(".shed__bay-stack").forEach((bayStack) => {
		maxContent = Math.max(maxContent, measureBayStackRenderedHeight(bayStack));
	});

	return maxContent;
}

function reconcileColumnsLayout(columns) {
	const chrome = getBayChromeForColumns(columns);
	let maxContent = measureMaxBayStackRenderedHeight(columns);

	columns.querySelectorAll(".shed__bay-stack").forEach((bayStack) => {
		const rendered = measureBayStackRenderedHeight(bayStack);
		const height = Math.max(maxContent, rendered);
		bayStack.style.height = `${height}px`;
		bayStack.style.minHeight = `${height}px`;
		maxContent = Math.max(maxContent, height);
	});

	let tallestBay = 0;
	columns.querySelectorAll(".shed__bay").forEach((bay) => {
		tallestBay = Math.max(tallestBay, bay.offsetHeight);
	});

	const columnsHeight = Math.max(getBaseColumnHeight(), maxContent + chrome + 12, tallestBay);
	columns.style.height = `${Math.ceil(columnsHeight)}px`;

	return maxContent;
}

function syncShedColumnsLayout(columns) {
	if (columns.offsetParent === null) return;

	columns.dataset.bayChrome = String(measureBayChromeForColumns(columns));

	columns.querySelectorAll(".shed__bay-stack").forEach((bayStack) => {
		applyStackAreaHeight(bayStack);
		applyAllStackHeights(bayStack);
	});

	let maxStackContent = measureMaxBayStackContentHeight(columns);
	const chrome = getBayChromeForColumns(columns);
	let columnsHeight = Math.max(getBaseColumnHeight(), maxStackContent + chrome + 12);

	columns.style.height = `${Math.round(columnsHeight)}px`;
	columns.offsetHeight;

	applyUniformBayStackHeights(columns, maxStackContent);

	columns.querySelectorAll(".shed__bay-stack").forEach((bayStack) => {
		finalizeBayStackLayout(bayStack);
	});

	maxStackContent = reconcileColumnsLayout(columns);

	columns.querySelectorAll(".shed__bay-stack").forEach((bayStack) => {
		finalizeBayStackLayout(bayStack);
	});

	reconcileColumnsLayout(columns);
}

export function refreshAllStackHeights() {
	document.querySelectorAll(".shed__bay-stack").forEach((bayStack) => {
		redistributeBayStackHeights(bayStack);
	});
}

export function syncAllShedLayouts() {
	repairAllBayLayouts();

	document.querySelectorAll(".shed__columns").forEach(syncShedColumnsLayout);
}

export function syncAllShedLayoutsAfterPaint() {
	syncAllShedLayouts();
	requestAnimationFrame(() => {
		syncAllShedLayouts();
	});
}

export function setStackHeight(stackEl, baleCount, maxBales) {
	const areaBudget = getStackAreaBudgetForStack(stackEl);
	const bayStack = stackEl.closest(".shed__bay-stack");
	const bayMax = getMaxBalesPerBay(getBayStackLocationId(bayStack));
	const pct = getStackHeightPercent(baleCount, maxBales, areaBudget, bayMax);
	stackEl.style.setProperty("--stack-height", String(pct));
	stackEl.style.removeProperty("min-height");
	delete stackEl.dataset.contentMinHeight;
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

function orderFrontStacksLast(container) {
	if (!container) return;

	const stacks = [...container.children].filter((el) => el.classList.contains("hay-stack"));
	if (stacks.length < 2) return;

	const regular = stacks.filter((stack) => !stack.classList.contains("hay-stack--bay-front"));
	const front = stacks.filter((stack) => stack.classList.contains("hay-stack--bay-front"));
	if (!front.length) return;

	[...regular, ...front].forEach((stack) => container.appendChild(stack));
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

	orderFrontStacksLast(bayStackEl);
	["1", "2"].forEach((isleNum) => {
		orderFrontStacksLast(bayStackEl.querySelector(`.shed__isle--${isleNum}`));
	});

	bayStackEl.classList.remove("shed__bay-stack--isle-front");

	islesRow.classList.remove("shed__front-anchor");
	bayStackEl
		.querySelectorAll(":scope > .hay-stack")
		.forEach((el) => el.classList.remove("shed__front-anchor"));

	bayStackEl
		.querySelectorAll(":scope > .hay-stack--bay-front")
		.forEach((el) => el.classList.add("shed__front-anchor"));
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

export const STACK_GRADES = [
	{ id: "premium", label: "Premium" },
	{ id: "low-premium", label: "LP" },
	{ id: "1a", label: "#1A" },
	{ id: "1", label: "#1" },
	{ id: "low-1", label: "Low #1" },
	{ id: "standard", label: "Standard" },
	{ id: "economy", label: "Economy" },
];

export function getStackGradeLabel(gradeId = "") {
	return STACK_GRADES.find((entry) => entry.id === gradeId)?.label ?? "";
}

export function normalizeStackGrade(value = "") {
	const id = String(value).trim();
	if (!id) return "";
	return STACK_GRADES.some((entry) => entry.id === id) ? id : "";
}

export function applyStackGrade(stackEl, gradeId = "") {
	if (!stackEl) return;

	const normalizedGrade = normalizeStackGrade(gradeId);
	stackEl.dataset.grade = normalizedGrade;

	const gradeEl = stackEl.querySelector(".hay-stack__grade");
	if (gradeEl) {
		const label = getStackGradeLabel(normalizedGrade);
		gradeEl.textContent = label;
		gradeEl.hidden = !label;
	}

	const bayStack = stackEl.closest(".shed__bay-stack");
	if (bayStack) {
		finalizeBayStackLayout(bayStack);
	}
}

export function normalizeStackComment(value = "") {
	const words = String(value).trim().split(/\s+/).filter(Boolean).slice(0, 3);
	return words.join(" ");
}

export function isBayFrontComment(comment = "") {
	const words = String(comment).trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (words.includes("fr")) return true;

	for (let i = 0; i < words.length - 1; i++) {
		if (words[i] === "bay" && words[i + 1] === "front") return true;
	}

	return false;
}

export function sanitizeCommentInput(value = "") {
	let v = String(value).replace(/^\s+/, "").replace(/\s+/g, " ");
	const parts = v.split(" ");
	const words = parts.filter(Boolean).slice(0, 3);

	if (words.length === 0) return "";

	const trailingSpace =
		v.endsWith(" ") && parts.length > words.length && words.length < 3;

	if (trailingSpace) {
		return `${words.join(" ")} `.slice(0, 24);
	}

	return words.join(" ").slice(0, 24);
}

function renderStackCommentElement(commentEl, normalizedComment) {
	const firstEl = commentEl.querySelector(".hay-stack__comment-word--first");
	const secondEl = commentEl.querySelector(".hay-stack__comment-word--second");
	const thirdEl = commentEl.querySelector(".hay-stack__comment-word--third");
	const wordEls = [firstEl, secondEl, thirdEl];

	if (!normalizedComment) {
		commentEl.hidden = true;
		wordEls.forEach((el) => {
			if (!el) return;
			el.textContent = "";
			el.hidden = true;
		});
		return;
	}

	const words = normalizedComment.split(" ");

	wordEls.forEach((el, index) => {
		if (!el) return;
		const word = words[index];
		if (word) {
			el.textContent = word;
			el.hidden = false;
		} else {
			el.textContent = "";
			el.hidden = true;
		}
	});

	commentEl.hidden = false;
}

export function formatStackCountLabel(baleCount, rejected = false) {
	const count = String(baleCount);
	return rejected ? `${count} - Rej.` : count;
}

function updateStackCountDisplay(stackEl, baleCount = stackEl?.dataset.bales) {
	if (!stackEl) return;
	const countEl = stackEl.querySelector(".hay-stack__count");
	if (!countEl) return;
	const rejected = stackEl.dataset.rejected === "true";
	countEl.textContent = formatStackCountLabel(baleCount, rejected);
}

export function applyStackRejected(stackEl, rejected) {
	if (!stackEl) return;
	stackEl.classList.toggle("hay-stack--rejected", rejected);
	stackEl.dataset.rejected = rejected ? "true" : "false";
	updateStackCountDisplay(stackEl);
}

export function applyStackComment(stackEl, comment = "") {
	if (!stackEl) return;

	const normalizedComment = normalizeStackComment(comment);
	stackEl.dataset.comment = normalizedComment;
	stackEl.classList.toggle("hay-stack--bay-front", isBayFrontComment(normalizedComment));

	const commentEl = stackEl.querySelector(".hay-stack__comment");
	if (commentEl) {
		renderStackCommentElement(commentEl, normalizedComment);
	}

	const bayStack = stackEl.closest(".shed__bay-stack");
	if (bayStack) {
		repairBayLayout(bayStack);
		finalizeBayStackLayout(bayStack);
	}
}

export function createHayStack(type, contract, baleCount, isle, bayStackEl, { rejected = false, comment = "", grade = "" } = {}) {
	const tpl = document.getElementById("hayStackTemplate");
	if (!tpl || !bayStackEl) return null;

	const stack = tpl.content.firstElementChild.cloneNode(true);
	stack.classList.add(`hay-stack--${type}`);
	stack.dataset.stackKey = formatStackKey(type, contract);
	stack.dataset.bales = String(baleCount);
	stack.querySelector(".hay-stack__type").textContent = getHayTypeStackLabel(type);
	stack.querySelector(".hay-stack__contract").textContent = contract;
	applyStackRejected(stack, rejected);
	applyStackGrade(stack, grade);
	applyStackComment(stack, comment);
	updateStackCountDisplay(stack, baleCount);
	const locationId = getBayStackLocationId(bayStackEl);
	setStackHeight(stack, baleCount, getIsleMaxBales(isle, locationId));
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
	updateStackCountDisplay(stackEl, baleCount);
	const bayStack = stackEl.closest(".shed__bay-stack");
	const locationId = getBayStackLocationId(bayStack);
	setStackHeight(stackEl, baleCount, getIsleMaxBales(isle, locationId));
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

export function createReportRow(entry, { showGrade = false, showProduct = false } = {}) {
	const tpl = document.getElementById("reportRowTemplate");
	if (!tpl) return null;

	const row = tpl.content.firstElementChild.cloneNode(true);
	const fields = {
		contract: entry.contract,
		product: entry.product || "—",
		shed: entry.shed,
		bay: entry.bay,
		bales: formatStackCountLabel(entry.bales, entry.rejected),
		grade: getStackGradeLabel(entry.grade) || "—",
	};

	row.querySelectorAll("[data-field]").forEach((cell) => {
		const key = cell.dataset.field;
		if (key in fields) cell.textContent = fields[key];
	});

	row.querySelectorAll(".reports__col-grade").forEach((cell) => {
		cell.hidden = !showGrade;
	});

	row.querySelectorAll(".reports__col-product").forEach((cell) => {
		cell.hidden = !showProduct;
	});

	if (entry.rejected) {
		row.classList.add("log-table__row--rejected");
	}

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
	const rejected = stackData.rejected === true || stackData.rejected === "true";
	const comment = stackData.comment || "";
	const grade = stackData.grade || "";

	const stack = createHayStack(type, contract, bales, isle, bayStackEl, { rejected, comment, grade });
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
