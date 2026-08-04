import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackagePlus, ClipboardList, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatKES, formatDate } from "@/lib/format";
import { STAGE_LABEL, STAGE_SOFT, type Stage } from "@/lib/stages";
import { StageTiles, stageSearchSchema } from "@/components/stage-tiles";
import { useCommissions } from "@/hooks/use-commissions";
import { MyCommissionsCard } from "@/components/commission-report";

export const Route = createFileRoute("/_authenticated/sales")({
  validateSearch: stageSearchSchema,
  head: () => ({
    meta: [
      { title: "Sales Handover — House of Maji Machines" },
      { name: "description", content: "Hand over a new water machine sale to the workshop." },
      { property: "og:title", content: "Sales Handover — House of Maji Machines" },
      { property: "og:description", content: "Create and track your machine handovers." },
    ],
  }),
  component: SalesPage,
});

const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const EMPTY = {
  client_name: "",
  location: "",
  additional_notes: "",
  machine_type: "",
  agreed_price: "",
  agreed_delivery_date: "",
};

function SalesPage() {
  const { profile } = useAuth();
  const { stage } = Route.useSearch() as { stage?: Stage };
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ["my-fulfillments", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fulfillments")
        .select("*")
        .eq("sales_rep_id", profile!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: commissions = [] } = useCommissions({ userId: profile?.id });
  const visible = stage ? list.filter((f) => f.current_stage === stage) : list;

  const create = useMutation({
    mutationFn: async () => {
      let filePath: string | null = null;
      if (file) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          throw new Error("Water analysis must be a PDF, PNG or JPG file");
        }
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "dat";
        filePath = `${profile!.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("water-analysis")
          .upload(filePath, file, { contentType: file.type });
        if (upErr) throw upErr;
      }

      const { data, error } = await supabase
        .from("fulfillments")
        .insert({
          client_name: form.client_name.trim(),
          location: form.location.trim(),
          water_analysis_file_url: filePath,
          additional_notes: form.additional_notes.trim() || null,
          machine_type: form.machine_type.trim(),
          agreed_price: Number(form.agreed_price),
          agreed_delivery_date: form.agreed_delivery_date,
          sales_rep_id: profile!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Handover submitted");
      setForm(EMPTY);
      setFile(null);
      setFileKey((k) => k + 1);
      qc.invalidateQueries({ queryKey: ["my-fulfillments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Sales Handover" subtitle="Submit a new machine sale to the workshop">
      <div className="mb-8">
        <StageTiles items={list} homePath="/sales" activeStage={stage} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form
          className="surface-card space-y-4 p-5 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h2 className="text-lg font-semibold">New handover</h2>
          <div className="space-y-2">
            <Label htmlFor="client">Client name</Label>
            <Input
              id="client"
              value={form.client_name}
              onChange={(e) => setForm({ ...form, client_name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="water-file">Water analysis (PDF, PNG or JPG)</Label>
            <Input
              key={fileKey}
              id="water-file"
              type="file"
              accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f && !ALLOWED_TYPES.includes(f.type)) {
                  toast.error("Only PDF, PNG or JPG files are allowed");
                  setFile(null);
                  setFileKey((k) => k + 1);
                  return;
                }
                setFile(f);
              }}
            />
            {file && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5" /> {file.name}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Additional notes</Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder="Delivery instructions, special terms agreed with the client…"
              value={form.additional_notes}
              onChange={(e) => setForm({ ...form, additional_notes: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="machine">Machine type</Label>
            <Input
              id="machine"
              value={form.machine_type}
              onChange={(e) => setForm({ ...form, machine_type: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price">Agreed price (KES)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="1"
                value={form.agreed_price}
                onChange={(e) => setForm({ ...form, agreed_price: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Agreed delivery date</Label>
              <Input
                id="date"
                type="date"
                value={form.agreed_delivery_date}
                onChange={(e) => setForm({ ...form, agreed_delivery_date: e.target.value })}
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending}>
            <PackagePlus className="h-4 w-4" />
            {create.isPending ? "Submitting…" : "Submit handover"}
          </Button>
        </form>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">My handovers</h2>
          {isLoading ? (
            <div className="surface-card p-6 text-sm text-muted-foreground">Loading…</div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={stage ? `No handovers in ${STAGE_LABEL[stage]}` : "No handovers yet"}
              message={
                stage
                  ? "Pick another stage tile or clear the filter to see all of your handovers."
                  : "Submit your first sale using the form and it will appear here with live progress."
              }
            />
          ) : (
            visible.map((f) => (
              <button
                key={f.id}
                onClick={() => navigate({ to: "/fulfillment/$id", params: { id: f.id } })}
                className="surface-card w-full cursor-pointer p-5 text-left transition-all hover:border-primary/40 hover:shadow-lg"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{f.client_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {f.machine_type} · {f.location}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${STAGE_SOFT[f.current_stage as Stage]}`}
                  >
                    {STAGE_LABEL[f.current_stage as Stage]}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <span className="font-semibold">{formatKES(f.agreed_price)}</span>
                  <span className="text-muted-foreground">
                    Due {formatDate(f.agreed_delivery_date)}
                  </span>
                </div>
              </button>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            Tip: open any handover to record payments and see the full stage timeline.{" "}
            <Link to="/" className="underline">
              Home
            </Link>
          </p>
        </section>
      </div>

      <MyCommissionsCard rows={commissions} fallbackName={profile?.full_name ?? ""} scope="mine" />
    </AppShell>
  );
}
