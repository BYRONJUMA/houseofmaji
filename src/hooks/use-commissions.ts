import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CommissionRow = {
  id: string;
  user_id: string;
  fulfillment_id: string;
  role: string;
  amount: number | string;
  paid: boolean;
  paid_at: string | null;
  computed_at: string;
  fulfillments: { client_name: string; machine_type: string } | null;
  profiles: { full_name: string; role: string } | null;
};

export const COMMISSION_TYPE_LABEL: Record<string, string> = {
  sales: "Sales (2%)",
  assembly: "Assembly",
  installation: "Installation",
};

/** Commissions for one user, or the whole team when `all` is true. */
export function useCommissions({ userId, all }: { userId?: string; all?: boolean }) {
  return useQuery({
    queryKey: ["commissions", all ? "all" : userId],
    enabled: !!userId,
    queryFn: async () => {
      let q = supabase
        .from("commissions")
        .select("*, fulfillments(client_name, machine_type), profiles(full_name, role)")
        .order("computed_at", { ascending: false });
      if (!all) q = q.eq("user_id", userId!);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as CommissionRow[];
    },
  });
}
