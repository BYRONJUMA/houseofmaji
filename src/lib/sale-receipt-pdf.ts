import { formatDate, formatKES } from "@/lib/format";

export type SaleReceiptPdfData = {
  invoiceNo: string;
  createdAt: string;
  branchName: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  status: string;
  servedBy: string;
  additionalInfo: string;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    taxPercent: number;
    lineTotal: number;
  }[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
};

export async function downloadSaleReceiptPdf(d: SaleReceiptPdfData) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 36;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text("HOUSE OF MAJI WATER TREATMENT LTD", pageWidth / 2, 44, { align: "center" });
  doc.setFontSize(11);
  doc.text("Sales Receipt", pageWidth / 2, 62, { align: "center" });
  doc.setFont("helvetica", "normal");

  autoTable(doc, {
    startY: 78,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    body: [
      ["Invoice No.", d.invoiceNo, "Date", formatDate(d.createdAt)],
      ["Customer", d.customerName, "Phone", d.customerPhone || "—"],
      ["Branch", d.branchName, "Served by", d.servedBy],
      ["Payment method", d.paymentMethod, "Status", d.status],
      ["Notes", d.additionalInfo || "—", "", ""],
    ],
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 110 },
      2: { fontStyle: "bold", cellWidth: 100 },
    },
  });

  const afterMeta = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  autoTable(doc, {
    startY: afterMeta + 16,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    head: [["Item", "Qty", "Price", "Disc %", "Tax %", "Total"]],
    body: [
      ...d.items.map((i) => [
        i.name,
        String(i.quantity),
        formatKES(i.unitPrice),
        `${i.discountPercent}%`,
        `${i.taxPercent}%`,
        formatKES(i.lineTotal),
      ]),
      ["", "", "", "", "Sub total", formatKES(d.subtotal)],
      ["", "", "", "", "Item discounts", formatKES(d.discountAmount)],
      ["", "", "", "", "Estimated tax", formatKES(d.taxAmount)],
      ["", "", "", "", "Total", formatKES(d.totalAmount)],
    ],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [30, 90, 140] },
    columnStyles: {
      1: { cellWidth: 42, halign: "right" },
      2: { cellWidth: 72, halign: "right" },
      3: { cellWidth: 48, halign: "right" },
      4: { cellWidth: 48, halign: "right" },
      5: { cellWidth: 90, halign: "right" },
    },
  });

  doc.save(`house-of-maji-${d.invoiceNo.toLowerCase()}.pdf`);
}
