import { getStackGradeLabel } from "./dom.js";

function escapeCsv(value) {
	const text = String(value ?? "");
	if (/[",\n\r]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

function csvLine(values) {
	return values.map(escapeCsv).join(",");
}

function downloadBlob(blob, filename) {
	const blobUrl = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = blobUrl;
	link.download = filename;
	link.rel = "noopener";
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export function downloadReportCsv({
	productLabel,
	rows,
	showGrade = false,
	showProduct = false,
	headingLabel = null,
	gradeFilter = "all",
	includeRejected = false,
	generatedAt = new Date(),
}) {
	let head;
	if (showProduct) {
		head = ["Contract #", "Product", "Shed", "Bay", "Bales"];
	} else if (showGrade) {
		head = ["Contract #", "Grade", "Shed", "Bay", "Bales"];
	} else {
		head = ["Contract #", "Shed", "Bay", "Bales"];
	}

	const body = rows.map((row) => {
		const bales = row.rejected ? `${row.bales} - Rej.` : String(row.bales);
		if (showProduct) {
			return [row.contract, row.product || "—", row.shed, row.bay, bales];
		}
		if (showGrade) {
			return [row.contract, getStackGradeLabel(row.grade) || "—", row.shed, row.bay, bales];
		}
		return [row.contract, row.shed, row.bay, bales];
	});

	const totalBales = rows.reduce((sum, row) => sum + row.bales, 0);
	const lines = [
		csvLine(["Hay Shed Inventory Report"]),
		csvLine([headingLabel || `Product: ${productLabel}`]),
	];

	if (showGrade && gradeFilter !== "all") {
		lines.push(csvLine([`Grade: ${getStackGradeLabel(gradeFilter)}`]));
	}

	lines.push(csvLine([`Include rejected: ${includeRejected ? "Yes" : "No"}`]));
	lines.push(csvLine([`Generated: ${generatedAt.toLocaleString()}`]));

	if (rows.length) {
		lines.push(
			csvLine([
				`${totalBales.toLocaleString()} bales in ${rows.length} location${rows.length === 1 ? "" : "s"}`,
			]),
		);
	} else {
		lines.push(csvLine(["No results found."]));
	}

	lines.push("");
	lines.push(csvLine(head));
	body.forEach((row) => lines.push(csvLine(row)));

	const slugSource = headingLabel || productLabel;
	const slug = slugSource.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	const datePart = generatedAt.toISOString().slice(0, 10);
	const filename = `${slug || "inventory"}-inventory-${datePart}.csv`;

	const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
		type: "text/csv;charset=utf-8",
	});
	downloadBlob(blob, filename);
}
