import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type QuotationStatus = "draft" | "completed";

export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  draft: "Draft",
  completed: "Completed",
};

export type Quotation = {
  id: string;
  quotation_no: string;
  branch_id: string;
  customer_id: string | null;
  lead_id: string | null;
  description: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  status: QuotationStatus;
  created_by: string | null;
  created_at: string;
};

export type QuotationItem = {
  id: string;
  quotation_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  line_total: number;
};

export type NewQuotationItem = Omit<QuotationItem, "id" | "quotation_id">;

export function useQuotations(branchId: string) {
  return useQuery({
    queryKey: ["quotations", branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select("*")
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Quotation[];
    },
  });
}

export function useQuotationItems(quotationIds?: string[]) {
  const key = (quotationIds ?? []).join(",");
  return useQuery({
    queryKey: ["quotation-items", key],
    queryFn: async () => {
      let q = supabase.from("quotation_items").select("*");
      if (quotationIds && quotationIds.length > 0) q = q.in("quotation_id", quotationIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as QuotationItem[];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["quotations"] });
  void qc.invalidateQueries({ queryKey: ["quotation-items"] });
}

type SaveInput = {
  id?: string;
  branchId: string;
  customerId: string | null;
  leadId: string | null;
  description: string | null;
  createdBy?: string | null;
  status: QuotationStatus;
  items: NewQuotationItem[];
};

function totalsOf(items: NewQuotationItem[]) {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const i of items) {
    const base = i.quantity * i.unit_price;
    const disc = (base * i.discount_percent) / 100;
    subtotal += base;
    discount += disc;
    tax += ((base - disc) * i.tax_percent) / 100;
  }
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}

/** Create or replace a quotation together with its item lines. */
export function useSaveQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: SaveInput) => {
      const t = totalsOf(v.items);
      const values = {
        branch_id: v.branchId,
        customer_id: v.customerId,
        lead_id: v.leadId,
        description: v.description,
        subtotal: t.subtotal,
        tax_amount: t.tax,
        discount_amount: t.discount,
        total_amount: t.total,
        status: v.status,
      };

      let quotationId = v.id;
      if (quotationId) {
        const { error } = await supabase
          .from("quotations")
          .update(values as never)
          .eq("id", quotationId);
        if (error) throw new Error(error.message);
        const del = await supabase.from("quotation_items").delete().eq("quotation_id", quotationId);
        if (del.error) throw new Error(del.error.message);
      } else {
        const { data, error } = await supabase
          .from("quotations")
          .insert({ ...values, created_by: v.createdBy ?? null } as never)
          .select("id, quotation_no")
          .single();
        if (error) throw new Error(error.message);
        quotationId = (data as unknown as { id: string }).id;
      }

      if (v.items.length > 0) {
        const { error } = await supabase.from("quotation_items").insert(
          v.items.map((i) => ({
            quotation_id: quotationId,
            product_id: i.product_id,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount_percent: i.discount_percent,
            tax_percent: i.tax_percent,
            line_total:
              i.quantity *
              i.unit_price *
              (1 - i.discount_percent / 100) *
              (1 + i.tax_percent / 100),
          })) as never,
        );
        if (error) throw new Error(error.message);
      }
      return quotationId as string;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotations").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: () => invalidate(qc),
  });
}
