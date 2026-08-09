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

const listKey = (fulfillmentId: string) => ["delivery-checklists", fulfillmentId];

/** All machine checklists recorded under one fulfillment, oldest first. */
export function useDeliveryChecklists(fulfillmentId: string) {
  return useQuery({
    queryKey: listKey(fulfillmentId),
    enabled: !!fulfillmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_checklists")
        .select("*")
        .eq("fulfillment_id", fulfillmentId)
        .order("started_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as DeliveryChecklist[];
    },
  });
}

/** Creates a new machine checklist — delivery no. and serial no. are generated server-side. */
export function useAddChecklist(fulfillmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("delivery_checklists")
        .insert({
          fulfillment_id: fulfillmentId,
          started_by: auth.user?.id ?? null,
        } as never)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as DeliveryChecklist;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey(fulfillmentId) }),
  });
}

export type ChecklistPatch = Partial<
  Omit<
    DeliveryChecklist,
    "id" | "fulfillment_id" | "delivery_no" | "machine_serial_no" | "started_at" | "updated_at"
  >
>;

/** Patches one existing machine checklist (auto-save). */
export function useSaveChecklist(fulfillmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      checklistId,
      patch,
    }: {
      checklistId: string;
      patch: ChecklistPatch;
    }) => {
      const rows = qc.getQueryData<DeliveryChecklist[]>(listKey(fulfillmentId)) ?? [];
      const existing = rows.find((r) => r.id === checklistId);

      const nextSections = (patch.sections ?? existing?.sections ?? {}) as ChecklistSections;
      const complete = isChecklistComplete(nextSections);
      const body: Record<string, unknown> = {
        ...patch,
        completed_at: complete ? (existing?.completed_at ?? new Date().toISOString()) : null,
      };

      const { data, error } = await supabase
        .from("delivery_checklists")
        .update(body as never)
        .eq("id", checklistId)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as DeliveryChecklist;
    },
    onSuccess: (row) => {
      qc.setQueryData<DeliveryChecklist[]>(listKey(fulfillmentId), (prev) =>
        (prev ?? []).map((r) => (r.id === row.id ? row : r)),
      );
    },
  });
}
