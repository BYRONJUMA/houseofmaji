import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MoreVertical, Receipt, ReceiptText, Ban, BadgeCheck } from "lucide-react";
import { EmptyState } from "@/components/app-shell";
import { StatusPill } from "@/components/store-shell";
import { usePosWriteAccess } from "@/components/pos-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { nameOf, useTeam } from "@/hooks/use-crm";
import { useCurrentBranch } from "@/hooks/use-branch";
import { useStoreProducts } from "@/hooks/use-store";
import {
  SALE_STATUS_LABEL,
  paymentMethodLabel,
  useMarkSalePaid,
  usePosCustomers,
  useSaleItems,
  useSales,
  useVoidSale,
  type Sale,
  type SaleStatus,
} from "@/hooks/use-pos";
import { formatDate, formatKES } from "@/lib/format";
import { downloadSaleReceiptPdf } from "@/lib/sale-receipt-pdf";

const statusTone = (s: SaleStatus) =>
  s === "completed" ? "good" : s === "pending_payment" ? "neutral" : "bad";

export function SalesList({ view }: { view: "all" | "pending_payment" | "voided" }) {
  const { branchId, branch } = useCurrentBranch();
  const { profile } = useAuth();
  const canWrite = usePosWriteAccess();
  const { data: sales = [], isLoading } = useSales(branchId);
  const { data: customers = [] } = usePosCustomers(branchId);
  const { data: products = [] } = useStoreProducts();
  const { data: team = [] } = useTeam();
  const ids = useMemo(() => sales.map((s) => s.id), [sales]);
  const { data: items = [] } = useSaleItems(ids);

  const [invoiceQ, setInvoiceQ] = useState("");
  const [customerQ, setCustomerQ] = useState("");
  const [date, setDate] = useState("");
  const [agent, setAgent] = useState("all");
  const [status, setStatus] = useState<"all" | SaleStatus>("all");
  const [voiding, setVoiding] = useState<Sale | null>(null);
  const [detail, setDetail] = useState<Sale | null>(null);

  const customerName = (id: string | null) =>
    customers.find((c) => c.id === id)?.name ?? "Walk-in Customer";
  const qtyOf = (saleId: string) =>
    items.filter((i) => i.sale_id === saleId).reduce((s, i) => s + Number(i.quantity), 0);

  const rows = sales.filter((s) => {
    if (view !== "all" && s.status !== view) return false;
    if (view === "all" && status !== "all" && s.status !== status) return false;
    if (invoiceQ && !s.invoice_no.toLowerCase().includes(invoiceQ.trim().toLowerCase()))
      return false;
    if (
      customerQ &&
      !customerName(s.customer_id).toLowerCase().includes(customerQ.trim().toLowerCase())
    )
      return false;
    if (date && s.created_at.slice(0, 10) !== date) return false;
    if (agent !== "all" && s.created_by !== agent) return false;
    return true;
  });

  const markPaid = useMarkSalePaid();

  const receipt = async (sale: Sale) => {
    const lines = items.filter((i) => i.sale_id === sale.id);
    await downloadSaleReceiptPdf({
      invoiceNo: sale.invoice_no,
      createdAt: sale.created_at,
      branchName: branch?.name ?? "—",
      customerName: customerName(sale.customer_id),
      customerPhone: customers.find((c) => c.id === sale.customer_id)?.phone ?? "",
      paymentMethod: paymentMethodLabel(sale.payment_method),
      status: SALE_STATUS_LABEL[sale.status],
      servedBy: nameOf(team, sale.created_by) || profile?.full_name || "—",
      additionalInfo: sale.additional_info ?? "",
      items: lines.map((i) => ({
        name: products.find((p) => p.id === i.product_id)?.name ?? "Item",
        quantity: Number(i.quantity),
        unitPrice: Number(i.unit_price),
        discountPercent: Number(i.discount_percent),
        taxPercent: Number(i.tax_percent),
        lineTotal: Number(i.line_total),
      })),
      subtotal: Number(sale.subtotal),
      discountAmount: Number(sale.discount_amount),
      taxAmount: Number(sale.tax_amount),
      totalAmount: Number(sale.total_amount),
    });
  };

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          value={invoiceQ}
          onChange={(e) => setInvoiceQ(e.target.value)}
          placeholder="Search invoice no."
        />
        <Input
          value={customerQ}
          onChange={(e) => setCustomerQ(e.target.value)}
          placeholder="Search customer"
        />
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Creation date"
        />
        <Select value={agent} onValueChange={setAgent}>
          <SelectTrigger aria-label="Agent">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {team.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {view === "all" ? (
          <Select value={status} onValueChange={(v) => setStatus(v as "all" | SaleStatus)}>
            <SelectTrigger aria-label="Status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending_payment">Pending payment</SelectItem>
              <SelectItem value="voided">Invalidated</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div />
        )}
      </div>

      {rows.length === 0 && !isLoading ? (
        <EmptyState
          icon={Receipt}
          title="No sales here yet"
          message="Sales you create at the counter appear in this list with their invoice number and status."
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Invoice No</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Created by</th>
                <th className="px-4 py-3">P.M</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary"
                  onClick={() => setDetail(s)}
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{s.invoice_no}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(s.created_at)}</td>
                  <td className="px-4 py-3">{customerName(s.customer_id)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{qtyOf(s.id)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatKES(s.total_amount)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {nameOf(team, s.created_by) || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone="neutral">{paymentMethodLabel(s.payment_method)}</StatusPill>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone={statusTone(s.status)}>
                      {SALE_STATUS_LABEL[s.status]}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${s.invoice_no}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetail(s)}>
                          <ReceiptText className="h-4 w-4" /> View sale
                        </DropdownMenuItem>
                        {s.status === "completed" && (
                          <DropdownMenuItem onClick={() => void receipt(s)}>
                            <Receipt className="h-4 w-4" /> Download receipt
                          </DropdownMenuItem>
                        )}
                        {canWrite && s.status === "pending_payment" && (
                          <DropdownMenuItem
                            onClick={() =>
                              markPaid.mutate(s.id, {
                                onSuccess: () => toast.success(`${s.invoice_no} marked paid`),
                                onError: (e: Error) => toast.error(e.message),
                              })
                            }
                          >
                            <BadgeCheck className="h-4 w-4" /> Mark paid
                          </DropdownMenuItem>
                        )}
                        {canWrite && s.status !== "voided" && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setVoiding(s)}
                          >
                            <Ban className="h-4 w-4" /> Void sale
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {voiding && <VoidSaleDialog sale={voiding} onClose={() => setVoiding(null)} />}
      {detail && (
        <SaleDetailDialog
          sale={detail}
          customerName={customerName(detail.customer_id)}
          onClose={() => setDetail(null)}
          onReceipt={() => void receipt(detail)}
        />
      )}
    </>
  );
}

function VoidSaleDialog({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const voidSale = useVoidSale();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Void {sale.invoice_no}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The items go back into stock at{" "}
          {sale.location === "warehouse" ? "the warehouse" : "the in-house store"} and the sale is
          marked invalidated.
        </p>
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this sale being voided?"
          />
        </div>
        <Button
          variant="destructive"
          disabled={voidSale.isPending}
          onClick={() =>
            voidSale.mutate(
              { saleId: sale.id, reason },
              {
                onSuccess: () => {
                  toast.success(`${sale.invoice_no} voided — stock restored`);
                  onClose();
                },
                onError: (e: Error) => toast.error(e.message),
              },
            )
          }
        >
          Void sale
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function SaleDetailDialog({
  sale,
  customerName,
  onClose,
  onReceipt,
}: {
  sale: Sale;
  customerName: string;
  onClose: () => void;
  onReceipt: () => void;
}) {
  const { data: items = [] } = useSaleItems([sale.id]);
  const { data: products = [] } = useStoreProducts();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sale.invoice_no}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1 text-sm">
          <p className="text-muted-foreground">
            {customerName} · {formatDate(sale.created_at)} ·{" "}
            {paymentMethodLabel(sale.payment_method)} · {SALE_STATUS_LABEL[sale.status]}
          </p>
          {sale.additional_info && <p className="text-muted-foreground">{sale.additional_info}</p>}
          {sale.void_reason && <p className="text-destructive">Voided: {sale.void_reason}</p>}
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Disc %</th>
                <th className="px-3 py-2 text-right">Tax %</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    {products.find((p) => p.id === i.product_id)?.name ?? "Item"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(i.quantity)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKES(i.unit_price)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(i.discount_percent)}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(i.tax_percent)}%</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatKES(i.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-1 text-sm">
          <Row label="Sub total" value={formatKES(sale.subtotal)} />
          <Row label="Item discounts" value={formatKES(sale.discount_amount)} />
          <Row label="Estimated tax" value={formatKES(sale.tax_amount)} />
          <Row label="Total amount" value={formatKES(sale.total_amount)} strong />
        </div>
        {sale.status === "completed" && (
          <Button variant="outline" onClick={onReceipt}>
            <Receipt className="h-4 w-4" /> Download receipt
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "text-base font-bold tabular-nums" : "font-medium tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
