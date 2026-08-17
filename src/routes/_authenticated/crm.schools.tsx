import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { CrmShell, CrmCard, StatCard, Bar, Badge } from "@/components/crm-shell";
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
import { formatDate } from "@/lib/format";
import {
  SCHOOL_STATUSES,
  SCHOOL_STATUS_BADGE,
  isCrmManager,
  isoDate,
  daysBetween,
  label,
} from "@/lib/crm";
import { useSchools, useTeam, useCrmMutation, nameOf, type School } from "@/hooks/use-crm";

export const Route = createFileRoute("/_authenticated/crm/schools")({
  head: () => ({
    meta: [
      { title: "Schools Outreach — Machines CRM" },
      {
        name: "description",
        content: "School prospect list by county and tier with visit tracking and follow-ups.",
      },
      { property: "og:title", content: "Schools Outreach — Machines CRM" },
      { property: "og:description", content: "Plan and track school outreach visits county by county." },
    ],
  }),
  component: SchoolsPage,
});

function SchoolsPage() {
  const { profile } = useAuth();
  const manager = isCrmManager(profile?.role);
  const { data: schools = [] } = useSchools();
  const { data: team = [] } = useTeam();
  const mutate = useCrmMutation("schools", ["crm-schools"]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<School | null>(null);
  const [county, setCounty] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const counties = [...new Set(schools.map((s) => s.county).filter(Boolean))] as string[];
  const q = search.trim().toLowerCase();
  const rows = schools.filter(
    (s) =>
      (county === "all" || s.county === county) &&
      (status === "all" || s.status === status) &&
      (!q ||
        [s.school_name, s.area, s.county].some((v) => String(v ?? "").toLowerCase().includes(q))),
  );

  const overdue = schools.filter(
    (s) => s.next_follow_up_date && new Date(s.next_follow_up_date) < new Date(),
  );

  const logVisit = (s: School) => {
    const today = new Date();
    const next = new Date(today);
    next.setDate(next.getDate() + 30);
    mutate.mutate(
      {
        type: "update",
        id: s.id,
        values: {
          status: "visited",
          last_contact_date: isoDate(today),
          next_follow_up_date: isoDate(next),
          visit_count: (s.visit_count ?? 0) + 1,
        },
      },
      {
        onSuccess: () => toast.success(`Visit logged for ${s.school_name}`),
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <CrmShell
      title="Schools"
      subtitle={`${schools.length} schools tracked · ${overdue.length} follow-ups overdue.`}
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add school
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Schools" value={String(schools.length)} />
          <StatCard
            label="Visited"
            value={String(schools.filter((s) => s.status === "visited").length)}
          />
          <StatCard
            label="Contacted"
            value={String(schools.filter((s) => s.status === "contacted").length)}
          />
          <StatCard label="Follow-ups overdue" value={String(overdue.length)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <CrmCard title="By county" className="lg:col-span-1">
            <div className="space-y-2">
              {counties.map((c) => {
                const n = schools.filter((s) => s.county === c).length;
                return (
                  <Bar
                    key={c}
                    label={c}
                    value={n}
                    max={Math.max(1, ...counties.map((x) => schools.filter((s) => s.county === x).length))}
                    sub={String(n)}
                  />
                );
              })}
              {counties.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No counties yet.</p>
              )}
            </div>
          </CrmCard>

          <CrmCard title="Filters" className="lg:col-span-2">
            <div className="flex flex-wrap gap-3">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search school, area or county"
                className="min-w-[14rem] flex-1"
              />
              <Select value={county} onValueChange={setCounty}>
                <SelectTrigger className="w-[12rem]">
                  <SelectValue placeholder="County" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All counties</SelectItem>
                  {counties.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[12rem]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {SCHOOL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {label(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CrmCard>
        </div>

        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">School</th>
                <th className="px-3 py-2">County</th>
                <th className="px-3 py-2">Area</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Rep</th>
                <th className="px-3 py-2">Last contact</th>
                <th className="px-3 py-2">Next follow-up</th>
                <th className="px-3 py-2 text-right">Visits</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const late =
                  s.next_follow_up_date && new Date(s.next_follow_up_date) < new Date();
                return (
                  <tr
                    key={s.id}
                    onClick={() => setEditing(s)}
                    className="cursor-pointer border-t border-border transition-colors hover:bg-secondary/50"
                  >
                    <td className="px-3 py-2 font-medium">{s.school_name}</td>
                    <td className="px-3 py-2">{s.county || "—"}</td>
                    <td className="px-3 py-2">{s.area || "—"}</td>
                    <td className="px-3 py-2">{label(s.tier)}</td>
                    <td className="px-3 py-2">
                      <Badge className={SCHOOL_STATUS_BADGE[s.status] ?? ""}>
                        {label(s.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{nameOf(team, s.rep_id)}</td>
                    <td className="px-3 py-2">{formatDate(s.last_contact_date)}</td>
                    <td
                      className={`px-3 py-2 ${late ? "font-semibold text-destructive" : ""}`}
                    >
                      {s.next_follow_up_date
                        ? `${formatDate(s.next_follow_up_date)}${late ? ` (${daysBetween(s.next_follow_up_date)}d late)` : ""}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.visit_count ?? 0}</td>
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                    No schools match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <SchoolDialog
          school={editing}
          manager={manager}
          team={team}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </CrmShell>
  );
}

function SchoolDialog({
  school,
  manager,
  team,
  onClose,
}: {
  school: School | null;
  manager: boolean;
  team: { id: string; full_name: string; role: string }[];
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const mutate = useCrmMutation("schools", ["crm-schools"]);
  const [f, setF] = useState({
    school_name: school?.school_name ?? "",
    county: school?.county ?? "",
    area: school?.area ?? "",
    tier: school?.tier ?? "",
    status: school?.status ?? "prospect",
    last_contact_date: school?.last_contact_date ?? "",
    next_follow_up_date: school?.next_follow_up_date ?? "",
    rep_id: school?.rep_id ?? profile?.id ?? "none",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const reps = team.filter((t) => t.role === "sales_rep" || t.role === "sales_head");

  const submit = () => {
    if (!f.school_name.trim()) {
      toast.error("School name is required");
      return;
    }
    const values = {
      school_name: f.school_name.trim(),
      county: f.county.trim() || null,
      area: f.area.trim() || null,
      tier: f.tier.trim() || null,
      status: f.status,
      last_contact_date: f.last_contact_date || null,
      next_follow_up_date: f.next_follow_up_date || null,
      rep_id: f.rep_id === "none" ? null : f.rep_id,
    };
    mutate.mutate(school ? { type: "update", id: school.id, values } : { type: "insert", values }, {
      onSuccess: () => {
        toast.success(school ? "School updated" : "School added");
        onClose();
      },
      onError: (e: unknown) => toast.error((e as Error).message),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{school ? "Edit school" : "Add school"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>School name</Label>
            <Input value={f.school_name} onChange={(e) => set("school_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>County</Label>
            <Input value={f.county} onChange={(e) => set("county", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Area</Label>
            <Input value={f.area} onChange={(e) => set("area", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tier</Label>
            <Input
              value={f.tier}
              onChange={(e) => set("tier", e.target.value)}
              placeholder="e.g. National, County, Private"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHOOL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {label(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Last contact</Label>
            <Input
              type="date"
              value={f.last_contact_date}
              onChange={(e) => set("last_contact_date", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Next follow-up</Label>
            <Input
              type="date"
              value={f.next_follow_up_date}
              onChange={(e) => set("next_follow_up_date", e.target.value)}
            />
          </div>
          {manager && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Assigned rep</Label>
              <Select value={f.rep_id} onValueChange={(v) => set("rep_id", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {reps.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.full_name || "Unnamed"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <Button onClick={submit} disabled={mutate.isPending}>
          {school ? "Save changes" : "Add school"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
