/** Shared CRM constants, labels and small helpers. */

export const LEAD_STAGES = ["new", "warm", "hot", "won", "not_won"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABEL: Record<string, string> = {
  new: "New",
  warm: "Warm",
  hot: "Hot",
  won: "Won",
  not_won: "Not Won",
};

/** Stages that count as still-open pipeline. */
export const CLOSED_STAGES: string[] = ["won", "not_won"];
export const isOpenStage = (stage: string) => !CLOSED_STAGES.includes(stage);

export const LEAD_SOURCES = [
  "walk_in",
  "phone",
  "whatsapp",
  "referral",
  "facebook",
  "instagram",
  "website",
  "field_visit",
  "other",
] as const;


export const label = (v?: string | null) =>
  !v ? "—" : v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const SCHOOL_STATUSES = ["prospect", "contacted", "visited"] as const;
export const PROJECT_STATUSES = ["ongoing", "complete"] as const;

export const BADGE_GOOD = "border-success/30 bg-success/10 text-success";
export const BADGE_WARN = "border-warning/30 bg-warning/10 text-warning";
export const BADGE_BAD = "border-destructive/30 bg-destructive/10 text-destructive";
export const BADGE_NEUTRAL = "border-border bg-secondary text-secondary-foreground";

export const LEAD_STAGE_BADGE: Record<string, string> = {
  new: BADGE_NEUTRAL,
  warm: BADGE_WARN,
  hot: BADGE_BAD,
  won: BADGE_GOOD,
  not_won: BADGE_NEUTRAL,
};


export const SCHOOL_STATUS_BADGE: Record<string, string> = {
  prospect: BADGE_NEUTRAL,
  contacted: BADGE_WARN,
  visited: BADGE_GOOD,
};

export const PROJECT_STATUS_BADGE: Record<string, string> = {
  ongoing: BADGE_WARN,
  complete: BADGE_GOOD,
};

/** Stock below this is flagged "Low". */
export const LOW_STOCK_THRESHOLD = 50;

/** Default months between service visits, per machine type. */
export const DEFAULT_SERVICE_INTERVAL_MONTHS = 6;
export const SERVICE_INTERVAL_MONTHS: Record<string, number> = {
  "RO 250LPH": 6,
  "RO 500LPH": 6,
  "RO 1000LPH": 4,
  UF: 6,
  Softener: 12,
};

export function serviceInterval(
  machineType?: string | null,
  fallback: number = DEFAULT_SERVICE_INTERVAL_MONTHS,
) {
  if (!machineType) return fallback;
  return SERVICE_INTERVAL_MONTHS[machineType] ?? fallback;
}

export const isCrmManager = (role?: string | null) => role === "admin" || role === "sales_head";
/** Roles that can open the CRM section (chief engineer has read-only context access). */
export const isCrmMember = (role?: string | null) =>
  role === "admin" || role === "sales_head" || role === "sales_rep" || role === "chief_engineer";
/** Roles allowed to create/edit CRM sales-side records. */
export const canWriteCrm = (role?: string | null) =>
  role === "admin" || role === "sales_head" || role === "sales_rep";

/* ------------------------------ dates ------------------------------ */

export function monthStart(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

export function monthEnd(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export function isoDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function monthLabel(d: Date) {
  return d.toLocaleDateString("en-KE", { month: "long", year: "numeric" });
}

export function daysBetween(a: Date | string, b: Date | string = new Date()) {
  const x = typeof a === "string" ? new Date(a) : a;
  const y = typeof b === "string" ? new Date(b) : b;
  return Math.floor((y.getTime() - x.getTime()) / 86_400_000);
}

export function pctChange(current: number, previous: number) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function formatPct(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(0)}%`;
}

export function num(v: unknown) {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}
