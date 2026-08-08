import { CHECKLIST_SECTIONS, type ChecklistSections } from "@/lib/checklist-schema";
import { formatDate } from "@/lib/format";

export type ChecklistPdfMeta = {
  deliveryNo: string;
  dateDelivered: string | null;
  clientName: string;
  projectSite: string;
  clientContact: string;
  machineType: string;
  capacityLph: string;
  machineSerialNo: string;
  deliveredBy: string;
};

export type ChecklistPdfData = {
  sections: ChecklistSections;
  remarks: string;
  engineerName: string;
  engineerAt: string | null;
  clientSignature: string | null;
  clientAt: string | null;
  chiefName: string;
  chiefAt: string | null;
};

const BLANK: ChecklistPdfData = {
  sections: {},
  remarks: "",
  engineerName: "",
  engineerAt: null,
  clientSignature: null,
  clientAt: null,
  chiefName: "",
  chiefAt: null,
};

export async function downloadChecklistPdf(
  meta: ChecklistPdfMeta,
  data: ChecklistPdfData | null,
  filenameSuffix: "blank" | "filled",
) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;
  const filled = data ?? BLANK;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 36;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text("HOUSE OF MAJI WATER TREATMENT LTD", pageWidth / 2, 44, { align: "center" });
  doc.setFontSize(11);
  doc.text("Machine Delivery Checklist & Handover Form", pageWidth / 2, 62, { align: "center" });
  doc.setFont("helvetica", "normal");

  const blank = (v: string) => (filenameSuffix === "blank" ? "" : v);

  autoTable(doc, {
    startY: 78,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    body: [
      ["Delivery No.", blank(meta.deliveryNo), "Date Delivered", blank(meta.dateDelivered ? formatDate(meta.dateDelivered) : "")],
      ["Client Name", blank(meta.clientName), "Project Site", blank(meta.projectSite)],
      ["Client Contact", blank(meta.clientContact), "Machine Type", blank(meta.machineType)],
      ["Capacity (LPH)", blank(meta.capacityLph), "Machine Serial No.", blank(meta.machineSerialNo)],
      ["Delivered By (Technician)", blank(meta.deliveredBy), "", ""],
    ],
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 120 },
      2: { fontStyle: "bold", cellWidth: 110 },
    },
  });

  for (const section of CHECKLIST_SECTIONS) {
    const head = [
      "Item",
      ...section.extra.map((e) => e.label),
      ...(section.hasStandard ? ["Standard"] : []),
      section.statusLabel,
      ...(section.hasRemarks ? ["Remarks"] : []),
    ];
    const body = section.rows.map((row) => {
      const cell = filled.sections?.[section.key]?.[row.key] ?? {};
      return [
        row.label,
        ...section.extra.map((e) => (filenameSuffix === "blank" ? "" : (cell[e.key] ?? ""))),
        ...(section.hasStandard ? [row.standard ?? ""] : []),
        filenameSuffix === "blank" ? "" : (cell.status ?? ""),
        ...(section.hasRemarks ? [filenameSuffix === "blank" ? "" : (cell.remarks ?? "")] : []),
      ];
    });

    const prevY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

    autoTable(doc, {
      startY: prevY + 16,
      margin: { left: marginX, right: marginX, top: 48 },
      theme: "grid",
      head: [
        [
          {
            content: `${section.number}. ${section.title}`,
            colSpan: head.length,
            styles: { fillColor: [17, 55, 85] as [number, number, number], halign: "left" as const },
          },
        ],
        head,
      ],
      body,
      styles: { fontSize: 8.5, cellPadding: 4, minCellHeight: 16 },
      headStyles: { fillColor: [30, 90, 140], fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 150 } },
    });
  }

  const afterSections = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY;
  let y = afterSections + 24;
  if (y > doc.internal.pageSize.getHeight() - 220) {
    doc.addPage();
    y = 60;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("9. Delivery & Handover Approval", marginX, y);
  doc.setFont("helvetica", "normal");


  autoTable(doc, {
    startY: y + 8,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4, minCellHeight: 28 },
    body: [["Remarks / Notes", filenameSuffix === "blank" ? "" : filled.remarks]],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 120 } },
  });

  const signStart =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;

  autoTable(doc, {
    startY: signStart,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    head: [["Role", "Name / Signature", "Date"]],
    body: [
      [
        "Delivered & Installed By",
        filenameSuffix === "blank" ? "" : filled.engineerName,
        filenameSuffix === "blank" ? "" : filled.engineerAt ? formatDate(filled.engineerAt) : "",
      ],
      [
        "Received By (Client)",
        "",
        filenameSuffix === "blank" ? "" : filled.clientAt ? formatDate(filled.clientAt) : "",
      ],
      [
        "Approved By (Chief Engineer)",
        filenameSuffix === "blank" ? "" : filled.chiefName,
        filenameSuffix === "blank" ? "" : filled.chiefAt ? formatDate(filled.chiefAt) : "",
      ],
    ],
    styles: { fontSize: 9, cellPadding: 6, minCellHeight: 44 },
    headStyles: { fillColor: [30, 90, 140] },
    columnStyles: { 0: { cellWidth: 160, fontStyle: "bold" }, 2: { cellWidth: 90 } },
    didDrawCell: (hook) => {
      if (
        filenameSuffix === "filled" &&
        filled.clientSignature &&
        hook.section === "body" &&
        hook.row.index === 1 &&
        hook.column.index === 1
      ) {
        try {
          doc.addImage(
            filled.clientSignature,
            "PNG",
            hook.cell.x + 4,
            hook.cell.y + 4,
            Math.min(hook.cell.width - 8, 140),
            hook.cell.height - 8,
          );
        } catch {
          /* ignore malformed signature data */
        }
      }
    },
  });

  doc.save(
    `house-of-maji-delivery-checklist-${filenameSuffix}-${(meta.deliveryNo || "form").replace(/\//g, "-")}.pdf`,
  );
}
