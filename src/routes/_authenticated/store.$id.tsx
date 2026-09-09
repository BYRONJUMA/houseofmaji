import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, SlidersHorizontal, Warehouse, Home } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StoreProductDialog } from "@/components/store-product-dialog";
import { DeleteProduct } from "@/routes/_authenticated/store.index";
import { useAuth } from "@/hooks/use-auth";
import { nameOf, useTeam } from "@/hooks/use-crm";
import {
  locationLabel,
  useCanWriteStore,
  useStoreEntries,
  useStoreEntryMutation,
  useStoreProduct,
  type StoreLocation,
  type StoreProduct,
} from "@/hooks/use-store";
import { num } from "@/lib/crm";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/store/$id")({
  head: () => ({
    meta: [
      { title: "Product Stock — Store | Machines" },
      {
        name: "description",
        content:
          "In-house and warehouse stock levels for a store product, with the full stock entry history.",
      },
      { property: "og:title", content: "Product Stock — Store | Machines" },
      {
        property: "og:description",
        content: "Add deliveries, correct counts and review the stock history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { id } = Route.useParams();
  const { profile } = useAuth();
  const canWrite = useCanWriteStore(profile?.role, profile?.id);
  const { data: product, isLoading } = useStoreProduct(id);
  const { data: entries = [] } = useStoreEntries(id);
  const { data: team = [] } = useTeam();

  const [editing, setEditing] = useState(false);
  const [addLocation, setAddLocation] = useState<StoreLocation | null>(null);
  const [adjustLocation, setAdjustLocation] = useState<StoreLocation | null>(null);

  if (!product) {
    return (
      <AppShell title="Product" showBack>
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading…" : "This product no longer exists."}
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={product.name}
      subtitle={[product.sku, product.category, product.unit && `Unit: ${product.unit}`]
        .filter(Boolean)
        .join(" · ")}
      showBack
      actions={
        canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit details
            </Button>
            <DeleteProduct product={product} />
          </div>
        )
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <LocationCard
          product={product}
          location="in_house"
          canWrite={canWrite}
          onAdd={() => setAddLocation("in_house")}
          onAdjust={() => setAdjustLocation("in_house")}
        />
        <LocationCard
          product={product}
          location="warehouse"
          canWrite={canWrite}
          onAdd={() => setAddLocation("warehouse")}
          onAdjust={() => setAdjustLocation("warehouse")}
        />
      </div>

      <section className="surface-card mt-4 overflow-x-auto p-0">
        <h2 className="px-4 py-4 text-base font-semibold">Stock history</h2>
        {entries.length === 0 ? (
          <p className="px-4 pb-6 text-sm text-muted-foreground">
            No stock has been recorded for this product yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-y border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3 text-right">Change</th>
                <th className="px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Logged by</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const qty = num(e.quantity);
                return (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(e.entered_at).toLocaleString("en-KE", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">{locationLabel(e.location)}</td>
                    <td
                      className={
                        qty < 0
                          ? "px-4 py-3 text-right font-semibold tabular-nums text-destructive"
                          : "px-4 py-3 text-right font-semibold tabular-nums text-success"
                      }
                    >
                      {qty > 0 ? `+${qty}` : qty}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {e.unit_price == null ? "—" : formatKES(e.unit_price)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {e.total_amount == null ? "—" : formatKES(e.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.supplier_name || "—"}
                      {e.supplier_contact ? ` · ${e.supplier_contact}` : ""}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.notes || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {nameOf(team, e.entered_by)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {editing && (
        <StoreProductDialog product={product} onClose={() => setEditing(false)} />
      )}
      {addLocation && (
        <AddStockDialog
          productId={product.id}
          location={addLocation}
          onClose={() => setAddLocation(null)}
        />
      )}
      {adjustLocation && (
        <AdjustQuantityDialog
          product={product}
          location={adjustLocation}
          onClose={() => setAdjustLocation(null)}
        />
      )}
    </AppShell>
  );
}

function LocationCard({
  product,
  location,
  canWrite,
  onAdd,
  onAdjust,
}: {
  product: StoreProduct;
  location: StoreLocation;
  canWrite: boolean;
  onAdd: () => void;
  onAdjust: () => void;
}) {
  const qty = num(location === "in_house" ? product.in_house_qty : product.warehouse_qty);
  const Icon = location === "in_house" ? Home : Warehouse;
  return (
    <section className="surface-card p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">{locationLabel(location)} stock</h2>
      </div>
      <p className="mt-3 font-display text-4xl font-bold tabular-nums">
        {qty}
        {product.unit && (
          <span className="ml-2 text-sm font-medium text-muted-foreground">{product.unit}</span>
        )}
      </p>
      {canWrite && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4" /> Add stock
          </Button>
          <Button size="sm" variant="outline" onClick={onAdjust}>
            <SlidersHorizontal className="h-4 w-4" /> Adjust quantity
          </Button>
        </div>
      )}
    </section>
  );
}

function AddStockDialog({
  productId,
  location,
  onClose,
}: {
  productId: string;
  location: StoreLocation;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const mutate = useStoreEntryMutation(productId);
  const [loc, setLoc] = useState<StoreLocation>(location);
  const [f, setF] = useState({
    quantity: "",
    unit_price: "",
    supplier_name: "",
    supplier_contact: "",
    notes: "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const total = useMemo(() => {
    const q = Number(f.quantity);
    const p = Number(f.unit_price);
    if (!f.quantity || !f.unit_price || !Number.isFinite(q) || !Number.isFinite(p)) return null;
    return q * p;
  }, [f.quantity, f.unit_price]);

  const submit = () => {
    const q = Number(f.quantity);
    if (!f.quantity || !Number.isFinite(q) || q === 0) {
      toast.error("Enter the quantity received");
      return;
    }
    mutate.mutate(
      {
        location: loc,
        quantity: q,
        unit_price: f.unit_price ? Number(f.unit_price) : null,
        supplier_name: f.supplier_name.trim() || null,
        supplier_contact: f.supplier_contact.trim() || null,
        notes: f.notes.trim() || null,
        entered_by: profile?.id ?? null,
      },
      {
        onSuccess: () => {
          toast.success("Stock added");
          onClose();
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add stock</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Select value={loc} onValueChange={(v) => setLoc(v as StoreLocation)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_house">In-House</SelectItem>
                <SelectItem value="warehouse">Warehouse</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input
                type="number"
                value={f.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unit price (KES)</Label>
              <Input
                type="number"
                value={f.unit_price}
                onChange={(e) => set("unit_price", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Total amount</span>{" "}
            <span className="font-semibold tabular-nums">
              {total == null ? "—" : formatKES(total)}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Supplier name</Label>
              <Input
                value={f.supplier_name}
                onChange={(e) => set("supplier_name", e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Supplier contact</Label>
              <Input
                value={f.supplier_contact}
                onChange={(e) => set("supplier_contact", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <Button onClick={submit} disabled={mutate.isPending}>
          Add stock
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function AdjustQuantityDialog({
  product,
  location,
  onClose,
}: {
  product: StoreProduct;
  location: StoreLocation;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const mutate = useStoreEntryMutation(product.id);
  const current = num(location === "in_house" ? product.in_house_qty : product.warehouse_qty);
  const [value, setValue] = useState(String(current));
  const [note, setNote] = useState("");

  const target = Number(value);
  const diff = Number.isFinite(target) ? target - current : 0;

  const submit = () => {
    if (!value || !Number.isFinite(target)) {
      toast.error("Enter the counted quantity");
      return;
    }
    if (diff === 0) {
      toast.error("That is the same as the current quantity");
      return;
    }
    mutate.mutate(
      {
        location,
        quantity: diff,
        unit_price: null,
        notes: note.trim() ? `Manual adjustment — ${note.trim()}` : "Manual adjustment",
        entered_by: profile?.id ?? null,
      },
      {
        onSuccess: () => {
          toast.success("Quantity corrected");
          onClose();
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust {locationLabel(location)} quantity</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Current quantity is <span className="font-semibold text-foreground">{current}</span>.
            Enter the correct figure — the difference is logged in the stock history so nothing is
            overwritten silently.
          </p>
          <div className="space-y-1.5">
            <Label>Counted quantity</Label>
            <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Recorded change: <span className="font-semibold">{diff > 0 ? `+${diff}` : diff}</span>
          </p>
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Stock count, breakage, transfer…"
            />
          </div>
        </div>
        <Button onClick={submit} disabled={mutate.isPending}>
          Save correction
        </Button>
      </DialogContent>
    </Dialog>
  );
}
