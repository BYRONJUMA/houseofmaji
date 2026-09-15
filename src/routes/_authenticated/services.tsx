import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  History as HistoryIcon,
  MoreVertical,
  Plus,
  ReceiptText,
  Stethoscope,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth, personHasRole, useAllUserRoles } from "@/hooks/use-auth";
import { useSettings, settingNumber, useMachineTypeOptions } from "@/hooks/use-crm-extra";
import { formatDate, formatKES } from "@/lib/format";
import {
  serviceIntervalFor,
  isoDate,
  daysBetween,
  BADGE_GOOD,
  BADGE_WARN,
  BADGE_BAD,
  BADGE_NEUTRAL,
  canSeeServiceContact,
  hasAnyRole,
  type RoleInput,
} from "@/lib/crm";
import { useServices, useTeam, useCrmMutation, nameOf, type ServiceRecord } from "@/hooks/use-crm";
import { useServiceVisitLog } from "@/hooks/use-service-visits";
import { useServiceInvoices } from "@/hooks/use-service-diagnosis";
import {
  DiagnosisDialog,
  ServiceInvoiceDialog,
  latestInvoice,
} from "@/components/service-diagnosis";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = ["all", "red", "orange", "green", "unscheduled"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export const Route = createFileRoute("/_authenticated/services")({
  validateSearch: (input: Record<string, unknown>) => ({
    status: STATUS_FILTERS.includes(input.status as StatusFilter)
      ? (input.status as StatusFilter)
      : "all",
  }),
  head: () => ({
    meta: [
      { title: "Service Visits — Machines" },
      {
        name: "description",
        content:
          "Maintenance schedule for installed machines: last visit, next due date and overdue alerts.",
      },
      { property: "og:title", content: "Service Visits — Machines" },
      { property: "og:description", content: "Never miss a scheduled machine service again." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ServicesPage,
});

const CAN_CREATE = ["admin", "chief_engineer", "engineer", "sales_head"];
const CAN_DELETE = ["admin", "chief_engineer", "sales_head"];

type ServiceType = "commercial_industrial" | "undersink";
const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: "commercial_industrial", label: "Commercial / Industrial" },
  { value: "undersink", label: "Undersink" },
];
const typeLabel = (t: string | null | undefined) =>
  SERVICE_TYPES.find((x) => x.value === t)?.label ?? "Unclassified";

/** Who may edit/complete a specific service record. */
function canEditRecord(role: RoleInput, uid: string | undefined, s: ServiceRecord) {
  if (hasAnyRole(role, "admin", "chief_engineer", "sales_head")) return true;
  if (uid && s.recorded_by === uid) return true;
  return !!uid && s.assigned_engineer_id === uid;
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Map the URL status filter to a due-zone. */
const STATUS_ZONE: Record<StatusFilter, Zone | "all"> = {
  all: "all",
  red: "bad",
  orange: "warn",
  green: "good",
  unscheduled: "none",
};

function zoneOf(s: ServiceRecord): Zone {
  return dueBadge(s.next_due_date).zone;
}

function StatTile({
  label,
  value,
  hint,
  status,
  active,
}: {
  label: string;
  value: string;
  hint?: string;
  status: StatusFilter;
  active: boolean;
}) {
  return (
    <Link
      to="/services"
      search={{ status }}
      aria-current={active ? "true" : undefined}
      className={cn(
        "surface-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active && "border-primary/60 ring-1 ring-primary/30",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Link>
  );
}

function daysUntil(next: string) {
  const [year, month, day] = next.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return daysBetween(new Date(), next);
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const dueUtc = Date.UTC(year, month - 1, day);
  return Math.round((dueUtc - todayUtc) / 86_400_000);
}

type Zone = "good" | "warn" | "bad" | "none";

function dueBadge(next: string | null) {
  if (!next) return { cls: BADGE_NEUTRAL, text: "Not scheduled", zone: "none" as Zone };
  const days = daysUntil(next);
  if (days < 0) {
    const overdueDays = Math.abs(days);
    return {
      cls: BADGE_BAD,
      text: `${overdueDays} ${overdueDays === 1 ? "day" : "days"} overdue`,
      zone: "bad" as Zone,
    };
  }
  if (days === 0) return { cls: BADGE_BAD, text: "Due today", zone: "bad" as Zone };
  const text = `${days} ${days === 1 ? "day" : "days"} remaining`;
  if (days <= 3) return { cls: BADGE_BAD, text, zone: "bad" as Zone };
  if (days <= 5) return { cls: BADGE_WARN, text, zone: "warn" as Zone };
  return { cls: BADGE_GOOD, text, zone: "good" as Zone };
}

const ZONE_ICON: Record<Zone, { Icon: typeof CheckCircle2; cls: string }> = {
  good: { Icon: CheckCircle2, cls: "text-success" },
  warn: { Icon: Clock, cls: "text-warning" },
  bad: { Icon: AlertCircle, cls: "text-destructive" },
  none: { Icon: AlertCircle, cls: "text-muted-foreground" },
};

/** Large color-coded icon shown beside the client name. */
function DueIcon({ next }: { next: string | null }) {
  const b = dueBadge(next);
  const { Icon, cls } = ZONE_ICON[b.zone];
  return (
    <span title={b.text}>
      <Icon className={cn("h-6 w-6 shrink-0", cls)} aria-label={b.text} />
    </span>
  );
}

/** Day-count text shown separately, near the record's other details. */
function DueText({ next }: { next: string | null }) {
  const b = dueBadge(next);
  return <Badge className={b.cls}>{b.text}</Badge>;
}

export function useServiceFulfillments() {
  return useQuery({
    queryKey: ["service-fulfillments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fulfillments")
        .select("id, client_name, client_contact, machine_type, location, capacity_lph")
        .order("client_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function ServicesPage() {
  const { profile, hasRole, roles } = useAuth();
  const canCreate = roles.some((r) => CAN_CREATE.includes(r));
  const canAssign = hasRole("chief_engineer") || hasRole("admin");
  const showContact = canSeeServiceContact(roles);
  const canEditAny = (s: ServiceRecord) => canEditRecord(roles, profile?.id, s);
  const { data: services = [] } = useServices();
  const { data: settings } = useSettings();
  const { data: team = [] } = useTeam();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ServiceRecord | null>(null);
  const mutate = useCrmMutation("services", ["crm-services"]);
  const { status } = Route.useSearch();

  const overdue = services.filter((s) => s.next_due_date && daysUntil(s.next_due_date) < 0);
  const dueSoon = services.filter((s) => {
    if (!s.next_due_date) return false;
    const d = daysUntil(s.next_due_date);
    return d >= 0 && d <= 30;
  });
  const unscheduled = services.filter((s) => !s.next_due_date);

  // Zone counts drive the clickable summary tiles.
  const redCount = services.filter((s) => zoneOf(s) === "bad").length;
  const orangeCount = services.filter((s) => zoneOf(s) === "warn").length;
  const greenCount = services.filter((s) => zoneOf(s) === "good").length;
  const unscheduledCount = unscheduled.length;
  const statusActive = status;

  const [tab, setTab] = useState<ServiceType | "unclassified">("commercial_industrial");
  const canDelete = roles.some((r) => CAN_DELETE.includes(r));
  const counts = {
    commercial_industrial: services.filter(
      (s) => s.machine_service_type === "commercial_industrial",
    ).length,
    undersink: services.filter((s) => s.machine_service_type === "undersink").length,
    unclassified: services.filter((s) => !s.machine_service_type).length,
  };
  const visible = services.filter((s) => {
    const byTab = tab === "unclassified" ? !s.machine_service_type : s.machine_service_type === tab;
    const byStatus = status === "all" ? true : zoneOf(s) === STATUS_ZONE[status];
    return byTab && byStatus;
  });

  const statusLabel =
    status === "all"
      ? null
      : status === "red"
        ? "due ≤3 days / overdue"
        : status === "orange"
          ? "due in 4–5 days"
          : status === "green"
            ? "on track (>5 days)"
            : "not scheduled";

  return (
    <AppShell
      title="Services"
      subtitle={
        canCreate
          ? `${services.length} machines on the service schedule · ${overdue.length} overdue.`
          : `Read-only service history for your clients' machines.`
      }
      actions={
        canCreate ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Log service
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <StatTile
            label="Machines on schedule"
            value={String(services.length)}
            hint="all machines"
            status="all"
            active={statusActive === "all"}
          />
          <StatTile
            label="Overdue / due soon"
            value={String(redCount)}
            hint="≤3 days or past due"
            status="red"
            active={statusActive === "red"}
          />
          <StatTile
            label="Due soon"
            value={String(orangeCount)}
            hint="4–5 days remaining"
            status="orange"
            active={statusActive === "orange"}
          />
          <StatTile
            label="On track"
            value={String(greenCount)}
            hint=">5 days remaining"
            status="green"
            active={statusActive === "green"}
          />
          <StatTile
            label="Not scheduled"
            value={String(unscheduledCount)}
            hint="needs a due date"
            status="unscheduled"
            active={statusActive === "unscheduled"}
          />
        </div>

        {status !== "all" && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Filtered: <span className="font-semibold text-foreground">{statusLabel}</span>
            </span>
            <Link
              to="/services"
              search={{ status: "all" }}
              className="ml-auto rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-secondary"
            >
              Clear filter
            </Link>
          </div>
        )}

        {canCreate && (overdue.length > 0 || dueSoon.length > 0) && (
          <section className="surface-card p-4 sm:p-5">
            <h2 className="mb-4 text-base font-semibold">Visit queue</h2>
            <div className="space-y-2">
              {[...overdue, ...dueSoon].map((s) => {
                return (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-2.5"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{s.client_name}</p>
                        <DueIcon next={s.next_due_date} />
                      </div>
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {s.machine_type || "machine"}
                          {showContact ? ` · ${s.contact || "no contact"}` : ""} · due{" "}
                          {formatDate(s.next_due_date)}
                        </span>
                        <DueText next={s.next_due_date} />
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {nameOf(team, s.assigned_engineer_id)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "commercial_industrial", label: "Commercial / Industrial" },
              { key: "undersink", label: "Undersink" },
              { key: "unclassified", label: "Unclassified" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                tab === t.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {t.label} ({counts[t.key]})
            </button>
          ))}
        </div>

        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Client</th>
                {showContact && <th className="px-3 py-2">Contact</th>}
                <th className="px-3 py-2">Machine</th>
                <th className="px-3 py-2">Service type</th>
                <th className="px-3 py-2">Linked order</th>
                <th className="px-3 py-2">Last service</th>
                <th className="px-3 py-2">Next due</th>
                <th className="px-3 py-2">Recorded by</th>
                <th className="px-3 py-2">Assigned to</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                return (
                  <tr
                    key={s.id}
                    onClick={() => canEditAny(s) && setEditing(s)}
                    className={cn(
                      "border-t border-border transition-colors",
                      canEditAny(s) && "cursor-pointer hover:bg-secondary/50",
                    )}
                  >
                    <td className="px-3 py-2 font-medium">
                      <div className="flex items-center gap-2">
                        {s.client_name}
                        <DueIcon next={s.next_due_date} />
                      </div>
                    </td>
                    {showContact && <td className="px-3 py-2">{s.contact || "—"}</td>}
                    <td className="px-3 py-2">{s.machine_type || "—"}</td>
                    <td className="px-3 py-2">
                      {s.machine_service_type ? (
                        <Badge className={BADGE_NEUTRAL}>{typeLabel(s.machine_service_type)}</Badge>
                      ) : (
                        <Badge className={BADGE_WARN}>Unclassified</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">{s.fulfillment_id ? "Linked" : "Manual"}</td>
                    <td className="px-3 py-2">{formatDate(s.last_service_date)}</td>
                    <td className="px-3 py-2">
                      {s.next_due_date ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <DueText next={s.next_due_date} />
                          <span className="text-xs text-muted-foreground">
                            {formatDate(s.next_due_date)}
                          </span>
                        </div>
                      ) : (
                        <DueText next={s.next_due_date} />
                      )}
                    </td>
                    <td className="px-3 py-2">{nameOf(team, s.recorded_by)}</td>
                    <td className="px-3 py-2">
                      {s.assigned_engineer_id ? (
                        nameOf(team, s.assigned_engineer_id)
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div
                        className="flex items-center justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {!s.machine_service_type && canEditAny(s) && <SetServiceType record={s} />}
                        {canAssign && <AssignEngineer record={s} />}
                        <ServiceRowMenu
                          record={s}
                          canDelete={canDelete}
                          canComplete={canEditAny(s)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                    No service records in this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || (editing && canEditAny(editing))) && (
        <ServiceDialog
          record={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </AppShell>
  );
}

function ServiceDialog({ record, onClose }: { record: ServiceRecord | null; onClose: () => void }) {
  const { profile, hasRole, roles } = useAuth();
  const mutate = useCrmMutation("services", ["crm-services"]);
  const { data: settings } = useSettings();
  const commercialMonths = settingNumber(settings, "service_interval_commercial_months");
  const undersinkMonths = settingNumber(settings, "service_interval_undersink_months");
  const machineTypes = useMachineTypeOptions();
  const showContact = canSeeServiceContact(roles);
  const { data: fulfillments = [] } = useServiceFulfillments();
  const [search, setSearch] = useState("");
  const [f, setF] = useState({
    fulfillment_id: record?.fulfillment_id ?? "none",
    client_name: record?.client_name ?? "",
    contact: record?.contact ?? "",
    machine_type: record?.machine_type ?? "",
    machine_service_type: record?.machine_service_type ?? "",
    last_service_date: record?.last_service_date ?? "",
    next_due_date: record?.next_due_date ?? "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? fulfillments.filter(
          (x) =>
            x.client_name.toLowerCase().includes(q) ||
            (x.machine_type ?? "").toLowerCase().includes(q),
        )
      : fulfillments;
    return list.slice(0, 50);
  }, [fulfillments, search]);

  const pickFulfillment = (id: string) => {
    if (id === "none") {
      set("fulfillment_id", "none");
      return;
    }
    const m = fulfillments.find((x) => x.id === id);
    setF((p) => ({
      ...p,
      fulfillment_id: id,
      client_name: m?.client_name ?? p.client_name,
      contact: showContact ? (m?.client_contact ?? p.contact) : p.contact,
      machine_type: m?.machine_type ?? p.machine_type,
    }));
  };

  const submit = () => {
    if (!f.client_name.trim()) {
      toast.error("Client name is required");
      return;
    }
    if (!record && !f.machine_service_type) {
      toast.error("Pick a service type");
      return;
    }
    let next = f.next_due_date;
    if (!next && f.last_service_date) {
      const d = new Date(f.last_service_date);
      d.setMonth(
        d.getMonth() +
          serviceIntervalFor(f.machine_service_type, commercialMonths, undersinkMonths),
      );
      next = isoDate(d);
    }
    const values = {
      fulfillment_id: f.fulfillment_id === "none" ? null : f.fulfillment_id,
      client_name: f.client_name.trim(),
      ...(showContact ? { contact: f.contact.trim() || null } : {}),
      machine_type: f.machine_type.trim() || null,
      machine_service_type: (f.machine_service_type || null) as ServiceType | null,
      last_service_date: f.last_service_date || null,
      next_due_date: next || null,
      ...(record ? {} : { recorded_by: profile?.id ?? null }),
    };
    mutate.mutate(record ? { type: "update", id: record.id, values } : { type: "insert", values }, {
      onSuccess: () => {
        toast.success(record ? "Record updated" : "Service record added");
        onClose();
      },
      onError: (e: unknown) => toast.error((e as Error).message),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record ? "Edit service record" : "Log a service machine"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Search machine orders</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client or machine type"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Linked machine order</Label>
            <Select value={f.fulfillment_id} onValueChange={pickFulfillment}>
              <SelectTrigger>
                <SelectValue placeholder="Select order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked (manual entry)</SelectItem>
                {matches.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.client_name} · {m.machine_type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Linking pulls client details and machine type from the order. Leave unlinked for older
              machines.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Client name</Label>
            <Input value={f.client_name} onChange={(e) => set("client_name", e.target.value)} />
          </div>
          {showContact && (
            <div className="space-y-1.5">
              <Label>Contact</Label>
              <Input value={f.contact} onChange={(e) => set("contact", e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Service type {!record && <span className="text-destructive">*</span>}</Label>
            <Select
              value={f.machine_service_type || undefined}
              onValueChange={(v) => set("machine_service_type", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Commercial / Industrial or Undersink" />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Machine type</Label>
            <Select
              value={f.machine_type || "none"}
              onValueChange={(v) => set("machine_type", v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select machine" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unspecified</SelectItem>
                {machineTypes.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
                {f.machine_type && !machineTypes.includes(f.machine_type) && (
                  <SelectItem value={f.machine_type}>{f.machine_type}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Last service date</Label>
            <Input
              type="date"
              value={f.last_service_date}
              onChange={(e) => set("last_service_date", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Next due date</Label>
            <Input
              type="date"
              value={f.next_due_date}
              onChange={(e) => set("next_due_date", e.target.value)}
            />
          </div>
        </div>
        <Button onClick={submit} disabled={mutate.isPending}>
          {record ? "Save changes" : "Add service record"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Row overflow menu: Mark complete + Delete, permission-scoped. */
function ServiceRowMenu({
  record,
  canDelete,
  canComplete,
}: {
  record: ServiceRecord;
  canDelete: boolean;
  canComplete: boolean;
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const commercialMonths = settingNumber(settings, "service_interval_commercial_months");
  const undersinkMonths = settingNumber(settings, "service_interval_undersink_months");
  const undersinkCommission = settingNumber(settings, "service_commission_undersink_kes");
  const commercialCommission = settingNumber(settings, "service_commission_commercial_kes");
  const mutate = useCrmMutation("services", ["crm-services"]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const { data: invoices = [] } = useServiceInvoices();
  const invoice = latestInvoice(invoices, record.id);
  const invoiceBlocks = !!invoice && invoice.status !== "cleared";
  const showComplete = canComplete && !!record.assigned_engineer_id;

  /**
   * Completing a visit closes the cycle and immediately schedules the next one.
   * The whole action runs in one locked database transaction, so a double-click or a
   * second person completing the same cycle is rejected instead of duplicating work.
   */
  const markComplete = async () => {
    setCompleting(true);
    try {
      const { data, error } = await supabase.rpc(
        "service_mark_complete" as never,
        {
          _service_id: record.id,
          _expected_next_due_date: record.next_due_date ?? null,
        } as never,
      );
      if (error) throw error;

      const result = (data ?? {}) as {
        next_due_date?: string;
        commission_recorded?: boolean;
        amount_kes?: number;
      };
      const nextDue = result.next_due_date ?? "";
      const commissionNote = result.commission_recorded
        ? `${formatKES(Number(result.amount_kes ?? 0))} commission recorded`
        : "This service has no machine type set — no commission will be recorded until one is chosen";

      void qc.invalidateQueries({ queryKey: ["crm-services"] });
      void qc.invalidateQueries({ queryKey: ["service-visit-log", record.id] });
      void qc.invalidateQueries({ queryKey: ["fulfillment-services"] });
      void qc.invalidateQueries({ queryKey: ["commissions"] });
      const baseMsg = `Visit logged — next service due ${formatDate(nextDue)}`;
      if (!result.commission_recorded) toast.warning(`${baseMsg}. ${commissionNote}`);
      else toast.success(`${baseMsg} · ${commissionNote}`);
      void qc.invalidateQueries({ queryKey: ["crm-services"] });
    } catch (e) {
      const msg = (e as Error).message;
      toast.error(msg);
      if (msg.startsWith("Already marked complete"))
        void qc.invalidateQueries({ queryKey: ["crm-services"] });
    } finally {
      setCompleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" aria-label="More actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {showComplete && (
            <DropdownMenuItem
              disabled={completing || invoiceBlocks}
              onClick={() => void markComplete()}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {invoiceBlocks ? "Mark complete (invoice pending)" : "Mark complete"}
            </DropdownMenuItem>
          )}
          {canComplete && !invoice && (
            <DropdownMenuItem onClick={() => setDiagnosisOpen(true)}>
              <Stethoscope className="mr-2 h-4 w-4" /> Record diagnosis &amp; parts
            </DropdownMenuItem>
          )}
          {invoice && (
            <DropdownMenuItem onClick={() => setInvoiceOpen(true)}>
              <ReceiptText className="mr-2 h-4 w-4" /> Service invoice ({invoice.invoice_no})
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
            <HistoryIcon className="mr-2 h-4 w-4" /> Visit history
          </DropdownMenuItem>
          {canDelete && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this service record — are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                mutate.mutate(
                  { type: "delete", id: record.id },
                  {
                    onSuccess: () => toast.success("Service record deleted"),
                    onError: (e: unknown) => toast.error((e as Error).message),
                  },
                )
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {historyOpen && <VisitHistoryDialog record={record} onClose={() => setHistoryOpen(false)} />}
      {diagnosisOpen && <DiagnosisDialog record={record} onClose={() => setDiagnosisOpen(false)} />}
      {invoiceOpen && (
        <ServiceInvoiceDialog record={record} onClose={() => setInvoiceOpen(false)} />
      )}
    </>
  );
}

/** Past completed visits for one machine — the main record resets after each cycle. */
function VisitHistoryDialog({ record, onClose }: { record: ServiceRecord; onClose: () => void }) {
  const { data: team = [] } = useTeam();
  const { data: log = [], isLoading } = useServiceVisitLog(record.id);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Visit history — {record.client_name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : log.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            No completed visits recorded yet.
          </p>
        ) : (
          <div className="space-y-2">
            {log.map((v) => (
              <div key={v.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-success" aria-label="Visit completed" />
                  Completed {formatDate(v.completed_at)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  by {nameOf(team, v.completed_by)} · next visit scheduled for{" "}
                  {formatDate(v.next_due_date_set_to)}
                </p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AssignEngineer({ record }: { record: ServiceRecord }) {
  const { profile, hasRole, roles } = useAuth();
  const { data: team = [] } = useTeam();
  const mutate = useCrmMutation("services", ["crm-services"]);
  const roleMap = useAllUserRoles();
  const engineers = team.filter((t) => personHasRole(roleMap, t, "engineer", "chief_engineer"));

  const assign = (engineerId: string) => {
    mutate.mutate(
      {
        type: "update",
        id: record.id,
        values: {
          assigned_engineer_id: engineerId,
          assigned_by: profile?.id ?? null,
          assigned_at: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => toast.success("Engineer assigned — they have been notified"),
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Select value={record.assigned_engineer_id ?? ""} onValueChange={assign}>
      <SelectTrigger className="h-8 w-[10.5rem] text-xs">
        <SelectValue placeholder="Assign engineer" />
      </SelectTrigger>
      <SelectContent>
        {engineers.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.full_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Retroactively classify an unclassified service record. */
function SetServiceType({ record }: { record: ServiceRecord }) {
  const mutate = useCrmMutation("services", ["crm-services"]);
  return (
    <Select
      onValueChange={(v) =>
        mutate.mutate(
          { type: "update", id: record.id, values: { machine_service_type: v } },
          {
            onSuccess: () => toast.success("Service type set"),
            onError: (e: unknown) => toast.error((e as Error).message),
          },
        )
      }
    >
      <SelectTrigger className="h-8 w-[9.5rem] text-xs">
        <SelectValue placeholder="Set type" />
      </SelectTrigger>
      <SelectContent>
        {SERVICE_TYPES.map((t) => (
          <SelectItem key={t.value} value={t.value}>
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
