import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { CrmShell, CrmCard, StatCard, Badge } from "@/components/crm-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
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

export const Route = createFileRoute("/_authenticated/crm/services")({
  head: () => ({
    meta: [
      { title: "Service Visits — House of Maji CRM" },
      {
        name: "description",
        content: "Service schedule per client: last visit, next due date and overdue alerts.",
      },
      { property: "og:title", content: "Service Visits — House of Maji CRM" },
      { property: "og:description", content: "Never miss a scheduled machine service again." },
    ],
  }),
  component: ServicesPage,
});

function dueBadge(next: string | null) {
  if (!next) return { cls: BADGE_NEUTRAL, text: "Not scheduled" };
  const days = daysBetween(new Date(), next);
  if (days < 0) return { cls: BADGE_BAD, text: `${Math.abs(days)}d overdue` };
  if (days <= 30) return { cls: BADGE_WARN, text: `due in ${days}d` };
  return { cls: BADGE_GOOD, text: `due in ${days}d` };
}

function ServicesPage() {
  const { data: services = [] } = useServices();
  const { data: team = [] } = useTeam();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ServiceRecord | null>(null);
  const mutate = useCrmMutation("services", ["crm-services"]);

  const overdue = services.filter((s) => s.next_due_date && daysBetween(new Date(), s.next_due_date) < 0);
  const dueSoon = services.filter((s) => {
    if (!s.next_due_date) return false;
    const d = daysBetween(new Date(), s.next_due_date);
    return d >= 0 && d <= 30;
  });
  const unscheduled = services.filter((s) => !s.next_due_date);

  const logVisit = (s: ServiceRecord) => {
    const today = new Date();
    const next = new Date(today);
    next.setMonth(next.getMonth() + serviceInterval(s.machine_type));
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
    <CrmShell
      title="Services"
      subtitle={`${services.length} clients on the service schedule · ${overdue.length} overdue.`}
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add client
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Clients on schedule" value={String(services.length)} />
          <StatCard label="Overdue" value={String(overdue.length)} hint="past next due date" />
          <StatCard label="Due in 30 days" value={String(dueSoon.length)} />
          <StatCard label="Not scheduled" value={String(unscheduled.length)} />
        </div>

        {(overdue.length > 0 || dueSoon.length > 0) && (
          <CrmCard title="Visit queue">
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
                      <Button size="sm" variant="outline" onClick={() => logVisit(s)}>
                        Log visit
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CrmCard>
        )}

        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Machine</th>
                <th className="px-3 py-2">Last service</th>
                <th className="px-3 py-2">Next due</th>
                <th className="px-3 py-2 text-right">Visits</th>
                <th className="px-3 py-2">Recorded by</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {services.map((s) => {
                const b = dueBadge(s.next_due_date);
                return (
                  <tr
                    key={s.id}
                    onClick={() => setEditing(s)}
                    className="cursor-pointer border-t border-border transition-colors hover:bg-secondary/50"
                  >
                    <td className="px-3 py-2 font-medium">{s.client_name}</td>
                    <td className="px-3 py-2">{s.contact || "—"}</td>
                    <td className="px-3 py-2">{s.machine_type || "—"}</td>
                    <td className="px-3 py-2">{formatDate(s.last_service_date)}</td>
                    <td className="px-3 py-2">
                      <Badge className={b.cls}>{b.text}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.visit_count ?? 0}</td>
                    <td className="px-3 py-2">{nameOf(team, s.recorded_by)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          logVisit(s);
                        }}
                      >
                        Log visit
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {services.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    No service clients yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <ServiceDialog
          record={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </CrmShell>
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
  const [f, setF] = useState({
    client_name: record?.client_name ?? "",
    contact: record?.contact ?? "",
    machine_type: record?.machine_type ?? "",
    last_service_date: record?.last_service_date ?? "",
    next_due_date: record?.next_due_date ?? "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!f.client_name.trim()) {
      toast.error("Client name is required");
      return;
    }
    let next = f.next_due_date;
    if (!next && f.last_service_date) {
      const d = new Date(f.last_service_date);
      d.setMonth(d.getMonth() + serviceInterval(f.machine_type));
      next = isoDate(d);
    }
    const values = {
      client_name: f.client_name.trim(),
      contact: f.contact.trim() || null,
      machine_type: f.machine_type.trim() || null,
      last_service_date: f.last_service_date || null,
      next_due_date: next || null,
      ...(record ? {} : { recorded_by: profile?.id ?? null }),
    };
    mutate.mutate(record ? { type: "update", id: record.id, values } : { type: "insert", values }, {
      onSuccess: () => {
        toast.success(record ? "Record updated" : "Client added");
        onClose();
      },
      onError: (e: unknown) => toast.error((e as Error).message),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{record ? "Edit service record" : "Add service client"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
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
            <Input value={f.machine_type} onChange={(e) => set("machine_type", e.target.value)} />
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
          {record ? "Save changes" : "Add client"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
