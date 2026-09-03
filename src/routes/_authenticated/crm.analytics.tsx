import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Sparkles } from "lucide-react";
import { CrmShell, CrmCard, MiniTile, Bar, Badge } from "@/components/crm-shell";
import { Button } from "@/components/ui/button";
import { useLeads, useTeam, nameOf, type Lead, type TeamMember } from "@/hooks/use-crm";
import { useExpireStaleLeads } from "@/hooks/use-lead-scoring";
import { formatKES } from "@/lib/format";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABEL,
  LEAD_STAGE_BADGE,
  LEAD_SCORING_CRITERIA,
  MAX_LEAD_SCORE,
  followUpCountdown,
  isOpenStage,
  label as pretty,
  num,
} from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/crm/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Machines CRM" },
      {
        name: "description",
        content:
          "Funnel, source performance, rep performance and weekly trends for House of Maji lead pipeline.",
      },
      { property: "og:title", content: "Analytics — Machines CRM" },
      {
        property: "og:description",
        content: "Funnel, source performance, rep performance, and lead trends.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

const REFRESH_MS = 60_000;
const WEEK_MS = 604_800_000;

function scored(lead: Lead, column: string) {
  return Boolean((lead as unknown as Record<string, string | null>)[column]);
}

/* ----------------------------- helpers ----------------------------- */

/** Deal value for a lead: explicit deal_value, else midpoint of its budget tier. */
function leadValue(l: Lead) {
  const dv = num(l.deal_value);
  if (dv > 0) return dv;
  return budgetMidpoint(l.budget_range);
}

function budgetMidpoint(raw?: string | null) {
  const t = budgetTier(raw);
  switch (t) {
    case "Under 100k":
      return 50_000;
    case "100k – 250k":
      return 175_000;
    case "250k – 500k":
      return 375_000;
    case "500k and above":
      return 750_000;
    default:
      return 0;
  }
}

/** Group free-text budget_range values into stable tiers. */
function budgetTier(raw?: string | null): string {
  if (!raw || !raw.trim()) return "Not tagged";
  const s = raw.toLowerCase().replace(/,/g, "").trim();
  if (/not\s*yet|undecided|not decided|unknown|n\/a/.test(s)) return "Undecided";
  const nums = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(k|m)?/g)].map((m) => {
    const v = Number(m[1]);
    const unit = m[2];
    return unit === "m" ? v * 1_000_000 : unit === "k" ? v * 1_000 : v;
  });
  const above = /above|\+|over|more than/.test(s);
  const top = nums.length ? Math.max(...nums) : 0;
  if (!top) return "Undecided";
  if (above && top >= 500_000) return "500k and above";
  if (top <= 100_000) return "Under 100k";
  if (top <= 250_000) return "100k – 250k";
  if (top <= 500_000) return "250k – 500k";
  return "500k and above";
}

type Group = { key: string; total: number; won: number; lost: number; value: number };

function groupBy(leads: Lead[], keyFn: (l: Lead) => string | null): Group[] {
  const map = new Map<string, Group>();
  for (const l of leads) {
    const k = keyFn(l);
    if (!k) continue;
    const g = map.get(k) ?? { key: k, total: 0, won: 0, lost: 0, value: 0 };
    g.total += 1;
    if (l.stage === "won") {
      g.won += 1;
      g.value += leadValue(l);
    } else if (l.stage === "not_won") g.lost += 1;
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

const winRate = (g: Group) => (g.won + g.lost ? (g.won / (g.won + g.lost)) * 100 : 0);

function weekStart(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}

/* ---------------------------- AI narrative ---------------------------- */

type Insight = {
  generatedAt: Date;
  headline: string;
  working: string[];
  concerns: string[];
  recommendations: { priority: "HIGH" | "MEDIUM" | "LOW"; title: string; body: string }[];
  watch: string[];
};

function buildInsight(leads: Lead[], team: TeamMember[]): Insight {
  const won = leads.filter((l) => l.stage === "won");
  const lost = leads.filter((l) => l.stage === "not_won");
  const closed = won.length + lost.length;
  const conv = closed ? (won.length / closed) * 100 : 0;
  const bySource = groupBy(leads, (l) => (l.source ? pretty(l.source) : "Unspecified"));
  const byRep = groupBy(leads, (l) => l.rep_id).map((g) => ({
    ...g,
    name: nameOf(team, g.key),
  }));
  const byCat = groupBy(leads, (l) => (l.machine_interest ? l.machine_interest : null));
  const now = Date.now();
  const last30 = leads.filter((l) => now - new Date(l.created_at).getTime() <= 30 * 86_400_000);
  const last7 = leads.filter((l) => now - new Date(l.created_at).getTime() <= 7 * 86_400_000);
  const wonValue = won.reduce((s, l) => s + leadValue(l), 0);

  const strongSources = bySource.filter((g) => g.total >= 2 && winRate(g) > conv);
  const strongReps = byRep.filter((r) => r.won > 0).sort((a, b) => winRate(b) - winRate(a));
  const weakReps = byRep.filter((r) => r.total >= 2 && r.won === 0);
  const strongCats = byCat.filter((g) => g.won > 0).sort((a, b) => winRate(b) - winRate(a));

  const headline = !leads.length
    ? "No leads recorded yet"
    : conv < 30 && closed >= 3
      ? `Low conversion rate of ${conv.toFixed(0)}% across ${closed} closed leads`
      : conv >= 60 && closed >= 3
        ? `Strong conversion rate of ${conv.toFixed(0)}% across ${closed} closed leads`
        : `${leads.length} leads in the book with ${won.length} won worth ${formatKES(wonValue)}`;

  const working: string[] = [];
  if (won.length)
    working.push(`${won.length} won lead${won.length === 1 ? "" : "s"} worth ${formatKES(wonValue)}`);
  for (const s of strongSources.slice(0, 2))
    working.push(`High win rate of ${winRate(s).toFixed(0)}% from ${s.key} leads`);
  for (const r of strongReps.slice(0, 2))
    working.push(`${r.name}'s ${winRate(r).toFixed(0)}% win rate across ${r.total} leads`);
  if (strongCats[0])
    working.push(
      `${strongCats[0].key} category's ${winRate(strongCats[0]).toFixed(0)}% win rate`,
    );
  if (last30.length >= 5) working.push(`${last30.length} new leads captured in the last 30 days`);
  if (!working.length) working.push("Pipeline is still too young to show clear strengths");

  const concerns: string[] = [];
  if (closed >= 3 && conv < 50)
    concerns.push(`Low conversion rate of ${conv.toFixed(0)}% overall`);
  for (const r of weakReps.slice(0, 2))
    concerns.push(`${r.name}'s 0% win rate across ${r.total} assigned leads`);
  if (last7.length <= 2)
    concerns.push(`Low number of leads in recent weeks (${last7.length} in the last 7 days)`);
  const untagged = leads.filter((l) => !l.budget_range).length;
  if (untagged) concerns.push(`${untagged} leads have no budget range tagged`);
  const overdue = leads.filter(
    (l) => isOpenStage(l.stage) && l.follow_up_due_at && new Date(l.follow_up_due_at) < new Date(),
  ).length;
  if (overdue) concerns.push(`${overdue} open leads have overdue follow-ups`);
  if (!concerns.length) concerns.push("No material red flags in the current pipeline");

  const recommendations: Insight["recommendations"] = [];
  if (weakReps[0])
    recommendations.push({
      priority: "HIGH",
      title: `Coach ${weakReps[0].name}`,
      body: `${weakReps[0].name} has a 0% win rate with ${weakReps[0].total} leads, indicating a need for improvement.`,
    });
  if (overdue)
    recommendations.push({
      priority: "HIGH",
      title: "Clear overdue follow-ups",
      body: `${overdue} open leads are past their follow-up date and are at risk of going cold.`,
    });
  if (strongSources[0])
    recommendations.push({
      priority: "MEDIUM",
      title: `Double down on ${strongSources[0].key}`,
      body: `${strongSources[0].key} converts at ${winRate(strongSources[0]).toFixed(0)}% over ${strongSources[0].total} leads — worth more spend and attention.`,
    });
  if (untagged)
    recommendations.push({
      priority: "LOW",
      title: "Tag budget ranges at intake",
      body: `${untagged} leads have no budget range, which weakens deal-value forecasting.`,
    });
  if (!recommendations.length)
    recommendations.push({
      priority: "MEDIUM",
      title: "Keep capturing lead detail",
      body: "There isn't enough closed history yet — keep logging sources, budgets and outcomes.",
    });

  return {
    generatedAt: new Date(),
    headline,
    working: working.slice(0, 5),
    concerns: concerns.slice(0, 5),
    recommendations: recommendations.slice(0, 4),
    watch: [
      "Weekly lead volume",
      "Conversion rate by sales representative",
      "Win rate by product category",
    ],
  };
}

const PRIORITY_CLS: Record<string, string> = {
  HIGH: "border-destructive/40 bg-destructive/10 text-destructive",
  MEDIUM: "border-warning/40 bg-warning/15 text-warning",
  LOW: "border-border bg-secondary text-muted-foreground",
};

/* ------------------------------- page ------------------------------- */

function AnalyticsPage() {
  const qc = useQueryClient();
  const { data: leads = [], isFetching } = useLeads();
  const { data: team = [] } = useTeam();
  const sweep = useExpireStaleLeads();
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [insight, setInsight] = useState<Insight | null>(null);

  const refresh = () => {
    sweep.mutate(undefined, {
      onSettled: () => {
        void qc.invalidateQueries({ queryKey: ["crm-leads"] });
        void qc.invalidateQueries({ queryKey: ["crm-lead-scoring"] });
        void qc.invalidateQueries({ queryKey: ["crm-lead-activities"] });
        setUpdatedAt(new Date());
      },
    });
  };

  useEffect(() => {
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Generate the narrative once data lands, then only on demand.
  useEffect(() => {
    if (!insight && leads.length >= 0) setInsight(buildInsight(leads, team));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, team]);

  const stats = useMemo(() => {
    const now = Date.now();
    const won = leads.filter((l) => l.stage === "won");
    const lost = leads.filter((l) => l.stage === "not_won");
    const inProgress = leads.filter((l) => isOpenStage(l.stage));
    const wonValue = won.reduce((s, l) => s + leadValue(l), 0);
    const since = (days: number) =>
      leads.filter((l) => now - new Date(l.created_at).getTime() <= days * 86_400_000).length;
    return {
      won,
      lost,
      inProgress,
      wonValue,
      conversion: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : 0,
      last7: since(7),
      last30: since(30),
      avgDeal: won.length ? wonValue / won.length : 0,
      byStage: LEAD_STAGES.map((s) => ({
        stage: s,
        count: leads.filter((l) => l.stage === s).length,
      })),
    };
  }, [leads]);

  const weekly = useMemo(() => {
    if (!leads.length) return [] as { start: Date; count: number }[];
    const times = leads.map((l) => new Date(l.created_at).getTime());
    let cur = weekStart(new Date(Math.min(...times)));
    const end = weekStart(new Date(Math.max(...times, Date.now())));
    const out: { start: Date; count: number }[] = [];
    while (cur.getTime() <= end.getTime()) {
      const from = cur.getTime();
      const to = from + WEEK_MS;
      out.push({
        start: new Date(cur),
        count: leads.filter((l) => {
          const t = new Date(l.created_at).getTime();
          return t >= from && t < to;
        }).length,
      });
      cur = new Date(from + WEEK_MS);
    }
    return out;
  }, [leads]);

  const bySource = useMemo(
    () => groupBy(leads, (l) => (l.source ? pretty(l.source) : "Unspecified")),
    [leads],
  );
  const byRep = useMemo(
    () =>
      groupBy(leads, (l) => l.rep_id).map((g) => ({ ...g, name: nameOf(team, g.key) })),
    [leads, team],
  );
  const byCategory = useMemo(
    () => groupBy(leads, (l) => (l.machine_interest?.trim() ? l.machine_interest.trim() : "Unspecified")),
    [leads],
  );
  const byBudget = useMemo(() => groupBy(leads, (l) => budgetTier(l.budget_range)), [leads]);

  /* -------------------- quality leads analysis -------------------- */
  const quality = useMemo(() => {
    const won = leads.filter((l) => l.stage === "won");
    if (won.length < 5) return { enough: false as const, won: won.length };
    const breakdown = LEAD_SCORING_CRITERIA.map((c) => {
      const hits = won.filter((l) => scored(l, c.column)).length;
      return { ...c, pct: (hits / won.length) * 100, hits };
    }).sort((a, b) => b.pct - a.pct);
    const top = breakdown.filter((b) => b.pct > 0).slice(0, 3);
    const matching = leads
      .filter((l) => isOpenStage(l.stage))
      .map((l) => ({ lead: l, matches: top.filter((c) => scored(l, c.column)).length }))
      .filter((m) => top.length > 0 && m.matches >= top.length)
      .sort((a, b) => num(b.lead.total_score) - num(a.lead.total_score));
    return { enough: true as const, won: won.length, breakdown, top, matching };
  }, [leads]);

  const maxStage = Math.max(1, ...stats.byStage.map((s) => s.count));
  const maxWeek = Math.max(1, ...weekly.map((w) => w.count));

  return (
    <CrmShell
      title="Analytics"
      subtitle="Funnel, source performance, rep performance, and trends. Numbers cover the whole tenant lifetime."
      showBack
      actions={
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Last updated{" "}
            {updatedAt.toLocaleTimeString("en-KE", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          <Button size="sm" variant="outline" onClick={refresh} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* 1. AI pipeline insights */}
        <CrmCard
          title="AI Pipeline Insights"
          action={
            <Badge className="border-primary/30 bg-primary/10 text-primary">
              <Sparkles className="mr-1 h-3 w-3" /> Narrative report
            </Badge>
          }
        >
          {!insight ? (
            <p className="text-sm text-muted-foreground">Generating…</p>
          ) : (
            <div className="space-y-5">
              <p className="text-xs text-muted-foreground">
                Generated{" "}
                {insight.generatedAt.toLocaleString("en-KE", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <h3 className="font-display text-xl font-bold leading-snug">{insight.headline}</h3>

              <Section heading="What's working">
                {insight.working.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </Section>

              <Section heading="Concerns">
                {insight.concerns.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </Section>

              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Recommendations
                </h4>
                <ul className="space-y-2">
                  {insight.recommendations.map((r) => (
                    <li
                      key={r.title}
                      className="rounded-lg border border-border bg-secondary/30 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={PRIORITY_CLS[r.priority]}>{r.priority}</Badge>
                        <span className="text-sm font-semibold">{r.title}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <Section heading="Watch list">
                {insight.watch.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </Section>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setInsight(buildInsight(leads, team))}
              >
                <Sparkles className="h-4 w-4" /> Regenerate
              </Button>
            </div>
          )}
        </CrmCard>

        {/* 2. Stat tiles */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <MiniTile label="Total leads" value={String(leads.length)} />
          <MiniTile
            label="Won"
            value={String(stats.won.length)}
            sub={formatKES(stats.wonValue)}
            tone="good"
          />
          <MiniTile label="Not won" value={String(stats.lost.length)} tone="bad" />
          <MiniTile label="Conversion" value={`${stats.conversion.toFixed(0)}%`} />
          <MiniTile label="In progress" value={String(stats.inProgress.length)} tone="warn" />
          <MiniTile label="Last 7 days" value={String(stats.last7)} />
          <MiniTile label="Last 30 days" value={String(stats.last30)} />
          <MiniTile label="Avg deal value" value={formatKES(stats.avgDeal)} />
        </div>

        {/* 3 + 4 */}
        <div className="grid gap-4 lg:grid-cols-2">
          <CrmCard title="Funnel">
            <div className="space-y-3">
              {stats.byStage.map((s) => (
                <Bar
                  key={s.stage}
                  label={LEAD_STAGE_LABEL[s.stage] ?? s.stage}
                  value={s.count}
                  max={maxStage}
                  sub={`${s.count} lead${s.count === 1 ? "" : "s"}`}
                />
              ))}
            </div>
          </CrmCard>

          <CrmCard title="Weekly trend" >
            {weekly.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leads recorded yet.</p>
            ) : (
              <div className="overflow-x-auto pb-1">
                <div className="flex h-48 min-w-full items-end gap-1.5">
                  {weekly.map((w) => (
                    <div
                      key={w.start.toISOString()}
                      className="flex min-w-[26px] flex-1 flex-col items-center gap-1"
                      title={`${w.count} new lead${w.count === 1 ? "" : "s"} week of ${w.start.toLocaleDateString("en-KE")}`}
                    >
                      <span className="text-[0.65rem] tabular-nums text-muted-foreground">
                        {w.count || ""}
                      </span>
                      <div
                        className="w-full rounded-t bg-primary/80"
                        style={{ height: `${Math.max(2, (w.count / maxWeek) * 140)}px` }}
                      />
                      <span className="whitespace-nowrap text-[0.6rem] text-muted-foreground">
                        {w.start.toLocaleDateString("en-KE", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CrmCard>
        </div>

        {/* 5 */}
        <CrmCard title="By source">
          <GroupTable
            head="Source"
            rows={bySource}
            showValue
            empty="No lead sources recorded yet."
          />
        </CrmCard>

        {/* 6 */}
        <CrmCard title="By rep">
          <p className="-mt-2 mb-3 text-sm text-muted-foreground">
            Each rep's pipeline + conversion. Reps with no assignments are hidden.
          </p>
          <GroupTable
            head="Rep"
            rows={byRep.map((r) => ({ ...r, key: r.name }))}
            empty="No leads assigned to reps yet."
          />
        </CrmCard>

        {/* 7 */}
        <CrmCard title="By machine category">
          <p className="-mt-2 mb-3 text-sm text-muted-foreground">
            Which product lines attract leads.
          </p>
          <GroupTable head="Category" rows={byCategory} empty="No machine interest recorded yet." />
        </CrmCard>

        {/* 8 */}
        <CrmCard title="By budget range">
          <p className="-mt-2 mb-3 text-sm text-muted-foreground">
            Distribution across budget tiers (when tagged).
          </p>
          <GroupTable head="Budget" rows={byBudget} empty="No budgets tagged yet." />
        </CrmCard>

        {/* Quality leads (kept) */}
        <CrmCard title="Quality Leads">
          {!quality.enough ? (
            <p className="text-sm text-muted-foreground">
              Not enough closed deals yet to identify a pattern ({quality.won} won lead
              {quality.won === 1 ? "" : "s"} — 5 needed).
            </p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-sm text-muted-foreground">
                  What your {quality.won} won leads had in common:
                </p>
                <ul className="space-y-2">
                  {quality.breakdown.map((b) => (
                    <li key={b.key} className="flex items-center justify-between gap-3 text-sm">
                      <span>{b.label}</span>
                      <span className="font-semibold tabular-nums">
                        {b.pct.toFixed(0)}%
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          ({b.hits}/{quality.won})
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-3 text-sm font-semibold">Leads worth prioritizing</p>
                {quality.matching.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No open leads currently match the top {quality.top.length || 0} winning traits.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {quality.matching.map(({ lead }) => (
                      <li
                        key={lead.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 p-2.5"
                      >
                        <div>
                          <p className="text-sm font-semibold">{lead.name || lead.phone}</p>
                          <p className="text-xs text-muted-foreground">
                            {nameOf(team, lead.rep_id)}
                            {lead.follow_up_due_at ? (
                              <>
                                {" · "}
                                <span
                                  className={followUpCountdown(lead.follow_up_due_at)!.className}
                                >
                                  {followUpCountdown(lead.follow_up_due_at)!.text}
                                </span>
                              </>
                            ) : null}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold tabular-nums">
                            {num(lead.total_score)}/{MAX_LEAD_SCORE}
                          </span>
                          <Badge className={LEAD_STAGE_BADGE[lead.stage] ?? ""}>
                            {LEAD_STAGE_LABEL[lead.stage] ?? lead.stage}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CrmCard>
      </div>
    </CrmShell>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {heading}
      </h4>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">{children}</ul>
    </div>
  );
}

function GroupTable({
  head,
  rows,
  showValue,
  empty,
}: {
  head: string;
  rows: Group[];
  showValue?: boolean;
  empty: string;
}) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-semibold">{head}</th>
            <th className="py-2 pr-3 text-right font-semibold">Total</th>
            <th className="py-2 pr-3 text-right font-semibold">Won</th>
            <th className="py-2 pr-3 text-right font-semibold">Lost</th>
            <th className="py-2 pr-3 text-right font-semibold">Win rate</th>
            {showValue && <th className="py-2 text-right font-semibold">Value</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key} className="border-b border-border/60 last:border-0">
              <td className="py-2 pr-3 font-medium">{g.key}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{g.total}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-success">{g.won}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-destructive">{g.lost}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{winRate(g).toFixed(0)}%</td>
              {showValue && (
                <td className="py-2 text-right tabular-nums">{formatKES(g.value)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
