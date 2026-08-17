import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/app-shell";
import { formatKES, formatDate } from "@/lib/format";
import { STAGES, STAGE_LABEL, STAGE_SOFT, type Stage } from "@/lib/stages";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [
      { title: "Orders — Machines" },
      {
        name: "description",
        content: "Read-only view of every machine order, its current stage and assigned team.",
      },
      { property: "og:title", content: "Orders — Machines" },
      { property: "og:description", content: "Follow every order from handover to installation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const [stage, setStage] = useState<Stage | "all">("all");

  const { data: orders = [] } = useQuery({
    queryKey: ["fulfillments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fulfillments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: people = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, role");
      if (error) throw error;
      return data;
    },
  });

  const nameOf = (id?: string | null) =>
    !id ? "Unassigned" : people.find((p) => p.id === id)?.full_name || "Unknown";

  const rows = useMemo(
    () => (stage === "all" ? orders : orders.filter((o) => o.current_stage === stage)),
    [orders, stage],
  );

  return (
    <AppShell
      title="Orders"
      subtitle="Every machine order and where it currently sits — read only."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["all", ...STAGES] as (Stage | "all")[]).map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                stage === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-secondary"
              }`}
            >
              {s === "all" ? `All (${orders.length})` : STAGE_LABEL[s]}{" "}
              {s !== "all" && `(${orders.filter((o) => o.current_stage === s).length})`}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No orders here"
            message="Nothing matches this stage yet."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((o) => (
              <Link
                key={o.id}
                to="/fulfillment/$id"
                params={{ id: o.id }}
                className="surface-card block p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{o.client_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.machine_type} · {o.location}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                      STAGE_SOFT[o.current_stage as Stage] ?? ""
                    }`}
                  >
                    {STAGE_LABEL[o.current_stage as Stage] ?? o.current_stage}
                  </span>
                </div>
                <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>
                    Value{" "}
                    <span className="font-semibold text-foreground">
                      {formatKES(o.agreed_price)}
                    </span>
                  </span>
                  <span>Due {formatDate(o.agreed_delivery_date)}</span>
                  <span>Sales: {nameOf(o.sales_rep_id)}</span>
                  <span>Engineer: {nameOf(o.assembly_engineer_id)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
