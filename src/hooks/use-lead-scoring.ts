import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LEAD_SCORING_CRITERIA, type LeadCriterionKey } from "@/lib/crm";

export type LeadScoringEvent = {
  id: string;
  lead_id: string;
  criterion: string;
  points: number;
  recorded_by: string | null;
  recorded_at: string;
};

export function useLeadScoringEvents(leadId?: string) {
  return useQuery({
    queryKey: ["crm-lead-scoring", leadId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("lead_scoring_events")
        .select("*")
        .order("recorded_at", { ascending: false });
      if (leadId) q = q.eq("lead_id", leadId);
      const { data, error } = await q.limit(leadId ? 100 : 2000);
      if (error) throw error;
      return (data ?? []) as unknown as LeadScoringEvent[];
    },
  });
}

/** Toggle a scoring criterion on a lead — triggers recompute the score server-side. */
export function useToggleLeadCriterion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      leadId: string;
      criterion: LeadCriterionKey;
      on: boolean;
      userId?: string | null;
    }) => {
      if (v.on) {
        const points =
          LEAD_SCORING_CRITERIA.find((c) => c.key === v.criterion)?.points ?? 0;
        const { error } = await supabase.from("lead_scoring_events").insert({
          lead_id: v.leadId,
          criterion: v.criterion,
          points,
          recorded_by: v.userId ?? null,
        } as never);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("lead_scoring_events")
          .delete()
          .eq("lead_id", v.leadId)
          .eq("criterion", v.criterion);
        if (error) throw error;
      }
      return true;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crm-lead-scoring"] });
      void qc.invalidateQueries({ queryKey: ["crm-leads"] });
      void qc.invalidateQueries({ queryKey: ["crm-lead-activities"] });
    },
  });
}

/** Runs the stale-lead sweep (New + low score + 14 days old -> Not Won). */
export function useExpireStaleLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("expire_stale_leads" as never);
      if (error) throw error;
      return (data as unknown as number) ?? 0;
    },
    onSuccess: (n) => {
      if (n > 0) {
        void qc.invalidateQueries({ queryKey: ["crm-leads"] });
        void qc.invalidateQueries({ queryKey: ["crm-lead-activities"] });
      }
    },
  });
}
