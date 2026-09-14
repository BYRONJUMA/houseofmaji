import { formatDate, formatKES } from "@/lib/format";

export type ServiceInvoicePdfData = {
  invoiceNo: string;
  createdAt: string;
  clientName: string;
  contact: string;
  machineType: string;
  serviceType: string;
  engineerName: string;
  diagnosisNotes: string;
  status: string;
  paymentMethod: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  subtotal: number;
};

export async function downloadServiceInvoicePdf(d: ServiceInvoicePdfData) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 36;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text("HOUSE OF MAJI WATER TREATMENT LTD", pageWidth / 2, 44, { align: "center" });
  doc.setFontSize(11);
  doc.text("Service Spare Parts Invoice", pageWidth / 2, 62, { align: "center" });
  doc.setFont("helvetica", "normal");

  autoTable(doc, {
    startY: 78,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    body: [
      ["Invoice No.", d.invoiceNo, "Date", formatDate(d.createdAt)],
      ["Client", d.clientName, "Contact", d.contact],
      ["Machine", d.machineType, "Service type", d.serviceType],
      ["Diagnosed by", d.engineerName, "Status", d.status],
      ["Payment method", d.paymentMethod, "", ""],
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
    head: [["Diagnosis"]],
    body: [[d.diagnosisNotes || "—"]],
    styles: { fontSize: 9, cellPadding: 6, minCellHeight: 40 },
    headStyles: { fillColor: [30, 90, 140] },
  });

  const afterNotes = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  autoTable(doc, {
    startY: afterNotes + 16,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    head: [["Spare part", "Qty", "Unit price", "Line total"]],
    body: [
      ...d.items.map((i) => [
        i.name,
        String(i.quantity),
        formatKES(i.unitPrice),
        formatKES(i.quantity * i.unitPrice),
      ]),
      ["", "", "Subtotal", formatKES(d.subtotal)],
    ],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [30, 90, 140] },
    columnStyles: {
      1: { cellWidth: 50, halign: "right" },
      2: { cellWidth: 100, halign: "right" },
      3: { cellWidth: 110, halign: "right" },
    },
  });

  doc.save(`house-of-maji-${d.invoiceNo.toLowerCase()}.pdf`);
}
