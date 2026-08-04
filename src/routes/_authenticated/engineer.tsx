import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wrench, CheckCircle2, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { AppShell, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatKES, formatDate } from "@/lib/format";
import { STAGE_LABEL, STAGE_SOFT, type Stage } from "@/lib/stages";
import { StageTiles, stageSearchSchema } from "@/components/stage-tiles";
import { useCommissions } from "@/hooks/use-commissions";
import { MyCommissionsCard } from "@/components/commission-report";

export const Route = createFileRoute("/_authenticated/engineer")({
  validateSearch: stageSearchSchema,
  head: () => ({
    meta: [
      { title: "My Jobs — House of Maji Machines" },
      { name: "description", content: "Machines assigned to you for assembly and installation." },
      { property: "og:title", content: "My Jobs — House of Maji Machines" },
      { property: "og:description", content: "Mark assembly complete and machines installed." },
    ],
  }),
  component: EngineerPage,
});

function EngineerPage() {
  const { profile } = useAuth();
  const { stage } = Route.useSearch() as { stage?: Stage };
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["engineer-jobs", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fulfillments")
        .select("*")
        .or(`assembly_engineer_id.eq.${profile!.id},installation_engineer_id.eq.${profile!.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: commissions = [] } = useCommissions({ userId: profile?.id });

  const visible = stage ? jobs.filter((f) => f.current_stage === stage) : jobs;

  const mutate = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"fulfillments"> }) => {
      const { error } = await supabase.from("fulfillments").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Job updated");
      qc.invalidateQueries({ queryKey: ["engineer-jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="My Jobs" subtitle="Machines assigned to you">
      <div className="mb-8">
        <StageTiles items={jobs} homePath="/engineer" activeStage={stage} />
      </div>

      {isLoading ? (
        <div className="surface-card p-6 text-sm text-muted-foreground">Loading jobs…</div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={stage ? `No jobs in ${STAGE_LABEL[stage]}` : "No jobs assigned"}
          message={
            stage
              ? "Pick another stage tile or clear the filter to see all of your jobs."
              : "When the chief engineer assigns you a machine for assembly or installation, it shows up here."
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((f) => {
            const installer = f.installation_engineer_id ?? f.assembly_engineer_id;
            const canAssemble =
              f.current_stage === "assembling" && f.assembly_engineer_id === profile?.id;
            const canInstall = f.current_stage === "delivery" && installer === profile?.id;
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
                className="surface-card cursor-pointer space-y-4 p-5 transition-all hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold">{f.client_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {f.machine_type} · {f.location}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${STAGE_SOFT[f.current_stage as Stage]}`}
                  >
                    {STAGE_LABEL[f.current_stage as Stage]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="font-semibold">{formatKES(f.agreed_price)}</span>
                  <span className="text-muted-foreground">
                    Due {formatDate(f.agreed_delivery_date)}
                  </span>
                </div>
                {f.additional_notes && (
                  <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">
                    {f.additional_notes}
                  </p>
                )}
                {canAssemble && (
                  <Button
                    className="w-full"
                    disabled={mutate.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      mutate.mutate({ id: f.id, patch: { current_stage: "delivery" } });
                    }}
                  >
                    <Truck className="h-4 w-4" /> Mark Assembly Complete
                  </Button>
                )}
                {canInstall && (
                  <Button
                    className="w-full"
                    disabled={mutate.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      mutate.mutate({ id: f.id, patch: { current_stage: "installed" } });
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Mark Installed
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      )}

      <MyCommissionsCard rows={commissions} fallbackName={profile?.full_name ?? ""} scope="mine" />
    </AppShell>
  );
}
