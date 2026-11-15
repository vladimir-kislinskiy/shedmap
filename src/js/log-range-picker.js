const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const DEFAULT_LABEL = "Any dates";

function startOfDay(date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatDay(date, withYear) {
	const text = `${MONTHS[date.getMonth()].slice(0, 3)} ${date.getDate()}`;
	return withYear ? `${text}, ${date.getFullYear()}` : text;
}

export function formatRangeLabel(range) {
	if (!range) return DEFAULT_LABEL;

	const { from, to } = range;
	if (from.getTime() === to.getTime()) return formatDay(from, true);
	if (from.getFullYear() !== to.getFullYear()) return `${formatDay(from, true)} - ${formatDay(to, true)}`;
	return `${formatDay(from, false)} - ${formatDay(to, true)}`;
}

export function createRangePicker({ button, label, panel, years, onChange }) {
	const root = button.parentElement;
	let range = null;
	let anchor = null;
	let hover = null;
	let viewYear = 0;
	let viewMonth = 0;
	let dayButtons = [];
	let monthSelect = null;
	let yearSelect = null;

	function isOpen() {
		return !panel.hidden;
	}

	function currentSpan() {
		if (anchor) {
			const end = hover ?? anchor;
			return anchor <= end ? { from: anchor, to: end } : { from: end, to: anchor };
		}
		return range;
	}

	function paint() {
		const span = currentSpan();
		const todayTime = startOfDay(new Date()).getTime();

		for (const { el, date } of dayButtons) {
			const time = date.getTime();
			const inside = span && time >= span.from.getTime() && time <= span.to.getTime();
			el.classList.toggle("log__range-day--in", Boolean(inside));
			el.classList.toggle("log__range-day--start", Boolean(span) && time === span.from.getTime());
			el.classList.toggle("log__range-day--end", Boolean(span) && time === span.to.getTime());
			el.classList.toggle("log__range-day--today", time === todayTime);
		}
	}

	function syncHeader() {
		const { start, end } = years();
		const options = [];
		for (let year = Math.min(start, viewYear); year <= Math.max(end, viewYear); year++) {
			options.push(new Option(String(year), String(year)));
		}
		yearSelect.replaceChildren(...options);
		yearSelect.value = String(viewYear);
		monthSelect.value = String(viewMonth);
	}

	function renderMonth() {
		const first = new Date(viewYear, viewMonth, 1);
		const offset = (first.getDay() + 6) % 7;
		const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

		syncHeader();
		grid.replaceChildren();
		dayButtons = [];

		for (let i = 0; i < offset; i++) {
			grid.append(document.createElement("span"));
		}

		for (let day = 1; day <= daysInMonth; day++) {
			const date = new Date(viewYear, viewMonth, day);
			const el = document.createElement("button");
			el.type = "button";
			el.className = "log__range-day";
			el.textContent = String(day);
			el.dataset.time = String(date.getTime());
			grid.append(el);
			dayButtons.push({ el, date });
		}

		paint();
	}

	function shiftMonth(delta) {
		const next = new Date(viewYear, viewMonth + delta, 1);
		viewYear = next.getFullYear();
		viewMonth = next.getMonth();
		renderMonth();
	}

	function applyRange(next) {
		range = next;
		anchor = null;
		hover = null;
		label.textContent = formatRangeLabel(range);
		onChange(range);
	}

	function pickDay(date) {
		if (!anchor) {
			anchor = date;
			hover = null;
			paint();
			return;
		}

		const from = anchor <= date ? anchor : date;
		const to = anchor <= date ? date : anchor;
		applyRange({ from, to });
		close();
	}

	function close({ restoreFocus = true } = {}) {
		if (!isOpen()) return;
		panel.hidden = true;
		anchor = null;
		hover = null;
		button.setAttribute("aria-expanded", "false");
		document.removeEventListener("pointerdown", onOutsidePointer, true);
		document.removeEventListener("keydown", onKeydown, true);
		if (restoreFocus) button.focus();
	}

	function open() {
		const focus = range?.from ?? new Date();
		viewYear = focus.getFullYear();
		viewMonth = focus.getMonth();
		renderMonth();

		const bounds = (root.closest(".tabs__panel") ?? document.body).getBoundingClientRect();
		panel.style.left = "";
		panel.hidden = false;
		button.setAttribute("aria-expanded", "true");

		const rect = panel.getBoundingClientRect();
		const margin = 8;
		const shift = Math.max(Math.min(0, bounds.right - margin - rect.right), bounds.left + margin - rect.left);
		if (shift) panel.style.left = `${shift}px`;

		document.addEventListener("pointerdown", onOutsidePointer, true);
		document.addEventListener("keydown", onKeydown, true);
	}

	function onOutsidePointer(event) {
		if (!root.contains(event.target)) close({ restoreFocus: false });
	}

	function onKeydown(event) {
		if (event.key === "Escape") close();
	}

	const head = document.createElement("div");
	head.className = "log__range-head";

	const prevBtn = document.createElement("button");
	prevBtn.type = "button";
	prevBtn.className = "log__range-nav log__range-nav--prev";
	prevBtn.setAttribute("aria-label", "Previous month");

	const nextBtn = document.createElement("button");
	nextBtn.type = "button";
	nextBtn.className = "log__range-nav log__range-nav--next";
	nextBtn.setAttribute("aria-label", "Next month");

	const title = document.createElement("div");
	title.className = "log__range-title";

	monthSelect = document.createElement("select");
	monthSelect.className = "log__range-select";
	monthSelect.setAttribute("aria-label", "Month");
	MONTHS.forEach((name, index) => monthSelect.append(new Option(name, String(index))));

	yearSelect = document.createElement("select");
	yearSelect.className = "log__range-select";
	yearSelect.setAttribute("aria-label", "Year");

	const monthWrap = document.createElement("span");
	monthWrap.className = "log__range-select-wrap";
	monthWrap.append(monthSelect);

	const yearWrap = document.createElement("span");
	yearWrap.className = "log__range-select-wrap";
	yearWrap.append(yearSelect);

	title.append(monthWrap, yearWrap);
	head.append(prevBtn, title, nextBtn);

	const weekdays = document.createElement("div");
	weekdays.className = "log__range-weekdays";
	for (const name of WEEKDAYS) {
		const el = document.createElement("span");
		el.textContent = name;
		weekdays.append(el);
	}

	const grid = document.createElement("div");
	grid.className = "log__range-grid";

	const foot = document.createElement("div");
	foot.className = "log__range-foot";

	const clearBtn = document.createElement("button");
	clearBtn.type = "button";
	clearBtn.className = "log__range-clear";
	clearBtn.textContent = "Clear";

	const last7Btn = document.createElement("button");
	last7Btn.type = "button";
	last7Btn.className = "log__range-clear";
	last7Btn.textContent = "Last 7 days";

	foot.append(last7Btn, clearBtn);
	panel.replaceChildren(head, weekdays, grid, foot);

	button.addEventListener("click", () => {
		if (isOpen()) close();
		else open();
	});

	monthSelect.addEventListener("change", () => {
		viewMonth = Number(monthSelect.value);
		renderMonth();
	});

	yearSelect.addEventListener("change", () => {
		viewYear = Number(yearSelect.value);
		renderMonth();
	});

	prevBtn.addEventListener("click", () => shiftMonth(-1));
	nextBtn.addEventListener("click", () => shiftMonth(1));

	grid.addEventListener("click", (event) => {
		const el = event.target.closest(".log__range-day");
		if (!el || !grid.contains(el)) return;
		pickDay(new Date(Number(el.dataset.time)));
	});

	grid.addEventListener("pointerover", (event) => {
		if (!anchor) return;
		const el = event.target.closest(".log__range-day");
		if (!el || !grid.contains(el)) return;
		hover = new Date(Number(el.dataset.time));
		paint();
	});

	clearBtn.addEventListener("click", () => {
		applyRange(null);
		close();
	});

	last7Btn.addEventListener("click", () => {
		const today = startOfDay(new Date());
		applyRange({ from: addDays(today, -6), to: today });
		close();
	});

	return {
		getRange: () => range,
		setRange(next) {
			if (isOpen()) close({ restoreFocus: false });
			applyRange(next);
		},
	};
}
