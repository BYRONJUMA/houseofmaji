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

export const Route = createFileRoute("/_authenticated/engineer")({
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
      {isLoading ? (
        <div className="surface-card p-6 text-sm text-muted-foreground">Loading jobs…</div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No jobs assigned"
          message="When the chief engineer assigns you a machine for assembly or installation, it shows up here."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {jobs.map((f) => {
            const installer = f.installation_engineer_id ?? f.assembly_engineer_id;
            const canAssemble =
              f.current_stage === "assembling" && f.assembly_engineer_id === profile?.id;
            const canInstall = f.current_stage === "delivery" && installer === profile?.id;
            return (
              <article key={f.id} className="surface-card space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button
                    className="text-left"
                    onClick={() => navigate({ to: "/fulfillment/$id", params: { id: f.id } })}
                  >
                    <p className="text-base font-semibold">{f.client_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {f.machine_type} · {f.location}
                    </p>
                  </button>
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
                {f.water_analysis_notes && (
                  <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">
                    {f.water_analysis_notes}
                  </p>
                )}
                {canAssemble && (
                  <Button
                    className="w-full"
                    disabled={mutate.isPending}
                    onClick={() =>
                      mutate.mutate({ id: f.id, patch: { current_stage: "delivery" } })
                    }
                  >
                    <Truck className="h-4 w-4" /> Mark Assembly Complete
                  </Button>
                )}
                {canInstall && (
                  <Button
                    className="w-full"
                    disabled={mutate.isPending}
                    onClick={() =>
                      mutate.mutate({ id: f.id, patch: { current_stage: "installed" } })
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" /> Mark Installed
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
