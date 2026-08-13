import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

/** Chief engineers and admins can flip a commission between paid and unpaid. */
export function useTogglePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { data, error } = await supabase
        .from("commissions")
        .update({ paid })
        .eq("id", id)
        .select("id, paid, paid_at")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commissions"] }),
  });
}

/** Marks a batch of commissions paid in one action (admin / chief engineer only). */
export function useMarkAllPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return 0;
      const { error } = await supabase.from("commissions").update({ paid: true }).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commissions"] }),
  });
}

/** "2026-08" style key used by the month filter. */
export function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-KE", {
    month: "long",
    year: "numeric",
  });
}

