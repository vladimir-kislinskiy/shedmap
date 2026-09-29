import { applyIsleLayout, placeStackInContainer, reorderFrontAgainst, placeFullFrontBehindIsles } from "./dom.js";

const DRAG_THRESHOLD = 6;
const TOUCH_CANCEL_THRESHOLD = 10;
const LONG_PRESS_MS = 450;

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

function getDropTarget(clientX, clientY, dragContext, stackEl) {
	const el = document.elementFromPoint(clientX, clientY);
	if (!el || !dragContext) return null;

	const { mode, bayStack } = dragContext;
	const isFrontDrag = stackEl?.classList.contains("hay-stack--bay-front");

	if (mode === "isle") {
		if (isFrontDrag) {
			const frontTarget = el.closest(".hay-stack--bay-front");
			if (
				frontTarget
				&& frontTarget !== stackEl
				&& !frontTarget.classList.contains("hay-stack--dragging")
				&& bayStack.contains(frontTarget)
			) {
				return { type: "front-order", el: frontTarget, container: bayStack };
			}
		}

		const targetIsle = el.closest(".shed__isle");
		if (!targetIsle || !bayStack.contains(targetIsle)) return null;

		const stack = el.closest(".hay-stack");
		if (stack && !stack.classList.contains("hay-stack--dragging") && targetIsle.contains(stack)) {
			return { type: "stack", el: stack, container: targetIsle };
		}

		return { type: "column", el: targetIsle, container: targetIsle };
	}

	if (isFrontDrag) {
		const frontTarget = el.closest(".hay-stack--bay-front");
		if (
			frontTarget
			&& frontTarget !== stackEl
			&& !frontTarget.classList.contains("hay-stack--dragging")
			&& bayStack.contains(frontTarget)
		) {
			return { type: "front-order", el: frontTarget, container: bayStack };
		}

		const targetIsle = el.closest(".shed__isle");
		if (targetIsle && bayStack.contains(targetIsle)) {
			return { type: "front-behind-isles", el: targetIsle, container: bayStack };
		}
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
	if (target.type === "front-order") {
		const targetIsle = target.el.closest(".shed__isle");
		const targetIsleId = targetIsle?.dataset?.isle;
		if (dragContext.mode === "isle" && targetIsleId) {
			applyIsleLayout(stackEl, targetIsleId, dragContext.bayStack);
		}
		return reorderFrontAgainst(stackEl, target.el, clientY);
	}

	if (target.type === "front-behind-isles") {
		return placeFullFrontBehindIsles(stackEl, dragContext.bayStack);
	}

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

	const unlockScroll = () => {
		document.documentElement.classList.remove("page--dragging");
		document.body.classList.remove("page--dragging");
		if (session?.scrollLocked && typeof session.scrollX === "number") {
			window.scrollTo(session.scrollX, session.scrollY);
		}
	};

	const endSession = () => {
		if (!session) return;
		if (session.pressTimer) clearTimeout(session.pressTimer);
		if (session.ghost) session.ghost.remove();
		detach();
		stackEl.classList.remove("hay-stack--dragging", "hay-stack--pressing");
		clearDropHighlights();
		unlockScroll();
		session = null;
		document.dispatchEvent(new CustomEvent("hayshed:dragend"));
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

		stackEl.classList.remove("hay-stack--pressing");
		stackEl.classList.add("hay-stack--dragging");
		if (!session.scrollLocked) {
			session.scrollLocked = true;
			session.scrollX = window.scrollX;
			session.scrollY = window.scrollY;
		}
		document.documentElement.classList.add("page--dragging");
		document.body.classList.add("page--dragging");
		moveGhost(session.ghost, clientX, clientY, session.offsetX, session.offsetY);
	};

	const handleMove = (clientX, clientY) => {
		if (!session) return;

		if (!session.dragging) {
			const dx = clientX - session.startX;
			const dy = clientY - session.startY;
			const dist = Math.hypot(dx, dy);

			if (!session.isMouse) {
				if (dist > TOUCH_CANCEL_THRESHOLD) {
					endSession();
				}
				return;
			}

			if (dist > DRAG_THRESHOLD) {
				beginDrag(clientX, clientY);
			}
			return;
		}

		moveGhost(session.ghost, clientX, clientY, session.offsetX, session.offsetY);
		clearDropHighlights();
		const target = getDropTarget(clientX, clientY, session.dragContext, stackEl);
		if (!target?.el) return;
		target.el.classList.add(
			target.type === "stack" || target.type === "front-order"
				? "hay-stack--drop-target"
				: "shed__isle--drop-target",
		);
	};

	const handleEnd = (clientX, clientY) => {
		if (!session) return;

		if (session.dragging) {
			const target = getDropTarget(clientX, clientY, session.dragContext, stackEl);
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

	const onTouchMove = (e) => {
		if (!session || session.isMouse) return;
		const touch = [...e.touches].find((t) => t.identifier === session.touchId) || e.touches[0];
		if (!touch) return;
		if (session.dragging) {
			e.preventDefault();
			handleMove(touch.clientX, touch.clientY);
			return;
		}
		handleMove(touch.clientX, touch.clientY);
	};

	const onTouchEnd = (e) => {
		if (!session || session.isMouse) return;
		const touch =
			[...e.changedTouches].find((t) => t.identifier === session.touchId) || e.changedTouches[0];
		if (!touch) {
			endSession();
			return;
		}
		handleEnd(touch.clientX, touch.clientY);
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

	const clearTextUI = () => {
		const selection = window.getSelection?.();
		if (selection?.removeAllRanges) selection.removeAllRanges();
	};

	const armTouchSession = (e) => {
		if (!canDrag()) return;
		if (session) endSession();

		clearTextUI();

		session = {
			isMouse: false,
			pointerId: e.pointerId,
			touchId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			dragging: false,
			scrollLocked: false,
			listeners: [],
			pressTimer: setTimeout(() => {
				if (!session || session.dragging) return;
				clearTextUI();
				beginDrag(session.startX, session.startY);
			}, LONG_PRESS_MS),
		};

		stackEl.classList.add("hay-stack--pressing");

		track(window, "pointermove", onPointerMove, { passive: false });
		track(window, "pointerup", onPointerEnd);
		track(window, "pointercancel", onPointerEnd);
		track(window, "touchmove", onTouchMove, { passive: false, capture: true });
		track(window, "touchend", onTouchEnd, { capture: true });
		track(window, "touchcancel", onTouchEnd, { capture: true });
	};

	stackEl.addEventListener("mousedown", (e) => {
		if (e.button !== 0 || !canDrag()) return;
		if (e.sourceCapabilities?.firesTouchEvents) return;
		e.stopPropagation();
		armMouseSession(e.clientX, e.clientY);
	});

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

	const blockBrowserChrome = (e) => {
		e.preventDefault();
		e.stopPropagation();
	};

	stackEl.addEventListener("contextmenu", blockBrowserChrome);
	stackEl.addEventListener("selectstart", blockBrowserChrome);
	stackEl.addEventListener("dragstart", blockBrowserChrome);
	stackEl.addEventListener("gesturestart", blockBrowserChrome);
}
