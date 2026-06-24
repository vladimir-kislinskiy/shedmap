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
	ghost.style.setProperty("--ghost-width", `${rect.width}px`);
	ghost.style.setProperty("--ghost-height", `${rect.height}px`);
	document.body.appendChild(ghost);
	return ghost;
}

function moveGhost(ghost, clientX, clientY, offsetX, offsetY) {
	ghost.style.setProperty("--ghost-left", `${clientX - offsetX}px`);
	ghost.style.setProperty("--ghost-top", `${clientY - offsetY}px`);
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

	let session = null;

	const detach = () => {
		if (!session?.listeners) return;
		session.listeners.forEach(({ target, type, handler, options }) => {
			target.removeEventListener(type, handler, options);
		});
	};

	const endSession = () => {
		if (!session) return;
		if (session.pressTimer) clearTimeout(session.pressTimer);
		if (session.ghost) session.ghost.remove();
		detach();
		stackEl.classList.remove("hay-stack--dragging");
		clearDropHighlights();
		document.body.classList.remove("page--dragging");
		session = null;
	};

	const track = (target, type, handler, options) => {
		target.addEventListener(type, handler, options);
		session.listeners.push({ target, type, handler, options });
	};

	const beginDrag = (clientX, clientY) => {
		if (!session || session.dragging) return;
		if (!canDrag()) {
			endSession();
			return;
		}

		const dragContext = getDragContext(stackEl);
		if (!dragContext) {
			endSession();
			return;
		}

		if (session.pressTimer) clearTimeout(session.pressTimer);

		const parent = stackEl.parentElement;
		const siblings = parent
			? [...parent.children].filter((el) => el.classList.contains("hay-stack"))
			: [];

		const rect = stackEl.getBoundingClientRect();
		session.dragging = true;
		session.dragContext = dragContext;
		session.fromIsle = stackEl.dataset.isle || "both";
		session.origin = {
			bayStack: dragContext.bayStack,
			fromIsle: session.fromIsle,
			index: siblings.indexOf(stackEl),
		};
		session.offsetX = clientX - rect.left;
		session.offsetY = clientY - rect.top;
		session.ghost = createGhost(stackEl);

		stackEl.classList.add("hay-stack--dragging");
		document.body.classList.add("page--dragging");
		moveGhost(session.ghost, clientX, clientY, session.offsetX, session.offsetY);
	};

	const handleMove = (clientX, clientY) => {
		if (!session) return;

		if (!session.dragging) {
			const dx = clientX - session.startX;
			const dy = clientY - session.startY;
			if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
				beginDrag(clientX, clientY);
			}
			return;
		}

		moveGhost(session.ghost, clientX, clientY, session.offsetX, session.offsetY);
		clearDropHighlights();
		const target = getDropTarget(clientX, clientY, session.dragContext);
		if (!target?.el) return;
		target.el.classList.add(
			target.type === "stack" ? "hay-stack--drop-target" : "shed__isle--drop-target",
		);
	};

	const handleEnd = (clientX, clientY) => {
		if (!session) return;

		if (session.dragging) {
			const target = getDropTarget(clientX, clientY, session.dragContext);
			if (target && performDrop(stackEl, target, clientY, session.dragContext)) {
				markDragged(stackEl);
				onReorder({
					stackEl,
					fromIsle: session.fromIsle,
					toIsle: stackEl.dataset.isle || "both",
					origin: session.origin,
				});
			} else {
				markDragged(stackEl);
			}
		}

		endSession();
	};

	const onMouseMove = (e) => {
		if (!session?.isMouse) return;
		e.preventDefault();
		handleMove(e.clientX, e.clientY);
	};

	const onMouseUp = (e) => {
		if (!session?.isMouse || e.button !== 0) return;
		handleEnd(e.clientX, e.clientY);
	};

	const onPointerMove = (e) => {
		if (!session || session.isMouse) return;
		if (e.pointerId !== session.pointerId) return;
		if (session.dragging) e.preventDefault();
		handleMove(e.clientX, e.clientY);
	};

	const onPointerEnd = (e) => {
		if (!session || session.isMouse) return;
		if (e.pointerId !== session.pointerId) return;
		handleEnd(e.clientX, e.clientY);
	};

	const armMouseSession = (clientX, clientY) => {
		if (!canDrag()) return;
		if (session) endSession();

		session = {
			isMouse: true,
			startX: clientX,
			startY: clientY,
			dragging: false,
			listeners: [],
			pressTimer: setTimeout(() => {
				if (session && !session.dragging) {
					beginDrag(session.startX, session.startY);
				}
			}, LONG_PRESS_MS),
		};

		track(window, "mousemove", onMouseMove, { passive: false });
		track(window, "mouseup", onMouseUp);
	};

	const armTouchSession = (e) => {
		if (!canDrag()) return;
		if (session) endSession();

		e.preventDefault();

		session = {
			isMouse: false,
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			dragging: false,
			listeners: [],
			pressTimer: setTimeout(() => {
				if (session && !session.dragging) {
					beginDrag(session.startX, session.startY);
				}
			}, LONG_PRESS_MS),
		};

		track(window, "pointermove", onPointerMove, { passive: false });
		track(window, "pointerup", onPointerEnd);
		track(window, "pointercancel", onPointerEnd);
	};

	// Desktop / macOS: native mouse events (reliable in Safari & Chrome)
	stackEl.addEventListener("mousedown", (e) => {
		if (e.button !== 0 || !canDrag()) return;
		// Ignore synthetic mouse events fired after touch on iOS
		if (e.sourceCapabilities?.firesTouchEvents) return;
		e.stopPropagation();
		armMouseSession(e.clientX, e.clientY);
	});

	// Touch / pen: pointer events (skip mouse — handled by mousedown above)
	stackEl.addEventListener(
		"pointerdown",
		(e) => {
			if (!canDrag() || e.button !== 0) return;
			if (e.pointerType === "mouse") return;
			e.stopPropagation();
			armTouchSession(e);
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
