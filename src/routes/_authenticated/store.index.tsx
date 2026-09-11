import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Boxes, Pencil, Plus, Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StoreProductDialog } from "@/components/store-product-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useStoreLocation } from "@/hooks/use-store-location";
import {
  locationLabel,
  useCanWriteStore,
  useStoreProductMutation,
  useStoreProducts,
  type StoreProduct,
} from "@/hooks/use-store";
import { num } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/store/")({
  head: () => ({
    meta: [
      { title: "Store Products — Machines" },
      {
        name: "description",
        content:
          "Manage store product definitions: code, name, brand, SKU, category and unit of measure.",
      },
      { property: "og:title", content: "Store Products — Machines" },
      {
        property: "og:description",
        content: "Product definitions for the in-house and warehouse stores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoreProductsPage,
});

function StoreProductsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canWrite = useCanWriteStore(profile?.role, profile?.id);
  const [location] = useStoreLocation();
  const { data: products = [], isLoading } = useStoreProducts();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StoreProduct | null>(null);
  const [q, setQ] = useState("");

  const term = q.trim().toLowerCase();
  const rows = term
    ? products.filter((p) =>
        [p.name, p.sku, p.brand, p.category, p.product_code].some((v) =>
          (v ?? "").toLowerCase().includes(term),
        ),
      )
    : products;

  return (
    <StoreShell
      title="Store products"
      subtitle="Product definitions — stock levels live on the Stock details page"
      actions={
        canWrite && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> New product
          </Button>
        )
      }
    >
      <div className="mb-4 max-w-sm">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by code, name, brand, SKU or category"
        />
      </div>

      {rows.length === 0 && !isLoading ? (
        <EmptyState
          icon={Boxes}
          title="No products yet"
          message={
            canWrite
              ? "Add your first store product to start tracking stock."
              : "Nothing has been added to the store yet."
          }
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU / Model</th>
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3 text-right">{locationLabel(location)} Qty</th>
                {canWrite && <th className="px-4 py-3 text-right">Manage</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate({ to: "/store/$id", params: { id: p.id } })}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary"
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    #{p.product_code || "—"}
                  </td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.sku || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.brand || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.category || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.unit || "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {num(location === "in_house" ? p.in_house_qty : p.warehouse_qty)}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Edit ${p.name}`}
                          onClick={() => setEditing(p)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <DeleteProduct product={p} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(adding || editing) && (
        <StoreProductDialog
          product={editing}
          createdBy={profile?.id}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </StoreShell>
  );
}

export function DeleteProduct({ product }: { product: StoreProduct }) {
  const mutate = useStoreProductMutation();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          aria-label={`Delete ${product.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {product.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            A product can only be deleted while it has no stock history. If stock has ever been
            recorded against it, the deletion is refused so nothing is quietly lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() =>
              mutate.mutate(
                { type: "delete", id: product.id },
                {
                  onSuccess: () => toast.success("Product deleted"),
                  onError: (e: Error) => toast.error(e.message),
                },
              )
            }
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
