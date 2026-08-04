import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, Boxes, Coins, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { formatKES, formatDate, formatDuration } from "@/lib/format";
import { STAGE_LABEL, STAGE_SOFT, type Stage } from "@/lib/stages";
import { StageTiles, stageSearchSchema } from "@/components/stage-tiles";

export const Route = createFileRoute("/_authenticated/admin")({
  validateSearch: stageSearchSchema,
  head: () => ({
    meta: [
      { title: "Admin Panel — House of Maji Machines" },
      { name: "description", content: "Team overview, pipeline stats and commission payouts." },
      { property: "og:title", content: "Admin Panel — House of Maji Machines" },
      { property: "og:description", content: "Monitor every fulfillment and every payout." },
    ],
  }),
  component: AdminPage,
});

const ROLE_LABEL: Record<string, string> = {
  sales_rep: "Sales Rep",
  chief_engineer: "Chief Engineer",
  engineer: "Engineer",
  admin: "Admin",
};

function AdminPage() {
  const { stage } = Route.useSearch() as { stage?: Stage };
  const navigate = useNavigate();
  const { data: fulfillments = [] } = useQuery({
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

  const { data: profiles = [] } = useQuery({
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

  const { data: commissions = [] } = useQuery({
    queryKey: ["commissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("commissions").select("*");
      if (error) throw error;
      return data;
    },
  });

  const names = Object.fromEntries(profiles.map((p) => [p.id, p.full_name]));
  const active = fulfillments.filter((f) => f.current_stage !== "installed");
  const totalCommission = commissions.reduce((s, c) => s + Number(c.amount), 0);
  const installed = fulfillments.filter((f) => f.current_stage === "installed");
  const avgCycle =
    installed.length > 0
      ? installed.reduce(
          (s, f) =>
            s + (new Date(f.updated_at).getTime() - new Date(f.created_at).getTime()) / 1000,
          0,
        ) / installed.length
      : 0;

  const stats = [
    { icon: Boxes, label: "Active fulfillments", value: String(active.length) },
    { icon: Users, label: "Team members", value: String(profiles.length) },
    { icon: Coins, label: "Commissions owed", value: formatKES(totalCommission) },
    {
      icon: Clock,
      label: "Avg. cycle time",
      value: avgCycle ? formatDuration(avgCycle) : "—",
    },
  ];

  return (
    <AppShell title="Admin Panel" subtitle="Everything happening across the business">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="surface-card p-5">
            <s.icon className="h-5 w-5 text-primary" />
            <p className="mt-3 text-2xl font-bold tracking-tight">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <StageTiles items={fulfillments} homePath="/admin" activeStage={stage} />
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold">Team</h2>
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Earned</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{p.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {ROLE_LABEL[p.role] ?? p.role}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(p.created_at)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatKES(
                      commissions
                        .filter((c) => c.user_id === p.id)
                        .reduce((s, c) => s + Number(c.amount), 0),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold">
          {stage ? `Fulfillments — ${STAGE_LABEL[stage]}` : "All fulfillments"}
        </h2>
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Machine</th>
                <th className="px-4 py-3">Sales rep</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {(stage ? fulfillments.filter((f) => f.current_stage === stage) : fulfillments).map(
                (f) => (
                  <tr
                    key={f.id}
                    onClick={() => navigate({ to: "/fulfillment/$id", params: { id: f.id } })}
                    className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary"
                  >
                    <td className="px-4 py-3 font-medium">{f.client_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{f.machine_type}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {names[f.sales_rep_id] ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STAGE_SOFT[f.current_stage as Stage]}`}
                      >
                        {STAGE_LABEL[f.current_stage as Stage]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatKES(f.agreed_price)}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
