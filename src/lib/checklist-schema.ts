/** Structure of the House of Maji "Machine Delivery Checklist & Handover Form". */

export type ChecklistRowDef = {
  key: string;
  label: string;
  standard?: string;
};

export type ChecklistSectionDef = {
  key: string;
  number: number;
  title: string;
  /** Extra free-text columns rendered before the status choice. */
  extra: { key: "qty" | "reading"; label: string }[];
  statusOptions: string[];
  statusLabel: string;
  hasRemarks: boolean;
  hasStandard?: boolean;
  rows: ChecklistRowDef[];
};

const rows = (...labels: string[]): ChecklistRowDef[] =>
  labels.map((label) => ({
    key: label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, ""),
    label,
  }));

export const CHECKLIST_SECTIONS: ChecklistSectionDef[] = [
  {
    key: "physical",
    number: 1,
    title: "Machine Physical Inspection",
    extra: [],
    statusOptions: ["Confirmed", "Not OK"],
    statusLabel: "Confirmed / Not OK",
    hasRemarks: true,
    rows: rows(
      "Machine frame condition",
      "Panel box condition",
      "Pipework fittings intact",
      "No leakages on joints",
      "Pressure gauges installed",
      "Flow meters installed",
      "Membrane housings fitted",
      "Filter vessels fitted correctly",
    ),
  },
  {
    key: "components",
    number: 2,
    title: "Components Delivery Confirmation",
    extra: [{ key: "qty", label: "Delivered / Qty" }],
    statusOptions: ["Delivered", "Missing"],
    statusLabel: "Delivered / Missing",
    hasRemarks: true,
    rows: rows(
      "Feed pump",
      "High-pressure pump",
      "Sand filter vessel",
      "Carbon filter vessel",
      "Softener vessel (if included)",
      "Micron filter housing",
      "RO membranes",
      "Sand media",
      "Activated carbon media",
      "Control panel complete",
      "Industrial salt",
      "UV system",
      "Dosing pumps (chlorine / antiscalant)",
      "Chemical tanks",
      "Booster pump (rinser) if included",
    ),
  },
  {
    key: "electrical",
    number: 3,
    title: "Electrical Delivery Check",
    extra: [],
    statusOptions: ["OK", "Not OK"],
    statusLabel: "OK / Not OK",
    hasRemarks: true,
    rows: rows(
      "Power cable provided",
      "Correct voltage requirement labeled",
      "MCB / MCCB installed",
      "Contactor / relay installed",
      "Emergency stop switch",
      "Indicator lights working",
      "Auto / manual selector",
    ),
  },
  {
    key: "function",
    number: 4,
    title: "Machine Function Test / Commissioning Check",
    extra: [],
    statusOptions: ["Passed", "Failed"],
    statusLabel: "Passed / Failed",
    hasRemarks: true,
    rows: rows(
      "Feed pump test run",
      "HP pump test run",
      "Pressure build-up test",
      "Dosing pump test",
      "Backwash operation tested",
      "Rinse operation tested",
      "Flush cycle tested",
      "Leak test completed",
    ),
  },
  {
    key: "water_quality",
    number: 5,
    title: "Water Quality Confirmation",
    extra: [{ key: "reading", label: "Reading" }],
    statusOptions: ["Pass", "Fail"],
    statusLabel: "Pass / Fail",
    hasRemarks: false,
    hasStandard: true,
    rows: [
      { key: "feed_water_tds", label: "Feed water TDS (ppm)", standard: "-" },
      { key: "product_water_tds", label: "Product water TDS (ppm)", standard: "< 50 ppm" },
      { key: "ph", label: "pH", standard: "6.5 – 8.5" },
      { key: "flow_rate", label: "Flow rate (LPH)", standard: "Rated capacity" },
    ],
  },
  {
    key: "documents",
    number: 6,
    title: "Documents Handed Over to Client",
    extra: [],
    statusOptions: ["Provided", "Not Provided"],
    statusLabel: "Provided / Not Provided",
    hasRemarks: true,
    rows: rows("Operation manual", "Preventive maintenance schedule"),
  },
  {
    key: "spares",
    number: 7,
    title: "Spare Parts / Consumables Supplied",
    extra: [{ key: "qty", label: "Qty" }],
    statusOptions: ["Confirmed", "Not supplied"],
    statusLabel: "Confirmed",
    hasRemarks: true,
    rows: rows(
      "Micron filter cartridges",
      "Spanners / tools (if any)",
      "Pipe fittings",
      "Membrane O-rings",
      "Chemicals (if supplied)",
    ),
  },
  {
    key: "training",
    number: 8,
    title: "Client Training Confirmation",
    extra: [],
    statusOptions: ["Done", "Not Done"],
    statusLabel: "Done / Not Done",
    hasRemarks: true,
    rows: rows(
      "Start / stop procedure",
      "Backwash process explained",
      "Chemical dosing explained",
      "Daily monitoring explained",
      "Basic troubleshooting explained",
    ),
  },
];

export type ChecklistCell = {
  status?: string;
  qty?: string;
  reading?: string;
  remarks?: string;
};

export type ChecklistSections = Record<string, Record<string, ChecklistCell>>;

export const TOTAL_ROWS = CHECKLIST_SECTIONS.reduce((n, s) => n + s.rows.length, 0);

export function filledRowCount(sections: ChecklistSections) {
  let n = 0;
  for (const section of CHECKLIST_SECTIONS) {
    for (const row of section.rows) {
      if (sections?.[section.key]?.[row.key]?.status) n += 1;
    }
  }
  return n;
}

export function isChecklistComplete(sections: ChecklistSections) {
  return filledRowCount(sections) === TOTAL_ROWS;
}
