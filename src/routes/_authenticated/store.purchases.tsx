import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, MoreVertical, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/app-shell";
import { StoreShell, StatusPill } from "@/components/store-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { nameOf, useTeam } from "@/hooks/use-crm";
import { useStoreLocation } from "@/hooks/use-store-location";
import {
  locationLabel,
  useCanWriteStore,
  useCreatePurchaseOrder,
  usePurchaseOrderAction,
  usePurchaseOrderItems,
  usePurchaseOrders,
  useStoreProducts,
  useSuppliers,
  type StoreLocation,
} from "@/hooks/use-store";
import { formatDate, formatKES } from "@/lib/format";
import { num } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/store/purchases")({
  head: () => ({
    meta: [
      { title: "Purchase Orders — Store | Machines" },
      {
        name: "description",
        content:
          "Raise local purchase orders with suppliers, price them line by line and receive stock on approval.",
      },
      { property: "og:title", content: "Purchase Orders — Store | Machines" },
      {
        property: "og:description",
        content: "Approved purchase orders add stock to the destination store automatically.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PurchaseOrdersPage,
});

function PurchaseOrdersPage() {
  const { profile, roles } = useAuth();
  const canWrite = useCanWriteStore(roles, profile?.id);
  const [location] = useStoreLocation();
  const { data: orders = [], isLoading } = usePurchaseOrders();
  const { data: items = [] } = usePurchaseOrderItems();
  const { data: suppliers = [] } = useSuppliers();
  const { data: team = [] } = useTeam();
  const action = usePurchaseOrderAction();
  const [creating, setCreating] = useState(false);

  const rows = orders.filter((o) => o.destination_location === location);
  const lines = (id: string) => items.filter((i) => i.purchase_order_id === id);
  const totalOf = (id: string) => lines(id).reduce((s, i) => s + num(i.line_total), 0);
  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name ?? "—";

  const run = (type: "approve" | "reject", id: string) =>
    action.mutate(
      { type, id },
      {
        onSuccess: () =>
          toast.success(
            type === "approve" ? "Approved — stock received" : "Purchase order rejected",
          ),
        onError: (e: Error) => toast.error(e.message),
      },
    );

  return (
    <StoreShell
      title="Purchase orders"
      subtitle={`Orders being received into the ${locationLabel(location)} store`}
      actions={
        canWrite && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Create purchase
          </Button>
        )
      }
    >
      {rows.length === 0 && !isLoading ? (
        <EmptyState
          icon={FileText}
          title="No purchase orders yet"
          message={
            canWrite
              ? "Create a purchase order to buy stock from a supplier."
              : "No purchase orders have been raised for this store."
          }
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">LPO No</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Created by</th>
                <th className="px-4 py-3">Status</th>
                {canWrite && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{o.lpo_no}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(o.created_at)}</td>
                  <td className="px-4 py-3">{supplierName(o.supplier_id)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{lines(o.id).length}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatKES(totalOf(o.id))}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{nameOf(team, o.created_by)}</td>
                  <td className="px-4 py-3">
                    <StatusPill
                      tone={
                        o.status === "acquired"
                          ? "good"
                          : o.status === "rejected"
                            ? "bad"
                            : "neutral"
                      }
                    >
                      {o.status === "acquired"
                        ? "Acquired"
                        : o.status === "rejected"
                          ? "Rejected"
                          : "Pending"}
                    </StatusPill>
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Actions for ${o.lpo_no}`}
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {o.status === "pending" ? (
                            <>
                              <DropdownMenuItem onClick={() => run("approve", o.id)}>
                                Approve &amp; receive stock
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => run("reject", o.id)}
                              >
                                Reject
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem disabled>No actions</DropdownMenuItem>
                          )}
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

      {creating && <CreatePurchaseDialog onClose={() => setCreating(false)} />}
    </StoreShell>
  );
}

type Line = {
  product_id: string;
  quantity: string;
  unit_price: string;
  discount_percent: string;
  tax_percent: string;
};

const emptyLine: Line = {
  product_id: "",
  quantity: "",
  unit_price: "",
  discount_percent: "0",
  tax_percent: "0",
};

function lineTotal(l: Line) {
  const q = Number(l.quantity) || 0;
  const p = Number(l.unit_price) || 0;
  const d = Number(l.discount_percent) || 0;
  const t = Number(l.tax_percent) || 0;
  return q * p * (1 - d / 100) * (1 + t / 100);
}

function CreatePurchaseDialog({ onClose }: { onClose: () => void }) {
  const [location] = useStoreLocation();
  const { data: products = [] } = useStoreProducts();
  const { data: suppliers = [] } = useSuppliers();
  const create = useCreatePurchaseOrder();
  const [supplierId, setSupplierId] = useState("");
  const [destination, setDestination] = useState<StoreLocation>(location);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const summary = useMemo(() => {
    let sub = 0;
    let discounts = 0;
    let tax = 0;
    for (const l of lines) {
      const q = Number(l.quantity) || 0;
      const p = Number(l.unit_price) || 0;
      const gross = q * p;
      const disc = gross * ((Number(l.discount_percent) || 0) / 100);
      const taxed = (gross - disc) * ((Number(l.tax_percent) || 0) / 100);
      sub += gross;
      discounts += disc;
      tax += taxed;
    }
    return { sub, discounts, tax, total: sub - discounts + tax };
  }, [lines]);

  const submit = () => {
    const items = lines
      .filter((l) => l.product_id && Number(l.quantity) > 0)
      .map((l) => ({
        product_id: l.product_id,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price) || 0,
        discount_percent: Number(l.discount_percent) || 0,
        tax_percent: Number(l.tax_percent) || 0,
      }));
    if (items.length === 0) {
      toast.error("Add at least one item with a quantity");
      return;
    }
    create.mutate(
      {
        supplier_id: supplierId || null,
        destination_location: destination,
        supplier_invoice_no: invoiceNo.trim() || null,
        description: description.trim() || null,
        items,
      },
      {
        onSuccess: () => {
          toast.success("Purchase order created");
          onClose();
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create purchase order</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Destination store</Label>
              <Select value={destination} onValueChange={(v) => setDestination(v as StoreLocation)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_house">In-House</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Supplier invoice no</Label>
              <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <Select value={l.product_id} onValueChange={(v) => setLine(i, { product_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Item name" />
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
                <Input
                  type="number"
                  className="w-20"
                  placeholder="Qty"
                  value={l.quantity}
                  onChange={(e) => setLine(i, { quantity: e.target.value })}
                />
                <Input
                  type="number"
                  className="w-28"
                  placeholder="Price"
                  value={l.unit_price}
                  onChange={(e) => setLine(i, { unit_price: e.target.value })}
                />
                <Input
                  type="number"
                  className="w-20"
                  placeholder="Disc %"
                  value={l.discount_percent}
                  onChange={(e) => setLine(i, { discount_percent: e.target.value })}
                />
                <Input
                  type="number"
                  className="w-20"
                  placeholder="Tax %"
                  value={l.tax_percent}
                  onChange={(e) => setLine(i, { tax_percent: e.target.value })}
                />
                <span className="min-w-[110px] text-right text-sm font-semibold tabular-nums">
                  {formatKES(lineTotal(l))}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Remove item"
                  onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLines((p) => [...p, { ...emptyLine }])}
            >
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm">
            <Row label="Sub total" value={summary.sub} />
            <Row label="Item discounts" value={-summary.discounts} />
            <Row label="Estimated tax" value={summary.tax} />
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>Total amount</span>
              <span className="tabular-nums">{formatKES(summary.total)}</span>
            </div>
          </div>
        </div>
        <Button onClick={submit} disabled={create.isPending}>
          Create purchase order
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-0.5 text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{formatKES(value)}</span>
    </div>
  );
}
