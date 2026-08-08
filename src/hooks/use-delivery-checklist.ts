import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ChecklistSections } from "@/lib/checklist-schema";
import { isChecklistComplete } from "@/lib/checklist-schema";

export type DeliveryChecklist = {
  id: string;
  fulfillment_id: string;
  delivery_no: string;
  date_delivered: string | null;
  capacity_lph: number | string | null;
  machine_serial_no: string | null;
  sections: ChecklistSections;
  remarks: string | null;
  engineer_signoff_name: string | null;
  engineer_signoff_at: string | null;
  client_signature_data: string | null;
  client_signoff_at: string | null;
  chief_signoff_name: string | null;
  chief_signoff_at: string | null;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
};

export function useDeliveryChecklist(fulfillmentId: string) {
  return useQuery({
    queryKey: ["delivery-checklist", fulfillmentId],
    enabled: !!fulfillmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_checklists")
        .select("*")
        .eq("fulfillment_id", fulfillmentId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as DeliveryChecklist) ?? null;
    },
  });
}

export type ChecklistPatch = Partial<
  Omit<DeliveryChecklist, "id" | "fulfillment_id" | "started_at" | "updated_at">
>;

/** Creates the checklist row on first write, then patches it (auto-save). */
export function useSaveChecklist(fulfillmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ChecklistPatch) => {
      const existing = qc.getQueryData<DeliveryChecklist | null>([
        "delivery-checklist",
        fulfillmentId,
      ]);

      const nextSections = (patch.sections ?? existing?.sections ?? {}) as ChecklistSections;
      const complete = isChecklistComplete(nextSections);
      const body: Record<string, unknown> = {
        ...patch,
        completed_at: complete ? (existing?.completed_at ?? new Date().toISOString()) : null,
      };

      if (!existing) {
        const { data: auth } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("delivery_checklists")
          .insert({
            fulfillment_id: fulfillmentId,
            started_by: auth.user?.id ?? null,
            ...body,
          } as never)
          .select("*")
          .single();
        if (error) throw error;
        return data as unknown as DeliveryChecklist;
      }

      const { data, error } = await supabase
        .from("delivery_checklists")
        .update(body as never)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as DeliveryChecklist;
    },
    onSuccess: (row) => {
      qc.setQueryData(["delivery-checklist", fulfillmentId], row);
    },
  });
}
