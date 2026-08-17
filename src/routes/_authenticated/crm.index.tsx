import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { CrmShell, CrmCard, StatCard, MiniTile, Bar, Badge } from "@/components/crm-shell";
import { formatKES, formatDate } from "@/lib/format";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABEL,
  LEAD_STAGE_BADGE,
  isOpenStage,
  monthStart,
  monthEnd,
  addMonths,
  monthLabel,
  pctChange,
  daysBetween,
  label,
  num,
} from "@/lib/crm";
import {
  useLeads,
  useInvoices,
  useServices,
  useSchools,
  useTargets,
  useTeam,
  nameOf,
} from "@/hooks/use-crm";

export const Route = createFileRoute("/_authenticated/crm/")({
  head: () => ({
    meta: [
      { title: "CRM Command Center — Machines" },
      {
        name: "description",
        content:
          "Live sales command center: pipeline value, monthly revenue against target, service visits due and school outreach.",
      },
      { property: "og:title", content: "CRM Command Center — Machines" },
      {
        property: "og:description",
        content: "Pipeline, revenue and service health in one view.",
      },
    ],
  }),
  component: CrmDashboard,
});

function CrmDashboard() {
  const { data: leads = [] } = useLeads();
  const { data: invoices = [] } = useInvoices();
  const { data: services = [] } = useServices();
  const { data: schools = [] } = useSchools();
  const { data: targets = [] } = useTargets();
  const { data: team = [] } = useTeam();

  const now = new Date();
  const thisMonth = monthStart(now);
  const nextMonth = monthEnd(thisMonth);
  const lastMonth = addMonths(thisMonth, -1);

  const m = useMemo(() => {
    const inMonth = (d: string, from: Date, to: Date) => {
      const t = new Date(d).getTime();
      return t >= from.getTime() && t < to.getTime();
    };
    const monthInvoices = invoices.filter((i) => inMonth(i.date, thisMonth, nextMonth));
    const prevInvoices = invoices.filter((i) => inMonth(i.date, lastMonth, thisMonth));
    const revenue = monthInvoices.reduce((s, i) => s + num(i.amount), 0);
    const prevRevenue = prevInvoices.reduce((s, i) => s + num(i.amount), 0);
    const outstanding = invoices.reduce((s, i) => s + num(i.balance), 0);

    const open = leads.filter((l) => isOpenStage(l.stage));
    const monthLeads = leads.filter((l) => inMonth(l.created_at, thisMonth, nextMonth));
    const prevLeads = leads.filter((l) => inMonth(l.created_at, lastMonth, thisMonth));
    const wonMonth = leads.filter(
      (l) => l.stage === "won" && inMonth(l.updated_at, thisMonth, nextMonth),
    );
    const closedMonth = leads.filter(
      (l) => !isOpenStage(l.stage) && inMonth(l.updated_at, thisMonth, nextMonth),
    );

    const target = targets.find(
      (t) => new Date(t.month).getMonth() === thisMonth.getMonth() &&
        new Date(t.month).getFullYear() === thisMonth.getFullYear(),
    );

    return {
      revenue,
      prevRevenue,
      outstanding,
      open,
      monthLeads,
      prevLeads,
      wonMonth,
      closedMonth,
      target,
      pipelineValue: open.reduce((s, l) => s + num(l.deal_value), 0),
      overdue: leads.filter(
        (l) => l.follow_up_due_at && new Date(l.follow_up_due_at) < now && isOpenStage(l.stage),
      ),
    };
  }, [invoices, leads, targets]);

  const revenueTarget = num(m.target?.revenue_target);
  const targetPct = revenueTarget ? Math.min(100, Math.round((m.revenue / revenueTarget) * 100)) : 0;
  const winRate = m.closedMonth.length
    ? Math.round((m.wonMonth.length / m.closedMonth.length) * 100)
    : 0;

  const dueSoon = services.filter(
    (s) => s.next_due_date && daysBetween(new Date(), s.next_due_date) <= 30,
  );
  const overdueService = services.filter(
    (s) => s.next_due_date && new Date(s.next_due_date) < now,
  );
  const reps = team.filter((t) => t.role === "sales_rep" || t.role === "sales_manager");

  const repRows = reps
    .map((r) => {
      const rLeads = leads.filter((l) => l.rep_id === r.id);
      const rOpen = rLeads.filter((l) => isOpenStage(l.stage));
      const rWon = m.wonMonth.filter((l) => l.rep_id === r.id);
      const rRevenue = invoices
        .filter(
          (i) =>
            i.rep_id === r.id &&
            new Date(i.date) >= thisMonth &&
            new Date(i.date) < nextMonth,
        )
        .reduce((s, i) => s + num(i.amount), 0);
      return {
        id: r.id,
        name: r.full_name || "Unnamed",
        open: rOpen.length,
        pipeline: rOpen.reduce((s, l) => s + num(l.deal_value), 0),
        won: rWon.length,
        revenue: rRevenue,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return (
    <CrmShell
      title="Command Center"
      subtitle={`${monthLabel(thisMonth)} — live pipeline, revenue and service health.`}
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Revenue this month"
            value={formatKES(m.revenue)}
            hint={revenueTarget ? `${targetPct}% of ${formatKES(revenueTarget)}` : "no target set"}
            change={pctChange(m.revenue, m.prevRevenue)}
            to="/crm/sales"
          />
          <StatCard
            label="Open pipeline"
            value={formatKES(m.pipelineValue)}
            hint={`${m.open.length} open deals`}
            to="/crm/leads"
          />
          <StatCard
            label="New leads this month"
            value={String(m.monthLeads.length)}
            change={pctChange(m.monthLeads.length, m.prevLeads.length)}
            hint={`${m.wonMonth.length} won · ${winRate}% win rate`}
            to="/crm/leads"
          />
          <StatCard
            label="Outstanding balance"
            value={formatKES(m.outstanding)}
            hint={`${invoices.filter((i) => num(i.balance) > 0).length} invoices unpaid`}
            to="/crm/sales"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MiniTile
            label="Overdue follow-ups"
            value={String(m.overdue.length)}
            tone={m.overdue.length ? "bad" : "good"}
            to="/crm/leads"
          />
          <MiniTile
            label="Services due 30d"
            value={String(dueSoon.length)}
            sub={`${overdueService.length} overdue`}
            tone={overdueService.length ? "warn" : "good"}
            to="/crm/services"
          />
          <MiniTile
            label="Schools tracked"
            value={String(schools.length)}
            sub={`${schools.filter((s) => s.status === "visited").length} visited`}
            to="/crm/schools"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <CrmCard title="Lead funnel" className="lg:col-span-1">
            <div className="space-y-2">
              {LEAD_STAGES.map((s) => {
                const c = leads.filter((l) => l.stage === s).length;
                return (
                  <Bar
                    key={s}
                    label={LEAD_STAGE_LABEL[s]!}
                    value={c}
                    max={Math.max(
                      1,
                      ...LEAD_STAGES.map((x) => leads.filter((l) => l.stage === x).length),
                    )}
                    sub={String(c)}
                  />
                );
              })}
            </div>
          </CrmCard>

          <CrmCard title="Rep leaderboard — this month" className="lg:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2">Rep</th>
                    <th className="pb-2 text-right">Open</th>
                    <th className="pb-2 text-right">Pipeline</th>
                    <th className="pb-2 text-right">Won</th>
                    <th className="pb-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {repRows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-2 font-medium">{r.name}</td>
                      <td className="py-2 text-right tabular-nums">{r.open}</td>
                      <td className="py-2 text-right tabular-nums">{formatKES(r.pipeline)}</td>
                      <td className="py-2 text-right tabular-nums">{r.won}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">
                        {formatKES(r.revenue)}
                      </td>
                    </tr>
                  ))}
                  {repRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted-foreground">
                        No sales reps yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CrmCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <CrmCard title={`Needs attention (${m.overdue.length})`}>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {m.overdue.slice(0, 20).map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5"
                >
                  <div>
                    <p className="text-sm font-semibold">{l.name || l.phone}</p>
                    <p className="text-xs text-muted-foreground">
                      {nameOf(team, l.rep_id)} · due {daysBetween(l.follow_up_due_at!)}d ago
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={LEAD_STAGE_BADGE[l.stage] ?? ""}>
                      {LEAD_STAGE_LABEL[l.stage] ?? l.stage}
                    </Badge>
                  </div>
                </div>
              ))}
              {m.overdue.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Every follow-up is on schedule.
                </p>
              )}
            </div>
          </CrmCard>

          <CrmCard title="Latest invoices">
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {invoices.slice(0, 20).map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5"
                >
                  <div>
                    <p className="text-sm font-semibold">{i.client_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.invoice_no} · {formatDate(i.date)} · {nameOf(team, i.rep_id)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatKES(i.amount)}</p>
                    {num(i.balance) > 0 && (
                      <p className="text-xs text-destructive">{formatKES(i.balance)} due</p>
                    )}
                  </div>
                </div>
              ))}
              {invoices.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No invoices recorded yet.
                </p>
              )}
            </div>
          </CrmCard>
        </div>
      </div>
    </CrmShell>
  );
}
