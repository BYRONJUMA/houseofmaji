import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CrmShell, CrmCard } from "@/components/crm-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSettings, SETTING_DEFAULTS, useProductCategories } from "@/hooks/use-crm-extra";
import { ListEditor, type Row } from "@/routes/_authenticated/crm.machines";

export const Route = createFileRoute("/_authenticated/crm/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Machines CRM" },
      {
        name: "description",
        content:
          "System-wide configuration: service interval, low-stock threshold and company identity.",
      },
      { property: "og:title", content: "Settings — Machines CRM" },
      { property: "og:description", content: "Admin-only system configuration for the CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

type Field = { key: string; label: string; hint: string; type?: string };

const GENERAL: Field[] = [
  {
    key: "service_interval_commercial_months",
    label: "Commercial / industrial service interval (months)",
    hint: "Months between visits for commercial and industrial machines.",
    type: "number",
  },
  {
    key: "service_interval_undersink_months",
    label: "Undersink service interval (months)",
    hint: "Months between visits for undersink machines.",
    type: "number",
  },
  {
    key: "low_stock_threshold",
    label: "Low-stock threshold",
    hint: "Inventory items below this quantity get the “Low” badge.",
    type: "number",
  },
  {
    key: "service_commission_undersink_kes",
    label: "Undersink service commission (KES)",
    hint: "Paid to the engineer who completes an undersink service visit.",
    type: "number",
  },
  {
    key: "service_commission_commercial_kes",
    label: "Commercial / industrial service commission (KES)",
    hint: "Paid to the engineer who completes a commercial or industrial service visit.",
    type: "number",
  },
  { key: "company_name", label: "Company name", hint: "Shown on reports and exports." },
  { key: "company_logo_url", label: "Company logo URL", hint: "Optional image URL for reports." },
];

const SCORING: Field[] = [
  {
    key: "score_points_showroom_visited",
    label: "Points — visited the showroom",
    hint: "",
    type: "number",
  },
  {
    key: "score_points_water_test_or_site_visit_paid",
    label: "Points — paid for a water test / site visit",
    hint: "",
    type: "number",
  },
  {
    key: "score_points_timeline_stated",
    label: "Points — stated a purchase timeline",
    hint: "",
    type: "number",
  },
  {
    key: "score_points_responded_within_agreed_period",
    label: "Points — responded within the agreed period",
    hint: "",
    type: "number",
  },
  {
    key: "score_points_budget_confirmed",
    label: "Points — confirmed their budget",
    hint: "",
    type: "number",
  },
  {
    key: "score_points_location_confirmed",
    label: "Points — confirmed their location",
    hint: "",
    type: "number",
  },
];

const THRESHOLDS: Field[] = [
  {
    key: "score_threshold_hot",
    label: "Minimum score for Hot",
    hint: "A lead reaching this score moves to Hot automatically.",
    type: "number",
  },
  {
    key: "score_threshold_warm",
    label: "Minimum score for Warm",
    hint: "A lead reaching this score moves to Warm automatically.",
    type: "number",
  },
  {
    key: "new_lead_timeout_days",
    label: "New-lead timeout (days)",
    hint: "How long a quiet new lead waits before it moves to Not Won.",
    type: "number",
  },
  {
    key: "new_lead_timeout_max_score",
    label: "Timeout applies at or below this score",
    hint: "Only quiet new leads scoring this or less are moved to Not Won.",
    type: "number",
  },
];

const FIELDS: Field[] = [...GENERAL, ...SCORING, ...THRESHOLDS];

function SettingsPage() {
  const { profile, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const { data: settings } = useSettings();
  const productCats = useProductCategories();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async (rows: { key: string; value: string }[]) => {
      const { error } = await supabase
        .from("settings")
        .upsert(rows.map((r) => ({ ...r, updated_by: profile?.id ?? null })));
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crm-settings"] });
      setDraft({});
      toast.success("Settings saved");
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const valueOf = (key: string) => draft[key] ?? settings?.[key] ?? SETTING_DEFAULTS[key] ?? "";

  if (!isAdmin) {
    return (
      <CrmShell title="Settings" showBack>
        <CrmCard>
          <p className="text-sm text-muted-foreground">
            Only admins can view and change system settings.
          </p>
        </CrmCard>
      </CrmShell>
    );
  }

  const group = (fields: Field[]) =>
    fields.map((f) => (
      <div key={f.key} className="space-y-1.5">
        <Label>{f.label}</Label>
        <Input
          type={f.type ?? "text"}
          value={valueOf(f.key)}
          onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.value }))}
        />
        {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
      </div>
    ));

  return (
    <CrmShell title="Settings" subtitle="System-wide configuration" showBack>
      <div className="max-w-2xl space-y-6">
        <CrmCard title="General">
          <div className="space-y-4">{group(GENERAL)}</div>
        </CrmCard>

        <CrmCard title="Lead scoring points">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Points a lead earns for each step. Changes apply to scoring from now on — scores
              already recorded stay as they are.
            </p>
            {group(SCORING)}
          </div>
        </CrmCard>

        <CrmCard title="Stage thresholds & new-lead timeout">
          <div className="space-y-4">{group(THRESHOLDS)}</div>
        </CrmCard>

        <Button
          onClick={() => save.mutate(FIELDS.map((f) => ({ key: f.key, value: valueOf(f.key) })))}
          disabled={save.isPending}
        >
          Save settings
        </Button>
      </div>
    </CrmShell>
  );
}
