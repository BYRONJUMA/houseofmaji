import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Hammer, Inbox, Boxes } from "lucide-react";
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
import { useAllPayments, paidPercent } from "@/hooks/use-payments";
import { StageTiles, stageSearchSchema } from "@/components/stage-tiles";

export const Route = createFileRoute("/_authenticated/chief")({
  validateSearch: stageSearchSchema,
  head: () => ({
    meta: [
      { title: "Chief Engineer — House of Maji Machines" },
      { name: "description", content: "Run the assembly and delivery pipeline stage by stage." },
      { property: "og:title", content: "Chief Engineer — House of Maji Machines" },
      { property: "og:description", content: "Order frames and assign engineers to machines." },
    ],
  }),
  component: ChiefPage,
});

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
  const { stage: stageFilter } = Route.useSearch() as { stage?: Stage };
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: fulfillments = [], isLoading } = useFulfillments();
  const { data: profiles = [] } = useProfiles();
  const { data: payments = [] } = useAllPayments();
  const engineers = profiles.filter((p) => p.role === "engineer");
  const [assign, setAssign] = useState<Record<string, { asm?: string; inst?: string }>>({});

  const mutate = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"fulfillments"> }) => {
      const { error } = await supabase.from("fulfillments").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pipeline updated");
      qc.invalidateQueries({ queryKey: ["fulfillments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const names = Object.fromEntries(profiles.map((p) => [p.id, p.full_name]));
  const paidByFulfillment = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.fulfillment_id] = (acc[p.fulfillment_id] ?? 0) + Number(p.amount);
    return acc;
  }, {});

  return (
    <AppShell title="Chief Engineer" subtitle="All fulfillments across the pipeline">
      <div className="mb-8">
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
                      <article
                        key={f.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => navigate({ to: "/fulfillment/$id", params: { id: f.id } })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate({ to: "/fulfillment/$id", params: { id: f.id } });
                          }
                        }}
                        className="surface-card cursor-pointer space-y-3 p-4 transition-all hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <div>
                          <p className="font-semibold leading-tight">{f.client_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {f.machine_type} · {f.location}
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <p className="font-semibold text-foreground">
                            {formatKES(f.agreed_price)}
                          </p>
                          <p>Due {formatDate(f.agreed_delivery_date)}</p>
                          {f.assembly_engineer_id && (
                            <p className="mt-1">Assembly: {names[f.assembly_engineer_id]}</p>
                          )}
                          {f.installation_engineer_id && (
                            <p>Install: {names[f.installation_engineer_id]}</p>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span>{pct.toFixed(0)}% paid</span>
                            <span className="text-muted-foreground">
                              {formatKES(paidByFulfillment[f.id] ?? 0)}
                            </span>
                          </div>
                          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className={`h-full rounded-full transition-all ${blocked ? "bg-destructive" : "bg-primary"}`}
                              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                            />
                          </div>
                        </div>

                        {blocked && nextStage && (
                          <p className="rounded-lg bg-destructive/10 px-2.5 py-2 text-xs font-medium text-destructive">
                            {PAYMENT_GATE_MESSAGE[nextStage]}
                          </p>
                        )}

                        {stage === "received" && (
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
                                  chief_engineer_id: profile!.id,
                                  frame_ordered_at: new Date().toISOString(),
                                },
                              });
                            }}
                          >
                            Order Frame
                          </Button>
                        )}

                        {stage === "waiting_for_frame" && (
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
                                  chief_engineer_id: f.chief_engineer_id ?? profile!.id,
                                },
                              });
                            }}
                          >
                            <Boxes className="h-4 w-4" /> Start Material Procurement
                          </Button>
                        )}

                        {stage === "material_procurement" && (
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
                                    current_stage: "assembling",
                                    assembly_engineer_id: a.asm,
                                    installation_engineer_id: a.inst || null,
                                    chief_engineer_id: f.chief_engineer_id ?? profile!.id,
                                  },
                                });
                              }}
                            >
                              <Hammer className="h-4 w-4" /> Start assembly
                            </Button>
                          </div>
                        )}
                      </article>
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
