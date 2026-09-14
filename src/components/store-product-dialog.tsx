import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PRODUCT_TYPES,
  TAX_CATEGORIES,
  useStoreProductMutation,
  type StoreProduct,
} from "@/hooks/use-store";
import { useProductCategories } from "@/hooks/use-crm-extra";
import { formatKES } from "@/lib/format";

/** Create or edit a store product (name, sku/model, brand, category, unit). */
export function StoreProductDialog({
  product,
  createdBy,
  onClose,
}: {
  product: StoreProduct | null;
  createdBy?: string | null;
  onClose: () => void;
}) {
  const mutate = useStoreProductMutation();
  const { data: categories = [] } = useProductCategories();
  const [f, setF] = useState({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    brand: product?.brand ?? "House of Maji",
    category: product?.category ?? "",
    unit: product?.unit ?? "",
    buying_price: product?.buying_price != null ? String(product.buying_price) : "",
    selling_price: product?.selling_price != null ? String(product.selling_price) : "",
    tax_category_percent: String(product?.tax_category_percent ?? 16),
    product_type: product?.product_type ?? "finished_product",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const buying = Number(f.buying_price);
  const selling = Number(f.selling_price);
  const hasMargin = f.buying_price.trim() !== "" && f.selling_price.trim() !== "";
  const margin = hasMargin ? selling - buying : null;

  const activeCats = categories.filter((c) => c.active).map((c) => c.name);
  const current = f.category.trim();
  const legacyCat = current && !activeCats.includes(current) ? current : null;
  const catOptions = legacyCat ? [legacyCat, ...activeCats] : activeCats;

  const submit = () => {
    if (!f.name.trim()) {
      toast.error("Product title is required");
      return;
    }
    if (!current) {
      toast.error("Category is required");
      return;
    }
    if (!f.product_type) {
      toast.error("Product type is required");
      return;
    }
    const values: Record<string, unknown> = {
      name: f.name.trim(),
      sku: f.sku.trim() || null,
      brand: f.brand.trim() || null,
      category: f.category.trim() || null,
      unit: f.unit.trim() || null,
      buying_price: f.buying_price.trim() === "" ? null : Number(f.buying_price),
      selling_price: f.selling_price.trim() === "" ? null : Number(f.selling_price),
      tax_category_percent: Number(f.tax_category_percent) || 16,
      product_type: f.product_type,
    };
    if (!product) values.created_by = createdBy ?? null;
    mutate.mutate(
      product ? { type: "update", id: product.id, values } : { type: "insert", values },
      {
        onSuccess: () => {
          toast.success(product ? "Product updated" : "Product added");
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
          <DialogTitle>{product ? "Edit product" : "New product"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {product?.product_code && (
            <p className="text-xs text-muted-foreground">
              Product code{" "}
              <span className="font-semibold text-foreground">#{product.product_code}</span>
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Product title</Label>
            <Input
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Membrane, Sediment filter, Pump…"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>SKU / model</Label>
              <Input
                value={f.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Input
                value={f.brand}
                onChange={(e) => set("brand", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={current} onValueChange={(v) => set("category", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {catOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c === legacyCat ? `${c} (not in list)` : c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {catOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No categories yet — an admin can add them in Settings.
                </p>
              )}
              {legacyCat && (
                <p className="text-xs text-warning">
                  This product’s category isn’t in the managed list — pick a real category to fix
                  it.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input
                value={f.unit}
                onChange={(e) => set("unit", e.target.value)}
                placeholder="pcs, box, litre…"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Buying price (KES)</Label>
              <Input
                type="number"
                min="0"
                value={f.buying_price}
                onChange={(e) => set("buying_price", e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Selling price (KES)</Label>
              <Input
                type="number"
                min="0"
                value={f.selling_price}
                onChange={(e) => set("selling_price", e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Margin</Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-secondary px-3 text-sm font-semibold tabular-nums">
                {margin == null || !Number.isFinite(margin) ? "—" : formatKES(margin)}
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tax category</Label>
              <Select
                value={f.tax_category_percent}
                onValueChange={(v) => set("tax_category_percent", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tax category" />
                </SelectTrigger>
                <SelectContent>
                  {TAX_CATEGORIES.map((t) => (
                    <SelectItem key={t.value} value={String(t.value)}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Product type</Label>
              <Select value={f.product_type} onValueChange={(v) => set("product_type", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product type" />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <Button onClick={submit} disabled={mutate.isPending}>
          {product ? "Save changes" : "Add product"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
