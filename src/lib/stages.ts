export const STAGES = [
  "received",
  "waiting_for_frame",
  "material_procurement",
  "assembling",
  "delivery",
  "installed",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  received: "Received",
  waiting_for_frame: "Waiting for Frame",
  material_procurement: "Material Procurement",
  assembling: "Assembling",
  delivery: "Delivery",
  installed: "Installed",
};

export const STAGE_DOT: Record<Stage, string> = {
  received: "bg-stage-received",
  waiting_for_frame: "bg-stage-frame",
  material_procurement: "bg-stage-procurement",
  assembling: "bg-stage-assembling",
  delivery: "bg-stage-delivery",
  installed: "bg-stage-installed",
};

export const STAGE_SOFT: Record<Stage, string> = {
  received: "bg-stage-received/12 text-stage-received border-stage-received/30",
  waiting_for_frame: "bg-stage-frame/12 text-stage-frame border-stage-frame/30",
  material_procurement:
    "bg-stage-procurement/12 text-stage-procurement border-stage-procurement/30",
  assembling: "bg-stage-assembling/12 text-stage-assembling border-stage-assembling/30",
  delivery: "bg-stage-delivery/12 text-stage-delivery border-stage-delivery/30",
  installed: "bg-stage-installed/12 text-stage-installed border-stage-installed/30",
};

/** Minimum % of agreed price that must be paid before entering a stage. */
export const PAYMENT_GATE: Partial<Record<Stage, number>> = {
  waiting_for_frame: 50,
  material_procurement: 80,
};

export const PAYMENT_GATE_MESSAGE: Partial<Record<Stage, string>> = {
  waiting_for_frame: "At least 50% payment required before ordering the frame",
  material_procurement: "At least 80% payment required before starting material procurement",
};

export function stageIndex(stage: string) {
  const i = STAGES.indexOf(stage as Stage);
  return i < 0 ? 0 : i;
}

export const ROLE_LABEL: Record<string, string> = {
  sales_rep: "Sales Rep",
  engineer: "Engineer",
  chief_engineer: "Chief Engineer",
  admin: "Admin",
};

export const ROLE_HOME: Record<string, string> = {
  sales_rep: "/sales",
  chief_engineer: "/chief",
  engineer: "/engineer",
  admin: "/admin",
};
