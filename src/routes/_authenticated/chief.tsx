import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Hammer, Inbox } from "lucide-react";
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
import { STAGES, STAGE_LABEL, STAGE_DOT, type Stage } from "@/lib/stages";

export const Route = createFileRoute("/_authenticated/chief")({
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
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: fulfillments = [], isLoading } = useFulfillments();
  const { data: profiles = [] } = useProfiles();
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

  return (
    <AppShell title="Chief Engineer" subtitle="All fulfillments across the pipeline">
      {isLoading ? (
        <div className="surface-card p-6 text-sm text-muted-foreground">Loading pipeline…</div>
      ) : fulfillments.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No fulfillments yet"
          message="Once a sales rep submits a handover it will land in the Received column."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {STAGES.map((stage) => {
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
                    return (
                      <article key={f.id} className="surface-card space-y-3 p-4">
                        <button
                          className="text-left"
                          onClick={() => navigate({ to: "/fulfillment/$id", params: { id: f.id } })}
                        >
                          <p className="font-semibold leading-tight">{f.client_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {f.machine_type} · {f.location}
                          </p>
                        </button>
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

                        {stage === "received" && (
                          <Button
                            size="sm"
                            className="w-full"
                            disabled={mutate.isPending}
                            onClick={() =>
                              mutate.mutate({
                                id: f.id,
                                patch: {
                                  current_stage: "waiting_for_frame",
                                  chief_engineer_id: profile!.id,
                                  frame_ordered_at: new Date().toISOString(),
                                },
                              })
                            }
                          >
                            Order Frame
                          </Button>
                        )}

                        {stage === "waiting_for_frame" && (
                          <div className="space-y-2">
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
                              onClick={() =>
                                mutate.mutate({
                                  id: f.id,
                                  patch: {
                                    current_stage: "assembling",
                                    assembly_engineer_id: a.asm,
                                    installation_engineer_id: a.inst || null,
                                    chief_engineer_id: f.chief_engineer_id ?? profile!.id,
                                  },
                                })
                              }
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
