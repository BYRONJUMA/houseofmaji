import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toCsv, downloadCsv, todayStamp } from "@/lib/csv";
import { LEAD_STAGES, LEAD_STAGE_LABEL } from "@/lib/crm";
import { useAuth } from "@/hooks/use-auth";

type LeadRow = {
  id: string;
  name: string;
  phone: string;
  machine_interest: string | null;
  location: string | null;
  source: string | null;
  stage: string;
  rep_id: string | null;
  follow_up_due_at: string | null;
  deal_value: number | string | null;
  created_at: string;
};

type Parsed = {
  name: string;
  phone: string;
  machine_interest: string | null;
  location: string | null;
  source: string | null;
  stage: string;
  deal_value: number | null;
};

const HEADERS = [
  "Name",
  "Phone",
  "Machine interest",
  "Location",
  "Source",
  "Stage",
  "Deal value",
  "Rep",
  "Follow-up due",
  "Created",
];

function normalizePhone(v: unknown) {
  return String(v ?? "")
    .replace(/[^\d+]/g, "")
    .trim();
}

function normalizeStage(v: unknown) {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (s === "not_won" || s === "lost" || s === "notwon") return "not_won";
  return (LEAD_STAGES as readonly string[]).includes(s) ? s : "new";
}

function pick(row: Record<string, unknown>, keys: string[]) {
  for (const k of Object.keys(row)) {
    const norm = k.trim().toLowerCase().replace(/[\s_]+/g, "");
    if (keys.includes(norm)) {
      const v = row[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return "";
}

export function LeadsImportExport({
  leads,
  allLeads,
  names,
  canWrite,
}: {
  leads: LeadRow[];
  allLeads: LeadRow[];
  names: Record<string, string>;
  canWrite: boolean;
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{
    rows: Parsed[];
    skipped: { line: number; reason: string }[];
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const exportLeads = () => {
    if (leads.length === 0) {
      toast.error("No leads match the current filters");
      return;
    }
    const rows = leads.map((l) => [
      l.name ?? "",
      l.phone ?? "",
      l.machine_interest ?? "",
      l.location ?? "",
      l.source ?? "",
      LEAD_STAGE_LABEL[l.stage] ?? l.stage,
      l.deal_value ?? "",
      (l.rep_id && names[l.rep_id]) || "",
      l.follow_up_due_at ? l.follow_up_due_at.slice(0, 10) : "",
      l.created_at.slice(0, 10),
    ]);
    downloadCsv(`house-of-maji-leads-${todayStamp()}.csv`, toCsv(HEADERS, rows));
    toast.success(`Exported ${leads.length} leads`);
  };

  const onFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!, { defval: "" });

      const existing = new Set(allLeads.map((l) => normalizePhone(l.phone)));
      const rows: Parsed[] = [];
      const skipped: { line: number; reason: string }[] = [];

      raw.forEach((r, i) => {
        const line = i + 2;
        const phone = normalizePhone(pick(r, ["phone", "phonenumber", "mobile", "contact", "tel"]));
        const name = pick(r, ["name", "clientname", "fullname", "client", "leadname"]);
        if (!phone) {
          skipped.push({ line, reason: "missing phone" });
          return;
        }
        if (phone.replace(/\D/g, "").length < 7) {
          skipped.push({ line, reason: `invalid phone "${phone}"` });
          return;
        }
        if (existing.has(phone)) {
          skipped.push({ line, reason: `duplicate phone ${phone}` });
          return;
        }
        existing.add(phone);
        const value = pick(r, ["dealvalue", "value", "amount", "price"]).replace(/[^\d.]/g, "");
        rows.push({
          name: name || phone,
          phone,
          machine_interest:
            pick(r, ["machineinterest", "machine", "interest", "product"]) || null,
          location: pick(r, ["location", "area", "county", "town"]) || null,
          source: pick(r, ["source", "channel"]).toLowerCase() || null,
          stage: normalizeStage(pick(r, ["stage", "status"])),
          deal_value: value ? Number(value) : null,
        });
      });

      if (rows.length === 0 && skipped.length === 0) {
        toast.error("No rows found in that file");
        return;
      }
      setPreview({ rows, skipped });
    } catch (e) {
      toast.error((e as Error).message || "Could not read that file");
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setSaving(true);
    const { error } = await supabase
      .from("leads")
      .insert(preview.rows.map((r) => ({ ...r, rep_id: profile?.id ?? null })));
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Imported ${preview.rows.length} leads`);
    setPreview(null);
    qc.invalidateQueries({ queryKey: ["crm-leads"] });
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={exportLeads}>
        <Download className="h-4 w-4" /> Export
      </Button>
      {canWrite && (
        <>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onFile(f);
            }}
          />
        </>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import preview</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {preview?.rows.length ?? 0} leads ready to import · {preview?.skipped.length ?? 0}{" "}
            skipped. Imported leads are assigned to you and can be reassigned afterwards.
          </p>

          {!!preview?.rows.length && (
            <div className="surface-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Machine</th>
                    <th className="px-3 py-2">Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 25).map((r, i) => (
                    <tr key={`${r.phone}-${i}`} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2">{r.phone}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.machine_interest ?? "—"}</td>
                      <td className="px-3 py-2">{LEAD_STAGE_LABEL[r.stage] ?? r.stage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 25 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  + {preview.rows.length - 25} more…
                </p>
              )}
            </div>
          )}

          {!!preview?.skipped.length && (
            <div className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">Skipped rows</p>
              {preview.skipped.slice(0, 15).map((s) => (
                <p key={s.line}>
                  Row {s.line}: {s.reason}
                </p>
              ))}
              {preview.skipped.length > 15 && <p>+ {preview.skipped.length - 15} more…</p>}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPreview(null)}>
              Cancel
            </Button>
            <Button onClick={confirmImport} disabled={saving || !preview?.rows.length}>
              {saving ? "Importing…" : `Import ${preview?.rows.length ?? 0} leads`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
