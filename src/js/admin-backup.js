import { downloadHayShedStateBackup, readHayShedStateFile } from "./state-backup.js";

const ADMIN_EMAIL = "operations@barr-ag.com";
const ROOT_ID = "adt-root";

let mounted = false;
let handlers = null;

function isAdminSession(email) {
	return email?.toLowerCase() === ADMIN_EMAIL;
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
				`Replace all sheds and change logs (Olds and Siksika) with data from "${exportedAt}"? This cannot be undone.`,
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
			<button type="button" id="adt-import" class="adt-btn">Restore from file</button>
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

	handlers = { collectAppState, restoreState, exportedBy };
	logSection.appendChild(buildPanel());
	mounted = true;
}

export function unmountAdminBackup() {
	document.getElementById(ROOT_ID)?.remove();
	mounted = false;
	handlers = null;
}
