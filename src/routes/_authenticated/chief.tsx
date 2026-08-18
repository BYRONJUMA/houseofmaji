import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Hammer, Inbox, Boxes, UserCog, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { AppShell, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatKES, formatDate } from "@/lib/format";
import {
  STAGES,
  STAGE_LABEL,
  STAGE_DOT,
  PAYMENT_GATE,
  PAYMENT_GATE_MESSAGE,
  type Stage,
} from "@/lib/stages";
import { useAllPayments, paidPercent, totalPaid } from "@/hooks/use-payments";
import { OrderCard } from "@/components/order-card";
import { StageTiles, stageSearchSchema } from "@/components/stage-tiles";
import { type Metric } from "@/components/metric-tiles";
import { UnifiedSummary } from "@/components/unified-summary";
import { SiteVisitsAwaitingAssignment } from "@/components/site-visit-assignment";
import { formatDuration } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/chief")({
  validateSearch: stageSearchSchema,
  head: () => ({
    meta: [
      { title: "Chief Engineer — Machines" },
      { name: "description", content: "Run the assembly and delivery pipeline stage by stage." },
      { property: "og:title", content: "Chief Engineer — Machines" },
      { property: "og:description", content: "Order frames and assign engineers to machines." },
    ],
  }),
  component: ChiefPage,
});

const ROLE_LABEL: Record<string, string> = {
  sales_rep: "Sales Rep",
  chief_engineer: "Chief Engineer",
  engineer: "Engineer",
  admin: "Admin",
};

export function useFulfillments() {
  return useQuery({
    queryKey: ["fulfillments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fulfillments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

function ChiefPage() {
  const { profile } = useAuth();
  const canAct = profile?.role === "chief_engineer" || profile?.role === "admin";
  const { stage: stageFilter } = Route.useSearch() as { stage?: Stage };
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: fulfillments = [], isLoading } = useFulfillments();
  const { data: profiles = [] } = useProfiles();
  const { data: payments = [] } = useAllPayments();
  const { data: commissions = [] } = useQuery({
    queryKey: ["commissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("commissions").select("*");
      if (error) throw error;
      return data;
    },
  });
  // the chief engineer can also assign the job to themselves
  const engineers = profiles.filter(
    (p) => p.role === "engineer" || (profile?.id && p.id === profile.id),
  );
  const [assign, setAssign] = useState<Record<string, { asm?: string; inst?: string }>>({});

  const mutate = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"fulfillments"> }) => {
      const { data, error } = await supabase
        .from("fulfillments")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (updated) => {
      qc.setQueryData<typeof fulfillments>(["fulfillments"], (current) =>
        (current ?? []).map((item) => (item.id === updated.id ? updated : item)),
      );
      qc.setQueryData(["fulfillment", updated.id], (current: unknown) => {
        if (!current || typeof current !== "object" || !("fulfillment" in current)) return current;
        return { ...current, fulfillment: updated };
      });
      toast.success("Pipeline updated");
      qc.invalidateQueries({ queryKey: ["fulfillments"] });
      qc.invalidateQueries({ queryKey: ["summary-fulfillments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const names = Object.fromEntries(profiles.map((p) => [p.id, p.full_name]));
  const paidByFulfillment = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.fulfillment_id] = (acc[p.fulfillment_id] ?? 0) + Number(p.amount);
    return acc;
  }, {});

  const active = fulfillments.filter((f) => f.current_stage !== "installed");
  const installed = fulfillments.filter((f) => f.current_stage === "installed");
  const avgCycle =
    installed.length > 0
      ? installed.reduce(
          (s, f) =>
            s + (new Date(f.updated_at).getTime() - new Date(f.created_at).getTime()) / 1000,
          0,
        ) / installed.length
      : 0;

  const totalCommission = commissions.reduce((s, c) => s + Number(c.amount), 0);
  const paidCommission = commissions
    .filter((c) => c.paid)
    .reduce((s, c) => s + Number(c.amount), 0);
  const revenue = fulfillments.reduce((s, f) => s + Number(f.agreed_price), 0);
  const collected = totalPaid(payments);

  const perRole = profiles.reduce<Record<string, number>>((acc, p) => {
    acc[p.role] = (acc[p.role] ?? 0) + 1;
    return acc;
  }, {});

  const stats: Metric[] = [
    {
      label: "Total orders",
      value: String(fulfillments.length),
      hint: `${active.length} active`,
      link: { to: "/chief", search: {} },
    },
    {
      label: "Total revenue",
      value: formatKES(revenue),
      hint: "Sum of agreed prices",
      link: { to: "/chief", search: {} },
    },
    {
      label: "Revenue collected",
      value: formatKES(collected),
      hint: revenue > 0 ? `${((collected / revenue) * 100).toFixed(0)}% of agreed value` : undefined,
      link: { to: "/chief", search: {} },
    },
    {
      label: "Commissions paid",
      value: formatKES(paidCommission),
      link: { to: "/commissions", search: { paid: "paid" } },
    },
    {
      label: "Commissions unpaid",
      value: formatKES(totalCommission - paidCommission),
      link: { to: "/commissions", search: { paid: "unpaid" } },
    },
    {
      label: "Team members",
      value: String(profiles.length),
      hint: Object.entries(perRole)
        .map(([r, n]) => `${n} ${ROLE_LABEL[r] ?? r}`)
        .join(" · "),
      link: { to: "/chief", search: {} },
    },
    { label: "Orders installed", value: String(installed.length), stage: "installed" },
    {
      label: "Avg. cycle time",
      value: avgCycle ? formatDuration(avgCycle) : "—",
      stage: "installed",
    },
  ];

  const blocked = fulfillments.filter((f) => {
    const next: Stage | null =
      f.current_stage === "received"
        ? "waiting_for_frame"
        : f.current_stage === "waiting_for_frame"
          ? "material_procurement"
          : null;
    if (!next) return false;
    return paidPercent(paidByFulfillment[f.id] ?? 0, f.agreed_price) < (PAYMENT_GATE[next] ?? 0);
  }).length;


  return (
    <AppShell
      title={canAct ? "Chief Engineer" : "Machines Pipeline"}
      subtitle={
        canAct
          ? "All fulfillments across the pipeline"
          : "Read-only view of all fulfillments across the pipeline"
      }
    >
      <UnifiedSummary />


      <div className="mt-8">
        {canAct && <SiteVisitsAwaitingAssignment />}
      </div>

      <div className="mb-8 mt-8">
        <StageTiles items={fulfillments} homePath="/chief" activeStage={stageFilter} />
      </div>

      {isLoading ? (
        <div className="surface-card p-6 text-sm text-muted-foreground">Loading pipeline…</div>
      ) : fulfillments.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No fulfillments yet"
          message="Once a sales rep submits a handover it will land in the Received column."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {STAGES.filter((s) => !stageFilter || s === stageFilter).map((stage) => {
            const items = fulfillments.filter((f) => f.current_stage === stage);
            return (
              <section key={stage} className="flex flex-col gap-3">
                <header className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${STAGE_DOT[stage]}`} />
                  <h2 className="text-sm font-bold uppercase tracking-wide">
                    {STAGE_LABEL[stage]}
                  </h2>
                  <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {items.length}
                  </span>
                </header>

                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    Nothing here
                  </p>
                ) : (
                  items.map((f) => {
                    const a = assign[f.id] ?? {};
                    const pct = paidPercent(paidByFulfillment[f.id] ?? 0, f.agreed_price);
                    const nextStage: Stage | null =
                      stage === "received"
                        ? "waiting_for_frame"
                        : stage === "waiting_for_frame"
                          ? "material_procurement"
                          : null;
                    const gate = nextStage ? (PAYMENT_GATE[nextStage] ?? 0) : 0;
                    const blocked = nextStage !== null && pct < gate;

                    return (
                      <OrderCard
                        key={f.id}
                        fulfillment={f}
                        paid={paidByFulfillment[f.id] ?? 0}
                        compact
                        meta={
                          <div className="space-y-1 text-xs text-muted-foreground">
                            {f.assembly_engineer_id && (
                              <p>Assembly: {names[f.assembly_engineer_id]}</p>
                            )}
                            {f.installation_engineer_id && (
                              <p>Install: {names[f.installation_engineer_id]}</p>
                            )}
                            {blocked && nextStage && (
                              <p className="rounded-lg bg-destructive/10 px-2.5 py-2 text-xs font-medium text-destructive">
                                {PAYMENT_GATE_MESSAGE[nextStage]}
                              </p>
                            )}
                          </div>
                        }
                      >


                        {canAct && stage === "received" && (
                          <Button
                            size="sm"
                            className="w-full"
                            disabled={mutate.isPending || blocked}
                            onClick={(e) => {
                              e.stopPropagation();
                              mutate.mutate({
                                id: f.id,
                                patch: {
                                  current_stage: "waiting_for_frame",
                                  chief_engineer_id: profile?.id,
                                  frame_ordered_at: new Date().toISOString(),
                                },
                              });
                            }}
                          >
                            Order Frame
                          </Button>
                        )}

                        {canAct && stage === "waiting_for_frame" && (
                          <Button
                            size="sm"
                            className="w-full"
                            disabled={mutate.isPending || blocked}
                            onClick={(e) => {
                              e.stopPropagation();
                              mutate.mutate({
                                id: f.id,
                                patch: {
                                  current_stage: "material_procurement",
                                  chief_engineer_id: f.chief_engineer_id ?? profile?.id,
                                },
                              });
                            }}
                          >
                            <Boxes className="h-4 w-4" /> Start Material Procurement
                          </Button>
                        )}

                        {canAct && stage === "material_procurement" && (
                          <div
                            className="space-y-2"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <Select
                              value={a.asm ?? ""}
                              onValueChange={(v) =>
                                setAssign({ ...assign, [f.id]: { ...a, asm: v } })
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Assembly engineer *" />
                              </SelectTrigger>
                              <SelectContent>
                                {engineers.map((e) => (
                                  <SelectItem key={e.id} value={e.id}>
                                    {e.full_name}
                                    {e.id === profile?.id ? " (me)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={a.inst ?? ""}
                              onValueChange={(v) =>
                                setAssign({
                                  ...assign,
                                  [f.id]: { ...a, inst: v === "same" ? "" : v },
                                })
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Installation engineer (optional)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="same">Same engineer installs</SelectItem>
                                {engineers.map((e) => (
                                  <SelectItem key={e.id} value={e.id}>
                                    {e.full_name}
                                    {e.id === profile?.id ? " (me)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              className="w-full"
                              disabled={!a.asm || mutate.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                mutate.mutate({
                                  id: f.id,
                                  patch: {
                                    current_stage: "assigned",
                                    assembly_engineer_id: a.asm,
                                    installation_engineer_id: a.inst || null,
                                    chief_engineer_id: f.chief_engineer_id ?? profile?.id,
                                  },
                                });
                              }}
                            >
                              <Hammer className="h-4 w-4" /> Assign Engineer
                            </Button>
                          </div>
                        )}

                        {["assembling", "delivery", "installed"].includes(stage) && (
                          <Button asChild size="sm" variant="outline" className="w-full">
                            <Link
                              to="/fulfillment/$id"
                              params={{ id: f.id }}
                              search={{ tab: "checklist" }}
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              <ClipboardCheck className="h-4 w-4" /> Delivery Checklist
                            </Link>
                          </Button>
                        )}

                        {canAct && (stage === "assigned" ||
                          stage === "assembling" ||
                          stage === "delivery") && (
                          <div
                            className="space-y-2 border-t border-border pt-3"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Reassign engineer
                            </p>
                            <Select
                              value={a.asm ?? ""}
                              onValueChange={(v) =>
                                setAssign({ ...assign, [f.id]: { ...a, asm: v } })
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="New assembly engineer" />
                              </SelectTrigger>
                              <SelectContent>
                                {engineers.map((e) => (
                                  <SelectItem key={e.id} value={e.id}>
                                    {e.full_name}
                                    {e.id === profile?.id ? " (me)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={a.inst ?? ""}
                              onValueChange={(v) =>
                                setAssign({
                                  ...assign,
                                  [f.id]: { ...a, inst: v === "same" ? "" : v },
                                })
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="New installation engineer (optional)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="same">Same engineer installs</SelectItem>
                                {engineers.map((e) => (
                                  <SelectItem key={e.id} value={e.id}>
                                    {e.full_name}
                                    {e.id === profile?.id ? " (me)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              disabled={
                                mutate.isPending ||
                                ((!a.asm || a.asm === f.assembly_engineer_id) &&
                                  (a.inst ?? "") === (f.installation_engineer_id ?? ""))
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                mutate.mutate({
                                  id: f.id,
                                  patch: {
                                    assembly_engineer_id: a.asm || f.assembly_engineer_id,
                                    installation_engineer_id:
                                      a.inst || f.installation_engineer_id || null,
                                  },
                                });
                                setAssign({ ...assign, [f.id]: {} });
                              }}
                            >
                              <UserCog className="h-4 w-4" /> Reassign Engineer
                            </Button>
                          </div>
                        )}
                      </OrderCard>
                    );
                  })
                )}
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
