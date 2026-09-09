import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/crm-shell";
import { useAuth } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-crm";
import { useStoreAccessList, useStoreAccessMutation } from "@/hooks/use-store";
import { ROLE_LABEL } from "@/lib/stages";
import { BADGE_GOOD, BADGE_NEUTRAL } from "@/lib/crm";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/store/access")({
  head: () => ({
    meta: [
      { title: "Store Access — Machines" },
      {
        name: "description",
        content: "Grant or revoke store management access without changing a person's role.",
      },
      { property: "og:title", content: "Store Access — Machines" },
      {
        property: "og:description",
        content: "Admins decide who can add products and adjust store stock.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoreAccessPage,
});

function StoreAccessPage() {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const notAdmin = !loading && !!profile && profile.role !== "admin";
  useEffect(() => {
    if (notAdmin) navigate({ to: "/store", replace: true });
  }, [notAdmin, navigate]);

  const { data: team = [] } = useTeam();
  const { data: access = [] } = useStoreAccessList();
  const mutate = useStoreAccessMutation();

  const granted = (id: string) => access.find((a) => a.user_id === id);
  const alwaysAllowed = (role: string) => role === "admin" || role === "chief_engineer";

  const toggle = (userId: string, isGranted: boolean) =>
    mutate.mutate(
      { type: isGranted ? "revoke" : "grant", userId, grantedBy: profile?.id },
      {
        onSuccess: () => toast.success(isGranted ? "Access revoked" : "Access granted"),
        onError: (e: Error) => toast.error(e.message),
      },
    );

  return (
    <AppShell
      title="Store access"
      subtitle="Admins and chief engineers can always manage the store. Grant anyone else access here."
      showBack
    >
      <div className="surface-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Store access</th>
              <th className="px-4 py-3 text-right">Manage</th>
            </tr>
          </thead>
          <tbody>
            {team.map((m) => {
              const row = granted(m.id);
              const byRole = alwaysAllowed(m.role);
              return (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{m.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {ROLE_LABEL[m.role] ?? m.role}
                  </td>
                  <td className="px-4 py-3">
                    {byRole ? (
                      <Badge className={BADGE_GOOD}>Always (by role)</Badge>
                    ) : row ? (
                      <Badge className={BADGE_GOOD}>Granted {formatDate(row.granted_at)}</Badge>
                    ) : (
                      <Badge className={BADGE_NEUTRAL}>View only</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {byRole ? (
                      <span className="text-xs text-muted-foreground">No grant needed</span>
                    ) : (
                      <Button
                        size="sm"
                        variant={row ? "outline" : "default"}
                        disabled={mutate.isPending}
                        onClick={() => toggle(m.id, !!row)}
                      >
                        {row ? "Revoke" : "Grant access"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
