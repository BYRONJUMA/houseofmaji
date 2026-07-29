import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { StageProgress } from "@/components/stage-progress";
import { formatKES, formatDate } from "@/lib/format";
import type { Stage } from "@/lib/stages";

export const Route = createFileRoute("/_authenticated/fulfillment/$id")({
  head: () => ({
    meta: [
      { title: "Fulfillment Detail — House of Maji Machines" },
      { name: "description", content: "Full stage timeline for a single machine fulfillment." },
      { property: "og:title", content: "Fulfillment Detail — House of Maji Machines" },
      { property: "og:description", content: "Track stage durations and assigned engineers." },
    ],
  }),
  component: DetailPage,
});

function DetailPage() {
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["fulfillment", id],
    queryFn: async () => {
      const [f, events] = await Promise.all([
        supabase.from("fulfillments").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("stage_events")
          .select("*")
          .eq("fulfillment_id", id)
          .order("entered_at", { ascending: true }),
      ]);
      if (f.error) throw f.error;
      if (events.error) throw events.error;
      return { fulfillment: f.data, events: events.data };
    },
  });

  if (isLoading) {
    return (
      <AppShell title="Fulfillment">
        <div className="surface-card p-6 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  const f = data?.fulfillment;
  if (!f) {
    return (
      <AppShell title="Fulfillment">
        <div className="surface-card p-6 text-sm text-muted-foreground">Not found.</div>
      </AppShell>
    );
  }

  return (
    <AppShell title={f.client_name} subtitle={`${f.machine_type} · ${f.location}`}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="surface-card p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">Pipeline</h2>
          <StageProgress
            currentStage={f.current_stage as Stage}
            events={data!.events}
            createdAt={f.created_at}
          />
        </div>
        <div className="surface-card space-y-3 p-5 text-sm">
          <h2 className="text-lg font-semibold">Details</h2>
          <Row label="Agreed price" value={formatKES(f.agreed_price)} />
          <Row label="Delivery date" value={formatDate(f.agreed_delivery_date)} />
          <Row label="Created" value={formatDate(f.created_at)} />
          {f.water_analysis_notes && (
            <div>
              <p className="text-muted-foreground">Water analysis</p>
              <p className="mt-1">{f.water_analysis_notes}</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
