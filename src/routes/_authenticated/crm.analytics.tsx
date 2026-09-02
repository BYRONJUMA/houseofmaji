import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { CrmShell, CrmCard, MiniTile, Bar, Badge } from "@/components/crm-shell";
import { Button } from "@/components/ui/button";
import { UnifiedSummary } from "@/components/unified-summary";
import { useLeads, useTeam, nameOf, type Lead } from "@/hooks/use-crm";
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
  monthStart,
  num,
} from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/crm/analytics")({
  head: () => ({
    meta: [
      { title: "Lead Analytics — Machines CRM" },
      {
        name: "description",
        content:
          "Live lead analytics for House of Maji: pipeline funnel, lead scores and the traits that closed deals share.",
      },
      { property: "og:title", content: "Lead Analytics — Machines CRM" },
      {
        property: "og:description",
        content: "Live pipeline funnel, lead scoring and quality-lead patterns.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

const REFRESH_MS = 60_000;

function scored(lead: Lead, column: string) {
  return Boolean((lead as unknown as Record<string, string | null>)[column]);
}

function AnalyticsPage() {
  const qc = useQueryClient();
  const { data: leads = [], isFetching } = useLeads();
  const { data: team = [] } = useTeam();
  const sweep = useExpireStaleLeads();
  const [updatedAt, setUpdatedAt] = useState(() => new Date());

  const refresh = () => {
    sweep.mutate(undefined, {
      onSettled: () => {
        void qc.invalidateQueries({ queryKey: ["crm-leads"] });
        void qc.invalidateQueries({ queryKey: ["crm-lead-scoring"] });
        void qc.invalidateQueries({ queryKey: ["crm-lead-activities"] });
        void qc.invalidateQueries({ queryKey: ["crm-invoices"] });
        void qc.invalidateQueries({ queryKey: ["crm-services"] });
        void qc.invalidateQueries({ queryKey: ["crm-schools"] });
        setUpdatedAt(new Date());
      },
    });
  };

  useEffect(() => {
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const open = leads.filter((l) => isOpenStage(l.stage));
    const won = leads.filter((l) => l.stage === "won");
    const closed = leads.filter((l) => !isOpenStage(l.stage));
    const ms = monthStart(new Date()).getTime();
    const wonThisMonth = won.filter((l) => new Date(l.updated_at).getTime() >= ms);
    const overdue = open.filter(
      (l) => l.follow_up_due_at && new Date(l.follow_up_due_at) < new Date(),
    );
    const pipeline = open.reduce((s, l) => s + num(l.deal_value), 0);
    const avgScore = leads.length
      ? leads.reduce((s, l) => s + num(l.total_score), 0) / leads.length
      : 0;
    return {
      open,
      won,
      overdue,
      pipeline,
      avgScore,
      wonThisMonth,
      winRate: closed.length ? (won.length / closed.length) * 100 : 0,
      byStage: LEAD_STAGES.map((s) => ({
        stage: s,
        count: leads.filter((l) => l.stage === s).length,
      })),
    };
  }, [leads]);

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
      .map((l) => ({
        lead: l,
        matches: top.filter((c) => scored(l, c.column)).length,
      }))
      .filter((m) => top.length > 0 && m.matches >= top.length)
      .sort((a, b) => num(b.lead.total_score) - num(a.lead.total_score));

    return { enough: true as const, won: won.length, breakdown, top, matching };
  }, [leads]);

  const maxStage = Math.max(1, ...stats.byStage.map((s) => s.count));

  return (
    <CrmShell
      title="Lead Analytics"
      subtitle="Live pipeline, lead scoring and what your won deals have in common."
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
        <UnifiedSummary />

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MiniTile label="Total leads" value={String(leads.length)} />
          <MiniTile label="Open leads" value={String(stats.open.length)} />
          <MiniTile label="Open pipeline" value={formatKES(stats.pipeline)} />
          <MiniTile
            label="Won this month"
            value={String(stats.wonThisMonth.length)}
            tone="good"
          />
          <MiniTile label="Win rate" value={`${stats.winRate.toFixed(0)}%`} />
          <MiniTile
            label="Overdue follow-ups"
            value={String(stats.overdue.length)}
            tone={stats.overdue.length ? "bad" : "good"}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <CrmCard title="Pipeline funnel">
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

          <CrmCard title="Lead scoring">
            <p className="text-sm text-muted-foreground">
              Average score{" "}
              <span className="font-display text-lg font-bold tabular-nums text-foreground">
                {stats.avgScore.toFixed(1)}
              </span>{" "}
              / {MAX_LEAD_SCORE}
            </p>
            <div className="mt-4 space-y-3">
              {LEAD_SCORING_CRITERIA.map((c) => {
                const hits = leads.filter((l) => scored(l, c.column)).length;
                return (
                  <Bar
                    key={c.key}
                    label={`${c.label} (+${c.points})`}
                    value={hits}
                    max={Math.max(1, leads.length)}
                    sub={`${hits} of ${leads.length}`}
                  />
                );
              })}
            </div>
          </CrmCard>
        </div>

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
                    No open leads currently match the top{" "}
                    {quality.top.length || 0} winning traits.
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
                                <span className={followUpCountdown(lead.follow_up_due_at)!.className}>
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
