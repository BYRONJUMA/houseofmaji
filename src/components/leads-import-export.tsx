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
import { useMachineTypes } from "@/hooks/use-crm-extra";

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
  budget_range?: string | null;
  created_at: string;
};

type Parsed = {
  name: string;
  phone: string;
  machine_interest: string | null;
  location: string | null;
  stage: string;
  budget_range: string | null;
  follow_up_due_at: string | null;
  rep_id: string | null;
};

type PreviewRow = { line: number; row: Parsed; flags: string[]; skipped: boolean };

const HEADERS = [
  "Lead Status",
  "Client Name",
  "Client Contact",
  "Client Location",
  "Lead Owner Name",
  "Budget Range",
  "Type of Machine",
  "Next Follow-up Date",
];

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_\-.()/]+/g, "");

/** Find the actual header key in a row for a set of normalized aliases. */
function findHeader(row: Record<string, unknown>, keys: string[]) {
  const cols = Object.keys(row);
  const exact = cols.find((k) => keys.includes(norm(k)));
  if (exact) return exact;
  // tolerate extra words in the header, e.g. "Lead Status (pipeline)"
  return cols.find((k) => keys.some((key) => norm(k).includes(key))) ?? null;
}

function pick(row: Record<string, unknown>, keys: string[]) {
  const k = findHeader(row, keys);
  if (!k) return "";
  const v = row[k];
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function normalizePhone(v: unknown) {
  return String(v ?? "")
    .replace(/[^\d+]/g, "")
    .trim();
}

/** Map real-world business text to one of the 5 stages; null when unrecognized. */
function matchStage(v: string): string | null {
  const s = norm(v);
  if (!s) return null;
  if (s.includes("notwon") || s.includes("lost")) return "not_won";
  if (s.includes("won")) return "won";
  if (s.includes("hot")) return "hot";
  if (s.includes("warm")) return "warm";
  if (s.includes("new")) return "new";
  const found = (LEAD_STAGES as readonly string[]).find((st) => norm(st) === s.replace(/^lead/, ""));
  return found ?? null;
}

/** Levenshtein distance based similarity 0..1 */
function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return 1 - prev[n]! / Math.max(m, n);
}


/** Parse DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD and Excel serial dates. */
function parseDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 60000) {
      const ms = Math.round((serial - 25569) * 86400000);
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (m) {
    let [a, b] = [Number(m[1]), Number(m[2])];
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    // ambiguous → prefer DD/MM/YYYY unless the first part can't be a day
    if (a > 12 && b > 12) return null;
    if (a > 12) [a, b] = [b, a];
    else if (b > 12) {
      // b is the day → a is month (MM/DD)
      const d = new Date(year, a - 1, b);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    const d = new Date(year, b - 1, a);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
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
  const { data: machineTypes = [] } = useMachineTypes();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  const exportLeads = () => {
    if (leads.length === 0) {
      toast.error("No leads match the current filters");
      return;
    }
    const rows = leads.map((l) => [
      LEAD_STAGE_LABEL[l.stage] ?? l.stage,
      l.name ?? "",
      l.phone ?? "",
      l.location ?? "",
      (l.rep_id && names[l.rep_id]) || "",
      l.budget_range ?? "",
      l.machine_interest ?? "",
      l.follow_up_due_at ? l.follow_up_due_at.slice(0, 10) : "",
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

      const ownerByName = new Map<string, string>();
      for (const [id, full] of Object.entries(names)) ownerByName.set(norm(full), id);
      const typeByName = new Map<string, string>();
      for (const t of machineTypes as { name: string }[]) typeByName.set(norm(t.name), t.name);

      const cutoff = Date.now() - 48 * 3600 * 1000;
      const recentPhones = new Set(
        allLeads
          .filter((l) => new Date(l.created_at).getTime() >= cutoff)
          .map((l) => normalizePhone(l.phone)),
      );

      const A = {
        name: ["clientname", "name", "fullname", "client", "leadname"],
        phone: ["clientcontact", "phone", "mobile", "phonenumber", "contact", "tel"],
        stage: ["leadstatus", "status", "stage", "leadstage", "pipelinestage"],
        owner: ["leadownername", "leadowner", "owner", "rep", "salesrep", "assignedto"],
        machine: ["typeofmachine", "machineinterest", "machine", "interest", "product"],
        date: [
          "nextfollowupdate",
          "followupdate",
          "nextfollowup",
          "followupdueat",
          "followup",
          "nextaction",
        ],
        location: ["clientlocation", "location", "area", "county", "town"],
        budget: ["budgetrange", "budget"],
      };

      const first = raw[0] ?? {};
      const detected = Object.fromEntries(
        Object.entries(A).map(([field, keys]) => [field, findHeader(first, keys) ?? "NOT FOUND"]),
      );
      console.info("[Leads import] file headers:", Object.keys(first));
      console.info("[Leads import] detected column per field:", detected);

      const out: PreviewRow[] = [];
      raw.forEach((r, i) => {
        const line = i + 2;
        const flags: string[] = [];
        const name = pick(r, A.name);
        const phone = normalizePhone(pick(r, A.phone));
        if (!name && !phone) {
          out.push({
            line,
            row: {
              name: "",
              phone: "",
              machine_interest: null,
              location: null,
              stage: "new",
              budget_range: null,
              follow_up_due_at: null,
              rep_id: null,
            },
            flags: ["Skipped — missing name and contact"],
            skipped: true,
          });
          return;
        }

        const statusText = pick(r, A.stage);
        const stage = matchStage(statusText);
        if (!stage)
          flags.push(`Unrecognized status "${statusText || "(blank)"}" — defaulted to New`);

        const ownerName = pick(r, A.owner);
        let rep_id: string | null = null;
        if (ownerName) {
          rep_id = ownerByName.get(norm(ownerName)) ?? null;
          if (!rep_id) {
            let best: { id: string; full: string; score: number } | null = null;
            for (const [id, full] of Object.entries(names)) {
              const score = similarity(norm(ownerName), norm(full));
              if (!best || score > best.score) best = { id, full, score };
            }
            if (best && best.score >= 0.8) {
              rep_id = best.id;
              flags.push(`Owner "${ownerName}" matched to "${best.full}" — confirm this is correct`);
            } else {
              flags.push(`Owner "${ownerName}" not found — imported as unassigned`);
            }
          }
        }

        const machineText = pick(r, A.machine);
        let machine_interest: string | null = null;
        if (machineText) {
          const matched = typeByName.get(norm(machineText));
          machine_interest = matched ?? machineText;
          if (!matched) flags.push("Unmatched machine type — check taxonomy");
        }

        const dateText = pick(r, A.date);
        let follow_up_due_at: string | null = null;
        if (dateText) {
          follow_up_due_at = parseDate(dateText);
          if (!follow_up_due_at) flags.push(`Invalid date "${dateText}" — follow-up left blank`);
        }


        if (phone && recentPhones.has(phone)) flags.push("Duplicate phone (48h)");
        if (phone) recentPhones.add(phone);

        out.push({
          line,
          row: {
            name: name || phone,
            phone,
            machine_interest,
            location: pick(r, ["clientlocation", "location", "area", "county", "town"]) || null,
            stage: stage ?? "new",
            budget_range: pick(r, ["budgetrange", "budget"]) || null,
            follow_up_due_at,
            rep_id,
          },
          flags,
          skipped: false,
        });
      });

      if (out.length === 0) {
        toast.error("No rows found in that file");
        return;
      }
      setPreview(out);
    } catch (e) {
      toast.error((e as Error).message || "Could not read that file");
    }
  };

  const importable = (preview ?? []).filter((p) => !p.skipped);
  const warned = importable.filter((p) => p.flags.length > 0).length;
  const skippedCount = (preview ?? []).length - importable.length;

  const confirmImport = async () => {
    if (!preview) return;
    setSaving(true);
    const { error } = await supabase.from("leads").insert(
      importable.map((p) => ({
        ...p.row,
        rep_id: p.row.rep_id ?? (p.flags.some((f) => f.startsWith("Owner")) ? null : (profile?.id ?? null)),
      })),
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      `${importable.length} leads imported (${warned} with warnings, ${skippedCount} skipped)`,
    );
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
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import preview</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {importable.length} leads ready to import ({warned} with warnings) · {skippedCount}{" "}
            skipped. Warnings are informational — flagged rows still import.
          </p>

          <div className="surface-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Machine</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Follow-up</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(preview ?? []).map((p) => (
                  <tr key={p.line} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{p.line}</td>
                    <td className="px-3 py-2 font-medium">{p.row.name || "—"}</td>
                    <td className="px-3 py-2">{p.row.phone || "—"}</td>
                    <td className="px-3 py-2">{LEAD_STAGE_LABEL[p.row.stage] ?? p.row.stage}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {p.row.machine_interest ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {p.flags.length === 0 ? (
                        <span className="text-success">Ready</span>
                      ) : (
                        <span className={p.skipped ? "text-destructive" : "text-warning"}>
                          {p.flags.join(" · ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPreview(null)}>
              Cancel
            </Button>
            <Button onClick={confirmImport} disabled={saving || importable.length === 0}>
              {saving ? "Importing…" : `Import ${importable.length} leads`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
