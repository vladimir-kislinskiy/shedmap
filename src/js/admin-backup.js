import { downloadHayShedStateBackup, readHayShedStateFile } from "./state-backup.js";

const ADMIN_EMAIL = "operations@barr-ag.com";
const STYLE_ID = "adt-styles";
const ROOT_ID = "adt-root";

let mounted = false;
let handlers = null;

const PANEL_STYLES = `
#${ROOT_ID}{margin-top:20px;padding:16px;border:1px solid var(--border-color);border-radius:var(--radius-md);background:var(--color-surface)}
#${ROOT_ID} h3{margin:0 0 8px;font-size:1rem}
#${ROOT_ID} p{margin:0 0 14px;font-size:.9rem;color:var(--text-muted);line-height:1.45;max-width:52rem}
.adt-actions{display:flex;flex-wrap:wrap;gap:10px}
.adt-btn{box-sizing:border-box;height:42px;min-height:42px;padding:10px 16px;font-size:15px;font-family:var(--font-primary);font-weight:600;color:var(--text-main);background:var(--color-surface);border:1px solid var(--border-color-strong);border-radius:var(--radius-sm);cursor:pointer;transition:var(--transition)}
.adt-btn:hover{border-color:var(--color-primary);color:var(--color-primary)}
.adt-btn--alt{color:var(--color-primary)}
.adt-status{margin:12px 0 0;font-size:.9rem;color:var(--color-primary)}
.adt-status[hidden]{display:none}
.adt-status--err{color:#b42318}
`;

function isAdminSession(email) {
	return email?.toLowerCase() === ADMIN_EMAIL;
}

function ensureStyles() {
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = PANEL_STYLES;
	document.head.appendChild(style);
}

function removeStyles() {
	document.getElementById(STYLE_ID)?.remove();
}

function showStatus(message, { isError = false } = {}) {
	const statusEl = document.getElementById("adt-status");
	if (!statusEl) return;

	statusEl.textContent = message;
	statusEl.hidden = !message;
	statusEl.classList.toggle("adt-status--err", isError);
}

async function exportBackup() {
	try {
		const state = handlers.collectAppState();
		downloadHayShedStateBackup(state, { exportedBy: handlers.exportedBy });
		showStatus("Backup downloaded.");
	} catch (err) {
		console.error("Backup export failed:", err);
		showStatus("Could not create backup.", { isError: true });
	}
}

async function restoreBackup(file) {
	try {
		const state = await readHayShedStateFile(file);
		const exportedAt = file.name || "backup file";

		if (
			!window.confirm(
				`Replace all sheds and the change log with data from "${exportedAt}"? This cannot be undone.`,
			)
		) {
			return;
		}

		await handlers.restoreState(state);
		showStatus("Backup restored to Firebase.");
	} catch (err) {
		console.error("Backup restore failed:", err);
		showStatus(err.message || "Could not restore backup.", { isError: true });
	}
}

function buildPanel() {
	const panel = document.createElement("section");
	panel.id = ROOT_ID;
	panel.setAttribute("aria-labelledby", "adt-title");

	panel.innerHTML = `
		<h3 id="adt-title">Backup &amp; restore</h3>
		<p>Download a JSON snapshot of sheds and the change log, or restore from a file.</p>
		<div class="adt-actions">
			<button type="button" id="adt-export" class="adt-btn">Download backup</button>
			<button type="button" id="adt-import" class="adt-btn adt-btn--alt">Restore from file</button>
			<input type="file" id="adt-file" accept=".json,application/json" hidden>
		</div>
		<p class="adt-status" id="adt-status" hidden role="status"></p>
	`;

	panel.querySelector("#adt-export").addEventListener("click", exportBackup);
	panel.querySelector("#adt-import").addEventListener("click", () => panel.querySelector("#adt-file").click());
	panel.querySelector("#adt-file").addEventListener("change", (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (file) restoreBackup(file);
	});

	return panel;
}

export function mountAdminBackup(email, { collectAppState, restoreState, exportedBy }) {
	if (!isAdminSession(email)) {
		unmountAdminBackup();
		return;
	}

	if (mounted) return;

	const logSection = document.getElementById("Log");
	if (!logSection) return;

	ensureStyles();
	handlers = { collectAppState, restoreState, exportedBy };
	logSection.appendChild(buildPanel());
	mounted = true;
}

export function unmountAdminBackup() {
	document.getElementById(ROOT_ID)?.remove();
	removeStyles();
	mounted = false;
	handlers = null;
}
