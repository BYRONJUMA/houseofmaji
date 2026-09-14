import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------ types ------------------------------ */

export type TaxonomyRow = { id: string; name: string; active: boolean };
export type CapacityRow = { id: string; label: string; active: boolean };
export type SettingRow = { key: string; value: string | null };

export type ChecklistItem = {
  item_key: string;
  label: string;
  checked: boolean;
  notes: string | null;
};

export type SiteVisit = {
  id: string;
  deal_id: string | null;
  client_name: string;
  location: string | null;
  visit_type: "installation" | "maintenance" | "repair" | "inspection";
  engineer_id: string | null;
  assigned_engineer_id: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  visit_date: string;
  notes: string | null;
  status: "pending_assignment" | "scheduled" | "completed";
  checklist: ChecklistItem[];
  created_by: string | null;
  created_at: string;
};

export type SiteVisitPhoto = {
  id: string;
  site_visit_id: string;
  photo_url: string;
  caption: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

export type Recording = {
  id: string;
  deal_id: string | null;
  uploaded_by: string | null;
  audio_file_url: string;
  created_at: string;
};

export type Transcript = {
  id: string;
  recording_id: string;
  transcript_text: string | null;
  score: number | null;
  coaching_notes: string | null;
  applied_at: string | null;
  created_at: string;
};

export type WaRecipient = {
  id: string;
  name: string;
  phone: string;
  region: string | null;
  active: boolean;
};

export type WaSequence = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

export type WaStep = {
  id: string;
  sequence_id: string;
  position: number;
  template_text: string;
  delay_hours: number;
};

/* ------------------------------ shared list helper ------------------------------ */

function rows<T>(key: string, table: string, col: string, asc = true) {
  return {
    queryKey: [key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as never)
        .select("*")
        .order(col, { ascending: asc });
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
  };
}

/* ------------------------------ taxonomy ------------------------------ */

export const useMachineCategories = () =>
  useQuery(rows<TaxonomyRow>("crm-machine-categories", "machine_categories", "name"));
export const useMachineTypes = () =>
  useQuery(rows<TaxonomyRow>("crm-machine-types", "machine_types", "name"));
export const useMachineCapacities = () =>
  useQuery(rows<CapacityRow>("crm-machine-capacities", "machine_capacities", "label"));

/** Managed store-product categories (populates the product Category dropdown). */
export const useProductCategories = () =>
  useQuery(rows<TaxonomyRow>("product-categories", "product_categories", "name"));

/** Active machine type names — used to populate machine dropdowns. */
export function useMachineTypeOptions() {
  const { data = [] } = useMachineTypes();
  return data.filter((t) => t.active).map((t) => t.name);
}

/* ------------------------------ settings ------------------------------ */

export function useSettings() {
  return useQuery({
    queryKey: ["crm-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("key, value").order("key");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const r of (data ?? []) as SettingRow[]) map[r.key] = r.value ?? "";
      return map;
    },
  });
}

export const SETTING_DEFAULTS: Record<string, string> = {
  service_interval_commercial_months: "6",
  service_interval_undersink_months: "12",
  low_stock_threshold: "50",
  service_commission_undersink_kes: "200",
  service_commission_commercial_kes: "500",
  company_name: "Machines",
  company_logo_url: "",
  score_points_showroom_visited: "5",
  score_points_water_test_or_site_visit_paid: "5",
  score_points_timeline_stated: "3",
  score_points_responded_within_agreed_period: "3",
  score_points_budget_confirmed: "2",
  score_points_location_confirmed: "2",
  score_threshold_hot: "15",
  score_threshold_warm: "8",
  new_lead_timeout_days: "14",
  new_lead_timeout_max_score: "7",
};

export function settingNumber(map: Record<string, string> | undefined, key: string) {
  const raw = map?.[key] ?? SETTING_DEFAULTS[key] ?? "0";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : Number(SETTING_DEFAULTS[key] ?? 0);
}

/* ------------------------------ site visits ------------------------------ */

export const useSiteVisits = () =>
  useQuery(rows<SiteVisit>("crm-site-visits", "site_visits", "visit_date", false));

export function useVisitPhotos(visitId?: string) {
  return useQuery({
    queryKey: ["crm-visit-photos", visitId ?? "none"],
    enabled: !!visitId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_visit_photos")
        .select("*")
        .eq("site_visit_id", visitId!)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SiteVisitPhoto[];
    },
  });
}

/* ------------------------------ call reviews ------------------------------ */

export const useRecordings = () =>
  useQuery(rows<Recording>("crm-recordings", "recordings", "created_at", false));

export const useTranscripts = () =>
  useQuery(rows<Transcript>("crm-transcripts", "transcripts", "created_at", false));

/* ------------------------------ whatsapp ------------------------------ */

export const useWaRecipients = () =>
  useQuery(rows<WaRecipient>("crm-wa-recipients", "whatsapp_recipients", "name"));
export const useWaSequences = () =>
  useQuery(rows<WaSequence>("crm-wa-sequences", "whatsapp_sequences", "name"));
export const useWaSteps = () =>
  useQuery(rows<WaStep>("crm-wa-steps", "whatsapp_sequence_steps", "position"));

/* ------------------------------ storage helpers ------------------------------ */

export const PHOTO_BUCKET = "site-visit-photos";
export const RECORDING_BUCKET = "call-recordings";

export async function uploadToBucket(bucket: string, file: File, prefix: string) {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Private buckets: resolve a temporary readable URL for a stored object path. */
export function useSignedUrl(bucket: string, path?: string | null) {
  return useQuery({
    queryKey: ["signed-url", bucket, path ?? "none"],
    enabled: !!path,
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export const AUDIO_MIME = [
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
];
export const MAX_AUDIO_BYTES = 200 * 1024 * 1024;

export const VISIT_TYPES = ["installation", "maintenance", "repair", "inspection"] as const;
export const VISIT_STATUSES = ["pending_assignment", "scheduled", "completed"] as const;

export const INSTALLATION_CHECKLIST: ChecklistItem[] = [
  {
    item_key: "unpacked_inspected",
    label: "Machine unpacked and inspected for transit damage",
    checked: false,
    notes: null,
  },
  {
    item_key: "positioned_level",
    label: "Positioned and levelled correctly",
    checked: false,
    notes: null,
  },
  {
    item_key: "inlet_connected",
    label: "Inlet water connection fitted and leak-free",
    checked: false,
    notes: null,
  },
  {
    item_key: "drain_connected",
    label: "Drain / waste line connected",
    checked: false,
    notes: null,
  },
  {
    item_key: "power_on",
    label: "Power connected and machine powers on",
    checked: false,
    notes: null,
  },
  {
    item_key: "system_flushed",
    label: "System flushed and initial run completed",
    checked: false,
    notes: null,
  },
  {
    item_key: "output_tested",
    label: "Output water tested (TDS / quality checked)",
    checked: false,
    notes: null,
  },
  { item_key: "no_leaks", label: "No leaks after a 10-minute run", checked: false, notes: null },
  {
    item_key: "customer_operation",
    label: "Customer trained on operation",
    checked: false,
    notes: null,
  },
];
