import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useStoreLocation } from "@/hooks/use-store-location";
import {
  STORE_LOCATIONS,
  STOCK_STATUS_LABEL,
  stockStatus,
  useCanWriteStore,
  type StoreLocation,
} from "@/hooks/use-store";
import { Badge } from "@/components/crm-shell";
import { BADGE_GOOD, BADGE_NEUTRAL } from "@/lib/crm";

const TABS: { to: string; label: string }[] = [
  { to: "/store", label: "Products" },
  { to: "/store/stock", label: "Stock details" },
  { to: "/store/requisitions", label: "Requisitions" },
  { to: "/store/purchases", label: "Purchase orders" },
  { to: "/store/suppliers", label: "Suppliers" },
  { to: "/store/stocktake", label: "Daily stock take" },
];

/** Location switcher used across every Store page. */
export function LocationSwitcher() {
  const [location, setLocation] = useStoreLocation();
  return (
    <Select value={location} onValueChange={(v) => setLocation(v as StoreLocation)}>
      <SelectTrigger className="w-[150px]" aria-label="Store location">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STORE_LOCATIONS.map((l) => (
          <SelectItem key={l.value} value={l.value}>
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function StockStatusBadge({ qty, threshold }: { qty: number; threshold: number }) {
  const status = stockStatus(qty, threshold);
  const cls =
    status === "IN_STOCK"
      ? "bg-success/15 text-success"
      : status === "LOW"
        ? "bg-warning/15 text-warning"
        : "bg-destructive/15 text-destructive";
  return <Badge className={cls}>{STOCK_STATUS_LABEL[status]}</Badge>;
}

export function StatusPill({ tone, children }: { tone: "good" | "bad" | "neutral"; children: ReactNode }) {
  const cls =
    tone === "good" ? BADGE_GOOD : tone === "bad" ? "bg-destructive/15 text-destructive" : BADGE_NEUTRAL;
  return <Badge className={cls}>{children}</Badge>;
}

/** Shared Store layout: page heading, sub-navigation and the location switcher. */
export function StoreShell({
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
  const { profile } = useAuth();
  const canWrite = useCanWriteStore(profile?.role, profile?.id);
  const tabs = profile?.role === "admin" ? [...TABS, { to: "/store/access", label: "Access" }] : TABS;

  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      showBack
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <LocationSwitcher />
          {actions}
        </div>
      }
    >
      <nav className="mb-5 flex flex-wrap gap-1 border-b border-border pb-2">
        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            activeOptions={{ exact: t.to === "/store" }}
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            activeProps={{ className: "bg-secondary text-foreground" }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {!canWrite && (
        <p className="mb-4 rounded-xl border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          You have view-only access to the Store. An admin can grant you permission to add stock,
          create requisitions and approve purchases.
        </p>
      )}

      {children}
    </AppShell>
  );
}
