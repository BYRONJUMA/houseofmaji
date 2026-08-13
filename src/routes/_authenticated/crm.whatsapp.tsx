import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Inbox, Plus, Send, Trash2 } from "lucide-react";
import { CrmShell, CrmCard, Badge } from "@/components/crm-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { isCrmManager, isCrmMember, BADGE_GOOD, BADGE_NEUTRAL, BADGE_WARN } from "@/lib/crm";
import { useCrmMutation } from "@/hooks/use-crm";
import {
  useWaRecipients,
  useWaSequences,
  useWaSteps,
  type WaSequence,
} from "@/hooks/use-crm-extra";

export const Route = createFileRoute("/_authenticated/crm/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp — House of Maji CRM" },
      {
        name: "description",
        content:
          "WhatsApp inbox mirror, recipient lists and drip sequences for the House of Maji sales team.",
      },
      { property: "og:title", content: "WhatsApp — House of Maji CRM" },
      {
        property: "og:description",
        content: "Manage recipient lists and drip message sequences.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WhatsAppPage,
});

type Tab = "inbox" | "recipients" | "sequences";

function WhatsAppPage() {
  const { profile } = useAuth();
  const canEdit = isCrmManager(profile?.role);
  const [tab, setTab] = useState<Tab>("inbox");

  if (!isCrmMember(profile?.role)) {
    return (
      <CrmShell title="WhatsApp" showBack>
        <CrmCard>
          <p className="text-sm text-muted-foreground">
            Only the sales team can access WhatsApp outreach.
          </p>
        </CrmCard>
      </CrmShell>
    );
  }

  return (
    <CrmShell title="WhatsApp" subtitle="Inbox mirror, recipients and drip sequences" showBack>
      <div className="space-y-5">
        <div className="flex rounded-lg border border-border p-0.5">
          {(["inbox", "recipients", "sequences"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "inbox" && <InboxMirror />}
        {tab === "recipients" && <Recipients canEdit={canEdit} />}
        {tab === "sequences" && <Sequences canEdit={canEdit} />}
      </div>
    </CrmShell>
  );
}

function InboxMirror() {
  return (
    <CrmCard title="Inbox mirror">
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
          <Inbox className="h-6 w-6 text-muted-foreground" />
        </span>
        <p className="text-sm font-semibold">No conversations mirrored yet</p>
        <p className="max-w-md text-xs text-muted-foreground">
          The inbox mirrors WhatsApp Business conversations once Meta Business API credentials are
          connected. Recipients and sequences below are your own data and are fully editable now —
          only the actual sending and inbox sync need those credentials.
        </p>
      </div>
    </CrmCard>
  );
}

function Recipients({ canEdit }: { canEdit: boolean }) {
  const { data: recipients = [] } = useWaRecipients();
  const mutate = useCrmMutation("whatsapp_recipients", ["crm-wa-recipients"]);
  const [f, setF] = useState({ name: "", phone: "", region: "" });

  const add = () => {
    if (!f.name.trim() || !f.phone.trim()) {
      toast.error("Name and phone are required");
      return;
    }
    mutate.mutate(
      {
        type: "insert",
        values: { name: f.name.trim(), phone: f.phone.trim(), region: f.region.trim() || null },
      },
      {
        onSuccess: () => {
          setF({ name: "", phone: "", region: "" });
          toast.success("Recipient added");
        },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  const patch = (id: string, values: Record<string, unknown>) =>
    mutate.mutate(
      { type: "update", id, values },
      { onError: (e: unknown) => toast.error((e as Error).message) },
    );

  return (
    <CrmCard title={`Recipient list (${recipients.length})`}>
      {canEdit && (
        <div className="mb-4 grid gap-2 sm:grid-cols-4">
          <Input
            placeholder="Name"
            value={f.name}
            onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            placeholder="Phone"
            value={f.phone}
            onChange={(e) => setF((p) => ({ ...p, phone: e.target.value }))}
          />
          <Input
            placeholder="Region"
            value={f.region}
            onChange={(e) => setF((p) => ({ ...p, region: e.target.value }))}
          />
          <Button onClick={add} disabled={mutate.isPending}>
            <Plus className="h-4 w-4" /> Add recipient
          </Button>
        </div>
      )}
      <div className="space-y-2">
        {recipients.map((r) => (
          <div
            key={r.id}
            className="grid items-center gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto]"
          >
            <Input
              defaultValue={r.name}
              disabled={!canEdit}
              className="h-8 text-sm"
              onBlur={(e) => e.target.value.trim() !== r.name && patch(r.id, { name: e.target.value.trim() })}
            />
            <Input
              defaultValue={r.phone}
              disabled={!canEdit}
              className="h-8 text-sm"
              onBlur={(e) => e.target.value.trim() !== r.phone && patch(r.id, { phone: e.target.value.trim() })}
            />
            <Input
              defaultValue={r.region ?? ""}
              disabled={!canEdit}
              placeholder="Region"
              className="h-8 text-sm"
              onBlur={(e) => patch(r.id, { region: e.target.value.trim() || null })}
            />
            <button disabled={!canEdit} onClick={() => patch(r.id, { active: !r.active })}>
              <Badge className={r.active ? BADGE_GOOD : BADGE_NEUTRAL}>
                {r.active ? "Active" : "Inactive"}
              </Badge>
            </button>
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove recipient"
                onClick={() =>
                  mutate.mutate(
                    { type: "delete", id: r.id },
                    { onError: (e: unknown) => toast.error((e as Error).message) },
                  )
                }
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
        {recipients.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">No recipients yet.</p>
        )}
      </div>
    </CrmCard>
  );
}

function Sequences({ canEdit }: { canEdit: boolean }) {
  const { data: sequences = [] } = useWaSequences();
  const mutate = useCrmMutation("whatsapp_sequences", ["crm-wa-sequences"]);
  const [name, setName] = useState("");

  return (
    <div className="space-y-4">
      {canEdit && (
        <CrmCard title="New drip sequence">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Sequence name (e.g. Schools warm-up)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-[16rem] flex-1"
            />
            <Button
              onClick={() => {
                if (!name.trim()) return;
                mutate.mutate(
                  { type: "insert", values: { name: name.trim() } },
                  {
                    onSuccess: () => {
                      setName("");
                      toast.success("Sequence created");
                    },
                    onError: (e: unknown) => toast.error((e as Error).message),
                  },
                );
              }}
              disabled={mutate.isPending}
            >
              <Plus className="h-4 w-4" /> Create
            </Button>
          </div>
        </CrmCard>
      )}
      {sequences.map((s) => (
        <SequenceCard key={s.id} sequence={s} canEdit={canEdit} />
      ))}
      {sequences.length === 0 && (
        <p className="surface-card p-6 text-center text-sm text-muted-foreground">
          No drip sequences yet.
        </p>
      )}
    </div>
  );
}

function SequenceCard({ sequence, canEdit }: { sequence: WaSequence; canEdit: boolean }) {
  const { data: allSteps = [] } = useWaSteps();
  const steps = allSteps
    .filter((s) => s.sequence_id === sequence.id)
    .sort((a, b) => a.position - b.position);
  const seqMutate = useCrmMutation("whatsapp_sequences", ["crm-wa-sequences"]);
  const stepMutate = useCrmMutation("whatsapp_sequence_steps", ["crm-wa-steps"]);
  const [template, setTemplate] = useState("");
  const [delay, setDelay] = useState("24");

  const addStep = () => {
    if (!template.trim()) {
      toast.error("Add the message template text");
      return;
    }
    stepMutate.mutate(
      {
        type: "insert",
        values: {
          sequence_id: sequence.id,
          position: (steps.at(-1)?.position ?? 0) + 1,
          template_text: template.trim(),
          delay_hours: Number(delay) || 24,
        },
      },
      {
        onSuccess: () => {
          setTemplate("");
          toast.success("Step added");
        },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <CrmCard
      title={sequence.name}
      action={
        <div className="flex items-center gap-2">
          <button
            disabled={!canEdit}
            onClick={() =>
              seqMutate.mutate({ type: "update", id: sequence.id, values: { active: !sequence.active } })
            }
          >
            <Badge className={sequence.active ? BADGE_GOOD : BADGE_NEUTRAL}>
              {sequence.active ? "Active" : "Paused"}
            </Badge>
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast.info("Sending needs Meta Business API credentials — the sequence is saved.")
            }
          >
            <Send className="h-4 w-4" /> Send
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        {steps.map((s, idx) => (
          <div key={s.id} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Step {idx + 1}
              </span>
              <div className="flex items-center gap-2">
                <Badge className={BADGE_WARN}>after {s.delay_hours}h</Badge>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove step"
                    onClick={() =>
                      stepMutate.mutate(
                        { type: "delete", id: s.id },
                        { onError: (e: unknown) => toast.error((e as Error).message) },
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
            <Textarea
              defaultValue={s.template_text}
              disabled={!canEdit}
              rows={2}
              onBlur={(e) =>
                e.target.value.trim() !== s.template_text &&
                stepMutate.mutate({
                  type: "update",
                  id: s.id,
                  values: { template_text: e.target.value.trim() },
                })
              }
            />
            {canEdit && (
              <div className="mt-2 flex items-center gap-2">
                <Label className="text-xs">Delay (hours)</Label>
                <Input
                  type="number"
                  min={0}
                  defaultValue={s.delay_hours}
                  className="h-8 w-24 text-sm"
                  onBlur={(e) =>
                    stepMutate.mutate({
                      type: "update",
                      id: s.id,
                      values: { delay_hours: Number(e.target.value) || 0 },
                    })
                  }
                />
              </div>
            )}
          </div>
        ))}
        {steps.length === 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">No steps yet.</p>
        )}
      </div>

      {canEdit && (
        <div className="mt-3 space-y-2 rounded-xl border border-dashed border-border p-3">
          <Label className="text-xs">Add step</Label>
          <Textarea
            rows={2}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="Message template text"
          />
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={delay}
              onChange={(e) => setDelay(e.target.value)}
              className="h-9 w-28"
            />
            <span className="text-xs text-muted-foreground">hours after previous step</span>
            <Button size="sm" className="ml-auto" onClick={addStep} disabled={stepMutate.isPending}>
              <Plus className="h-4 w-4" /> Add step
            </Button>
          </div>
        </div>
      )}
    </CrmCard>
  );
}
