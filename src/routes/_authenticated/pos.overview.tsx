import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { PosShell } from "@/components/pos-shell";
import { useCurrentBranch } from "@/hooks/use-branch";
import { useSales, useSaleItems, usePosCustomers, SALE_STATUS_LABEL } from "@/hooks/use-pos";
import { useStoreProducts } from "@/hooks/use-store";
import { useTeam, nameOf } from "@/hooks/use-crm";
import { formatKES, formatDate } from "@/lib/format";
import { num } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/pos/overview")({
  head: () => ({
    meta: [
      { title: "Branch Overview — Point of Sale" },
      {
        name: "description",
        content:
          "Today's takings, pending payments, weekly trend, top customers and best-selling products for this branch.",
      },
      { property: "og:title", content: "Branch Overview — Point of Sale" },
      {
        property: "og:description",
        content: "Sales performance for a single branch: today, this week and this month.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BranchOverview,
});

const DAY_MS = 86_400_000;

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function dayKey(iso: string) {
  return startOfDay(new Date(iso)).getTime();
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function BranchOverview() {
  const { branchId, branch } = useCurrentBranch();
  const { data: sales = [], isLoading } = useSales(branchId);
  const { data: customers = [] } = usePosCustomers(branchId);
  const { data: products = [] } = useStoreProducts();
  const { data: team = [] } = useTeam();

  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const weekStart = todayStart - 6 * DAY_MS;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const completed = sales.filter((s) => s.status === "completed");
  const pending = sales.filter((s) => s.status === "pending_payment");

  const sum = (list: typeof sales) => list.reduce((t, s) => t + num(s.total_amount), 0);
  const since = (list: typeof sales, from: number) =>
    list.filter((s) => new Date(s.created_at).getTime() >= from);

  const salesToday = since(sales, todayStart).filter((s) => s.status !== "voided");
  const completedToday = since(completed, todayStart);
  const pendingToday = since(pending, todayStart);

  // Sales created this week (rolling 7 days) drive the leaderboards.
  const weekCompleted = since(completed, weekStart);
  const weekSaleIds = useMemo(() => weekCompleted.map((s) => s.id), [sales]);
  const { data: weekItems = [] } = useSaleItems(weekSaleIds);

  const trend = useMemo(() => {
    const days: { key: number; label: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const key = todayStart - i * DAY_MS;
      days.push({
        key,
        label: new Date(key).toLocaleDateString("en-GB", { weekday: "short" }),
        total: 0,
      });
    }
    for (const s of completed) {
      const k = dayKey(s.created_at);
      const slot = days.find((d) => d.key === k);
      if (slot) slot.total += num(s.total_amount);
    }
    return days;
  }, [sales]);

  const trendMax = Math.max(1, ...trend.map((d) => d.total));

  const topCustomers = useMemo(() => {
    const byId = new Map<string, number>();
    for (const s of weekCompleted) {
      const key = s.customer_id ?? "walk-in";
      byId.set(key, (byId.get(key) ?? 0) + num(s.total_amount));
    }
    return [...byId.entries()]
      .map(([id, total]) => ({
        name:
          id === "walk-in"
            ? "Walk-in customers"
            : (customers.find((c) => c.id === id)?.name ?? "Unknown"),
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [sales, customers]);

  const topProducts = useMemo(() => {
    const byId = new Map<string, number>();
    for (const it of weekItems) {
      byId.set(it.product_id, (byId.get(it.product_id) ?? 0) + num(it.line_total));
    }
    return [...byId.entries()]
      .map(([id, total]) => ({
        name: products.find((p) => p.id === id)?.name ?? "Unknown product",
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [weekItems, products]);

  const recent = sales.slice(0, 6);

  return (
    <PosShell title="Overview" subtitle={`Sales performance for ${branch?.name ?? "this branch"}`}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile label="Pending sales" value={String(pending.length)} hint="awaiting payment" />
        <Tile
          label="Sales count today"
          value={String(salesToday.length)}
          hint="all sales made today"
        />
        <Tile
          label="Today's sales"
          value={formatKES(sum(completedToday))}
          hint="completed sales only"
        />
        <Tile
          label="Pending today"
          value={formatKES(sum(pendingToday))}
          hint="unpaid so far today"
        />
        <Tile label="This week's sales" value={formatKES(sum(weekCompleted))} hint="last 7 days" />
        <Tile
          label="This month's sales"
          value={formatKES(sum(since(completed, monthStart)))}
          hint="since the 1st"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Daily sales — last 7 days">
          <div className="flex h-40 items-end gap-2">
            {trend.map((d) => (
              <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-muted-foreground">
                  {d.total > 0 ? formatKES(d.total) : ""}
                </span>
                <div
                  className="w-full rounded-t-md bg-primary/70"
                  style={{ height: `${Math.max(2, (d.total / trendMax) * 100)}%` }}
                  aria-label={`${d.label}: ${formatKES(d.total)}`}
                />
                <span className="text-xs text-muted-foreground">{d.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Recent activity">
          {recent.length === 0 ? (
            <Empty text={isLoading ? "Loading…" : "No sales recorded yet."} />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {recent.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.invoice_no}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {nameOf(team, s.created_by)} · {formatDate(s.created_at)} ·{" "}
                      {SALE_STATUS_LABEL[s.status]}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">
                    {formatKES(s.total_amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Top 5 customers this week (by sales total)">
          {topCustomers.length === 0 ? (
            <Empty text="No completed sales this week." />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {topCustomers.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 font-semibold">{formatKES(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Top 5 selling products this week (by revenue)">
          {topProducts.length === 0 ? (
            <Empty text="No products sold this week." />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {topProducts.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 font-semibold">{formatKES(p.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PosShell>
  );
}
