import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MoreVertical, PackagePlus, Boxes } from "lucide-react";
import { EmptyState } from "@/components/app-shell";
import { StoreShell, StockStatusBadge } from "@/components/store-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  locationLabel,
  useCanWriteStore,
  useSetQuantity,
  useStoreProductMutation,
  useStoreProducts,
  type StoreLocation,
  type StoreProduct,
} from "@/hooks/use-store";
import { useSettings, settingNumber } from "@/hooks/use-crm-extra";
import { num } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/store/stock")({
  head: () => ({
    meta: [
      { title: "Stock Details — Store | Machines" },
      {
        name: "description",
        content:
          "Live stock levels per store with low-stock and out-of-stock flags, and direct stock updates.",
      },
      { property: "og:title", content: "Stock Details — Store | Machines" },
      {
        property: "og:description",
        content: "Quantities for the selected store with an audited update trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StockDetailsPage,
});

function StockDetailsPage() {
  const { profile } = useAuth();
  const canWrite = useCanWriteStore(profile?.role, profile?.id);
  const [location, setLocation] = useStoreLocation();
  const { data: products = [], isLoading } = useStoreProducts();
  const { data: settings } = useSettings();
  const threshold = settingNumber(settings, "low_stock_threshold");
  const [q, setQ] = useState("");
  const [updating, setUpdating] = useState<StoreProduct | null>(null);
  const [creating, setCreating] = useState(false);

  const term = q.trim().toLowerCase();
  const rows = useMemo(
    () =>
      term
        ? products.filter((p) =>
            [p.name, p.product_code, p.brand, p.category].some((v) =>
              (v ?? "").toLowerCase().includes(term),
            ),
          )
        : products,
    [products, term],
  );

  const qtyOf = (p: StoreProduct) =>
    num(location === "in_house" ? p.in_house_qty : p.warehouse_qty);

  return (
    <StoreShell
      title="Stock details"
      subtitle={`Quantities held in the ${locationLabel(location)} store`}
      actions={
        canWrite && (
          <Button onClick={() => setCreating(true)}>
            <PackagePlus className="h-4 w-4" /> Create stock
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Store</Label>
          <Select value={location} onValueChange={(v) => setLocation(v as StoreLocation)}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in_house">In-House</SelectItem>
              <SelectItem value="warehouse">Warehouse</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Product</Label>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products"
            className="w-[260px]"
          />
        </div>
        <p className="ml-auto text-xs text-muted-foreground">
          Low-stock level: {threshold} — change it in CRM settings
        </p>
      </div>

      {rows.length === 0 && !isLoading ? (
        <EmptyState
          icon={Boxes}
          title="Nothing in this store yet"
          message={
            canWrite
              ? "Use Create stock to record what this store is holding."
              : "No stock has been recorded for this store."
          }
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Product code</th>
                <th className="px-4 py-3">Product name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3">Status</th>
                {canWrite && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    #{p.product_code || "—"}
                  </td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.category || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.brand || "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{qtyOf(p)}</td>
                  <td className="px-4 py-3">
                    <StockStatusBadge qty={qtyOf(p)} threshold={threshold} />
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" aria-label={`Actions for ${p.name}`}>
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setUpdating(p)}>
                            Update stock
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {updating && (
        <UpdateStockDialog
          products={products}
          initial={updating}
          location={location}
          onClose={() => setUpdating(null)}
        />
      )}
      {creating && <CreateStockDialog location={location} onClose={() => setCreating(false)} />}
    </StoreShell>
  );
}

function UpdateStockDialog({
  products,
  initial,
  location,
  onClose,
}: {
  products: StoreProduct[];
  initial: StoreProduct;
  location: StoreLocation;
  onClose: () => void;
}) {
  const setQty = useSetQuantity();
  const [productId, setProductId] = useState(initial.id);
  const product = products.find((p) => p.id === productId);
  const current = num(location === "in_house" ? product?.in_house_qty : product?.warehouse_qty);
  const [value, setValue] = useState(String(current));

  const submit = () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Enter the new quantity");
      return;
    }
    setQty.mutate(
      { productId, location, newQty: n, notes: "Manual stock update" },
      {
        onSuccess: () => {
          toast.success("Stock updated");
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
          <DialogTitle>Update {locationLabel(location)} stock</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <Select
              value={productId}
              onValueChange={(v) => {
                setProductId(v);
                const p = products.find((x) => x.id === v);
                setValue(String(num(location === "in_house" ? p?.in_house_qty : p?.warehouse_qty)));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>New quantity</Label>
            <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Currently {current}. The difference is written to the stock history as “Manual stock
            update”, so nothing is overwritten silently.
          </p>
        </div>
        <Button onClick={submit} disabled={setQty.isPending}>
          Save quantity
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function CreateStockDialog({
  location,
  onClose,
}: {
  location: StoreLocation;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const createProduct = useStoreProductMutation();
  const setQty = useSetQuantity();
  const [f, setF] = useState({ name: "", brand: "", category: "", unit: "", quantity: "" });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    const qty = Number(f.quantity);
    if (!f.name.trim()) {
      toast.error("Product name is required");
      return;
    }
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("Enter the opening quantity");
      return;
    }
    try {
      await createProduct.mutateAsync({
        type: "insert",
        values: {
          name: f.name.trim(),
          brand: f.brand.trim() || null,
          category: f.category.trim() || null,
          unit: f.unit.trim() || null,
          created_by: profile?.id ?? null,
        },
      });
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("store_products")
        .select("id")
        .eq("name", f.name.trim())
        .order("created_at", { ascending: false })
        .limit(1);
      const id = (data?.[0] as { id: string } | undefined)?.id;
      if (id && qty > 0) {
        await setQty.mutateAsync({
          productId: id,
          location,
          newQty: qty,
          notes: "Opening stock",
        });
      }
      toast.success("Stock created");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create stock in {locationLabel(location)}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Product name</Label>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Input value={f.brand} onChange={(e) => set("brand", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input value={f.category} onChange={(e) => set("category", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input
                value={f.unit}
                onChange={(e) => set("unit", e.target.value)}
                placeholder="pcs, box…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Opening quantity</Label>
              <Input
                type="number"
                value={f.quantity}
                onChange={(e) => set("quantity", e.target.value)}
              />
            </div>
          </div>
        </div>
        <Button onClick={submit} disabled={createProduct.isPending || setQty.isPending}>
          Create stock
        </Button>
      </DialogContent>
    </Dialog>
  );
}
