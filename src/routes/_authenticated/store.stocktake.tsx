import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/app-shell";
import { StoreShell } from "@/components/store-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { nameOf, useTeam } from "@/hooks/use-crm";
import { useStoreLocation } from "@/hooks/use-store-location";
import {
  locationLabel,
  useCanWriteStore,
  useStockTakeVariances,
  useStoreProducts,
  useSubmitStockTake,
} from "@/hooks/use-store";
import { num } from "@/lib/crm";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/store/stocktake")({
  head: () => ({
    meta: [
      { title: "Daily Stock Take — Store | Machines" },
      {
        name: "description",
        content:
          "Count what is physically on the shelf, compare it with the system figure and correct the difference.",
      },
      { property: "og:title", content: "Daily Stock Take — Store | Machines" },
      {
        property: "og:description",
        content: "Every counted difference is recorded before stock is corrected.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StockTakePage,
});

function StockTakePage() {
  const { profile } = useAuth();
  const canWrite = useCanWriteStore(profile?.role, profile?.id);
  const [location] = useStoreLocation();
  const { data: products = [], isLoading } = useStoreProducts();
  const { data: variances = [] } = useStockTakeVariances();
  const { data: team = [] } = useTeam();
  const submit = useSubmitStockTake();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);

  const systemQty = (id: string) => {
    const p = products.find((x) => x.id === id);
    return num(location === "in_house" ? p?.in_house_qty : p?.warehouse_qty);
  };

  const rows = products.map((p) => {
    const raw = counts[p.id];
    const counted = raw === undefined || raw === "" ? null : Number(raw);
    const system = systemQty(p.id);
    return { p, counted, system, variance: counted === null ? null : counted - system };
  });
  const mismatches = rows.filter((r) => r.variance !== null && r.variance !== 0);

  const send = () => {
    submit.mutate(
      {
        location,
        rows: mismatches.map((r) => ({ product_id: r.p.id, counted_quantity: r.counted as number })),
      },
      {
        onSuccess: (n) => {
          toast.success(
            n === 0 ? "No differences to record" : `${n} product(s) corrected and logged`,
          );
          setCounts({});
          setConfirming(false);
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  const todayVariances = variances.filter((v) => v.location === location).slice(0, 15);

  return (
    <StoreShell
      title="Daily stock take"
      subtitle={`Count the ${locationLabel(location)} store and record any differences`}
      actions={
        canWrite && (
          <Button disabled={mismatches.length === 0} onClick={() => setConfirming(true)}>
            <ClipboardCheck className="h-4 w-4" /> Submit count ({mismatches.length})
          </Button>
        )
      }
    >
      {products.length === 0 && !isLoading ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No products to count"
          message="Add store products first, then come back to run a stock take."
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">System quantity</th>
                <th className="px-4 py-3 text-right">Counted quantity</th>
                <th className="px-4 py-3 text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, system, variance }) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    #{p.product_code || "—"}
                  </td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{system}</td>
                  <td className="px-4 py-3 text-right">
                    <Input
                      type="number"
                      className="ml-auto w-28 text-right"
                      disabled={!canWrite}
                      value={counts[p.id] ?? ""}
                      onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value }))}
                    />
                  </td>
                  <td
                    className={
                      variance == null || variance === 0
                        ? "px-4 py-3 text-right tabular-nums text-muted-foreground"
                        : variance < 0
                          ? "px-4 py-3 text-right font-semibold tabular-nums text-destructive"
                          : "px-4 py-3 text-right font-semibold tabular-nums text-success"
                    }
                  >
                    {variance == null ? "—" : variance > 0 ? `+${variance}` : variance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {todayVariances.length > 0 && (
        <section className="surface-card mt-4 overflow-x-auto p-0">
          <h2 className="px-4 py-4 text-base font-semibold">Recent counted differences</h2>
          <table className="w-full text-sm">
            <thead className="border-y border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">System</th>
                <th className="px-4 py-3 text-right">Counted</th>
                <th className="px-4 py-3 text-right">Difference</th>
                <th className="px-4 py-3">Counted by</th>
              </tr>
            </thead>
            <tbody>
              {todayVariances.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(v.counted_at)}</td>
                  <td className="px-4 py-3">
                    {products.find((p) => p.id === v.product_id)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{num(v.system_quantity)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{num(v.counted_quantity)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {num(v.variance) > 0 ? `+${num(v.variance)}` : num(v.variance)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{nameOf(team, v.counted_by)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this stock take?</AlertDialogTitle>
            <AlertDialogDescription>
              {mismatches.length} product(s) differ from the system figure. Each difference is
              recorded, then the {locationLabel(location)} quantity is corrected to your counted
              figure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={send} disabled={submit.isPending}>
              Submit count
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StoreShell>
  );
}
