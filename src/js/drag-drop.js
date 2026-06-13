import { applyIsleLayout, placeStackInContainer } from "./dom.js";

const DRAG_THRESHOLD = 10;
const LONG_PRESS_MS = 400;

function getDragContext(stackEl) {
	const parent = stackEl.parentElement;
	const bayStack = stackEl.closest(".shed__bay-stack");
	if (!bayStack) return null;

	if (parent?.classList.contains("shed__isle")) {
		return { mode: "isle", bayStack };
	}

	if (parent === bayStack) {
		return { mode: "full", bayStack };
	}

	return null;
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

function getDropTarget(clientX, clientY, dragContext) {
	const el = document.elementFromPoint(clientX, clientY);
	if (!el || !dragContext) return null;

	const { mode, bayStack } = dragContext;

	if (mode === "isle") {
		const targetIsle = el.closest(".shed__isle");
		if (!targetIsle || !bayStack.contains(targetIsle)) return null;

		const stack = el.closest(".hay-stack");
		if (stack && !stack.classList.contains("hay-stack--dragging") && targetIsle.contains(stack)) {
			return { type: "stack", el: stack, container: targetIsle };
		}

		return { type: "column", el: targetIsle, container: targetIsle };
	}

	const stack = el.closest(".hay-stack");
	if (stack && !stack.classList.contains("hay-stack--dragging") && stack.parentElement === bayStack) {
		return { type: "stack", el: stack, container: bayStack };
	}

	const hitBayStack = el.closest(".shed__bay-stack");
	if (hitBayStack === bayStack && !el.closest(".shed__isle")) {
		return { type: "column", el: bayStack, container: bayStack };
	}

	return null;
}

function performDrop(stackEl, target, clientY, dragContext) {
	const targetContainer = target.container;
	const isleId = targetContainer.dataset?.isle;

	if (dragContext.mode === "isle" && isleId) {
		applyIsleLayout(stackEl, isleId, dragContext.bayStack);
	}

	if (target.type === "stack" && target.el !== stackEl) {
		return placeStackInContainer(stackEl, targetContainer, target.el, clientY);
	}

	if (target.type === "column") {
		return placeStackInContainer(stackEl, targetContainer, null, clientY);
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

		const dragContext = getDragContext(stackEl);
		if (!dragContext) return;

		const rect = stackEl.getBoundingClientRect();
		const clientX = e.clientX ?? state?.startX ?? rect.left;
		const clientY = e.clientY ?? state?.startY ?? rect.top;
		const pointerId = e.pointerId ?? state?.pointerId;

		state = {
			pointerId,
			dragContext,
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
		const target = getDropTarget(e.clientX, e.clientY, state.dragContext);
		if (!target?.el) return;
		target.el.classList.add(
			target.type === "stack" ? "hay-stack--drop-target" : "shed__isle--drop-target",
		);
	};

	const onPointerUp = (e) => {
		if (!state) return;

		if (state.active && e.pointerId === state.pointerId) {
			const target = getDropTarget(e.clientX, e.clientY, state.dragContext);
			if (target && performDrop(stackEl, target, e.clientY, state.dragContext)) onReorder();
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
