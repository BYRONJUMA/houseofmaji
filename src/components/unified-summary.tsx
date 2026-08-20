import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAllPayments, totalPaid } from "@/hooks/use-payments";
import { useLeads, useInvoices, useServices, useTeam } from "@/hooks/use-crm";
import { useSiteVisits } from "@/hooks/use-crm-extra";
import { formatKES } from "@/lib/format";
import { STAGES, STAGE_LABEL, STAGE_DOT, ROLE_LABEL, ROLE_HOME, type Stage } from "@/lib/stages";
import { LEAD_STAGES, LEAD_STAGE_LABEL, LEAD_STAGE_BADGE, daysBetween, num } from "@/lib/crm";
import { cn } from "@/lib/utils";

type Target = { to: string; search?: Record<string, unknown> };

function Tile({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: string;
  hint?: string;
  to?: Target;
}) {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  return to ? (
    <Link
      to={to.to}
      search={to.search}
      className="surface-card p-4 transition-all hover:border-primary/40 hover:shadow-lg"
    >
      {body}
    </Link>
  ) : (
    <div className="surface-card p-4">{body}</div>
  );
}

/**
 * One shared summary for every dashboard (Machines + CRM combined).
 * Numbers are identical for all roles — what differs is what each role can do
 * once they click through, which is enforced by the destination pages.
 */
export function UnifiedSummary({ title = "Business summary" }: { title?: string }) {
  const { profile } = useAuth();
  const machinesHome = ROLE_HOME[profile?.role ?? ""] ?? "/";

  const { data: fulfillments = [] } = useQuery({
    queryKey: ["summary-fulfillments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fulfillments")
        .select("id, current_stage, agreed_price")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: commissions = [] } = useQuery({
    queryKey: ["summary-commissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("commissions").select("amount, paid");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payments = [] } = useAllPayments();
  const { data: leads = [] } = useLeads();
  const { data: invoices = [] } = useInvoices();
  const { data: services = [] } = useServices();
  const { data: visits = [] } = useSiteVisits();
  const { data: team = [] } = useTeam();

  const orderRevenue = fulfillments.reduce((s, f) => s + num(f.agreed_price), 0);
  const crmRevenue = invoices.reduce((s, i) => s + num(i.amount), 0);
  const collected = totalPaid(payments);
  const commissionTotal = commissions.reduce((s, c) => s + num(c.amount), 0);
  const commissionPaid = commissions.filter((c) => c.paid).reduce((s, c) => s + num(c.amount), 0);

  const perRole = team.reduce<Record<string, number>>((acc, t) => {
    acc[t.role] = (acc[t.role] ?? 0) + 1;
    return acc;
  }, {});

  const visitsCompleted = visits.filter((v) => v.status === "completed").length;
  const visitsScheduled = visits.length - visitsCompleted;
  const overdueServices = services.filter(
    (s) => s.next_due_date && daysBetween(new Date(), s.next_due_date) < 0,
  ).length;

  const tiles: { label: string; value: string; hint?: string; to?: Target }[] = [
    {
      label: "Orders & leads",
      value: `${fulfillments.length} / ${leads.length}`,
      hint: "machine orders / CRM leads",
      to: { to: machinesHome, search: {} },
    },
    {
      label: "Total revenue",
      value: formatKES(orderRevenue + crmRevenue),
      hint: `${formatKES(orderRevenue)} orders · ${formatKES(crmRevenue)} invoices`,
      to: { to: "/crm/sales" },
    },
    {
      label: "Payments collected",
      value: formatKES(collected),
      hint:
        orderRevenue > 0
          ? `${((collected / orderRevenue) * 100).toFixed(0)}% of agreed order value`
          : undefined,
      to: { to: machinesHome, search: {} },
    },
    {
      label: "Commissions paid",
      value: formatKES(commissionPaid),
      hint: `${formatKES(commissionTotal - commissionPaid)} unpaid`,
      to: { to: "/commissions", search: { paid: "paid" } },
    },
    {
      label: "Users per role",
      value: String(team.length),
      hint:
        Object.entries(perRole)
          .map(([r, n]) => `${n} ${ROLE_LABEL[r] ?? r}`)
          .join(" · ") || undefined,
      to: { to: "/team" },
    },
    {
      label: "Site visits",
      value: `${visitsScheduled} / ${visitsCompleted}`,
      hint: "scheduled / completed",
      to: { to: "/crm/visits" },
    },
    {
      label: "Services logged",
      value: String(services.length),
      hint: `${overdueServices} overdue`,
      to: { to: "/services" },
    },
    {
      label: "Won deals",
      value: String(leads.filter((l) => l.stage === "won").length),
      hint: `of ${leads.length} leads`,
      to: { to: "/crm/leads" },
    },
  ];

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <Tile key={t.label} {...t} />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="surface-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Orders by stage
          </p>
          <div className="flex flex-wrap gap-2">
            {STAGES.map((s) => (
              <Link
                key={s}
                to={machinesHome}
                search={{ stage: s as Stage }}
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/50"
              >
                <span className={`h-2 w-2 rounded-full ${STAGE_DOT[s]}`} />
                {STAGE_LABEL[s]}
                <span className="font-bold">
                  {fulfillments.filter((f) => f.current_stage === s).length}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="surface-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Leads by stage
          </p>
          <div className="flex flex-wrap gap-2">
            {LEAD_STAGES.map((s) => (
              <Link
                key={s}
                to="/crm/leads"
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80",
                  LEAD_STAGE_BADGE[s],
                )}
              >
                {LEAD_STAGE_LABEL[s]}
                <span className="font-bold">{leads.filter((l) => l.stage === s).length}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
