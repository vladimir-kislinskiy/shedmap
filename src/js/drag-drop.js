const DRAG_THRESHOLD = 10;
const LONG_PRESS_MS = 400;

function getDropZone(stackEl) {
	return stackEl.parentElement;
}

function clearDropHighlights() {
	document.querySelectorAll(".hay-stack--drop-target, .shed__isle--drop-target").forEach((el) => {
		el.classList.remove("hay-stack--drop-target", "shed__isle--drop-target");
	});
}

function createGhost(stackEl) {
	const ghost = stackEl.cloneNode(true);
	ghost.classList.add("hay-stack__ghost");
	ghost.setAttribute("aria-hidden", "true");
	const rect = stackEl.getBoundingClientRect();
	ghost.style.width = `${rect.width}px`;
	ghost.style.height = `${rect.height}px`;
	document.body.appendChild(ghost);
	return ghost;
}

function moveGhost(ghost, clientX, clientY, offsetX, offsetY) {
	ghost.style.left = `${clientX - offsetX}px`;
	ghost.style.top = `${clientY - offsetY}px`;
}

function getDropTarget(clientX, clientY, dropZone) {
	const el = document.elementFromPoint(clientX, clientY);
	if (!el || !dropZone) return null;

	const stack = el.closest(".hay-stack");
	if (stack && !stack.classList.contains("hay-stack--dragging") && stack.parentElement === dropZone) {
		return { type: "stack", el: stack };
	}

	if (dropZone.classList.contains("shed__isle") && el.closest(".shed__isle") === dropZone) {
		return { type: "column", el: dropZone };
	}

	return null;
}

function reorderStack(draggedStack, target, clientY) {
	const dropZone = draggedStack.parentElement;
	if (!dropZone) return false;

	if (target.type === "stack" && target.el !== draggedStack) {
		const targetRect = target.el.getBoundingClientRect();
		const insertBefore = clientY < targetRect.top + targetRect.height / 2;
		if (insertBefore) {
			dropZone.insertBefore(draggedStack, target.el);
		} else {
			target.el.after(draggedStack);
		}
		return true;
	}

	if (target.type === "column") {
		dropZone.appendChild(draggedStack);
		return true;
	}

	return false;
}

export function bindStackDrag(stackEl, { canDrag, onReorder }) {
	if (stackEl._pointerDragBound) return;
	stackEl._pointerDragBound = true;

	let state = null;

	const cleanup = () => {
		if (state?.longPressTimer) clearTimeout(state.longPressTimer);
		if (state?.ghost) state.ghost.remove();
		stackEl.classList.remove("hay-stack--dragging");
		clearDropHighlights();
		document.body.classList.remove("page--dragging");
		document.removeEventListener("pointermove", onPointerMove);
		document.removeEventListener("pointerup", onPointerUp);
		document.removeEventListener("pointercancel", onPointerUp);
		state = null;
	};

	const startDrag = (e) => {
		if (!canDrag()) return;

		const rect = stackEl.getBoundingClientRect();
		const clientX = e.clientX ?? state?.startX ?? rect.left;
		const clientY = e.clientY ?? state?.startY ?? rect.top;
		const pointerId = e.pointerId ?? state?.pointerId;

		state = {
			pointerId,
			dropZone: getDropZone(stackEl),
			offsetX: clientX - rect.left,
			offsetY: clientY - rect.top,
			ghost: createGhost(stackEl),
			active: true,
		};

		stackEl.classList.add("hay-stack--dragging");
		document.body.classList.add("page--dragging");
		moveGhost(state.ghost, clientX, clientY, state.offsetX, state.offsetY);
		document.addEventListener("pointermove", onPointerMove);
		document.addEventListener("pointerup", onPointerUp);
		document.addEventListener("pointercancel", onPointerUp);
	};

	const onPointerMove = (e) => {
		if (!state?.active || e.pointerId !== state.pointerId) return;
		e.preventDefault();
		moveGhost(state.ghost, e.clientX, e.clientY, state.offsetX, state.offsetY);
		clearDropHighlights();
		const target = getDropTarget(e.clientX, e.clientY, state.dropZone);
		if (!target?.el) return;
		target.el.classList.add(
			target.type === "stack" ? "hay-stack--drop-target" : "shed__isle--drop-target",
		);
	};

	const onPointerUp = (e) => {
		if (!state) return;

		if (state.active && e.pointerId === state.pointerId) {
			const target = getDropTarget(e.clientX, e.clientY, state.dropZone);
			if (target && reorderStack(stackEl, target, e.clientY)) onReorder();
		}

		cleanup();
	};

	stackEl.addEventListener("pointerdown", (e) => {
		if (!canDrag() || e.button !== 0) return;

		state = {
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			active: false,
			longPressTimer: setTimeout(() => {
				if (state && !state.active) {
					startDrag({ pointerId: state.pointerId, clientX: state.startX, clientY: state.startY });
				}
			}, LONG_PRESS_MS),
		};
	});

	stackEl.addEventListener("pointermove", (e) => {
		if (!state || state.active || e.pointerId !== state.pointerId) return;

		const dx = e.clientX - state.startX;
		const dy = e.clientY - state.startY;
		if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
			clearTimeout(state.longPressTimer);
			startDrag(e);
		}
	});

	stackEl.addEventListener("pointerup", (e) => {
		if (!state || state.active) return;
		if (e.pointerId !== state.pointerId) return;
		clearTimeout(state.longPressTimer);
		cleanup();
	});

	stackEl.addEventListener("pointercancel", () => {
		if (!state || state.active) return;
		cleanup();
	});

	stackEl.addEventListener("contextmenu", (e) => {
		if (canDrag()) e.preventDefault();
	});
}

export function setStacksDraggable(enabled) {
	document.querySelectorAll(".hay-stack").forEach((stack) => {
		stack.classList.toggle("hay-stack--draggable", enabled);
	});
}
