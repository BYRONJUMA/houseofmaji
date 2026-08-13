import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { CrmShell, CrmCard, MiniTile, Badge } from "@/components/crm-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/format";
import { isCrmManager, BADGE_GOOD, BADGE_NEUTRAL } from "@/lib/crm";
import { useLeads, useTeam, useCrmMutation, nameOf } from "@/hooks/use-crm";
import {
  useRecordings,
  useTranscripts,
  useSignedUrl,
  RECORDING_BUCKET,
  type Recording,
  type Transcript,
} from "@/hooks/use-crm-extra";

export const Route = createFileRoute("/_authenticated/crm/calls")({
  head: () => ({
    meta: [
      { title: "Call Reviews — Machines CRM" },
      {
        name: "description",
        content:
          "Uploaded sales call recordings with playback, transcripts, scores and coaching notes.",
      },
      { property: "og:title", content: "Call Reviews — Machines CRM" },
      {
        property: "og:description",
        content: "Review uploaded call recordings and attach coaching notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CallsPage,
});

function CallsPage() {
  const { profile } = useAuth();
  const manager = isCrmManager(profile?.role);
  const { data: recordings = [] } = useRecordings();
  const { data: transcripts = [] } = useTranscripts();
  const { data: team = [] } = useTeam();
  const { data: leads = [] } = useLeads();

  const byRecording = useMemo(() => {
    const m = new Map<string, Transcript>();
    for (const t of transcripts) if (!m.has(t.recording_id)) m.set(t.recording_id, t);
    return m;
  }, [transcripts]);

  const dealName = (id: string | null) => {
    if (!id) return "No deal";
    const l = leads.find((x) => x.id === id);
    return l ? l.name || l.phone : "Deal removed";
  };

  return (
    <CrmShell
      title="Call reviews"
      subtitle={manager ? "Every uploaded call recording" : "Your uploaded call recordings"}
      showBack
    >
      <div className="space-y-5">
        <CrmCard>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniTile label="Recordings" value={String(recordings.length)} />
            <MiniTile
              label="With transcript"
              value={String(transcripts.filter((t) => t.applied_at).length)}
              tone="good"
            />
            <MiniTile
              label="Awaiting review"
              value={String(recordings.length - byRecording.size)}
              tone="warn"
            />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Recordings are uploaded from a deal's detail view on the Leads page. Automatic
            transcription and AI scoring stay empty until speech-to-text and language-model
            credentials are connected — the transcript, score and coaching notes below can still be
            filled in and saved manually.
          </p>
        </CrmCard>

        <div className="space-y-3">
          {recordings.map((r) => (
            <RecordingRow
              key={r.id}
              recording={r}
              transcript={byRecording.get(r.id)}
              uploader={nameOf(team, r.uploaded_by)}
              deal={dealName(r.deal_id)}
            />
          ))}
          {recordings.length === 0 && (
            <p className="surface-card p-6 text-center text-sm text-muted-foreground">
              No call recordings uploaded yet.
            </p>
          )}
        </div>
      </div>
    </CrmShell>
  );
}

function RecordingRow({
  recording,
  transcript,
  uploader,
  deal,
}: {
  recording: Recording;
  transcript?: Transcript;
  uploader: string;
  deal: string;
}) {
  const { data: url } = useSignedUrl(RECORDING_BUCKET, recording.audio_file_url);
  const insert = useCrmMutation("transcripts", ["crm-transcripts"]);
  const update = useCrmMutation("transcripts", ["crm-transcripts"]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(transcript?.transcript_text ?? "");
  const [score, setScore] = useState(transcript?.score != null ? String(transcript.score) : "");
  const [notes, setNotes] = useState(transcript?.coaching_notes ?? "");

  const apply = () => {
    const values = {
      transcript_text: text.trim() || null,
      score: score === "" ? null : Number(score),
      coaching_notes: notes.trim() || null,
      applied_at: new Date().toISOString(),
    };
    const onDone = {
      onSuccess: () => toast.success("Transcript applied"),
      onError: (e: unknown) => toast.error((e as Error).message),
    };
    if (transcript) update.mutate({ type: "update", id: transcript.id, values }, onDone);
    else
      insert.mutate(
        { type: "insert", values: { ...values, recording_id: recording.id } },
        onDone,
      );
  };

  return (
    <div className="surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{deal}</p>
          <p className="text-xs text-muted-foreground">
            {uploader} · {formatDate(recording.created_at)}
          </p>
        </div>
        <Badge className={transcript?.applied_at ? BADGE_GOOD : BADGE_NEUTRAL}>
          {transcript?.applied_at ? "Reviewed" : "Not reviewed"}
        </Badge>
      </div>
      {url ? (
        <audio controls preload="none" src={url} className="mt-3 w-full" />
      ) : (
        <div className="mt-3 h-10 w-full animate-pulse rounded-lg bg-secondary" />
      )}
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen((v) => !v)}>
        <Sparkles className="h-4 w-4" /> {open ? "Hide review" : "Transcript & scoring"}
      </Button>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl border border-border p-3">
          <div className="space-y-1.5">
            <Label>Transcript</Label>
            <Textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Transcription pending — connect speech-to-text credentials or paste a transcript."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Score (0–100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => setScore(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Coaching notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <Button size="sm" onClick={apply} disabled={insert.isPending || update.isPending}>
            Apply transcript
          </Button>
          {transcript?.applied_at && (
            <p className="text-xs text-muted-foreground">
              Last applied {formatDate(transcript.applied_at)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
