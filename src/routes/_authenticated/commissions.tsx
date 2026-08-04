import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Coins } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell, EmptyState } from "@/components/app-shell";
import { formatKES, formatDate } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMMISSION_TYPE_LABEL, useCommissions } from "@/hooks/use-commissions";
import { DownloadReportButton } from "@/components/commission-report";
import { ROLE_LABEL } from "@/lib/stages";

export const Route = createFileRoute("/_authenticated/commissions")({
  head: () => ({
    meta: [
      { title: "Commissions — House of Maji Machines" },
      { name: "description", content: "Track every commission earned across sales and jobs." },
      { property: "og:title", content: "Commissions — House of Maji Machines" },
      { property: "og:description", content: "Your earnings from sales and engineering work." },
    ],
  }),
  component: CommissionsPage,
});

function CommissionsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const isChief = profile?.role === "chief_engineer";
  const seesAll = isAdmin || isChief;

  const [person, setPerson] = useState("all");
  const [paidFilter, setPaidFilter] = useState("all");

  const { data: all = [], isLoading } = useCommissions({ userId: profile?.id, all: seesAll });

  const people = useMemo(() => {
    const map = new Map<string, string>();
    all.forEach((r) => map.set(r.user_id, r.profiles?.full_name ?? "Unknown"));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);

  const rows = all.filter(
    (r) =>
      (person === "all" || r.user_id === person) &&
      (paidFilter === "all" || (paidFilter === "paid" ? r.paid : !r.paid)),
  );

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <AppShell
      title="Commissions"
      subtitle={
        isAdmin
          ? "All payouts across the team"
          : isChief
            ? "All team payouts (read-only)"
            : "Your earnings"
      }
      actions={
        <DownloadReportButton
          rows={rows}
          fallbackName={profile?.full_name ?? ""}
          scope={seesAll ? "all" : "mine"}
        />
      }
    >
      <div className="surface-card mb-6 flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-muted-foreground">
            {seesAll ? "Total commissions" : "Total earned"}
          </p>
          <p className="text-3xl font-bold tracking-tight">{formatKES(total)}</p>
          <p className="text-xs text-muted-foreground">
            {rows.length} record{rows.length === 1 ? "" : "s"} in view
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {seesAll && (
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Person" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All team members</SelectItem>
                {people.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={paidFilter} onValueChange={setPaidFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="surface-card p-6 text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Coins}
          title="No commissions to show"
          message="Commissions appear automatically as machines move through the pipeline."
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {seesAll && <th className="px-4 py-3">Team member</th>}
                {seesAll && <th className="px-4 py-3">Role</th>}
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Machine</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  {seesAll && (
                    <td className="px-4 py-3 font-medium">{r.profiles?.full_name ?? "—"}</td>
                  )}
                  {seesAll && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {ROLE_LABEL[r.profiles?.role ?? ""] ?? r.profiles?.role ?? "—"}
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium">{r.fulfillments?.client_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.fulfillments?.machine_type ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {COMMISSION_TYPE_LABEL[r.role] ?? r.role}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.paid ? "Paid" : "Unpaid"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(r.paid_at ?? r.computed_at)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatKES(Number(r.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
