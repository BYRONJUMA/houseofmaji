import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2, ShoppingCart } from "lucide-react";
import { PosShell, usePosWriteAccess } from "@/components/pos-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentBranch } from "@/hooks/use-branch";
import { useStoreLocation } from "@/hooks/use-store-location";
import { useStoreProducts } from "@/hooks/use-store";
import {
  POS_PAYMENT_METHODS,
  useCreateSale,
  usePosCustomers,
  type PosPaymentMethod,
} from "@/hooks/use-pos";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pos/")({
  head: () => ({
    meta: [
      { title: "Create Sale — Point of Sale" },
      {
        name: "description",
        content: "Ring up a counter sale: pick items, quantities, discounts and payment method.",
      },
      { property: "og:title", content: "Create Sale — Point of Sale" },
      { property: "og:description", content: "Record a sale and take the stock off the shelf." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreateSalePage,
});

const NEW_CUSTOMER = "__new";

type Line = {
  key: number;
  product_id: string;
  quantity: string;
  unit_price: string;
  discount_percent: string;
  tax_percent: string;
};

const emptyLine = (key: number): Line => ({
  key,
  product_id: "",
  quantity: "1",
  unit_price: "",
  discount_percent: "0",
  tax_percent: "16",
});

function lineMath(l: Line) {
  const base = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
  const disc = (base * (Number(l.discount_percent) || 0)) / 100;
  const tax = ((base - disc) * (Number(l.tax_percent) || 0)) / 100;
  return { base, disc, tax, total: base - disc + tax };
}

function CreateSalePage() {
  const { branchId, isMachines } = useCurrentBranch();
  const [storeLocation] = useStoreLocation();
  const location = isMachines ? storeLocation : "in_house";
  const canWrite = usePosWriteAccess();
  const { data: products = [] } = useStoreProducts();
  const { data: customers = [] } = usePosCustomers(branchId);
  const createSale = useCreateSale();

  const walkIn = customers.find((c) => c.name === "Walk-in Customer");
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("cash");
  const [customerId, setCustomerId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [info, setInfo] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine(1)]);
  const [nextKey, setNextKey] = useState(2);

  const selectedCustomer = customerId || walkIn?.id || NEW_CUSTOMER;
  const inStock = products.filter(
    (p) => Number(location === "in_house" ? p.in_house_qty : p.warehouse_qty) > 0,
  );

  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pickProduct = (key: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    setLine(key, {
      product_id: productId,
      unit_price: p?.selling_price != null ? String(p.selling_price) : "",
      tax_percent: String(p?.tax_category_percent ?? 16),
    });
  };

  const totals = lines.reduce(
    (acc, l) => {
      const m = lineMath(l);
      return {
        subtotal: acc.subtotal + m.base,
        discount: acc.discount + m.disc,
        tax: acc.tax + m.tax,
        total: acc.total + m.total,
      };
    },
    { subtotal: 0, discount: 0, tax: 0, total: 0 },
  );

  const reset = () => {
    setPaymentMethod("cash");
    setCustomerId("");
    setNewName("");
    setNewPhone("");
    setInfo("");
    setLines([emptyLine(nextKey)]);
    setNextKey((k) => k + 1);
  };

  const submit = () => {
    const filled = lines.filter((l) => l.product_id && Number(l.quantity) > 0);
    if (filled.length === 0) {
      toast.error("Add at least one item with a quantity");
      return;
    }
    if (selectedCustomer === NEW_CUSTOMER && !newName.trim()) {
      toast.error("Give the new customer a name");
      return;
    }
    createSale.mutate(
      {
        branchId,
        location,
        paymentMethod,
        items: filled.map((l) => ({
          product_id: l.product_id,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price) || 0,
          discount_percent: Number(l.discount_percent) || 0,
          tax_percent: Number(l.tax_percent) || 0,
        })),
        customerId: selectedCustomer === NEW_CUSTOMER ? null : selectedCustomer,
        newCustomerName: selectedCustomer === NEW_CUSTOMER ? newName.trim() : null,
        newCustomerPhone: selectedCustomer === NEW_CUSTOMER ? newPhone.trim() || null : null,
        additionalInfo: info.trim() || null,
      },
      {
        onSuccess: (res) => {
          toast.success(
            `${res.invoice_no} created — ${formatKES(res.total_amount)}${
              paymentMethod === "credit" ? " (pending payment)" : ""
            }`,
          );
          reset();
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <PosShell title="Create sale" subtitle="Ring up a sale — stock leaves the shelf immediately">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="surface-card grid gap-3 p-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PosPaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POS_PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={selectedCustomer} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Walk-in Customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_CUSTOMER}>+ New customer…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedCustomer === NEW_CUSTOMER && (
              <>
                <div className="space-y-1.5">
                  <Label>New customer name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone (optional)</Label>
                  <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Additional info (optional)</Label>
              <Textarea rows={2} value={info} onChange={(e) => setInfo(e.target.value)} />
            </div>
          </div>

          <div className="surface-card overflow-x-auto p-5">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-2">Item name</th>
                  <th className="pb-2 pr-2">Qty</th>
                  <th className="pb-2 pr-2">Price</th>
                  <th className="pb-2 pr-2">Disc %</th>
                  <th className="pb-2 pr-2">Tax %</th>
                  <th className="pb-2 pr-2 text-right">Total</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className="align-top">
                    <td className="py-1.5 pr-2 min-w-[180px]">
                      <Select value={l.product_id} onValueChange={(v) => pickProduct(l.key, v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select item" />
                        </SelectTrigger>
                        <SelectContent>
                          {inStock.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 pr-2 w-20">
                      <Input
                        type="number"
                        min="1"
                        value={l.quantity}
                        onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2 w-28">
                      <Input
                        type="number"
                        min="0"
                        value={l.unit_price}
                        onChange={(e) => setLine(l.key, { unit_price: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2 w-20">
                      <Input
                        type="number"
                        min="0"
                        value={l.discount_percent}
                        onChange={(e) => setLine(l.key, { discount_percent: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2 w-20">
                      <Input
                        type="number"
                        min="0"
                        value={l.tax_percent}
                        onChange={(e) => setLine(l.key, { tax_percent: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">
                      {formatKES(lineMath(l).total)}
                    </td>
                    <td className="py-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        aria-label="Remove item"
                        disabled={lines.length === 1}
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setLines((ls) => [...ls, emptyLine(nextKey)]);
                setNextKey((k) => k + 1);
              }}
            >
              <Plus className="h-4 w-4" /> Add item
            </Button>
            {inStock.length === 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                No products with stock at this location yet — add stock before selling.
              </p>
            )}
          </div>
        </div>

        <aside className="surface-card h-fit space-y-3 p-5">
          <h2 className="text-base font-semibold">Summary</h2>
          <Sum label="Sub total" value={totals.subtotal} />
          <Sum label="Estimated tax" value={totals.tax} />
          <Sum label="Item discounts" value={totals.discount} />
          <div className="border-t border-border pt-3">
            <Sum label="Total amount" value={totals.total} strong />
          </div>
          <div className="grid gap-2 pt-2">
            <Button onClick={submit} disabled={!canWrite || createSale.isPending}>
              <ShoppingCart className="h-4 w-4" />
              {createSale.isPending ? "Creating…" : "Create sale"}
            </Button>
            <Button variant="outline" onClick={reset} disabled={createSale.isPending}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          </div>
          {paymentMethod === "credit" && (
            <p className="text-xs text-muted-foreground">
              Credit sales are saved as pending payment, and the stock still leaves now.
            </p>
          )}
        </aside>
      </div>
    </PosShell>
  );
}

function Sum({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "text-lg font-bold tabular-nums" : "font-medium tabular-nums"}>
        {formatKES(value)}
      </span>
    </div>
  );
}
