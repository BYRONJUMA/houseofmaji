import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, MoreVertical, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/app-shell";
import { PosShell, usePosWriteAccess } from "@/components/pos-shell";
import { StatusPill } from "@/components/store-shell";
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
import { useCurrentBranch } from "@/hooks/use-branch";
import { nameOf, useLeads, useTeam } from "@/hooks/use-crm";
import { useStoreProducts } from "@/hooks/use-store";
import { usePosCustomers, useCreateSale } from "@/hooks/use-pos";
import {
  QUOTATION_STATUS_LABEL,
  useDeleteQuotation,
  useQuotationItems,
  useQuotations,
  useSaveQuotation,
  type Quotation,
  type QuotationStatus,
} from "@/hooks/use-quotations";
import { formatDate, formatKES } from "@/lib/format";
import { num } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/pos/quotations")({
  head: () => ({
    meta: [
      { title: "Quotations — Point of Sale" },
      {
        name: "description",
        content:
          "Prepare priced quotations for customers and CRM leads, then convert them into a sale.",
      },
      { property: "og:title", content: "Quotations — Point of Sale" },
      {
        property: "og:description",
        content: "Quotations are proposals only — stock moves when one becomes a sale.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuotationsPage,
});

const NONE = "__none";

function QuotationsPage() {
  const { branchId } = useCurrentBranch();
  const canWrite = usePosWriteAccess();
  const { data: quotations = [], isLoading } = useQuotations(branchId);
  const { data: items = [] } = useQuotationItems();
  const { data: customers = [] } = usePosCustomers(branchId);
  const { data: team = [] } = useTeam();
  const del = useDeleteQuotation();
  const save = useSaveQuotation();
  const createSale = useCreateSale();
  const [editing, setEditing] = useState<Quotation | null>(null);
  const [creating, setCreating] = useState(false);

  const lines = (id: string) => items.filter((i) => i.quotation_id === id);
  const qtyOf = (id: string) => lines(id).reduce((s, i) => s + num(i.quantity), 0);
  const customerName = (id: string | null) =>
    customers.find((c) => c.id === id)?.name ?? "—";

  const convert = (q: Quotation) => {
    const ls = lines(q.id);
    if (ls.length === 0) {
      toast.error("This quotation has no items");
      return;
    }
    createSale.mutate(
      {
        branchId,
        location: "in_house",
        paymentMethod: "cash",
        items: ls.map((i) => ({
          product_id: i.product_id,
          quantity: num(i.quantity),
          unit_price: num(i.unit_price),
          discount_percent: num(i.discount_percent),
          tax_percent: num(i.tax_percent),
        })),
        customerId: q.customer_id,
        additionalInfo: `From quotation ${q.quotation_no}`,
      },
      {
        onSuccess: (res) => {
          toast.success(`${res.invoice_no} created from ${q.quotation_no}`);
          save.mutate({
            id: q.id,
            branchId,
            customerId: q.customer_id,
            leadId: q.lead_id,
            description: q.description,
            status: "completed",
            items: ls.map((i) => ({
              product_id: i.product_id,
              quantity: num(i.quantity),
              unit_price: num(i.unit_price),
              discount_percent: num(i.discount_percent),
              tax_percent: num(i.tax_percent),
              line_total: num(i.line_total),
            })),
          });
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  const remove = (q: Quotation) => {
    if (!window.confirm(`Delete quotation ${q.quotation_no}?`)) return;
    del.mutate(q.id, {
      onSuccess: () => toast.success("Quotation deleted"),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <PosShell
      title="Quotations"
      subtitle="Priced proposals — no stock moves until one becomes a sale"
      actions={
        canWrite && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Create quotation
          </Button>
        )
      }
    >
      {quotations.length === 0 && !isLoading ? (
        <EmptyState
          icon={FileText}
          title="No quotations yet"
          message={
            canWrite
              ? "Create a quotation to send a customer or lead a price proposal."
              : "No quotations have been prepared for this branch."
          }
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Quotation No</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Created by</th>
                <th className="px-4 py-3">Status</th>
                {canWrite && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {quotations.map((q) => (
                <tr key={q.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{q.quotation_no}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(q.created_at)}</td>
                  <td className="px-4 py-3">{customerName(q.customer_id)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{qtyOf(q.id)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatKES(num(q.total_amount))}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{nameOf(team, q.created_by)}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={q.status === "completed" ? "good" : "neutral"}>
                      {QUOTATION_STATUS_LABEL[q.status]}
                    </StatusPill>
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Actions for ${q.quotation_no}`}
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing(q)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={q.status === "completed" || createSale.isPending}
                            onClick={() => convert(q)}
                          >
                            Convert to sale
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => remove(q)}
                          >
                            Delete
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

      {(creating || editing) && (
        <QuotationDialog
          quotation={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </PosShell>
  );
}

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

function QuotationDialog({
  quotation,
  onClose,
}: {
  quotation: Quotation | null;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const { branchId } = useCurrentBranch();
  const { data: products = [] } = useStoreProducts();
  const { data: customers = [] } = usePosCustomers(branchId);
  const { data: leads = [] } = useLeads();
  const { data: existingItems = [] } = useQuotationItems(quotation ? [quotation.id] : undefined);
  const save = useSaveQuotation();

  const [customerId, setCustomerId] = useState(quotation?.customer_id ?? NONE);
  const [leadId, setLeadId] = useState(quotation?.lead_id ?? NONE);
  const [leadSearch, setLeadSearch] = useState("");
  const [description, setDescription] = useState(quotation?.description ?? "");
  const [status, setStatus] = useState<QuotationStatus>(quotation?.status ?? "draft");
  const [lines, setLines] = useState<Line[]>([emptyLine(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [seeded, setSeeded] = useState(!quotation);

  if (!seeded && existingItems.length > 0) {
    setLines(
      existingItems.map((i, idx) => ({
        key: idx + 1,
        product_id: i.product_id,
        quantity: String(i.quantity),
        unit_price: String(i.unit_price),
        discount_percent: String(i.discount_percent),
        tax_percent: String(i.tax_percent),
      })),
    );
    setNextKey(existingItems.length + 1);
    setSeeded(true);
  }

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

  const visibleLeads = useMemo(() => {
    const term = leadSearch.trim().toLowerCase();
    const list = term
      ? leads.filter(
          (l) => l.name.toLowerCase().includes(term) || (l.phone ?? "").includes(term),
        )
      : leads;
    return list.slice(0, 50);
  }, [leads, leadSearch]);

  const submit = () => {
    const filled = lines.filter((l) => l.product_id && Number(l.quantity) > 0);
    if (filled.length === 0) {
      toast.error("Add at least one item with a quantity");
      return;
    }
    save.mutate(
      {
        id: quotation?.id,
        branchId,
        customerId: customerId === NONE ? null : customerId,
        leadId: leadId === NONE ? null : leadId,
        description: description.trim() || null,
        createdBy: profile?.id ?? null,
        status,
        items: filled.map((l) => ({
          product_id: l.product_id,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price) || 0,
          discount_percent: Number(l.discount_percent) || 0,
          tax_percent: Number(l.tax_percent) || 0,
          line_total: lineMath(l).total,
        })),
      },
      {
        onSuccess: () => {
          toast.success(quotation ? "Quotation updated" : "Quotation created");
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
          <DialogTitle>
            {quotation ? `Edit ${quotation.quotation_no}` : "Create quotation"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Customer (optional)</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="No customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No customer</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quotation lead (optional)</Label>
              <Input
                placeholder="Search leads by name or phone"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
              />
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger>
                  <SelectValue placeholder="No lead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No lead</SelectItem>
                  {visibleLeads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} · {l.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as QuotationStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            {lines.map((l) => (
              <div key={l.key} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <Select value={l.product_id} onValueChange={(v) => pickProduct(l.key, v)}>
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
                  onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                />
                <Input
                  type="number"
                  className="w-28"
                  placeholder="Price"
                  value={l.unit_price}
                  onChange={(e) => setLine(l.key, { unit_price: e.target.value })}
                />
                <Input
                  type="number"
                  className="w-20"
                  placeholder="Disc %"
                  value={l.discount_percent}
                  onChange={(e) => setLine(l.key, { discount_percent: e.target.value })}
                />
                <Input
                  type="number"
                  className="w-20"
                  placeholder="Tax %"
                  value={l.tax_percent}
                  onChange={(e) => setLine(l.key, { tax_percent: e.target.value })}
                />
                <span className="min-w-[110px] text-right text-sm font-semibold tabular-nums">
                  {formatKES(lineMath(l).total)}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Remove item"
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLines((ls) => [...ls, emptyLine(nextKey)]);
                setNextKey((k) => k + 1);
              }}
            >
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm">
            <Row label="Sub total" value={totals.subtotal} />
            <Row label="Estimated tax" value={totals.tax} />
            <Row label="Item discounts" value={-totals.discount} />
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>Total amount</span>
              <span className="tabular-nums">{formatKES(totals.total)}</span>
            </div>
          </div>
        </div>
        <Button onClick={submit} disabled={save.isPending}>
          {quotation ? "Save quotation" : "Create quotation"}
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
