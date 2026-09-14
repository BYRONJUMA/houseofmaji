import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useStoreProducts } from "@/hooks/use-store";
import { useTeam, nameOf, type ServiceRecord } from "@/hooks/use-crm";
import {
  useClearInvoice,
  useDiagnosisItems,
  useServiceDiagnoses,
  useServiceInvoices,
  useSubmitDiagnosis,
  paymentMethodLabel,
  PAYMENT_METHODS,
  type ServiceInvoice,
  type ServicePaymentMethod,
} from "@/hooks/use-service-diagnosis";
import { downloadServiceInvoicePdf } from "@/lib/service-invoice-pdf";
import { formatDate, formatKES } from "@/lib/format";
import { num } from "@/lib/crm";

/** Latest invoice for a service, if any. */
export function latestInvoice(invoices: ServiceInvoice[], serviceId: string) {
  return invoices.find((i) => i.service_id === serviceId) ?? null;
}

type Line = { product_id: string; quantity: string };

/** Engineer records what they found plus the spare parts needed. */
export function DiagnosisDialog({
  record,
  onClose,
}: {
  record: ServiceRecord;
  onClose: () => void;
}) {
  const { data: products = [] } = useStoreProducts();
  const submit = useSubmitDiagnosis();
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: "1" }]);

  const priceOf = (id: string) => num(products.find((p) => p.id === id)?.selling_price ?? 0);
  const subtotal = lines.reduce((t, l) => t + priceOf(l.product_id) * num(l.quantity), 0);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const save = () => {
    if (!notes.trim()) {
      toast.error("Describe what you found");
      return;
    }
    const items = lines
      .filter((l) => l.product_id && num(l.quantity) > 0)
      .map((l) => ({ product_id: l.product_id, quantity: num(l.quantity) }));
    submit.mutate(
      { serviceId: record.id, notes: notes.trim(), items },
      {
        onSuccess: (res) => {
          toast.success(
            `Diagnosis saved — invoice ${res.invoice_no ?? ""} raised for ${formatKES(Number(res.subtotal ?? 0))}`,
          );
          onClose();
        },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Diagnosis — {record.client_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              What did you find? <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Faulty pump, membrane clogged…"
            />
          </div>

          <div className="space-y-2">
            <Label>Spare parts needed</Label>
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1 space-y-1">
                  <Select
                    value={l.product_id || undefined}
                    onValueChange={(v) => setLine(i, { product_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a part" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} · {formatKES(p.selling_price ?? 0)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  className="w-20"
                  type="number"
                  min="1"
                  value={l.quantity}
                  onChange={(e) => setLine(i, { quantity: e.target.value })}
                />
                <span className="min-w-[5.5rem] pb-2 text-right text-sm tabular-nums text-muted-foreground">
                  {formatKES(priceOf(l.product_id) * num(l.quantity))}
                </span>
                {lines.length > 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Remove line"
                    onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLines((p) => [...p, { product_id: "", quantity: "1" }])}
            >
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Invoice subtotal</span>
            <span className="font-semibold tabular-nums">{formatKES(subtotal)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Saving raises an invoice for these parts. Stock is only deducted once a sales head
            clears the invoice, and the service cannot be completed until then.
          </p>
          <Button onClick={save} disabled={submit.isPending}>
            Save diagnosis &amp; raise invoice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Invoice view: download the PDF, and (sales head only) clear it. */
export function ServiceInvoiceDialog({
  record,
  onClose,
}: {
  record: ServiceRecord;
  onClose: () => void;
}) {
  const { hasRole } = useAuth();
  const { data: team = [] } = useTeam();
  const { data: products = [] } = useStoreProducts();
  const { data: invoices = [] } = useServiceInvoices();
  const { data: diagnoses = [] } = useServiceDiagnoses(record.id);
  const invoice = useMemo(() => latestInvoice(invoices, record.id), [invoices, record.id]);
  const diagnosis = diagnoses.find((d) => d.id === invoice?.diagnosis_id) ?? null;
  const { data: items = [] } = useDiagnosisItems(invoice?.diagnosis_id);
  const clear = useClearInvoice();
  const [method, setMethod] = useState<ServicePaymentMethod | "">("");

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "Part";
  const isSalesHead = hasRole("sales_head");

  const download = () => {
    if (!invoice) return;
    void downloadServiceInvoicePdf({
      invoiceNo: invoice.invoice_no,
      createdAt: invoice.created_at,
      clientName: record.client_name,
      contact: record.contact ?? "—",
      machineType: record.machine_type ?? "—",
      serviceType:
        record.machine_service_type === "undersink"
          ? "Undersink"
          : record.machine_service_type === "commercial_industrial"
            ? "Commercial / Industrial"
            : "Unclassified",
      engineerName: nameOf(team, diagnosis?.engineer_id ?? null),
      diagnosisNotes: diagnosis?.diagnosis_notes ?? "",
      status: invoice.status === "cleared" ? "Cleared" : "Pending payment",
      paymentMethod: paymentMethodLabel(invoice.payment_method),
      items: items.map((i) => ({
        name: productName(i.product_id),
        quantity: num(i.quantity),
        unitPrice: num(i.unit_price),
      })),
      subtotal: num(invoice.subtotal),
    });
  };

  const doClear = () => {
    if (!invoice || !method) {
      toast.error("Select a payment method");
      return;
    }
    clear.mutate(
      { invoiceId: invoice.id, method },
      {
        onSuccess: () => toast.success(`Invoice ${invoice.invoice_no} cleared — parts deducted`),
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Service invoice — {record.client_name}</DialogTitle>
        </DialogHeader>
        {!invoice ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            No diagnosis or invoice for this service yet.
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{invoice.invoice_no}</p>
                <p className="text-xs text-muted-foreground">
                  raised {formatDate(invoice.created_at)} by{" "}
                  {nameOf(team, diagnosis?.engineer_id ?? null)}
                </p>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide">
                {invoice.status === "cleared"
                  ? `Cleared · ${paymentMethodLabel(invoice.payment_method)}`
                  : "Pending payment"}
              </span>
            </div>

            {diagnosis && (
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Diagnosis
                </p>
                <p className="mt-1 whitespace-pre-wrap">{diagnosis.diagnosis_notes}</p>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Part</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-t border-border">
                      <td className="px-3 py-2">{productName(i.product_id)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(i.quantity)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatKES(i.unit_price)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatKES(num(i.quantity) * num(i.unit_price))}
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                        No parts on this invoice.
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-border bg-secondary/40 font-semibold">
                    <td className="px-3 py-2" colSpan={3}>
                      Subtotal
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatKES(invoice.subtotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={download}>
                <Download className="h-4 w-4" /> Download PDF
              </Button>
            </div>

            {invoice.status !== "cleared" && isSalesHead && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <Label>Payment method</Label>
                <Select value={method || undefined} onValueChange={(v) => setMethod(v as never)}>
                  <SelectTrigger>
                    <SelectValue placeholder="How was it paid?" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={doClear} disabled={clear.isPending}>
                  Clear invoice
                </Button>
                <p className="text-xs text-muted-foreground">
                  Clearing deducts these parts from In-House stock and unlocks service completion.
                </p>
              </div>
            )}
            {invoice.status !== "cleared" && !isSalesHead && (
              <p className="text-xs text-muted-foreground">
                Only a sales head can clear this invoice.
              </p>
            )}
            {invoice.status === "cleared" && (
              <p className="text-xs text-muted-foreground">
                Cleared by {nameOf(team, invoice.cleared_by)} on {formatDate(invoice.cleared_at)}.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
