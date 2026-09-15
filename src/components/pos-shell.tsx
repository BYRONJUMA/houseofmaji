import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { useCanWriteStore } from "@/hooks/use-store";
import { useCanWriteBranchPos, useCurrentBranch } from "@/hooks/use-branch";

const TABS: { to: string; label: string }[] = [
  { to: "/pos/overview", label: "Overview" },
  { to: "/pos", label: "Create sale" },
  { to: "/pos/sales", label: "All sales" },
  { to: "/pos/pending", label: "Pending sales" },
  { to: "/pos/voided", label: "Invalidated sales" },
];

/** True when the signed-in person may create, void or settle sales here. */
export function usePosWriteAccess() {
  const { profile, roles } = useAuth();
  const canWriteStore = useCanWriteStore(roles, profile?.id);
  const { branchId } = useCurrentBranch();
  return useCanWriteBranchPos(roles, profile?.id, branchId, canWriteStore);
}

/** Shared Point of Sale layout: heading, sub-navigation and branch context. */
export function PosShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { branch, isMachines } = useCurrentBranch();
  const canWrite = usePosWriteAccess();

  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      showBack
      actions={<div className="flex flex-wrap items-center gap-2">{actions}</div>}
    >
      <nav className="mb-5 flex flex-wrap gap-1 border-b border-border pb-2">
        {TABS.filter((t) => !(isMachines && t.to === "/pos/overview")).map((t) => (
          <Link
            key={t.to}
            to={t.to}
            activeOptions={{ exact: t.to === "/pos" }}
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            activeProps={{ className: "bg-secondary text-foreground" }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <p className="mb-4 text-xs text-muted-foreground">
        Selling for <span className="font-semibold text-foreground">{branch?.name ?? "—"}</span>
        {isMachines ? " — stock always comes off in-house stock." : ""}
      </p>

      {!canWrite && (
        <p className="mb-4 rounded-xl border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          You have view-only access to sales in this branch. An admin can grant you permission to
          create sales, void them and settle credit sales.
        </p>
      )}

      {children}
    </AppShell>
  );
}
