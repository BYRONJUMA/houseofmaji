import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Droplets } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_HOME } from "@/lib/stages";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "House of Maji Machines — Fulfillment Tracking" },
      {
        name: "description",
        content:
          "Track every water machine from sale to installation: handover, frame ordering, assembly, delivery and commissions.",
      },
      { property: "og:title", content: "House of Maji Machines — Fulfillment Tracking" },
      {
        property: "og:description",
        content: "Track every water machine from sale to installation: handover, frame ordering, assembly, delivery and commissions.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/auth", replace: true });
    } else if (profile) {
      navigate({ to: ROLE_HOME[profile.role] ?? "/auth", replace: true });
    }
  }, [loading, session, profile, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <span className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <Droplets className="h-7 w-7" />
      </span>
      <h1 className="page-title">House of Maji Machines</h1>
      <p className="text-sm text-muted-foreground">Loading your workspace…</p>
    </div>
  );
}
