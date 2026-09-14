import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ServiceVisitLogRow = {
  id: string;
  service_id: string;
  completed_at: string;
  completed_by: string | null;
  next_due_date_set_to: string | null;
};

/** Completion history for a single service record (the main record resets each cycle). */
export function useServiceVisitLog(serviceId?: string) {
  return useQuery({
    queryKey: ["service-visit-log", serviceId ?? "none"],
    enabled: !!serviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_visit_log")
        .select("*")
        .eq("service_id", serviceId!)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ServiceVisitLogRow[];
    },
  });
}
