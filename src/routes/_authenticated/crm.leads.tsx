import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { CrmShell, CrmCard, MiniTile, Bar, Badge } from "@/components/crm-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useMachineTypeOptions } from "@/hooks/use-crm-extra";
import { UploadCallRecording } from "@/components/call-recording-upload";
import { formatKES, formatDate } from "@/lib/format";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABEL,
  LEAD_STAGE_BADGE,
  LEAD_SOURCES,
  isOpenStage,
  isCrmManager,
  daysBetween,
  label,
  num,
} from "@/lib/crm";
import {
  useLeads,
  useTeam,
  useLeadActivities,
  useCrmMutation,
  nameOf,
  type Lead,
} from "@/hooks/use-crm";

export const Route = createFileRoute("/_authenticated/crm/leads")({
  head: () => ({
    meta: [
      { title: "Leads — Machines CRM" },
      {
        name: "description",
        content: "Every sales rep's lead pipeline: kanban stages, follow-ups and deal values.",
      },
      { property: "og:title", content: "Leads — Machines CRM" },
      { property: "og:description", content: "Track and move every lead through the pipeline." },
    ],
  }),
  component: LeadsPage,
});

type View = "kanban" | "triage" | "list";
type Range = "today" | "week" | "month" | "all";

function withinRange(created: string, range: Range) {
  if (range === "all") return true;
  const d = daysBetween(created);
  if (range === "today") return d < 1;
  if (range === "week") return d < 7;
  return d < 31;
}

function LeadsPage() {
  const { profile } = useAuth();
  const manager = isCrmManager(profile?.role);
  const { data: leads = [] } = useLeads();
  const { data: team = [] } = useTeam();
  const mutate = useCrmMutation("leads", ["crm-leads"]);

  const [view, setView] = useState<View>("kanban");
  const [repTab, setRepTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<Range>("all");
  const [source, setSource] = useState("all");
  const [followUp, setFollowUp] = useState("all");
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [creating, setCreating] = useState(false);

  const reps = team.filter((t) => t.role === "sales_rep" || t.role === "sales_manager");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (repTab !== "all" && l.rep_id !== repTab) return false;
      if (source !== "all" && l.source !== source) return false;
      if (!withinRange(l.created_at, range)) return false;
      if (followUp === "overdue")
        if (!(l.follow_up_due_at && new Date(l.follow_up_due_at) < new Date())) return false;
      if (followUp === "scheduled" && !l.follow_up_due_at) return false;
      if (followUp === "none" && l.follow_up_due_at) return false;
      if (!q) return true;
      return [l.phone, l.name, l.machine_interest, l.location]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [leads, repTab, source, range, followUp, search]);

  const open = filtered.filter((l) => isOpenStage(l.stage));
  const won = filtered.filter((l) => l.stage === "won");
  const pipelineValue = open.reduce((s, l) => s + num(l.deal_value), 0);
  const wonValue = won.reduce((s, l) => s + num(l.deal_value), 0);
  const notWon = filtered.filter((l) => l.stage === "not_won");
  const conversion = won.length + notWon.length
    ? Math.round((won.length / (won.length + notWon.length)) * 100)
    : 0;
  const avgAge = open.length
    ? Math.round(open.reduce((s, l) => s + daysBetween(l.created_at), 0) / open.length)
    : 0;
  const spanDays = Math.max(
    1,
    filtered.length ? daysBetween(filtered[filtered.length - 1]!.created_at) + 1 : 1,
  );
  const avgPerDay = (filtered.length / spanDays).toFixed(1);

  const move = (lead: Lead, stage: string) => {
    if (lead.stage === stage) return;
    mutate.mutate(
      { type: "update", id: lead.id, values: { stage } },
      {
        onSuccess: () => toast.success(`${lead.name || lead.phone} → ${LEAD_STAGE_LABEL[stage]}`),
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <CrmShell
      title="Leads"
      subtitle={`Every rep's pipeline — drag a card to move a stage. ${open.length} open.`}
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New lead
        </Button>
      }
    >
      <div className="space-y-4">
        {/* rep tabs */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setRepTab("all")}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${repTab === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"}`}
          >
            All reps ({leads.filter((l) => isOpenStage(l.stage)).length})
          </button>
          {reps.map((r) => (
            <button
              key={r.id}
              onClick={() => setRepTab(r.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${repTab === r.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"}`}
            >
              {r.full_name || "Unnamed"} (
              {leads.filter((l) => l.rep_id === r.id && isOpenStage(l.stage)).length})
            </button>
          ))}
        </div>

        {/* toolbar */}
        <div className="surface-card flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phone, name, machine or location"
              className="pl-9"
            />
          </div>
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger className="w-[9rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-[9rem]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {LEAD_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {label(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={followUp} onValueChange={setFollowUp}>
            <SelectTrigger className="w-[10rem]">
              <SelectValue placeholder="Follow-up" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any follow-up</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="none">Not scheduled</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex rounded-lg border border-border p-0.5">
            {(["kanban", "triage", "list"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {view === "kanban" && (
          <KanbanBoard leads={filtered} team={team} onMove={move} onOpen={setOpenLead} />
        )}
        {view === "triage" && <TriageView leads={filtered} team={team} onOpen={setOpenLead} />}
        {view === "list" && <ListView leads={filtered} team={team} onOpen={setOpenLead} />}

        {/* glance */}
        <CrmCard title="Pipeline at a glance">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <MiniTile label="Open deals" value={String(open.length)} />
            <MiniTile label="Pipeline value" value={formatKES(pipelineValue)} />
            <MiniTile
              label="Won"
              value={String(won.length)}
              sub={formatKES(wonValue)}
              tone="good"
            />
            <MiniTile label="Conversion" value={`${conversion}%`} sub="won of closed" />
            <MiniTile label="Avg age" value={`${avgAge}d`} sub="open deals" />
          </div>
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Deals by stage</h3>
              {LEAD_STAGES.map((s) => {
                const c = filtered.filter((l) => l.stage === s).length;
                return (
                  <Bar
                    key={s}
                    label={LEAD_STAGE_LABEL[s]!}
                    value={c}
                    max={Math.max(1, ...LEAD_STAGES.map((x) => filtered.filter((l) => l.stage === x).length))}
                    sub={String(c)}
                  />
                );
              })}
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Open deals by rep</h3>
              {reps.map((r) => {
                const c = open.filter((l) => l.rep_id === r.id).length;
                return (
                  <Bar
                    key={r.id}
                    label={r.full_name || "Unnamed"}
                    value={c}
                    max={Math.max(1, ...reps.map((x) => open.filter((l) => l.rep_id === x.id).length))}
                    sub={String(c)}
                  />
                );
              })}
              <Bar
                label="Unassigned"
                value={open.filter((l) => !l.rep_id).length}
                max={Math.max(1, open.length)}
                sub={String(open.filter((l) => !l.rep_id).length)}
              />
            </div>
          </div>
        </CrmCard>
      </div>

      {openLead && (
        <LeadDetail
          lead={leads.find((l) => l.id === openLead.id) ?? openLead}
          team={team}
          manager={manager}
          onClose={() => setOpenLead(null)}
        />
      )}
      {creating && <NewLeadDialog onClose={() => setCreating(false)} team={team} />}
    </CrmShell>
  );
}

function LeadCard({
  lead,
  team,
  onOpen,
  draggable,
}: {
  lead: Lead;
  team: { id: string; full_name: string; role: string }[];
  onOpen: (l: Lead) => void;
  draggable?: boolean;
}) {
  const overdue = lead.follow_up_due_at && new Date(lead.follow_up_due_at) < new Date();
  return (
    <button
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.id)}
      onClick={() => onOpen(lead)}
      className="w-full rounded-lg border border-border bg-card p-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight">{lead.name || lead.phone}</p>
        <Badge className={LEAD_STAGE_BADGE[lead.stage] ?? ""}>
          {LEAD_STAGE_LABEL[lead.stage] ?? lead.stage}
        </Badge>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{lead.phone}</p>
      {lead.machine_interest && <p className="text-xs">{lead.machine_interest}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span>{nameOf(team, lead.rep_id)}</span>
        {lead.deal_value ? (
          <span className="font-semibold text-foreground">{formatKES(lead.deal_value)}</span>
        ) : null}
        {overdue && (
          <span className="font-semibold text-destructive">
            due {daysBetween(lead.follow_up_due_at!)}d ago
          </span>
        )}
      </div>
    </button>
  );
}

function KanbanBoard({
  leads,
  team,
  onMove,
  onOpen,
}: {
  leads: Lead[];
  team: { id: string; full_name: string; role: string }[];
  onMove: (l: Lead, stage: string) => void;
  onOpen: (l: Lead) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {LEAD_STAGES.map((stage) => {
        const items = leads.filter((l) => l.stage === stage);
        return (
          <div
            key={stage}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(stage);
            }}
            onDragLeave={() => setOver((s) => (s === stage ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/plain");
              const lead = leads.find((l) => l.id === id);
              if (lead) onMove(lead, stage);
            }}
            className={`w-[15rem] shrink-0 rounded-xl border p-2 ${over === stage ? "border-primary bg-primary/5" : "border-border bg-secondary/30"}`}
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <span className="text-xs font-bold uppercase tracking-wide">
                {LEAD_STAGE_LABEL[stage]}
              </span>
              <Badge className={LEAD_STAGE_BADGE[stage] ?? ""}>{items.length}</Badge>
            </div>
            <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
              {items.map((l) => (
                <LeadCard key={l.id} lead={l} team={team} onOpen={onOpen} draggable />
              ))}
              {items.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">Empty</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TriageView({
  leads,
  team,
  onOpen,
}: {
  leads: Lead[];
  team: { id: string; full_name: string; role: string }[];
  onOpen: (l: Lead) => void;
}) {
  const now = Date.now();
  const groups: { title: string; items: Lead[] }[] = [
    {
      title: "Overdue follow-ups",
      items: leads.filter(
        (l) => l.follow_up_due_at && new Date(l.follow_up_due_at).getTime() < now,
      ),
    },
    { title: "No follow-up scheduled", items: leads.filter((l) => !l.follow_up_due_at) },
    {
      title: "Hot & open",
      items: leads.filter((l) => l.stage === "hot"),
    },
    {
      title: "Stale 14d+",
      items: leads.filter((l) => isOpenStage(l.stage) && daysBetween(l.updated_at) >= 14),
    },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
      {groups.map((g) => (
        <CrmCard key={g.title} title={`${g.title} (${g.items.length})`}>
          <div className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto">
            {g.items.map((l) => (
              <LeadCard key={l.id} lead={l} team={team} onOpen={onOpen} />
            ))}
            {g.items.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">Nothing here</p>
            )}
          </div>
        </CrmCard>
      ))}
    </div>
  );
}

function ListView({
  leads,
  team,
  onOpen,
}: {
  leads: Lead[];
  team: { id: string; full_name: string; role: string }[];
  onOpen: (l: Lead) => void;
}) {
  return (
    <div className="surface-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Phone</th>
            <th className="px-3 py-2">Machine</th>
            <th className="px-3 py-2">Location</th>
            <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Stage</th>
            <th className="px-3 py-2">Rep</th>
            <th className="px-3 py-2 text-right">Deal value</th>
            <th className="px-3 py-2">Follow-up</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const overdue = l.follow_up_due_at && new Date(l.follow_up_due_at) < new Date();
            return (
              <tr
                key={l.id}
                onClick={() => onOpen(l)}
                className="cursor-pointer border-t border-border transition-colors hover:bg-secondary/50"
              >
                <td className="px-3 py-2 font-medium">{l.name || "—"}</td>
                <td className="px-3 py-2">{l.phone}</td>
                <td className="px-3 py-2">{l.machine_interest || "—"}</td>
                <td className="px-3 py-2">{l.location || "—"}</td>
                <td className="px-3 py-2">{label(l.source)}</td>
                <td className="px-3 py-2">
                  <Badge className={LEAD_STAGE_BADGE[l.stage] ?? ""}>
                    {LEAD_STAGE_LABEL[l.stage] ?? l.stage}
                  </Badge>
                </td>
                <td className="px-3 py-2">{nameOf(team, l.rep_id)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.deal_value ? formatKES(l.deal_value) : "—"}
                </td>
                <td className={`px-3 py-2 ${overdue ? "font-semibold text-destructive" : ""}`}>
                  {l.follow_up_due_at ? formatDate(l.follow_up_due_at) : "—"}
                </td>
              </tr>
            );
          })}
          {leads.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                No leads match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function LeadDetail({
  lead,
  team,
  manager,
  onClose,
}: {
  lead: Lead;
  team: { id: string; full_name: string; role: string }[];
  manager: boolean;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const { data: activities = [] } = useLeadActivities(lead.id);
  const updateLead = useCrmMutation("leads", ["crm-leads"]);
  const logActivity = useCrmMutation("lead_activities", ["crm-lead-activities", "crm-leads"]);
  const [reached, setReached] = useState("yes");
  const [note, setNote] = useState("");
  const [nextDays, setNextDays] = useState("3");
  const reps = team.filter((t) => t.role === "sales_rep" || t.role === "sales_manager");

  const submit = () => {
    if (!profile) return;
    logActivity.mutate(
      {
        type: "insert",
        values: {
          lead_id: lead.id,
          rep_id: profile.id,
          reached: reached === "yes",
          outcome_note: note.trim() || null,
        },
      },
      {
        onSuccess: () => {
          const due = new Date();
          due.setDate(due.getDate() + Number(nextDays || 3));
          updateLead.mutate({
            type: "update",
            id: lead.id,
            values: { follow_up_due_at: due.toISOString() },
          });
          setNote("");
          toast.success("Follow-up logged");
        },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  const patch = (values: Record<string, unknown>) =>
    updateLead.mutate(
      { type: "update", id: lead.id, values },
      { onError: (e: unknown) => toast.error((e as Error).message) },
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead.name || lead.phone}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <UploadCallRecording dealId={lead.id} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Phone:</span> {lead.phone || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Machine:</span>{" "}
              {lead.machine_interest || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Location:</span> {lead.location || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Source:</span> {label(lead.source)}
            </p>
            <p>
              <span className="text-muted-foreground">Created:</span> {formatDate(lead.created_at)}
            </p>
            <p>
              <span className="text-muted-foreground">Follow-up:</span>{" "}
              {lead.follow_up_due_at ? formatDate(lead.follow_up_due_at) : "not scheduled"}
            </p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={lead.stage} onValueChange={(v) => patch({ stage: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_STAGE_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Deal value (KES)</Label>
              <Input
                type="number"
                defaultValue={lead.deal_value ?? ""}
                onBlur={(e) =>
                  patch({ deal_value: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </div>
            {manager && (
              <div className="space-y-1.5">
                <Label>Assigned rep</Label>
                <Select
                  value={lead.rep_id ?? "none"}
                  onValueChange={(v) => patch({ rep_id: v === "none" ? null : v })}
                >
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
        </div>

        <div className="mt-2 space-y-3 rounded-xl border border-border p-3">
          <h3 className="text-sm font-semibold">Log follow-up</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Reached?</Label>
              <Select value={reached} onValueChange={setReached}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Reached</SelectItem>
                  <SelectItem value="no">Not reached</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Next follow-up in (days)</Label>
              <Input
                type="number"
                min={0}
                value={nextDays}
                onChange={(e) => setNextDays(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Outcome note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <Button size="sm" onClick={submit} disabled={logActivity.isPending}>
            Log follow-up
          </Button>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Activity log</h3>
          <div className="max-h-52 space-y-2 overflow-y-auto">
            {activities.map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{nameOf(team, a.rep_id)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(a.created_at)} · {a.reached ? "reached" : "not reached"}
                  </span>
                </div>
                {a.outcome_note && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.outcome_note}</p>
                )}
              </div>
            ))}
            {activities.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">
                No follow-ups logged yet.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewLeadDialog({ onClose }: { onClose: () => void; team?: unknown }) {
  const create = useCrmMutation("leads", ["crm-leads"]);
  const machineTypes = useMachineTypeOptions();
  const [f, setF] = useState({
    name: "",
    phone: "",
    location: "",
    machine_interest: "none",
    source: "walk_in",
  });
  const [dupe, setDupe] = useState<Lead | null>(null);
  const [checking, setChecking] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const insert = () => {
    create.mutate(
      {
        type: "insert",
        values: {
          name: f.name.trim(),
          phone: f.phone.trim(),
          location: f.location.trim() || null,
          machine_interest: f.machine_interest === "none" ? null : f.machine_interest,
          source: f.source,
          stage: "new",
          rep_id: null,
        },
      },
      {
        onSuccess: () => {
          toast.success("Lead captured at stage New, unassigned");
          onClose();
        },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  const submit = async () => {
    if (!f.phone.trim() && !f.name.trim()) {
      toast.error("Add at least a name or phone number");
      return;
    }
    if (!f.phone.trim()) {
      insert();
      return;
    }
    setChecking(true);
    try {
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("phone", f.phone.trim())
        .gte("created_at", since)
        .limit(1);
      if (error) throw error;
      const existing = (data ?? [])[0] as Lead | undefined;
      if (existing) {
        setDupe(existing);
        return;
      }
      insert();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Quick intake — the lead is created at stage New and left unassigned for triage.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              value={f.phone}
              onChange={(e) => {
                setDupe(null);
                set("phone", e.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={f.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Machine interest</Label>
            <Select value={f.machine_interest} onValueChange={(v) => set("machine_interest", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select machine" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not sure yet</SelectItem>
                {machineTypes.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Source</Label>
            <Select value={f.source} onValueChange={(v) => set("source", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {label(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {dupe && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="font-semibold text-warning">Possible duplicate</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {dupe.name || dupe.phone} was already captured on {formatDate(dupe.created_at)} with
              this phone number (within the last 48 hours).
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={insert} disabled={create.isPending}>
                Create anyway
              </Button>
            </div>
          </div>
        )}

        {!dupe && (
          <Button onClick={() => void submit()} disabled={create.isPending || checking}>
            {checking ? "Checking for duplicates…" : "Add lead"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
