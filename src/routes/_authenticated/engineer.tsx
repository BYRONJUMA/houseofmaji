import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wrench, PackageCheck, Truck, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { AppShell, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatKES, formatDate } from "@/lib/format";
import { STAGE_LABEL, STAGE_SOFT, type Stage } from "@/lib/stages";
import { OrderCard } from "@/components/order-card";
import { StageTiles, stageSearchSchema } from "@/components/stage-tiles";
import { useCommissions } from "@/hooks/use-commissions";
import { MyCommissionsCard } from "@/components/commission-report";
import { type Metric } from "@/components/metric-tiles";
import { UnifiedSummary } from "@/components/unified-summary";
import { useMachinesGuard } from "@/hooks/use-machines-access";

export const Route = createFileRoute("/_authenticated/engineer")({
  validateSearch: stageSearchSchema,
  head: () => ({
    meta: [
      { title: "My Jobs — Machines" },
      { name: "description", content: "Machines assigned to you for assembly and installation." },
      { property: "og:title", content: "My Jobs — Machines" },
      { property: "og:description", content: "Mark assembly complete and machines installed." },
    ],
  }),
  component: EngineerPage,
});

function EngineerPage() {
  useMachinesGuard();
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

  const assemblies = jobs.filter(
    (f) =>
      f.assembly_engineer_id === profile?.id &&
      ["delivery", "installed"].includes(f.current_stage),
  ).length;
  const installations = jobs.filter(
    (f) =>
      (f.installation_engineer_id ?? f.assembly_engineer_id) === profile?.id &&
      f.current_stage === "installed",
  ).length;
  const earned = commissions.reduce((s, c) => s + Number(c.amount), 0);
  const paidCommission = commissions
    .filter((c) => c.paid)
    .reduce((s, c) => s + Number(c.amount), 0);

  const metrics: Metric[] = [
    {
      label: "Assemblies completed",
      value: String(assemblies),
      link: { to: "/engineer", search: {} },
    },
    { label: "Installations completed", value: String(installations), stage: "installed" },
    {
      label: "Commissions earned",
      value: formatKES(earned),
      hint: `${formatKES(paidCommission)} paid · ${formatKES(earned - paidCommission)} unpaid`,
      link: { to: "/commissions" },
    },
    {
      label: "Currently assigned",
      value: String(jobs.filter((f) => f.current_stage !== "installed").length),
      link: { to: "/engineer", search: {} },
    },
  ];

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
      qc.setQueryData<typeof jobs>(["engineer-jobs", profile?.id], (current) =>
        (current ?? []).map((item) => (item.id === updated.id ? updated : item)),
      );
      qc.setQueryData(["fulfillment", updated.id], (current: unknown) => {
        if (!current || typeof current !== "object" || !("fulfillment" in current)) return current;
        return { ...current, fulfillment: updated };
      });
      toast.success("Job updated");
      qc.invalidateQueries({ queryKey: ["engineer-jobs"] });
      qc.invalidateQueries({ queryKey: ["fulfillments"] });
      qc.invalidateQueries({ queryKey: ["summary-fulfillments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="My Jobs" subtitle="Machines assigned to you">
      <UnifiedSummary />

      <div className="mb-8 mt-8">
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
            const canReceive =
              f.current_stage === "assigned" && f.assembly_engineer_id === profile?.id;
            const canAssemble =
              f.current_stage === "assembling" && f.assembly_engineer_id === profile?.id;
            return (
              <OrderCard
                key={f.id}
                fulfillment={f}
                meta={
                  f.additional_notes ? (
                    <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">
                      {f.additional_notes}
                    </p>
                  ) : null
                }
              >

                {canReceive && (
                  <Button
                    className="w-full"
                    disabled={mutate.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      mutate.mutate({ id: f.id, patch: { current_stage: "assembling" } });
                    }}
                  >
                    <PackageCheck className="h-4 w-4" /> Mark Machine Received
                  </Button>
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
                {["assembling", "delivery", "installed"].includes(f.current_stage) && (
                  <Button asChild variant="outline" className="w-full">
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
                {f.current_stage === "delivery" && (
                  <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
                    Complete the “Delivered & Installed By” sign-off on the checklist to mark this
                    installed.
                  </p>
                )}
              </OrderCard>
            );
          })}
        </div>
      )}

      <MyCommissionsCard rows={commissions} fallbackName={profile?.full_name ?? ""} scope="mine" />
    </AppShell>
  );
}
