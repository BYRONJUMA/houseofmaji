import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ServiceDiagnosis = {
  id: string;
  service_id: string;
  engineer_id: string | null;
  diagnosis_notes: string;
  created_at: string;
};

export type ServiceDiagnosisItem = {
  id: string;
  diagnosis_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
};

export type ServicePaymentMethod = "cash" | "mpesa" | "bank_transfer" | "other";

export const PAYMENT_METHODS: { value: ServicePaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other", label: "Other" },
];

export const paymentMethodLabel = (m: string | null | undefined) =>
  PAYMENT_METHODS.find((p) => p.value === m)?.label ?? "—";

export type ServiceInvoice = {
  id: string;
  service_id: string;
  diagnosis_id: string;
  invoice_no: string;
  subtotal: number;
  status: "pending_payment" | "cleared";
  payment_method: ServicePaymentMethod | null;
  cleared_by: string | null;
  cleared_at: string | null;
  created_at: string;
};

/** Every invoice the signed-in user may see — used for the completion gate and lists. */
export function useServiceInvoices() {
  return useQuery({
    queryKey: ["service-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_invoices")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ServiceInvoice[];
    },
  });
}

export function useServiceDiagnoses(serviceId?: string) {
  return useQuery({
    queryKey: ["service-diagnoses", serviceId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("service_diagnoses")
        .select("*")
        .order("created_at", { ascending: false });
      if (serviceId) q = q.eq("service_id", serviceId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ServiceDiagnosis[];
    },
  });
}

export function useDiagnosisItems(diagnosisId?: string) {
  return useQuery({
    queryKey: ["service-diagnosis-items", diagnosisId ?? "none"],
    enabled: !!diagnosisId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_diagnosis_items")
        .select("*")
        .eq("diagnosis_id", diagnosisId!);
      if (error) throw error;
      return (data ?? []) as unknown as ServiceDiagnosisItem[];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["service-invoices"] });
  void qc.invalidateQueries({ queryKey: ["service-diagnoses"] });
  void qc.invalidateQueries({ queryKey: ["crm-services"] });
}

/** Records the diagnosis, its spare-part lines and the auto-generated invoice. */
export function useSubmitDiagnosis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      serviceId: string;
      notes: string;
      items: { product_id: string; quantity: number }[];
    }) => {
      const { data, error } = await supabase.rpc("service_submit_diagnosis" as never, {
        _service_id: v.serviceId,
        _notes: v.notes,
        _items: v.items,
      } as never);
      if (error) throw new Error(error.message);
      return (data ?? {}) as { invoice_no?: string; subtotal?: number };
    },
    onSuccess: () => invalidate(qc),
  });
}

/** Sales-head-only clearing — this is the step that deducts In-House stock. */
export function useClearInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { invoiceId: string; method: ServicePaymentMethod }) => {
      const { data, error } = await supabase.rpc("service_invoice_clear" as never, {
        _invoice_id: v.invoiceId,
        _payment_method: v.method,
      } as never);
      if (error) throw new Error(error.message);
      return (data ?? {}) as { invoice_no?: string };
    },
    onSuccess: () => {
      invalidate(qc);
      void qc.invalidateQueries({ queryKey: ["store-products"] });
      void qc.invalidateQueries({ queryKey: ["store-entries"] });
    },
  });
}
