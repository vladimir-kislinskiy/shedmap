import { applyIsleLayout, placeStackInContainer } from "./dom.js";

const DRAG_THRESHOLD = 6;
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

	if (dragContext.mode === "isle") {
		if (!isleId) return false;
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

function markDragged(stackEl) {
	stackEl._justDragged = true;
	setTimeout(() => {
		stackEl._justDragged = false;
	}, 300);
}

export function bindStackDrag(stackEl, { canDrag, onReorder }) {
	if (stackEl._pointerDragBound) return;
	stackEl._pointerDragBound = true;

	let state = null;

	const removePendingListeners = () => {
		document.removeEventListener("pointermove", onPendingPointerMove);
		document.removeEventListener("pointerup", onPendingPointerUp);
		document.removeEventListener("pointercancel", onPendingPointerUp);
	};

	const removeActiveListeners = () => {
		document.removeEventListener("pointermove", onActivePointerMove);
		document.removeEventListener("pointerup", onActivePointerUp);
		document.removeEventListener("pointercancel", onActivePointerUp);
	};

	const releaseCapture = () => {
		if (state?.pointerId == null) return;
		try {
			if (stackEl.hasPointerCapture?.(state.pointerId)) {
				stackEl.releasePointerCapture(state.pointerId);
			}
		} catch (_) {
			/* Safari may throw if capture was never set */
		}
	};

	const cleanup = () => {
		if (state?.longPressTimer) clearTimeout(state.longPressTimer);
		if (state?.ghost) state.ghost.remove();
		removePendingListeners();
		removeActiveListeners();
		releaseCapture();
		stackEl.classList.remove("hay-stack--dragging");
		stackEl.style.pointerEvents = "";
		clearDropHighlights();
		document.body.classList.remove("page--dragging");
		state = null;
	};

	const startDrag = (e) => {
		if (!canDrag()) {
			cleanup();
			return;
		}

		const dragContext = getDragContext(stackEl);
		if (!dragContext) {
			cleanup();
			return;
		}

		removePendingListeners();
		if (state?.longPressTimer) clearTimeout(state.longPressTimer);

		const rect = stackEl.getBoundingClientRect();
		const clientX = e.clientX ?? state?.startX ?? rect.left;
		const clientY = e.clientY ?? state?.startY ?? rect.top;
		const pointerId = e.pointerId ?? state?.pointerId;
		const fromIsle = stackEl.dataset.isle || "both";

		state = {
			pointerId,
			dragContext,
			fromIsle,
			startX: state?.startX ?? clientX,
			startY: state?.startY ?? clientY,
			offsetX: clientX - rect.left,
			offsetY: clientY - rect.top,
			ghost: createGhost(stackEl),
			active: true,
		};

		stackEl.classList.add("hay-stack--dragging");
		stackEl.style.pointerEvents = "none";
		document.body.classList.add("page--dragging");
		moveGhost(state.ghost, clientX, clientY, state.offsetX, state.offsetY);

		document.addEventListener("pointermove", onActivePointerMove, { passive: false });
		document.addEventListener("pointerup", onActivePointerUp);
		document.addEventListener("pointercancel", onActivePointerUp);
	};

	const onActivePointerMove = (e) => {
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

	const onActivePointerUp = (e) => {
		if (!state?.active || e.pointerId !== state.pointerId) return;

		const target = getDropTarget(e.clientX, e.clientY, state.dragContext);
		if (target && performDrop(stackEl, target, e.clientY, state.dragContext)) {
			markDragged(stackEl);
			onReorder({
				stackEl,
				fromIsle: state.fromIsle,
				toIsle: stackEl.dataset.isle || "both",
			});
		} else {
			markDragged(stackEl);
		}

		cleanup();
	};

	const onPendingPointerMove = (e) => {
		if (!state || state.active || e.pointerId !== state.pointerId) return;

		const dx = e.clientX - state.startX;
		const dy = e.clientY - state.startY;
		if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
			startDrag(e);
		}
	};

	const onPendingPointerUp = (e) => {
		if (!state || state.active || e.pointerId !== state.pointerId) return;
		cleanup();
	};

	stackEl.addEventListener(
		"pointerdown",
		(e) => {
			if (!canDrag() || e.button !== 0) return;

			e.preventDefault();

			cleanup();

			try {
				stackEl.setPointerCapture(e.pointerId);
			} catch (_) {
				/* ignore */
			}

			state = {
				pointerId: e.pointerId,
				startX: e.clientX,
				startY: e.clientY,
				active: false,
				longPressTimer: setTimeout(() => {
					if (state && !state.active) {
						startDrag({
							pointerId: state.pointerId,
							clientX: state.startX,
							clientY: state.startY,
						});
					}
				}, LONG_PRESS_MS),
			};

			document.addEventListener("pointermove", onPendingPointerMove);
			document.addEventListener("pointerup", onPendingPointerUp);
			document.addEventListener("pointercancel", onPendingPointerUp);
		},
		{ passive: false },
	);

	stackEl.addEventListener("contextmenu", (e) => {
		if (canDrag()) e.preventDefault();
	});
}

export function setStacksDraggable(enabled) {
	document.querySelectorAll(".hay-stack").forEach((stack) => {
		stack.classList.toggle("hay-stack--draggable", enabled);
	});
}
