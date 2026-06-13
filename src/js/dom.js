export function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

export function setStackHeight(stackEl, baleCount, maxBales) {
	const percent = (baleCount / maxBales) * 100;
	stackEl.style.setProperty("--stack-height", `${percent}%`);
}

export function createHayStack(type, contract, baleCount, maxBales) {
	const tpl = document.getElementById("hayStackTemplate");
	if (!tpl) return null;

	const stack = tpl.content.firstElementChild.cloneNode(true);
	stack.classList.add(`hay-stack--${type}`);
	stack.dataset.stackKey = `${type}-${contract}`;
	stack.dataset.bales = String(baleCount);
	stack.querySelector(".hay-stack__type").textContent = capitalize(type);
	stack.querySelector(".hay-stack__contract").textContent = contract;
	stack.querySelector(".hay-stack__count").textContent = baleCount;
	setStackHeight(stack, baleCount, maxBales);
	return stack;
}

export function updateHayStack(stackEl, type, contract, baleCount, maxBales) {
	stackEl.dataset.bales = String(baleCount);
	stackEl.querySelector(".hay-stack__type").textContent = capitalize(type);
	stackEl.querySelector(".hay-stack__contract").textContent = contract;
	stackEl.querySelector(".hay-stack__count").textContent = baleCount;
	setStackHeight(stackEl, baleCount, maxBales);
}

export function getStackType(stackEl) {
	const typeClass = Array.from(stackEl.classList).find((c) => c.startsWith("hay-stack--"));
	return typeClass ? typeClass.replace("hay-stack--", "") : "";
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
		shed: entry.shed,
		bales: entry.bales,
	};

	row.querySelectorAll("[data-field]").forEach((cell) => {
		const key = cell.dataset.field;
		if (key in fields) cell.textContent = fields[key];
	});

	return row;
}

export function restoreHayStack(stackData, maxBales) {
	const parts = stackData.stackKey?.split("-") || [];
	const type = stackData.type || parts[0] || "alfalfa";
	const contract = parts.slice(1).join("-") || "";
	const bales = parseInt(stackData.bales, 10) || 0;

	const stack = createHayStack(type, contract, bales, maxBales);
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
