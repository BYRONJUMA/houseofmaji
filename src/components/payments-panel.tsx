import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePayments, totalPaid, paidPercent } from "@/hooks/use-payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatKES, formatDate } from "@/lib/format";

export function PaymentsPanel({
  fulfillmentId,
  agreedPrice,
  names,
}: {
  fulfillmentId: string;
  agreedPrice: number | string;
  names: Record<string, string>;
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: payments = [], isLoading } = usePayments(fulfillmentId);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const canRecord = profile?.role === "sales_rep" || profile?.role === "chief_engineer";
  const paid = totalPaid(payments);
  const pct = paidPercent(paid, agreedPrice);

  const record = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a valid amount");
      const { error } = await supabase.from("payments").insert({
        fulfillment_id: fulfillmentId,
        amount: value,
        notes: notes.trim() || null,
        recorded_by: profile!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      setAmount("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="surface-card space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Receipt className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Payment plan</h2>
      </div>

      <div>
        <div className="flex items-end justify-between gap-3">
          <p className="text-2xl font-bold tracking-tight tabular-nums">{formatKES(paid)}</p>
          <p className="text-sm font-semibold tabular-nums">{pct.toFixed(1)}% paid</p>
        </div>
        <p className="text-xs text-muted-foreground">of {formatKES(agreedPrice)} agreed</p>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>50% → order frame</span>
          <span>80% → material procurement</span>
        </div>
      </div>

      {canRecord && (
        <form
          className="space-y-3 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            record.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Amount (KES)</Label>
            <Input
              id="pay-amount"
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-notes">Note (optional)</Label>
            <Input
              id="pay-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="M-Pesa ref, deposit, balance…"
              maxLength={200}
            />
          </div>
          <Button type="submit" className="w-full" disabled={record.isPending}>
            {record.isPending ? "Recording…" : "Record payment"}
          </Button>
        </form>
      )}

      <div className="border-t border-border pt-4">
        <h3 className="mb-2 text-sm font-semibold">Payment log</h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0"
              >
                <div>
                  <p className="font-semibold tabular-nums">{formatKES(Number(p.amount))}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(p.paid_at)} · {names[p.recorded_by] ?? "Team member"}
                  </p>
                  {p.notes && <p className="mt-1 text-xs">{p.notes}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
