import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell, EmptyState } from "@/components/app-shell";
import { formatKES, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/commissions")({
  head: () => ({
    meta: [
      { title: "Commissions — House of Maji Machines" },
      { name: "description", content: "Track every commission earned across sales and jobs." },
      { property: "og:title", content: "Commissions — House of Maji Machines" },
      { property: "og:description", content: "Your earnings from sales and engineering work." },
    ],
  }),
  component: CommissionsPage,
});

const TYPE_LABEL: Record<string, string> = {
  sales: "Sales (2%)",
  assembly: "Assembly",
  installation: "Installation",
};

function CommissionsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const isChief = profile?.role === "chief_engineer";
  const seesAll = isAdmin || isChief;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["commissions", profile?.id, seesAll],
    enabled: !!profile?.id,
    queryFn: async () => {
      let q = supabase
        .from("commissions")
        .select("*, fulfillments(client_name, machine_type), profiles(full_name, role)")
        .order("computed_at", { ascending: false });
      if (!seesAll) q = q.eq("user_id", profile!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <AppShell
      title="Commissions"
      subtitle={
        isAdmin
          ? "All payouts across the team"
          : isChief
            ? "All team payouts (read-only)"
            : "Your earnings"
      }
    >
      <div className="surface-card mb-6 p-5">
        <p className="text-sm text-muted-foreground">
          {seesAll ? "Total commissions" : "Total earned"}
        </p>
        <p className="text-3xl font-bold tracking-tight">{formatKES(total)}</p>
      </div>

      {isLoading ? (
        <div className="surface-card p-6 text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Coins}
          title="No commissions yet"
          message="Commissions appear automatically as machines move through the pipeline."
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {seesAll && <th className="px-4 py-3">Team member</th>}
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Machine</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  {seesAll && (
                    <td className="px-4 py-3 font-medium">{r.profiles?.full_name ?? "—"}</td>
                  )}
                  <td className="px-4 py-3 font-medium">{r.fulfillments?.client_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.fulfillments?.machine_type ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {TYPE_LABEL[r.role] ?? r.role}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.computed_at)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatKES(Number(r.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
