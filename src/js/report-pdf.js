import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const PDF_HEAD_COLOR = [109, 123, 78];
const PDF_ALT_ROW_COLOR = [250, 246, 239];

export function downloadReportPdf({ productLabel, rows, generatedAt = new Date() }) {
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

		autoTable(doc, {
			startY: cursorY + 14,
			head: [["Contract #", "Shed", "Bay", "Bales"]],
			body: rows.map((row) => [row.contract, row.shed, row.bay, String(row.bales)]),
			styles: {
				fontSize: 10,
				cellPadding: 6,
				textColor: [60, 53, 44],
			},
			headStyles: {
				fillColor: PDF_HEAD_COLOR,
				textColor: [255, 255, 255],
				fontStyle: "bold",
			},
			alternateRowStyles: {
				fillColor: PDF_ALT_ROW_COLOR,
			},
			columnStyles: {
				3: { halign: "right" },
			},
		});
	}

	const slug = productLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	const datePart = generatedAt.toISOString().slice(0, 10);
	doc.save(`${slug || "product"}-inventory-${datePart}.pdf`);
}
