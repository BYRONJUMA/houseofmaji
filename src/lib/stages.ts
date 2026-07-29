export const STAGES = [
  "received",
  "waiting_for_frame",
  "assembling",
  "delivery",
  "installed",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  received: "Received",
  waiting_for_frame: "Waiting for Frame",
  assembling: "Assembling",
  delivery: "Delivery",
  installed: "Installed",
};

export const STAGE_DOT: Record<Stage, string> = {
  received: "bg-stage-received",
  waiting_for_frame: "bg-stage-frame",
  assembling: "bg-stage-assembling",
  delivery: "bg-stage-delivery",
  installed: "bg-stage-installed",
};

export const STAGE_SOFT: Record<Stage, string> = {
  received: "bg-stage-received/12 text-stage-received border-stage-received/30",
  waiting_for_frame: "bg-stage-frame/12 text-stage-frame border-stage-frame/30",
  assembling: "bg-stage-assembling/12 text-stage-assembling border-stage-assembling/30",
  delivery: "bg-stage-delivery/12 text-stage-delivery border-stage-delivery/30",
  installed: "bg-stage-installed/12 text-stage-installed border-stage-installed/30",
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
