import {
  ArrowRightLeft,
  BadgeCheck,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Flag,
  PenLine,
  Pencil,
  PackageCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { STAGE_LABEL, type Stage } from "@/lib/stages";
import { formatKES } from "@/lib/format";
import type { Payment } from "@/hooks/use-payments";
import type { DeliveryChecklist } from "@/hooks/use-delivery-checklist";
import { isChecklistComplete } from "@/lib/checklist-schema";

type StageEventRow = {
  id: string;
  stage: string;
  actor_id: string | null;
  entered_at: string;
  notes: string | null;
};

type Entry = {
  at: string;
  icon: ReactNode;
  title: string;
  who: string;
  detail?: string;
};

function stamp(value: string) {
  return new Date(value).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type FulfillmentEditRow = {
  id: string;
  actor_id: string | null;
  field_label: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
};

export function MachineHistory({
  events,
  payments,
  checklists,
  edits = [],
  names,
}: {
  events: StageEventRow[];
  payments: Payment[];
  checklists: DeliveryChecklist[];
  edits?: FulfillmentEditRow[];
  names: Record<string, string>;
}) {
  const who = (id: string | null | undefined) => (id && names[id]) || "System";
  const entries: Entry[] = [];

  for (const ev of events) {
    const label = STAGE_LABEL[ev.stage as Stage] ?? ev.stage;
    entries.push({
      at: ev.entered_at,
      icon:
        ev.stage === "assembling" ? (
          <PackageCheck className="h-4 w-4" />
        ) : ev.stage === "installed" ? (
          <Flag className="h-4 w-4" />
        ) : (
          <BadgeCheck className="h-4 w-4" />
        ),
      title:
        ev.stage === "assembling"
          ? "Machine received by engineer — assembly started"
          : `Stage entered: ${label}`,
      who: who(ev.actor_id),
    });

    for (const line of (ev.notes ?? "").split("\n").filter((l) => l.trim())) {
      if (line.startsWith("Reassigned")) {
        entries.push({
          at: ev.entered_at,
          icon: <ArrowRightLeft className="h-4 w-4" />,
          title: "Engineer reassigned",
          who: "Chief engineer",
          detail: line,
        });
      }
    }
  }

  for (const p of payments) {
    entries.push({
      at: p.paid_at,
      icon: <CreditCard className="h-4 w-4" />,
      title: `Payment recorded — ${formatKES(p.amount)}`,
      who: who(p.recorded_by),
      detail: p.notes ?? undefined,
    });
  }

  for (const checklist of checklists) {
    entries.push({
      at: checklist.started_at,
      icon: <ClipboardList className="h-4 w-4" />,
      title: `Delivery checklist started (${checklist.delivery_no})`,
      who: who(checklist.started_by),
    });
    if (checklist.completed_at && isChecklistComplete(checklist.sections ?? {})) {
      entries.push({
        at: checklist.completed_at,
        icon: <ClipboardCheck className="h-4 w-4" />,
        title: `Delivery checklist completed (${checklist.machine_serial_no ?? checklist.delivery_no})`,
        who: "Delivery team",
      });
    }
    if (checklist.engineer_signoff_at) {
      entries.push({
        at: checklist.engineer_signoff_at,
        icon: <PenLine className="h-4 w-4" />,
        title: "Sign-off: Delivered & installed by",
        who: checklist.engineer_signoff_name ?? "Engineer",
      });
    }
    if (checklist.client_signoff_at) {
      entries.push({
        at: checklist.client_signoff_at,
        icon: <PenLine className="h-4 w-4" />,
        title: "Sign-off: Received by client",
        who: "Client (signature captured)",
      });
    }
    if (checklist.chief_signoff_at) {
      entries.push({
        at: checklist.chief_signoff_at,
        icon: <PenLine className="h-4 w-4" />,
        title: "Sign-off: Approved by chief engineer",
        who: checklist.chief_signoff_name ?? "Chief engineer",
      });
    }
  }

  for (const edit of edits) {
    entries.push({
      at: edit.changed_at,
      icon: <Pencil className="h-4 w-4" />,
      title: `Order details edited — ${edit.field_label}`,
      who: who(edit.actor_id),
      detail: `${edit.old_value ?? "—"} → ${edit.new_value ?? "—"}`,
    });
  }

  entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <div className="surface-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Machine History</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Full audit trail for this machine, oldest first.
      </p>
      {entries.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <ol className="mt-6 space-y-0">
          {entries.map((e, i) => (
            <li key={`${e.at}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
              {i < entries.length - 1 && (
                <span className="absolute left-[15px] top-8 h-full w-[2px] bg-border" aria-hidden />
              )}
              <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary">
                {e.icon}
              </span>
              <div className="min-w-0 pt-1">
                <p className="text-sm font-medium">{e.title}</p>
                <p className="text-xs text-muted-foreground">
                  {e.who} · <span className="tabular-nums">{stamp(e.at)}</span>
                </p>
                {e.detail && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    {e.detail}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
