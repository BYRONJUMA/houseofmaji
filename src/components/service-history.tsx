import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

type ServiceRow = {
  id: string;
  client_name: string;
  contact: string | null;
  machine_type: string | null;
  last_service_date: string | null;
  next_due_date: string | null;
  visit_count: number;
  recorded_by: string | null;
  created_at: string;
};

/** Service visits logged against a specific fulfillment. */
export function ServiceHistory({
  fulfillmentId,
  names,
}: {
  fulfillmentId: string;
  names: Record<string, string>;
}) {
  const { data: rows = [] } = useQuery({
    queryKey: ["fulfillment-services", fulfillmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("fulfillment_id", fulfillmentId)
        .order("last_service_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ServiceRow[];
    },
  });

  return (
    <section className="surface-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Wrench className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Service History</h2>
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          No service visits logged against this machine yet.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => (
            <div key={s.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{s.machine_type || "Machine"} service</p>
                <p className="text-xs text-muted-foreground">
                  Last serviced {formatDate(s.last_service_date)}
                </p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.visit_count ?? 0} visit(s) · next due {formatDate(s.next_due_date)} · recorded by{" "}
                {(s.recorded_by && names[s.recorded_by]) || "—"}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
