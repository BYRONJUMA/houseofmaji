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

/**
 * Leads-only stage colours: New = light blue, Warm = yellow-orange,
 * Hot = strong orange, Won = green, Not Won = red.
 * Deliberately separate from the Machines pipeline stage colours.
 */
export const LEAD_STAGE_BADGE: Record<string, string> = {
  new: "border-lead-new/35 bg-lead-new/10 text-lead-new",
  warm: "border-lead-warm/40 bg-lead-warm/15 text-lead-warm",
  hot: "border-lead-hot/40 bg-lead-hot/15 text-lead-hot",
  won: "border-lead-won/35 bg-lead-won/10 text-lead-won",
  not_won: "border-lead-notwon/35 bg-lead-notwon/10 text-lead-notwon",
};

/** Kanban column tint per lead stage. */
export const LEAD_STAGE_COLUMN: Record<string, string> = {
  new: "border-lead-new/30 bg-lead-new/5",
  warm: "border-lead-warm/30 bg-lead-warm/5",
  hot: "border-lead-hot/35 bg-lead-hot/5",
  won: "border-lead-won/30 bg-lead-won/5",
  not_won: "border-lead-notwon/30 bg-lead-notwon/5",
};

/* --------------------------- lead scoring --------------------------- */

export const LEAD_SCORING_CRITERIA = [
  { key: "showroom_visited", column: "showroom_visited_at", points: 5, label: "Visited the showroom" },
  {
    key: "water_test_or_site_visit_paid",
    column: "water_test_or_site_visit_paid_at",
    points: 5,
    label: "Paid for a water test / site assessment",
  },
  { key: "timeline_stated", column: "timeline_stated_at", points: 3, label: "Stated a purchase timeline" },
  {
    key: "responded_within_agreed_period",
    column: "responded_within_agreed_period_at",
    points: 3,
    label: "Responded within the agreed period",
  },
  { key: "budget_confirmed", column: "budget_confirmed_at", points: 2, label: "Confirmed their budget" },
  { key: "location_confirmed", column: "location_confirmed_at", points: 2, label: "Confirmed their location" },
] as const;

export type LeadCriterionKey = (typeof LEAD_SCORING_CRITERIA)[number]["key"];
export const MAX_LEAD_SCORE = 20;

/** Days until (positive) or since (negative) a follow-up due date. */
export function followUpCountdown(due?: string | null) {
  if (!due) return null;
  const ms = new Date(due).getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  return {
    days: Math.abs(days),
    overdue: ms < 0,
    text: ms < 0 ? `${Math.abs(days)}d overdue` : `${days}d until follow-up`,
    className: ms < 0 ? "text-destructive" : "text-success",
  };
}

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
/** Roles allowed to manage the machine taxonomy lists. */
export const canManageTaxonomy = (role?: string | null) =>
  role === "admin" || role === "sales_head" || role === "chief_engineer";
/** Roles allowed to see client contact details on service records. */
export const canSeeServiceContact = (role?: string | null) =>
  role === "admin" || role === "sales_head" || role === "chief_engineer";
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
