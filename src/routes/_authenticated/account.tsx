import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { EquipmentPanel } from "@/components/equipment-panel";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/stages";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "My Account — Machines" },
      {
        name: "description",
        content: "Your profile details and the company equipment currently assigned to you.",
      },
      { property: "og:title", content: "My Account — Machines" },
      {
        property: "og:description",
        content: "Track the company equipment assigned to you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { profile, loading } = useAuth();

  return (
    <AppShell
      title="My account"
      subtitle="Your details and the company equipment assigned to you"
      showBack
    >
      <div className="space-y-6">
        <section className="surface-card p-5">
          <h2 className="mb-3 text-lg font-semibold">Profile</h2>
          {loading || !profile ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Name</dt>
                <dd className="font-medium">{profile.full_name || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Role</dt>
                <dd className="font-medium">{ROLE_LABEL[profile.role] ?? profile.role}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Joined</dt>
                <dd className="font-medium">{formatDate(profile.created_at)}</dd>
              </div>
            </dl>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Name and role changes are handled by an admin. Email changes go through the normal
            verified email-change process.
          </p>
        </section>

        {profile && (
          <EquipmentPanel
            userId={profile.id}
            canEdit
            title="Company equipment assigned to me"
          />
        )}
      </div>
    </AppShell>
  );
}
