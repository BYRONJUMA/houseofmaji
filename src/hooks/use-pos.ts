import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StoreLocation } from "@/hooks/use-store";

export type PosPaymentMethod = "cash" | "mpesa" | "credit" | "bank_transfer";
export type SaleStatus = "completed" | "pending_payment" | "voided";

export const POS_PAYMENT_METHODS: { value: PosPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "credit", label: "Credit" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

export const paymentMethodLabel = (m: string | null | undefined) =>
  POS_PAYMENT_METHODS.find((p) => p.value === m)?.label ?? "—";

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  completed: "Completed",
  pending_payment: "Pending payment",
  voided: "Invalidated",
};

export type PosCustomer = {
  id: string;
  name: string;
  phone: string | null;
  branch_id: string;
  created_at: string;
};

export type Sale = {
  id: string;
  invoice_no: string;
  customer_id: string | null;
  branch_id: string;
  location: StoreLocation;
  payment_method: PosPaymentMethod;
  additional_info: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  status: SaleStatus;
  created_by: string | null;
  voided_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  line_total: number;
};

export type NewSaleItem = {
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
};

export function usePosCustomers(branchId: string) {
  return useQuery({
    queryKey: ["pos-customers", branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_customers")
        .select("*")
        .eq("branch_id", branchId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PosCustomer[];
    },
  });
}

export function useSales(branchId: string) {
  return useQuery({
    queryKey: ["pos-sales", branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Sale[];
    },
  });
}

export function useSaleItems(saleIds?: string[]) {
  const key = (saleIds ?? []).join(",");
  return useQuery({
    queryKey: ["pos-sale-items", key],
    queryFn: async () => {
      let q = supabase.from("sale_items").select("*");
      if (saleIds && saleIds.length > 0) q = q.in("sale_id", saleIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SaleItem[];
    },
  });
}

function invalidatePos(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["pos-sales"] });
  void qc.invalidateQueries({ queryKey: ["pos-sale-items"] });
  void qc.invalidateQueries({ queryKey: ["pos-customers"] });
  void qc.invalidateQueries({ queryKey: ["store-products"] });
  void qc.invalidateQueries({ queryKey: ["store-entries"] });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      branchId: string;
      location: StoreLocation;
      paymentMethod: PosPaymentMethod;
      items: NewSaleItem[];
      customerId?: string | null;
      newCustomerName?: string | null;
      newCustomerPhone?: string | null;
      additionalInfo?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("pos_create_sale", {
        _branch_id: v.branchId,
        _location: v.location,
        _payment_method: v.paymentMethod,
        _items: v.items,
        _customer_id: v.customerId ?? undefined,
        _new_customer_name: v.newCustomerName ?? undefined,
        _new_customer_phone: v.newCustomerPhone ?? undefined,
        _additional_info: v.additionalInfo ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data as unknown as { sale_id: string; invoice_no: string; total_amount: number };
    },
    onSuccess: () => invalidatePos(qc),
  });
}

export function useVoidSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { saleId: string; reason: string }) => {
      const { error } = await supabase.rpc("pos_void_sale", {
        _sale_id: v.saleId,
        _reason: v.reason,
      });
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: () => invalidatePos(qc),
  });
}

export function useMarkSalePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (saleId: string) => {
      const { error } = await supabase.rpc("pos_mark_sale_paid", { _sale_id: saleId });
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: () => invalidatePos(qc),
  });
}
