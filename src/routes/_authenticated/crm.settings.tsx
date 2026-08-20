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
import { useSettings, SETTING_DEFAULTS } from "@/hooks/use-crm-extra";

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

const FIELDS: { key: string; label: string; hint: string; type?: string }[] = [
  {
    key: "default_service_interval_months",
    label: "Default service interval (months)",
    hint: "Used when a machine type has no specific interval, for Services follow-up dates.",
    type: "number",
  },
  {
    key: "low_stock_threshold",
    label: "Low-stock threshold",
    hint: "Inventory items below this quantity get the “Low” badge.",
    type: "number",
  },
  { key: "company_name", label: "Company name", hint: "Shown on reports and exports." },
  { key: "company_logo_url", label: "Company logo URL", hint: "Optional image URL for reports." },
];

function SettingsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { data: settings } = useSettings();
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

  return (
    <CrmShell title="Settings" subtitle="System-wide configuration" showBack>
      <CrmCard title="General" className="max-w-2xl">
        <div className="space-y-4">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input
                type={f.type ?? "text"}
                value={valueOf(f.key)}
                onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">{f.hint}</p>
            </div>
          ))}
          <Button
            onClick={() => save.mutate(FIELDS.map((f) => ({ key: f.key, value: valueOf(f.key) })))}
            disabled={save.isPending}
          >
            Save settings
          </Button>
        </div>
      </CrmCard>
    </CrmShell>
  );
}
