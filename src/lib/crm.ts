/** Shared CRM constants, labels and small helpers. */

export const LEAD_STAGES = [
  "new",
  "contacted",
  "not_responding",
  "ghost",
  "qualified",
  "not_qualified",
  "showroom_demo",
  "quote_sent",
  "negotiation",
  "won",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  not_responding: "Not Responding",
  ghost: "Ghost",
  qualified: "Qualified",
  not_qualified: "Not Qualified",
  showroom_demo: "Showroom Demo",
  quote_sent: "Quote Sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

/** Stages that count as still-open pipeline. */
export const CLOSED_STAGES: string[] = ["won", "lost", "not_qualified", "ghost"];
export const isOpenStage = (stage: string) => !CLOSED_STAGES.includes(stage);

export const LEAD_TEMPS = ["hot", "warm", "cold"] as const;
export const TEMP_BADGE: Record<string, string> = {
  hot: "border-destructive/30 bg-destructive/10 text-destructive",
  warm: "border-warning/30 bg-warning/10 text-warning",
  cold: "border-primary/30 bg-primary/10 text-primary",
};

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
  contacted: "border-primary/30 bg-primary/10 text-primary",
  not_responding: BADGE_WARN,
  ghost: BADGE_NEUTRAL,
  qualified: "border-primary/30 bg-primary/10 text-primary",
  not_qualified: BADGE_NEUTRAL,
  showroom_demo: "border-primary/30 bg-primary/10 text-primary",
  quote_sent: BADGE_WARN,
  negotiation: BADGE_WARN,
  won: BADGE_GOOD,
  lost: BADGE_BAD,
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

export function serviceInterval(machineType?: string | null) {
  if (!machineType) return DEFAULT_SERVICE_INTERVAL_MONTHS;
  return SERVICE_INTERVAL_MONTHS[machineType] ?? DEFAULT_SERVICE_INTERVAL_MONTHS;
}

export const isCrmManager = (role?: string | null) => role === "admin" || role === "sales_manager";
export const isCrmMember = (role?: string | null) =>
  role === "admin" || role === "sales_manager" || role === "sales_rep";

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
