import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getStackGradeLabel } from "./dom.js";

const PDF_HEAD_COLOR = [109, 123, 78];
const PDF_ROW_BORDER = [196, 181, 160];
const PDF_REJECTED_ROW = [253, 238, 238];
const PDF_ROW_FILL = [255, 254, 251];

export function openReportPdf({
	productLabel,
	rows,
	showGrade = false,
	gradeFilter = "all",
	includeRejected = false,
	generatedAt = new Date(),
}) {
	const doc = new jsPDF({
		orientation: "portrait",
		unit: "pt",
		format: "letter",
	});

	const marginX = 40;
	let cursorY = 40;

	doc.setFont("helvetica", "bold");
	doc.setFontSize(16);
	doc.text("Hay Shed Inventory Report", marginX, cursorY);

	cursorY += 22;
	doc.setFont("helvetica", "normal");
	doc.setFontSize(11);
	doc.text(`Product: ${productLabel}`, marginX, cursorY);

	cursorY += 16;
	if (showGrade && gradeFilter !== "all") {
		doc.text(`Grade: ${getStackGradeLabel(gradeFilter)}`, marginX, cursorY);
		cursorY += 16;
	}

	doc.text(`Include rejected: ${includeRejected ? "Yes" : "No"}`, marginX, cursorY);

	cursorY += 16;
	doc.text(`Generated: ${generatedAt.toLocaleString()}`, marginX, cursorY);

	if (rows.length === 0) {
		cursorY += 24;
		doc.text(`No ${productLabel} found in any shed.`, marginX, cursorY);
	} else {
		const totalBales = rows.reduce((sum, row) => sum + row.bales, 0);
		cursorY += 20;
		doc.text(
			`${totalBales.toLocaleString()} bales in ${rows.length} location${rows.length === 1 ? "" : "s"}`,
			marginX,
			cursorY,
		);

		const head = showGrade
			? [["Contract #", "Grade", "Shed", "Bay", "Bales"]]
			: [["Contract #", "Shed", "Bay", "Bales"]];
		const body = rows.map((row) => {
			const bales = row.rejected ? `${row.bales} - Rej.` : String(row.bales);
			if (showGrade) {
				const grade = getStackGradeLabel(row.grade) || "—";
				return [row.contract, grade, row.shed, row.bay, bales];
			}
			return [row.contract, row.shed, row.bay, bales];
		});

		autoTable(doc, {
			startY: cursorY + 14,
			head,
			body,
			styles: {
				fontSize: 10,
				cellPadding: 6,
				textColor: [60, 53, 44],
				fillColor: PDF_ROW_FILL,
				lineWidth: { top: 0, right: 0, bottom: 0.5, left: 0 },
				lineColor: PDF_ROW_BORDER,
			},
			headStyles: {
				fillColor: PDF_HEAD_COLOR,
				textColor: [255, 255, 255],
				fontStyle: "bold",
				lineWidth: { top: 0, right: 0, bottom: 0.5, left: 0 },
				lineColor: PDF_ROW_BORDER,
			},
			bodyStyles: {
				fillColor: PDF_ROW_FILL,
			},
			didParseCell(data) {
				if (data.section !== "body") return;

				data.cell.styles.lineWidth = { top: 0, right: 0, bottom: 0.5, left: 0 };
				data.cell.styles.lineColor = PDF_ROW_BORDER;
				data.cell.styles.fillColor = rows[data.row.index]?.rejected
					? PDF_REJECTED_ROW
					: PDF_ROW_FILL;
			},
			columnStyles: showGrade
				? { 4: { halign: "right" } }
				: { 3: { halign: "right" } },
		});
	}

	const slug = productLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	const datePart = generatedAt.toISOString().slice(0, 10);
	const filename = `${slug || "product"}-inventory-${datePart}.pdf`;
	const blobUrl = doc.output("bloburl");
	const pdfWindow = window.open(blobUrl, "_blank", "noopener,noreferrer");

	if (!pdfWindow) {
		doc.save(filename);
		return;
	}

	pdfWindow.document.title = filename;
}
