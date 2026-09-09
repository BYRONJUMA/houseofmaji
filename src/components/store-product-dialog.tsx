import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStoreProductMutation, type StoreProduct } from "@/hooks/use-store";

/** Create or edit a store product (name, sku/model, category, unit). */
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
  const [f, setF] = useState({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    category: product?.category ?? "",
    unit: product?.unit ?? "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!f.name.trim()) {
      toast.error("Product name is required");
      return;
    }
    const values: Record<string, unknown> = {
      name: f.name.trim(),
      sku: f.sku.trim() || null,
      category: f.category.trim() || null,
      unit: f.unit.trim() || null,
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
          <div className="space-y-1.5">
            <Label>Product name</Label>
            <Input
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Membrane, Sediment filter, Pump…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>SKU / model</Label>
            <Input
              value={f.sku}
              onChange={(e) => set("sku", e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input
                value={f.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="Optional"
              />
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
        </div>
        <Button onClick={submit} disabled={mutate.isPending}>
          {product ? "Save changes" : "Add product"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
