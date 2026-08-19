import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/app-shell";
import { AdminUserActions } from "@/components/admin-user-actions";
import { useAuth } from "@/hooks/use-auth";
import { formatKES, formatDate } from "@/lib/format";
import { ROLE_LABEL, STAGE_LABEL, STAGE_SOFT, type Stage } from "@/lib/stages";
import { Inbox } from "lucide-react";
import { MetricTiles, type Metric } from "@/components/metric-tiles";
import { useMachinesGuard } from "@/hooks/use-machines-access";

export const Route = createFileRoute("/_authenticated/user/$id")({
  head: () => ({
    meta: [
      { title: "Team Member — Machines" },
      { name: "description", content: "Team member details, assigned orders and commissions." },
      { property: "og:title", content: "Team Member — Machines" },
      { property: "og:description", content: "Manage a team member's role and account." },
    ],
  }),
  component: UserDetailPage,
});

function UserDetailPage() {
  useMachinesGuard();
  const { id } = Route.useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isAdmin = profile?.role === "admin";

  const { data: user, isLoading } = useQuery({
    queryKey: ["profile", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["user-orders", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fulfillments")
        .select("*")
        .or(
          `sales_rep_id.eq.${id},assembly_engineer_id.eq.${id},installation_engineer_id.eq.${id},chief_engineer_id.eq.${id}`,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: commissions = [] } = useQuery({
    queryKey: ["user-commissions", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("commissions").select("*").eq("user_id", id);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <AppShell title="Team member" showBack>
        <div className="surface-card p-6 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell title="Team member" showBack>
        <EmptyState icon={Inbox} title="Not found" message="This account no longer exists." />
      </AppShell>
    );
  }


  const earned = commissions.reduce((s, c) => s + Number(c.amount), 0);
  const paid = commissions.filter((c) => c.paid).reduce((s, c) => s + Number(c.amount), 0);
  const active = orders.filter((f) => f.current_stage !== "installed").length;

  const metrics: Metric[] = [
    { label: "Orders involved in", value: String(orders.length), hint: `${active} active` },
    { label: "Commissions earned", value: formatKES(earned), link: { to: "/commissions" } },
    {
      label: "Paid out",
      value: formatKES(paid),
      link: { to: "/commissions", search: { paid: "paid" } },
    },
    {
      label: "Outstanding",
      value: formatKES(earned - paid),
      link: { to: "/commissions", search: { paid: "unpaid" } },
    },
  ];

  return (
    <AppShell
      title={user.full_name || "Unnamed"}
      subtitle={`${ROLE_LABEL[user.role] ?? user.role} · joined ${formatDate(user.created_at)}`}
      showBack
      actions={
        isAdmin ? <AdminUserActions user={user} isSelf={user.id === profile?.id} /> : undefined
      }
    >

      <MetricTiles metrics={metrics} homePath="/admin" />

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold">Orders</h2>
        {orders.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No orders yet"
            message="This person isn’t attached to any fulfillment."
          />
        ) : (
          <div className="surface-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Machine</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() =>
                      navigate({
                        to: "/fulfillment/$id",
                        params: { id: f.id },
                        search: { tab: undefined },
                      })
                    }
                    className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary"
                  >
                    <td className="px-4 py-3 font-medium">{f.client_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{f.machine_type}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
