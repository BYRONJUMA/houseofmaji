import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackagePlus, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell, EmptyState } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatKES, formatDate } from "@/lib/format";
import { STAGE_LABEL, STAGE_SOFT, type Stage } from "@/lib/stages";

export const Route = createFileRoute("/_authenticated/sales")({
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

function SalesPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    client_name: "",
    location: "",
    water_analysis_notes: "",
    machine_type: "",
    agreed_price: "",
    agreed_delivery_date: "",
  });

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

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("fulfillments")
        .insert({
          client_name: form.client_name.trim(),
          location: form.location.trim(),
          water_analysis_notes: form.water_analysis_notes.trim() || null,
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
      setForm({
        client_name: "",
        location: "",
        water_analysis_notes: "",
        machine_type: "",
        agreed_price: "",
        agreed_delivery_date: "",
      });
      qc.invalidateQueries({ queryKey: ["my-fulfillments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Sales Handover" subtitle="Submit a new machine sale to the workshop">
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
            <Label htmlFor="notes">Water analysis notes</Label>
            <Textarea
              id="notes"
              rows={3}
              value={form.water_analysis_notes}
              onChange={(e) => setForm({ ...form, water_analysis_notes: e.target.value })}
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
          ) : list.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No handovers yet"
              message="Submit your first sale using the form and it will appear here with live progress."
            />
          ) : (
            list.map((f) => (
              <button
                key={f.id}
                onClick={() => navigate({ to: "/fulfillment/$id", params: { id: f.id } })}
                className="surface-card w-full p-5 text-left transition-shadow hover:shadow-lg"
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
            Tip: open any handover for the full stage timeline.{" "}
            <Link to="/" className="underline">
              Home
            </Link>
          </p>
        </section>
      </div>
    </AppShell>
  );
}
