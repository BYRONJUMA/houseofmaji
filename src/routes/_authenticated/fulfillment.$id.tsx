import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { StageProgress } from "@/components/stage-progress";
import { PaymentsPanel } from "@/components/payments-panel";
import { DeliveryChecklistPanel } from "@/components/delivery-checklist-panel";
import { MachineHistory } from "@/components/machine-history";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePayments } from "@/hooks/use-payments";
import { useDeliveryChecklists } from "@/hooks/use-delivery-checklist";
import { formatKES, formatDate } from "@/lib/format";


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
      const [f, events, profiles] = await Promise.all([
        supabase.from("fulfillments").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("stage_events")
          .select("*")
          .eq("fulfillment_id", id)
          .order("entered_at", { ascending: true }),
        supabase.from("profiles").select("id, full_name"),
      ]);
      if (f.error) throw f.error;
      if (events.error) throw events.error;
      if (profiles.error) throw profiles.error;
      return { fulfillment: f.data, events: events.data, profiles: profiles.data };
    },
  });

  const filePath = data?.fulfillment?.water_analysis_file_url ?? null;
  const { data: signedUrl } = useQuery({
    queryKey: ["water-analysis-url", filePath],
    enabled: !!filePath,
    queryFn: async () => {
      const { data: signed, error } = await supabase.storage
        .from("water-analysis")
        .createSignedUrl(filePath!, 3600);
      if (error) throw error;
      return signed.signedUrl;
    },
  });

  const { data: payments } = usePayments(id);
  const { data: checklists } = useDeliveryChecklists(id);

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

  const names = Object.fromEntries((data!.profiles ?? []).map((p) => [p.id, p.full_name]));
  const checklistReady = ["delivery", "installed"].includes(f.current_stage);
  const machines = checklists ?? [];
  const signedOff = machines.filter((c) => !!c.engineer_signoff_at).length;
  const showSignoffProgress = checklistReady && machines.length > 0;

  return (
    <AppShell title={f.client_name} subtitle={`${f.machine_type} · ${f.location}`}>
      {showSignoffProgress && (
        <div
          className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
            signedOff === machines.length
              ? "border-stage-installed/30 bg-stage-installed/12 text-stage-installed"
              : "border-border bg-secondary text-foreground"
          }`}
        >
          <span className="font-semibold">
            {signedOff} of {machines.length} machine{machines.length === 1 ? "" : "s"} signed off
          </span>{" "}
          {signedOff === machines.length
            ? "— engineer sign-off complete, order marked installed."
            : "— the order is marked installed automatically once every machine has the engineer’s “Delivered & Installed By” sign-off."}
        </div>
      )}
      <Tabs defaultValue="overview" className="space-y-6">

        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="checklist">
            Delivery Checklist{!checklistReady && " (locked)"}
          </TabsTrigger>
          <TabsTrigger value="history">Machine History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <StageProgress currentStage={f.current_stage} events={data!.events} names={names} />
              <PaymentsPanel fulfillmentId={f.id} agreedPrice={f.agreed_price} names={names} />
            </div>
            <div className="surface-card space-y-3 p-5 text-sm">
              <h2 className="text-lg font-semibold">Details</h2>
              <Row label="Client" value={f.client_name} />
              <Row label="Client contact" value={f.client_contact ?? "—"} />
              <Row label="Location" value={f.location} />
              <Row label="Agreed price" value={formatKES(f.agreed_price)} />
              <Row label="Delivery date" value={formatDate(f.agreed_delivery_date)} />
              <Row label="Created" value={formatDate(f.created_at)} />
              <div>
                <p className="text-muted-foreground">Water analysis</p>
                {filePath ? (
                  signedUrl ? (
                    <a
                      href={signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1.5 font-medium text-primary underline"
                    >
                      <FileText className="h-4 w-4" /> View attached file
                    </a>
                  ) : (
                    <p className="mt-1 text-muted-foreground">Preparing link…</p>
                  )
                ) : (
                  <p className="mt-1">No file attached</p>
                )}
              </div>
              {f.additional_notes && (
                <div>
                  <p className="text-muted-foreground">Additional notes</p>
                  <p className="mt-1 whitespace-pre-wrap">{f.additional_notes}</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="checklist">
          <DeliveryChecklistPanel fulfillment={f} names={names} />
        </TabsContent>

        <TabsContent value="history">
          <MachineHistory
            events={data!.events}
            payments={payments ?? []}
            checklists={checklists ?? []}
            names={names}
          />
        </TabsContent>
      </Tabs>
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
