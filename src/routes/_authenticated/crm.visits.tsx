import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, Plus } from "lucide-react";
import { CrmShell, CrmCard, MiniTile, Bar, Badge } from "@/components/crm-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/format";
import { isCrmManager, label, BADGE_GOOD, BADGE_WARN, BADGE_NEUTRAL } from "@/lib/crm";
import { useLeads, useTeam, useCrmMutation, nameOf } from "@/hooks/use-crm";
import {
  useSiteVisits,
  useVisitPhotos,
  useSignedUrl,
  uploadToBucket,
  PHOTO_BUCKET,
  VISIT_TYPES,
  VISIT_STATUSES,
  type SiteVisit,
  type ChecklistItem,
  type SiteVisitPhoto,
} from "@/hooks/use-crm-extra";

export const Route = createFileRoute("/_authenticated/crm/visits")({
  head: () => ({
    meta: [
      { title: "Site Visits — House of Maji CRM" },
      {
        name: "description",
        content:
          "File installation, maintenance, repair and inspection visit reports with checklists and site photos.",
      },
      { property: "og:title", content: "Site Visits — House of Maji CRM" },
      {
        property: "og:description",
        content: "Engineer visit reports, installation checklists and site photos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VisitsPage,
});

const statusBadge = (s: string) => (s === "completed" ? BADGE_GOOD : BADGE_WARN);

function VisitsPage() {
  const { profile } = useAuth();
  const manager = isCrmManager(profile?.role);
  const { data: visits = [] } = useSiteVisits();
  const { data: team = [] } = useTeam();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<SiteVisit | null>(null);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [engineer, setEngineer] = useState("all");

  const engineers = team.filter((t) => t.role === "engineer" || t.role === "chief_engineer");

  const filtered = useMemo(
    () =>
      visits.filter(
        (v) =>
          (type === "all" || v.visit_type === type) &&
          (status === "all" || v.status === status) &&
          (engineer === "all" || v.engineer_id === engineer),
      ),
    [visits, type, status, engineer],
  );

  const completed = visits.filter((v) => v.status === "completed").length;

  return (
    <CrmShell
      title="Site visits"
      subtitle={manager ? "Every engineer's visit reports" : "Your visit reports"}
      actions={
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New visit
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="surface-card flex flex-wrap items-center gap-2 p-3">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[11rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All visit types</SelectItem>
              {VISIT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {label(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[10rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {VISIT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {label(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {manager && (
            <Select value={engineer} onValueChange={setEngineer}>
              <SelectTrigger className="w-[13rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All engineers</SelectItem>
                {engineers.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name || "Unnamed"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => {
            const items = Array.isArray(v.checklist) ? v.checklist : [];
            const done = items.filter((i) => i.checked).length;
            return (
              <button
                key={v.id}
                onClick={() => setOpen(v)}
                className="surface-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-tight">{v.client_name}</p>
                  <Badge className={statusBadge(v.status)}>{label(v.status)}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {label(v.visit_type)} · {formatDate(v.visit_date)}
                </p>
                <p className="mt-1 text-xs">{v.location || "No location"}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{nameOf(team, v.engineer_id)}</span>
                  {items.length > 0 && (
                    <span className="font-semibold text-foreground">
                      {done}/{items.length} checked
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="surface-card p-6 text-center text-sm text-muted-foreground">
              No visit reports yet.
            </p>
          )}
        </div>

        {manager && (
          <CrmCard title="Site visit summary">
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniTile label="Total visits" value={String(visits.length)} />
              <MiniTile label="Completed" value={String(completed)} tone="good" />
              <MiniTile
                label="Scheduled"
                value={String(visits.length - completed)}
                tone="warn"
              />
            </div>
            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">By visit type</h3>
                {VISIT_TYPES.map((t) => {
                  const c = visits.filter((v) => v.visit_type === t).length;
                  return (
                    <Bar
                      key={t}
                      label={label(t)}
                      value={c}
                      max={Math.max(
                        1,
                        ...VISIT_TYPES.map((x) => visits.filter((v) => v.visit_type === x).length),
                      )}
                      sub={String(c)}
                    />
                  );
                })}
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">By engineer</h3>
                {engineers.map((e) => {
                  const c = visits.filter((v) => v.engineer_id === e.id).length;
                  return (
                    <Bar
                      key={e.id}
                      label={e.full_name || "Unnamed"}
                      value={c}
                      max={Math.max(
                        1,
                        ...engineers.map((x) => visits.filter((v) => v.engineer_id === x.id).length),
                      )}
                      sub={String(c)}
                    />
                  );
                })}
                {engineers.length === 0 && (
                  <p className="text-xs text-muted-foreground">No engineers on the team yet.</p>
                )}
              </div>
            </div>
          </CrmCard>
        )}
      </div>

      {creating && <NewVisitDialog onClose={() => setCreating(false)} />}
      {open && (
        <VisitDetail
          visit={visits.find((v) => v.id === open.id) ?? open}
          onClose={() => setOpen(null)}
        />
      )}
    </CrmShell>
  );
}

function NewVisitDialog({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const { data: team = [] } = useTeam();
  const { data: leads = [] } = useLeads();
  const create = useCrmMutation("site_visits", ["crm-site-visits"]);
  const engineers = team.filter((t) => t.role === "engineer" || t.role === "chief_engineer");
  const [f, setF] = useState({
    client_name: "",
    location: "",
    visit_type: "installation",
    engineer_id: profile?.id ?? "none",
    visit_date: new Date().toISOString().slice(0, 10),
    deal_id: "none",
    notes: "",
    status: "scheduled",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!f.client_name.trim()) {
      toast.error("Client name is required");
      return;
    }
    create.mutate(
      {
        type: "insert",
        values: {
          client_name: f.client_name.trim(),
          location: f.location.trim() || null,
          visit_type: f.visit_type,
          engineer_id: f.engineer_id === "none" ? null : f.engineer_id,
          visit_date: f.visit_date,
          deal_id: f.deal_id === "none" ? null : f.deal_id,
          notes: f.notes.trim() || null,
          status: f.status,
          created_by: profile?.id ?? null,
        },
      },
      {
        onSuccess: () => {
          toast.success("Visit report created");
          onClose();
        },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New site visit</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Client name</Label>
            <Input value={f.client_name} onChange={(e) => set("client_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={f.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Visit date</Label>
            <Input
              type="date"
              value={f.visit_date}
              onChange={(e) => set("visit_date", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Visit type</Label>
            <Select value={f.visit_type} onValueChange={(v) => set("visit_type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {label(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {label(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Engineer</Label>
            <Select value={f.engineer_id} onValueChange={(v) => set("engineer_id", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {engineers.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name || "Unnamed"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Linked deal</Label>
            <Select value={f.deal_id} onValueChange={(v) => set("deal_id", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No deal</SelectItem>
                {leads.slice(0, 100).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name || l.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            Create visit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VisitDetail({ visit, onClose }: { visit: SiteVisit; onClose: () => void }) {
  const { profile } = useAuth();
  const { data: team = [] } = useTeam();
  const update = useCrmMutation("site_visits", ["crm-site-visits"]);
  const addPhoto = useCrmMutation("site_visit_photos", ["crm-visit-photos"]);
  const { data: photos = [] } = useVisitPhotos(visit.id);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const items: ChecklistItem[] = Array.isArray(visit.checklist) ? visit.checklist : [];

  const patch = (values: Record<string, unknown>) =>
    update.mutate(
      { type: "update", id: visit.id, values },
      { onError: (e: unknown) => toast.error((e as Error).message) },
    );

  const setItem = (key: string, next: Partial<ChecklistItem>) =>
    patch({ checklist: items.map((i) => (i.item_key === key ? { ...i, ...next } : i)) });

  const onFile = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadToBucket(PHOTO_BUCKET, file, visit.id);
      await new Promise<void>((resolve, reject) =>
        addPhoto.mutate(
          {
            type: "insert",
            values: {
              site_visit_id: visit.id,
              photo_url: path,
              caption: caption.trim() || null,
              uploaded_by: profile?.id ?? null,
            },
          },
          { onSuccess: () => resolve(), onError: (e) => reject(e as Error) },
        ),
      );
      setCaption("");
      toast.success("Photo attached");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{visit.client_name}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Type:</span> {label(visit.visit_type)}
            </p>
            <p>
              <span className="text-muted-foreground">Date:</span> {formatDate(visit.visit_date)}
            </p>
            <p>
              <span className="text-muted-foreground">Location:</span> {visit.location || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Engineer:</span>{" "}
              {nameOf(team, visit.engineer_id)}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={visit.status} onValueChange={(v) => patch({ status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {label(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge className={statusBadge(visit.status)}>{label(visit.status)}</Badge>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border p-3">
          <h3 className="text-sm font-semibold">Checklist</h3>
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No checklist items for this visit type — use the notes below.
            </p>
          )}
          {items.map((i) => (
            <div key={i.item_key} className="rounded-lg border border-border p-2">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={i.checked}
                  onCheckedChange={(c) => setItem(i.item_key, { checked: !!c })}
                  className="mt-0.5"
                />
                <span>{i.label}</span>
              </label>
              <Input
                defaultValue={i.notes ?? ""}
                placeholder="Item note (optional)"
                className="mt-2 h-8 text-xs"
                onBlur={(e) => setItem(i.item_key, { notes: e.target.value || null })}
              />
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label>Visit notes</Label>
          <Textarea
            defaultValue={visit.notes ?? ""}
            rows={3}
            onBlur={(e) => patch({ notes: e.target.value || null })}
          />
        </div>

        <div className="space-y-2 rounded-xl border border-border p-3">
          <h3 className="text-sm font-semibold">Photos</h3>
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption for the next photo (optional)"
          />
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary">
            <Camera className="h-4 w-4" />
            {uploading ? "Uploading…" : "Add photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((p) => (
              <PhotoTile key={p.id} photo={p} />
            ))}
          </div>
          {photos.length === 0 && (
            <p className="text-xs text-muted-foreground">No photos attached yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PhotoTile({ photo }: { photo: SiteVisitPhoto }) {
  const { data: url } = useSignedUrl(PHOTO_BUCKET, photo.photo_url);
  return (
    <figure className="overflow-hidden rounded-lg border border-border">
      {url ? (
        <img
          src={url}
          alt={photo.caption || "Site visit photo"}
          loading="lazy"
          className="h-28 w-full object-cover"
        />
      ) : (
        <div className="h-28 w-full animate-pulse bg-secondary" />
      )}
      <figcaption className="truncate p-1.5 text-[0.7rem] text-muted-foreground">
        {photo.caption || formatDate(photo.uploaded_at)}
      </figcaption>
    </figure>
  );
}

export { statusBadge as visitStatusBadge, BADGE_NEUTRAL as visitNeutralBadge };
