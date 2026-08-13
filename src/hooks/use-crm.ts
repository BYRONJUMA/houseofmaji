import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Lead = {
  id: string;
  name: string;
  phone: string;
  machine_interest: string | null;
  location: string | null;
  source: string | null;
  stage: string;
  rep_id: string | null;
  follow_up_due_at: string | null;
  deal_value: number | null;
  created_at: string;
  updated_at: string;
};

export type LeadActivity = {
  id: string;
  lead_id: string;
  rep_id: string | null;
  reached: boolean;
  outcome_note: string | null;
  created_at: string;
};

export type Invoice = {
  id: string;
  invoice_no: string;
  date: string;
  client_name: string;
  machine: string | null;
  rep_id: string | null;
  amount: number;
  balance: number | null;
  created_at: string;
};

export type InventoryItem = {
  id: string;
  product_name: string;
  model: string | null;
  in_stock: number;
  buying_price: number | null;
  selling_price: number | null;
};

export type ServiceRecord = {
  id: string;
  client_name: string;
  contact: string | null;
  machine_type: string | null;
  last_service_date: string | null;
  next_due_date: string | null;
  visit_count: number;
  recorded_by: string | null;
};

export type Project = {
  id: string;
  date: string;
  client_name: string | null;
  machine_description: string | null;
  location: string | null;
  total: number;
  balance: number | null;
  status: string;
  created_by: string | null;
};

export type School = {
  id: string;
  school_name: string;
  county: string | null;
  area: string | null;
  tier: string | null;
  status: string;
  rep_id: string | null;
  last_contact_date: string | null;
  next_follow_up_date: string | null;
  visit_count: number;
};

export type MonthlyTarget = {
  id: string;
  month: string;
  revenue_target: number;
  deals_target: number;
};

export type TeamMember = { id: string; full_name: string; role: string };

function list<T>(key: string, table: string, order: { col: string; asc?: boolean }) {
  return {
    queryKey: [key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as never)
        .select("*")
        .order(order.col, { ascending: order.asc ?? false });
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
  };
}

export const useLeads = () => useQuery(list<Lead>("crm-leads", "leads", { col: "created_at" }));
export const useInvoices = () =>
  useQuery(list<Invoice>("crm-invoices", "invoices", { col: "date" }));
export const useInventory = () =>
  useQuery(list<InventoryItem>("crm-inventory", "inventory", { col: "product_name", asc: true }));
export const useServices = () =>
  useQuery(list<ServiceRecord>("crm-services", "services", { col: "next_due_date", asc: true }));
export const useProjects = () =>
  useQuery(list<Project>("crm-projects", "projects", { col: "date" }));
export const useSchools = () =>
  useQuery(list<School>("crm-schools", "schools", { col: "school_name", asc: true }));
export const useTargets = () =>
  useQuery(list<MonthlyTarget>("crm-targets", "monthly_targets", { col: "month" }));

export function useTeam() {
  return useQuery({
    queryKey: ["crm-team"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
  });
}

export function useLeadActivities(leadId?: string) {
  return useQuery({
    queryKey: ["crm-lead-activities", leadId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("lead_activities")
        .select("*")
        .order("created_at", { ascending: false });
      if (leadId) q = q.eq("lead_id", leadId);
      const { data, error } = await q.limit(leadId ? 200 : 60);
      if (error) throw error;
      return (data ?? []) as unknown as LeadActivity[];
    },
  });
}

/** Generic table mutation used across the CRM pages. */
export function useCrmMutation(table: string, invalidate: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      op:
        | { type: "insert"; values: Record<string, unknown> }
        | { type: "update"; id: string; values: Record<string, unknown> }
        | { type: "delete"; id: string },
    ) => {
      const t = supabase.from(table as never);
      const res =
        op.type === "insert"
          ? await t.insert(op.values as never)
          : op.type === "update"
            ? await t.update(op.values as never).eq("id", op.id)
            : await t.delete().eq("id", op.id);
      if (res.error) throw res.error;
      return true;
    },
    onSuccess: () => {
      for (const k of invalidate) void qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

export function nameOf(team: TeamMember[], id?: string | null) {
  if (!id) return "Unassigned";
  return team.find((t) => t.id === id)?.full_name || "Unknown";
}
