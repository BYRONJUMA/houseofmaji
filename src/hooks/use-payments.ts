import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Payment = {
  id: string;
  fulfillment_id: string;
  amount: number | string;
  paid_at: string;
  recorded_by: string;
  notes: string | null;
};

/** All payments, used to compute per-fulfillment totals. */
export function useAllPayments() {
  return useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });
}

export function usePayments(fulfillmentId: string) {
  return useQuery({
    queryKey: ["payments", fulfillmentId],
    enabled: !!fulfillmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("fulfillment_id", fulfillmentId)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });
}

export function totalPaid(payments: Payment[] | undefined) {
  return (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
}

export function paidPercent(paid: number, agreedPrice: number | string) {
  const price = Number(agreedPrice);
  if (!Number.isFinite(price) || price <= 0) return 0;
  return (paid / price) * 100;
}
