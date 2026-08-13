import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { AdminOrderActions } from "@/components/admin-order-actions";
import { AdminUserActions } from "@/components/admin-user-actions";
import { useAuth } from "@/hooks/use-auth";
import { formatKES, formatDate, formatDuration } from "@/lib/format";
import { STAGE_LABEL, STAGE_SOFT, type Stage } from "@/lib/stages";
import { StageTiles, stageSearchSchema } from "@/components/stage-tiles";
import { MetricTiles, StageBreakdown, type Metric } from "@/components/metric-tiles";
import { useAllPayments, totalPaid } from "@/hooks/use-payments";

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
  const { profile } = useAuth();
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

  const { data: payments = [] } = useAllPayments();

  const names = Object.fromEntries(profiles.map((p) => [p.id, p.full_name]));
  const active = fulfillments.filter((f) => f.current_stage !== "installed");
  const totalCommission = commissions.reduce((s, c) => s + Number(c.amount), 0);
  const paidCommission = commissions
    .filter((c) => c.paid)
    .reduce((s, c) => s + Number(c.amount), 0);
  const revenue = fulfillments.reduce((s, f) => s + Number(f.agreed_price), 0);
  const collected = totalPaid(payments);
  const installed = fulfillments.filter((f) => f.current_stage === "installed");
  const avgCycle =
    installed.length > 0
      ? installed.reduce(
          (s, f) =>
            s + (new Date(f.updated_at).getTime() - new Date(f.created_at).getTime()) / 1000,
          0,
        ) / installed.length
      : 0;

  const perRole = profiles.reduce<Record<string, number>>((acc, p) => {
    acc[p.role] = (acc[p.role] ?? 0) + 1;
    return acc;
  }, {});

  const stats: Metric[] = [
    {
      label: "Total orders",
      value: String(fulfillments.length),
      hint: `${active.length} active`,
      link: { to: "/admin", search: {} },
    },
    {
      label: "Total revenue",
      value: formatKES(revenue),
      hint: "Sum of agreed prices",
      link: { to: "/admin", search: {} },
    },
    {
      label: "Revenue collected",
      value: formatKES(collected),
      hint: revenue > 0 ? `${((collected / revenue) * 100).toFixed(0)}% of agreed value` : undefined,
      link: { to: "/admin", search: {} },
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
      link: { to: "/admin", search: {} },
    },
    { label: "Orders installed", value: String(installed.length), stage: "installed" },
    {
      label: "Avg. cycle time",
      value: avgCycle ? formatDuration(avgCycle) : "—",
      stage: "installed",
    },
  ];


  return (
    <AppShell title="Admin Panel" subtitle="Everything happening across the business">
      <MetricTiles metrics={stats} homePath="/admin" />

      <div className="mt-4">
        <StageBreakdown items={fulfillments} homePath="/admin" />
      </div>

      <div className="mt-8">
        <StageTiles items={fulfillments} homePath="/admin" activeStage={stage} />
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold">Team</h2>
        <p className="text-sm text-muted-foreground">
          Change a role or remove an account. Users still assigned to an active order can’t be
          deleted.
        </p>
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Earned</th>
                <th className="px-4 py-3 text-right">Manage</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate({ to: "/user/$id", params: { id: p.id } })}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary"
                >
                  <td className="px-4 py-3 font-medium">
                    {p.full_name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {ROLE_LABEL[p.role] ?? p.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(p.created_at)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatKES(
                      commissions
                        .filter((c) => c.user_id === p.id)
                        .reduce((s, c) => s + Number(c.amount), 0),
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <AdminUserActions user={p} isSelf={p.id === profile?.id} />
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
                <th className="px-4 py-3 text-right">Manage</th>
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
                      {(f.sales_rep_id && names[f.sales_rep_id]) ?? "—"}
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
                    <td className="px-4 py-3">
                      <AdminOrderActions fulfillment={f} people={profiles} />
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
