import { Link, useNavigate } from "@tanstack/react-router";
import { Droplets, LogOut, Menu, Wrench } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABEL } from "@/lib/stages";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { BackButton } from "@/components/back-button";
import { cn } from "@/lib/utils";

const CRM_NAV = [
  { to: "/crm", label: "Dashboard" },
  { to: "/crm/leads", label: "Leads" },
  { to: "/crm/sales", label: "Sales" },
  { to: "/crm/inventory", label: "Inventory" },
  { to: "/crm/services", label: "Services" },
  { to: "/crm/visits", label: "Site Visits" },
  { to: "/crm/projects", label: "Projects" },
  { to: "/crm/schools", label: "Schools" },
  { to: "/crm/calls", label: "Call Reviews" },
  { to: "/crm/whatsapp", label: "WhatsApp" },
] as const;

const MANAGER_NAV = [{ to: "/crm/machines", label: "Taxonomy" }] as const;
const ADMIN_NAV = [{ to: "/crm/settings", label: "Settings" }] as const;


export function CrmShell({
  title,
  subtitle,
  actions,
  children,
  showBack,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  showBack?: boolean;
}) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const nav = [
    ...CRM_NAV,
    ...(profile?.role === "admin" || profile?.role === "sales_manager" ? MANAGER_NAV : []),
    ...(profile?.role === "admin" ? ADMIN_NAV : []),
  ];

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-[100rem] items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/crm" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Droplets className="h-5 w-5" />
            </span>
            <span className="font-display text-sm font-bold leading-tight tracking-tight sm:text-base">
              Machines
              <span className="block text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
                CRM
              </span>
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 lg:flex">
            {nav.map((i) => (
              <Link
                key={i.to}
                to={i.to}
                activeOptions={{ exact: i.to === "/crm" }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {i.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-3 lg:flex">
            <Link
              to="/"
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Wrench className="h-4 w-4" /> Machines
            </Link>
            <NotificationBell />
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold">{profile?.full_name || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {profile ? (ROLE_LABEL[profile.role] ?? profile.role) : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2 lg:hidden">
            <NotificationBell />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {open && (
          <div className="border-t border-border bg-card px-4 py-3 lg:hidden">
            <div className="flex flex-col gap-1">
              {nav.map((i) => (
                <Link
                  key={i.to}
                  to={i.to}
                  activeOptions={{ exact: i.to === "/crm" }}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                  activeProps={{ className: "bg-secondary text-foreground" }}
                >
                  {i.label}
                </Link>
              ))}
              <Link
                to="/"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Machines section
              </Link>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <div>
                <p className="text-sm font-semibold">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {profile ? (ROLE_LABEL[profile.role] ?? profile.role) : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[100rem] px-4 py-5 sm:px-6 sm:py-6">
        <div className="mb-5">
          {showBack && <BackButton className="mb-1" />}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="page-title">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {actions}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

export function CrmCard({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface-card p-4 sm:p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  change,
  to,
  search,
}: {
  label: string;
  value: string;
  hint?: string;
  change?: number;
  to?: string;
  search?: Record<string, unknown>;
}) {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {hint && <span className="text-muted-foreground">{hint}</span>}
        {change !== undefined && (
          <span
            className={cn(
              "font-semibold",
              change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {change > 0 ? "+" : ""}
            {change.toFixed(0)}%
          </span>
        )}
      </div>
    </>
  );
  const cls =
    "surface-card block p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg";
  if (to)
    return (
      <Link to={to as "/crm"} search={search as never} className={cls}>
        {body}
      </Link>
    );
  return <div className="surface-card p-4">{body}</div>;
}

export function MiniTile({
  label,
  value,
  sub,
  tone = "neutral",
  to,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  to?: string;
}) {
  const toneCls = {
    neutral: "text-foreground",
    good: "text-success",
    warn: "text-warning",
    bad: "text-destructive",
  }[tone];
  const body = (
    <>
      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 font-display text-xl font-bold tabular-nums", toneCls)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </>
  );
  const cls =
    "rounded-xl border border-border bg-secondary/40 p-3 text-left transition-all hover:-translate-y-0.5 hover:bg-secondary hover:shadow-md";
  if (to)
    return (
      <Link to={to as "/crm"} className={cls}>
        {body}
      </Link>
    );
  return <div className="rounded-xl border border-border bg-secondary/40 p-3">{body}</div>;
}

export function Bar({ label, value, max, sub }: { label: string; value: number; max: number; sub?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{sub ?? value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}
