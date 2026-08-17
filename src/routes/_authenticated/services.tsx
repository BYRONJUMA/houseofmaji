import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { useAuth } from "@/hooks/use-auth";
import { useSettings, settingNumber, useMachineTypeOptions } from "@/hooks/use-crm-extra";
import { formatDate } from "@/lib/format";
import {
  serviceInterval,
  isoDate,
  daysBetween,
  BADGE_GOOD,
  BADGE_WARN,
  BADGE_BAD,
  BADGE_NEUTRAL,
} from "@/lib/crm";
import { useServices, useTeam, useCrmMutation, nameOf, type ServiceRecord } from "@/hooks/use-crm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/services")({
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

/** Who may edit/complete a specific service record. */
function canEditRecord(role: string | undefined, uid: string | undefined, s: ServiceRecord) {
  if (role === "admin" || role === "chief_engineer" || role === "sales_head") return true;
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

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function dueBadge(next: string | null) {
  if (!next) return { cls: BADGE_NEUTRAL, text: "Not scheduled" };
  const days = daysBetween(new Date(), next);
  if (days < 0) return { cls: BADGE_BAD, text: `${Math.abs(days)}d overdue` };
  if (days <= 30) return { cls: BADGE_WARN, text: `due in ${days}d` };
  return { cls: BADGE_GOOD, text: `due in ${days}d` };
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
  const { profile } = useAuth();
  const canCreate = CAN_CREATE.includes(profile?.role ?? "");
  const canAssign = profile?.role === "chief_engineer" || profile?.role === "admin";
  const canEditAny = (s: ServiceRecord) => canEditRecord(profile?.role, profile?.id, s);
  const { data: services = [] } = useServices();
  const { data: settings } = useSettings();
  const defaultInterval = settingNumber(settings, "default_service_interval_months");
  const { data: team = [] } = useTeam();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ServiceRecord | null>(null);
  const mutate = useCrmMutation("services", ["crm-services"]);

  const overdue = services.filter(
    (s) => s.next_due_date && daysBetween(new Date(), s.next_due_date) < 0,
  );
  const dueSoon = services.filter((s) => {
    if (!s.next_due_date) return false;
    const d = daysBetween(new Date(), s.next_due_date);
    return d >= 0 && d <= 30;
  });
  const unscheduled = services.filter((s) => !s.next_due_date);

  const logVisit = (s: ServiceRecord) => {
    const today = new Date();
    const next = new Date(today);
    next.setMonth(next.getMonth() + serviceInterval(s.machine_type, defaultInterval));
    mutate.mutate(
      {
        type: "update",
        id: s.id,
        values: {
          last_service_date: isoDate(today),
          next_due_date: isoDate(next),
          visit_count: (s.visit_count ?? 0) + 1,
        },
      },
      {
        onSuccess: () => toast.success(`Visit logged for ${s.client_name}`),
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile label="Machines on schedule" value={String(services.length)} />
          <Tile label="Overdue" value={String(overdue.length)} hint="past next due date" />
          <Tile label="Due in 30 days" value={String(dueSoon.length)} />
          <Tile label="Not scheduled" value={String(unscheduled.length)} />
        </div>

        {canCreate && (overdue.length > 0 || dueSoon.length > 0) && (
          <section className="surface-card p-4 sm:p-5">
            <h2 className="mb-4 text-base font-semibold">Visit queue</h2>
            <div className="space-y-2">
              {[...overdue, ...dueSoon].map((s) => {
                const b = dueBadge(s.next_due_date);
                return (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-2.5"
                  >
                    <div>
                      <p className="text-sm font-semibold">{s.client_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.machine_type || "machine"} · {s.contact || "no contact"} · due{" "}
                        {formatDate(s.next_due_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={b.cls}>{b.text}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {nameOf(team, s.assigned_engineer_id)}
                      </span>
                      {canEditAny(s) && (
                        <Button size="sm" variant="outline" onClick={() => logVisit(s)}>
                          Log visit
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Machine</th>
                <th className="px-3 py-2">Linked order</th>
                <th className="px-3 py-2">Last service</th>
                <th className="px-3 py-2">Next due</th>
                <th className="px-3 py-2 text-right">Visits</th>
                <th className="px-3 py-2">Recorded by</th>
                <th className="px-3 py-2">Assigned to</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {services.map((s) => {
                const b = dueBadge(s.next_due_date);
                return (
                  <tr
                    key={s.id}
                    onClick={() => canEditAny(s) && setEditing(s)}
                    className={cn(
                      "border-t border-border transition-colors",
                      canEditAny(s) && "cursor-pointer hover:bg-secondary/50",
                    )}
                  >
                    <td className="px-3 py-2 font-medium">{s.client_name}</td>
                    <td className="px-3 py-2">{s.contact || "—"}</td>
                    <td className="px-3 py-2">{s.machine_type || "—"}</td>
                    <td className="px-3 py-2">{s.fulfillment_id ? "Linked" : "Manual"}</td>
                    <td className="px-3 py-2">{formatDate(s.last_service_date)}</td>
                    <td className="px-3 py-2">
                      <Badge className={b.cls}>{b.text}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.visit_count ?? 0}</td>
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
                        {canAssign && <AssignEngineer record={s} />}
                        {canEditAny(s) && (
                          <Button size="sm" variant="outline" onClick={() => logVisit(s)}>
                            Log visit
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {services.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                    No service records yet.
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

function ServiceDialog({
  record,
  onClose,
}: {
  record: ServiceRecord | null;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const mutate = useCrmMutation("services", ["crm-services"]);
  const { data: settings } = useSettings();
  const defaultInterval = settingNumber(settings, "default_service_interval_months");
  const machineTypes = useMachineTypeOptions();
  const { data: fulfillments = [] } = useServiceFulfillments();
  const [search, setSearch] = useState("");
  const [f, setF] = useState({
    fulfillment_id: record?.fulfillment_id ?? "none",
    client_name: record?.client_name ?? "",
    contact: record?.contact ?? "",
    machine_type: record?.machine_type ?? "",
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
      contact: m?.client_contact ?? p.contact,
      machine_type: m?.machine_type ?? p.machine_type,
    }));
  };

  const submit = () => {
    if (!f.client_name.trim()) {
      toast.error("Client name is required");
      return;
    }
    let next = f.next_due_date;
    if (!next && f.last_service_date) {
      const d = new Date(f.last_service_date);
      d.setMonth(d.getMonth() + serviceInterval(f.machine_type, defaultInterval));
      next = isoDate(d);
    }
    const values = {
      fulfillment_id: f.fulfillment_id === "none" ? null : f.fulfillment_id,
      client_name: f.client_name.trim(),
      contact: f.contact.trim() || null,
      machine_type: f.machine_type.trim() || null,
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
              Linking pulls client name, contact and machine type from the order. Leave unlinked for
              older machines.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Client name</Label>
            <Input value={f.client_name} onChange={(e) => set("client_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact</Label>
            <Input value={f.contact} onChange={(e) => set("contact", e.target.value)} />
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

function AssignEngineer({ record }: { record: ServiceRecord }) {
  const { profile } = useAuth();
  const { data: team = [] } = useTeam();
  const mutate = useCrmMutation("services", ["crm-services"]);
  const engineers = team.filter((t) => t.role === "engineer" || t.role === "chief_engineer");

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
