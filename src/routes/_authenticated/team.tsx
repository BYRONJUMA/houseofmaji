import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { AdminUserActions } from "@/components/admin-user-actions";
import { useAuth } from "@/hooks/use-auth";
import { formatKES, formatDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/stages";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team & Users — Machines" },
      { name: "description", content: "Manage user accounts, roles and commission earnings." },
      { property: "og:title", content: "Team & Users — Machines" },
      { property: "og:description", content: "Change a role or remove an account." },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const notAdmin = !loading && !!profile && profile.role !== "admin";
  useEffect(() => {
    if (notAdmin) navigate({ to: "/", replace: true });
  }, [notAdmin, navigate]);

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

  const perRole = profiles.reduce<Record<string, number>>((acc, p) => {
    acc[p.role] = (acc[p.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell title="Team & Users" subtitle="Roles, accounts and commission earnings" showBack>
      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(perRole).map(([role, n]) => (
          <span
            key={role}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium"
          >
            {ROLE_LABEL[role] ?? role} <span className="font-bold">{n}</span>
          </span>
        ))}
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        Change a role or remove an account. Users still assigned to an active order can’t be deleted.
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
    </AppShell>
  );
}
