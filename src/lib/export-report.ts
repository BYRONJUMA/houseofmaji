import { todayStamp } from "@/lib/csv";

export function reportFilename(ext: string, scope?: string) {
  const suffix = scope ? `-${scope}` : "";
  return `house-of-maji-commissions${suffix}-${todayStamp()}.${ext}`;
}

export async function downloadPdf(
  headers: string[],
  rows: (string | number)[][],
  scope?: string,
  title = "Machines — Commissions",
) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(10);
  doc.text(todayStamp(), 14, 22);
  autoTable(doc, {
    head: [headers],
    body: rows.map((r) => r.map((c) => String(c))),
    startY: 28,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 90, 140] },
  });
  doc.save(reportFilename("pdf", scope));
}

export async function downloadXlsx(
  headers: string[],
  rows: (string | number)[][],
  scope?: string,
  sheetName = "Commissions",
) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  XLSX.writeFile(book, reportFilename("xlsx", scope));
}
