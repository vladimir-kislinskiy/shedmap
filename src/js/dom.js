export function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

export function getIsleMaxBales(isle) {
	return isle === "both" ? 2000 : 1000;
}

export function setStackHeight(stackEl, baleCount, maxBales) {
	const percent = (baleCount / maxBales) * 100;
	stackEl.style.setProperty("--stack-height", `${percent}%`);
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
