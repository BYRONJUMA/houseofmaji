import { useEffect, useState } from "react";
import { Download, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { SignaturePad } from "@/components/signature-pad";
import { useAuth } from "@/hooks/use-auth";
import {
  useDeliveryChecklist,
  useSaveChecklist,
  type ChecklistPatch,
} from "@/hooks/use-delivery-checklist";
import {
  CHECKLIST_SECTIONS,
  TOTAL_ROWS,
  filledRowCount,
  type ChecklistCell,
  type ChecklistSections,
} from "@/lib/checklist-schema";
import { downloadChecklistPdf, type ChecklistPdfMeta } from "@/lib/checklist-pdf";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Fulfillment = {
  id: string;
  client_name: string;
  location: string;
  client_contact: string | null;
  machine_type: string;
  capacity_lph?: number | string | null;
  current_stage: string;
  assembly_engineer_id: string | null;
  installation_engineer_id: string | null;
};

export function DeliveryChecklistPanel({
  fulfillment,
  names,
}: {
  fulfillment: Fulfillment;
  names: Record<string, string>;
}) {
  const { profile } = useAuth();
  const { data: checklist, isLoading } = useDeliveryChecklist(fulfillment.id);
  const save = useSaveChecklist(fulfillment.id);

  const canEdit =
    profile?.role === "engineer" || profile?.role === "chief_engineer" || profile?.role === "admin";
  const available = ["assembling", "delivery", "installed"].includes(fulfillment.current_stage);
  const capacity =
    fulfillment.capacity_lph != null
      ? String(fulfillment.capacity_lph)
      : checklist?.capacity_lph != null
        ? String(checklist.capacity_lph)
        : "";

  const sections = (checklist?.sections ?? {}) as ChecklistSections;
  const filled = filledRowCount(sections);

  const engineerId = fulfillment.installation_engineer_id ?? fulfillment.assembly_engineer_id;
  const meta: ChecklistPdfMeta = {
    deliveryNo: checklist?.delivery_no ?? "",
    dateDelivered: checklist?.date_delivered ?? null,
    clientName: fulfillment.client_name,
    projectSite: fulfillment.location,
    clientContact: fulfillment.client_contact ?? "",
    machineType: fulfillment.machine_type,
    capacityLph: capacity,
    machineSerialNo: checklist?.machine_serial_no ?? "",
    deliveredBy: (engineerId && names[engineerId]) || "",
  };

  const patch = (p: ChecklistPatch) => {
    if (!checklist) return;
    save.mutate(
      { checklistId: checklist.id, patch: p },
      { onError: (e: unknown) => toast.error((e as Error).message ?? "Could not save") },
    );
  };

  const setCell = (sectionKey: string, rowKey: string, cell: Partial<ChecklistCell>) => {
    const next: ChecklistSections = {
      ...sections,
      [sectionKey]: {
        ...(sections[sectionKey] ?? {}),
        [rowKey]: { ...(sections[sectionKey]?.[rowKey] ?? {}), ...cell },
      },
    };
    patch({ sections: next });
  };

  const downloadBlank = () =>
    downloadChecklistPdf(meta, null, "blank").catch(() => toast.error("Could not build the PDF"));

  const downloadFilled = () =>
    downloadChecklistPdf(
      meta,
      {
        sections,
        remarks: checklist?.remarks ?? "",
        engineerName: checklist?.engineer_signoff_name ?? "",
        engineerAt: checklist?.engineer_signoff_at ?? null,
        clientSignature: checklist?.client_signature_data ?? null,
        clientAt: checklist?.client_signoff_at ?? null,
        chiefName: checklist?.chief_signoff_name ?? "",
        chiefAt: checklist?.chief_signoff_at ?? null,
      },
      "filled",
    ).catch(() => toast.error("Could not build the PDF"));

  if (!available) {
    return (
      <div className="surface-card space-y-4 p-6">
        <h2 className="text-lg font-semibold">Delivery Checklist & Handover Form</h2>
        <p className="text-sm text-muted-foreground">
          Available once assembly begins — this fulfillment is still at an earlier stage.
        </p>
        <Button variant="outline" size="sm" onClick={downloadBlank}>
          <Download className="mr-2 h-4 w-4" /> Download Blank Checklist (PDF)
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="surface-card space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Delivery Checklist & Handover Form</h2>
            <p className="text-sm text-muted-foreground">
              {canEdit
                ? "Fill sections in as you work — changes save automatically."
                : "Read-only — engineers and chief engineers can fill this in."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadBlank}>
              <Download className="mr-2 h-4 w-4" /> Blank (PDF)
            </Button>
            <Button variant="outline" size="sm" onClick={downloadFilled}>
              <Download className="mr-2 h-4 w-4" /> Filled (PDF)
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {filled} of {TOTAL_ROWS} rows completed
            </span>
            <span className="flex items-center gap-1">
              {save.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </>
              ) : checklist ? (
                <>
                  <Check className="h-3 w-3" /> Saved {formatDate(checklist.updated_at)}
                </>
              ) : null}
            </span>
          </div>
          <Progress value={(filled / TOTAL_ROWS) * 100} />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ReadOnly label="Delivery No. (auto)" value={checklist?.delivery_no ?? "—"} />
            <ReadOnly
              label="Machine serial no. (auto)"
              value={checklist?.machine_serial_no ?? "—"}
            />
            <ReadOnly
              label="Date delivered (auto)"
              value={checklist?.date_delivered ? formatDate(checklist.date_delivered) : "—"}
            />
            <ReadOnly label="Capacity (LPH)" value={capacity || "—"} />
            <ReadOnly label="Client" value={fulfillment.client_name} />
            <ReadOnly label="Project site" value={fulfillment.location} />
            <ReadOnly label="Client contact" value={fulfillment.client_contact ?? "—"} />
            <ReadOnly label="Delivered by" value={meta.deliveredBy || "—"} />
          </div>
        )}
      </div>

      {CHECKLIST_SECTIONS.map((section) => (
        <div key={section.key} className="surface-card overflow-hidden">
          <h3 className="border-b border-border px-5 py-3 text-sm font-semibold">
            {section.number}. {section.title}
          </h3>
          <div className="divide-y divide-border">
            {section.rows.map((row) => {
              const cell = sections[section.key]?.[row.key] ?? {};
              return (
                <div
                  key={row.key}
                  className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center"
                >
                  <div>
                    <p className="text-sm font-medium">{row.label}</p>
                    {section.hasStandard && (
                      <p className="text-xs text-muted-foreground">Standard: {row.standard}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {section.extra.map((extra) => (
                      <Input
                        key={extra.key}
                        aria-label={`${row.label} ${extra.label}`}
                        placeholder={extra.label}
                        defaultValue={cell[extra.key] ?? ""}
                        disabled={!canEdit}
                        className="h-9 w-28"
                        onBlur={(e) =>
                          e.target.value !== (cell[extra.key] ?? "") &&
                          setCell(section.key, row.key, { [extra.key]: e.target.value })
                        }
                      />
                    ))}
                    <div className="flex gap-1.5">
                      {section.statusOptions.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          disabled={!canEdit}
                          onClick={() =>
                            setCell(section.key, row.key, {
                              status: cell.status === opt ? undefined : opt,
                            })
                          }
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                            cell.status === opt
                              ? /not ok|missing|failed|fail|not provided|not done|not supplied/i.test(
                                  opt,
                                )
                                ? "border-destructive bg-destructive/12 text-destructive"
                                : "border-primary bg-primary/12 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/50",
                            !canEdit && "cursor-not-allowed opacity-70",
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  {section.hasRemarks ? (
                    <Input
                      aria-label={`${row.label} remarks`}
                      placeholder="Remarks"
                      defaultValue={cell.remarks ?? ""}
                      disabled={!canEdit}
                      className="h-9"
                      onBlur={(e) =>
                        e.target.value !== (cell.remarks ?? "") &&
                        setCell(section.key, row.key, { remarks: e.target.value })
                      }
                    />
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="surface-card space-y-5 p-5 sm:p-6">
        <h3 className="text-sm font-semibold">9. Delivery &amp; Handover Approval</h3>
        <div className="space-y-1.5">
          <Label htmlFor="checklist-remarks">Remarks / notes</Label>
          <Textarea
            id="checklist-remarks"
            rows={3}
            defaultValue={checklist?.remarks ?? ""}
            disabled={!canEdit}
            onBlur={(e) =>
              e.target.value !== (checklist?.remarks ?? "") && patch({ remarks: e.target.value })
            }
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <SignOff
            title="Delivered & Installed By"
            name={checklist?.engineer_signoff_name ?? ""}
            at={checklist?.engineer_signoff_at ?? null}
            disabled={!canEdit || !checklist?.chief_signoff_at}
            note={!checklist?.chief_signoff_at ? "Waiting on Chief Engineer approval" : undefined}
            defaultName={profile?.full_name ?? ""}
            onSign={(name) =>
              patch({ engineer_signoff_name: name, engineer_signoff_at: new Date().toISOString() })
            }
          />

          <div className="space-y-2">
            <p className="text-sm font-semibold">Received By (Client)</p>
            <SignaturePad
              value={checklist?.client_signature_data ?? null}
              disabled={!canEdit}
              onChange={(dataUrl) =>
                patch({
                  client_signature_data: dataUrl,
                  client_signoff_at: dataUrl ? new Date().toISOString() : null,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              {checklist?.client_signoff_at
                ? `Signed ${formatDate(checklist.client_signoff_at)}`
                : "Awaiting client signature"}
            </p>
          </div>
          <SignOff
            title="Approved By (Chief Engineer)"
            name={checklist?.chief_signoff_name ?? ""}
            at={checklist?.chief_signoff_at ?? null}
            disabled={profile?.role !== "chief_engineer" && profile?.role !== "admin"}
            defaultName={profile?.full_name ?? ""}
            onSign={(name) =>
              patch({ chief_signoff_name: name, chief_signoff_at: new Date().toISOString() })
            }
          />
        </div>
      </div>
    </div>
  );
}

function SignOff({
  title,
  name,
  at,
  disabled,
  note,
  defaultName,
  onSign,
}: {
  title: string;
  name: string;
  at: string | null;
  disabled?: boolean;
  note?: string;
  defaultName: string;
  onSign: (name: string) => void;
}) {
  const [value, setValue] = useState(name || defaultName);
  useEffect(() => {
    if (name) setValue(name);
  }, [name]);

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      <Input
        aria-label={`${title} full name`}
        value={value}
        disabled={disabled}
        placeholder="Full name"
        onChange={(e) => setValue(e.target.value)}
      />
      {at ? (
        <p className="text-xs text-muted-foreground">Signed {formatDate(at)}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Not signed yet</p>
      )}
      {note && <p className="text-xs font-medium text-destructive">{note}</p>}
      {!disabled && (
        <Button size="sm" variant="outline" onClick={() => value.trim() && onSign(value.trim())}>
          {at ? "Update sign-off" : "Sign off"}
        </Button>
      )}
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm">{value}</p>
    </div>
  );
}
