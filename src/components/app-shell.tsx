import { Link, useNavigate } from "@tanstack/react-router";
import { Droplets, LogOut, Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABEL, ROLE_HOME } from "@/lib/stages";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

function navFor(role?: string) {
  const items: { to: string; label: string }[] = [];
  if (!role) return items;
  items.push({ to: ROLE_HOME[role], label: "Dashboard" });
  if (role === "chief_engineer" || role === "admin") {
    items.push({ to: "/commissions", label: "Commissions" });
  }
  return items;
}

export function AppShell({
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
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const items = navFor(profile?.role);

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Droplets className="h-5 w-5" />
            </span>
            <span className="font-display text-base font-bold tracking-tight sm:text-lg">
              House of Maji Machines
            </span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {items.map((i) => (
              <Link
                key={i.to}
                to={i.to}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {i.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-3 md:flex">
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold">{profile?.full_name || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {profile ? ROLE_LABEL[profile.role] : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>

          <Button
            variant="outline"
            size="icon"
            className="ml-auto md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>

        {open && (
          <div className="border-t border-border bg-card px-4 py-3 md:hidden">
            <div className="flex flex-col gap-1">
              {items.map((i) => (
                <Link
                  key={i.to}
                  to={i.to}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                  activeProps={{ className: "bg-secondary text-foreground" }}
                >
                  {i.label}
                </Link>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <div>
                <p className="text-sm font-semibold">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {profile ? ROLE_LABEL[profile.role] : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="page-title">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
}) {
  return (
    <div className="surface-card flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Icon className="h-7 w-7" />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
