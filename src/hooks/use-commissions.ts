import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CommissionSource = "fulfillment" | "service";

export type CommissionRow = {
  id: string;
  source: CommissionSource;
  user_id: string;
  /** Empty string for service commissions (they are not tied to a fulfillment). */
  fulfillment_id: string;
  service_id?: string;
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
  service: "Service",
};

type ServiceCommissionRaw = {
  id: string;
  service_id: string;
  user_id: string;
  amount_kes: number | string;
  paid: boolean;
  paid_at: string | null;
  computed_at: string;
  services: { client_name: string; machine_type: string | null } | null;
  profiles: { full_name: string; role: string } | null;
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

      let sq = supabase
        .from("service_commissions")
        .select("*, services(client_name, machine_type), profiles(full_name, role)")
        .order("computed_at", { ascending: false });
      if (!all) sq = sq.eq("user_id", userId!);

      const [{ data, error }, { data: sData, error: sError }] = await Promise.all([q, sq]);
      if (error) throw error;
      if (sError) throw sError;

      const fulfillmentRows = ((data ?? []) as unknown as CommissionRow[]).map((r) => ({
        ...r,
        source: "fulfillment" as const,
      }));

      const serviceRows: CommissionRow[] = ((sData ?? []) as unknown as ServiceCommissionRaw[]).map(
        (r) => ({
          id: r.id,
          source: "service" as const,
          user_id: r.user_id,
          fulfillment_id: "",
          service_id: r.service_id,
          role: "service",
          amount: r.amount_kes,
          paid: r.paid,
          paid_at: r.paid_at,
          computed_at: r.computed_at,
          fulfillments: r.services
            ? { client_name: r.services.client_name, machine_type: r.services.machine_type ?? "" }
            : null,
          profiles: r.profiles,
        }),
      );

      return [...fulfillmentRows, ...serviceRows].sort((a, b) =>
        a.computed_at < b.computed_at ? 1 : -1,
      );
    },
  });
}

function tableFor(source: CommissionSource) {
  return source === "service" ? "service_commissions" : "commissions";
}

/** Chief engineers and admins can flip a commission between paid and unpaid. */
export function useTogglePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      paid,
      source = "fulfillment",
    }: {
      id: string;
      paid: boolean;
      source?: CommissionSource;
    }) => {
      const { error } = await supabase
        .from(tableFor(source) as never)
        .update({ paid } as never)
        .eq("id", id);
      if (error) throw error;
      return { id, paid };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commissions"] }),
  });
}

/** Marks a batch of commissions paid in one action (admin / chief engineer only). */
export function useMarkAllPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { id: string; source: CommissionSource }[]) => {
      if (rows.length === 0) return 0;
      const groups: Record<CommissionSource, string[]> = { fulfillment: [], service: [] };
      rows.forEach((r) => groups[r.source].push(r.id));
      for (const source of ["fulfillment", "service"] as CommissionSource[]) {
        const ids = groups[source];
        if (ids.length === 0) continue;
        const { error } = await supabase
          .from(tableFor(source) as never)
          .update({ paid: true } as never)
          .in("id", ids);
        if (error) throw error;
      }
      return rows.length;
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
