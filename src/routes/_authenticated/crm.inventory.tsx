import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { CrmShell, CrmCard, StatCard, Badge } from "@/components/crm-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { formatKES } from "@/lib/format";
import { isCrmManager, LOW_STOCK_THRESHOLD, BADGE_GOOD, BADGE_WARN, BADGE_BAD, num } from "@/lib/crm";
import { useInventory, useCrmMutation, type InventoryItem } from "@/hooks/use-crm";

export const Route = createFileRoute("/_authenticated/crm/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — House of Maji CRM" },
      {
        name: "description",
        content: "Stock levels, buying and selling prices, margins and low-stock alerts.",
      },
      { property: "og:title", content: "Inventory — House of Maji CRM" },
      { property: "og:description", content: "Live stock levels and margin per product." },
    ],
  }),
  component: InventoryPage,
});

function stockBadge(qty: number) {
  if (qty <= 0) return { cls: BADGE_BAD, text: "Out of stock" };
  if (qty < LOW_STOCK_THRESHOLD) return { cls: BADGE_WARN, text: "Low" };
  return { cls: BADGE_GOOD, text: "In stock" };
}

function InventoryPage() {
  const { profile } = useAuth();
  const manager = isCrmManager(profile?.role);
  const { data: items = [] } = useInventory();
  const mutate = useCrmMutation("inventory", ["crm-inventory"]);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [creating, setCreating] = useState(false);

  const totalUnits = items.reduce((s, i) => s + num(i.in_stock), 0);
  const stockValue = items.reduce((s, i) => s + num(i.in_stock) * num(i.selling_price), 0);
  const costValue = items.reduce((s, i) => s + num(i.in_stock) * num(i.buying_price), 0);
  const low = items.filter((i) => num(i.in_stock) < LOW_STOCK_THRESHOLD);

  const remove = (item: InventoryItem) => {
    if (!confirm(`Delete ${item.product_name}?`)) return;
    mutate.mutate(
      { type: "delete", id: item.id },
      {
        onSuccess: () => toast.success("Item deleted"),
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <CrmShell
      title="Inventory"
      subtitle={`${items.length} products tracked · ${low.length} need restocking.`}
      actions={
        manager && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Add product
          </Button>
        )
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Products" value={String(items.length)} />
          <StatCard label="Units in stock" value={String(totalUnits)} />
          <StatCard label="Stock value (retail)" value={formatKES(stockValue)} />
          <StatCard
            label="Potential margin"
            value={formatKES(stockValue - costValue)}
            hint={`cost ${formatKES(costValue)}`}
          />
        </div>

        {low.length > 0 && (
          <CrmCard title={`Low stock (${low.length})`}>
            <div className="flex flex-wrap gap-2">
              {low.map((i) => (
                <Badge key={i.id} className={stockBadge(num(i.in_stock)).cls}>
                  {i.product_name} · {num(i.in_stock)}
                </Badge>
              ))}
            </div>
          </CrmCard>
        )}

        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2 text-right">In stock</th>
                <th className="px-3 py-2 text-right">Buying</th>
                <th className="px-3 py-2 text-right">Selling</th>
                <th className="px-3 py-2 text-right">Margin</th>
                <th className="px-3 py-2">Status</th>
                {manager && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const b = stockBadge(num(i.in_stock));
                const margin = num(i.selling_price) - num(i.buying_price);
                return (
                  <tr
                    key={i.id}
                    onClick={() => manager && setEditing(i)}
                    className={`border-t border-border transition-colors hover:bg-secondary/50 ${manager ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-3 py-2 font-medium">{i.product_name}</td>
                    <td className="px-3 py-2">{i.model || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(i.in_stock)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatKES(i.buying_price)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatKES(i.selling_price)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKES(margin)}</td>
                    <td className="px-3 py-2">
                      <Badge className={b.cls}>{b.text}</Badge>
                    </td>
                    {manager && (
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(i);
                          }}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    No products yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <ItemDialog
          item={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </CrmShell>
  );
}

function ItemDialog({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const mutate = useCrmMutation("inventory", ["crm-inventory"]);
  const [f, setF] = useState({
    product_name: item?.product_name ?? "",
    model: item?.model ?? "",
    in_stock: String(item?.in_stock ?? ""),
    buying_price: String(item?.buying_price ?? ""),
    selling_price: String(item?.selling_price ?? ""),
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!f.product_name.trim()) {
      toast.error("Product name is required");
      return;
    }
    const values = {
      product_name: f.product_name.trim(),
      model: f.model.trim() || null,
      in_stock: Number(f.in_stock || 0),
      buying_price: f.buying_price ? Number(f.buying_price) : null,
      selling_price: f.selling_price ? Number(f.selling_price) : null,
    };
    mutate.mutate(item ? { type: "update", id: item.id, values } : { type: "insert", values }, {
      onSuccess: () => {
        toast.success(item ? "Product updated" : "Product added");
        onClose();
      },
      onError: (e: unknown) => toast.error((e as Error).message),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? "Edit product" : "Add product"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Product name</Label>
            <Input value={f.product_name} onChange={(e) => set("product_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Input value={f.model} onChange={(e) => set("model", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>In stock</Label>
            <Input
              type="number"
              value={f.in_stock}
              onChange={(e) => set("in_stock", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Buying price</Label>
            <Input
              type="number"
              value={f.buying_price}
              onChange={(e) => set("buying_price", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Selling price</Label>
            <Input
              type="number"
              value={f.selling_price}
              onChange={(e) => set("selling_price", e.target.value)}
            />
          </div>
        </div>
        <Button onClick={submit} disabled={mutate.isPending}>
          {item ? "Save changes" : "Add product"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
