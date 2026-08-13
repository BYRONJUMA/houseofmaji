import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Coins, CheckCheck } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  COMMISSION_TYPE_LABEL,
  monthKey,
  monthLabel,
  useCommissions,
  useMarkAllPaid,
  useTogglePaid,
} from "@/hooks/use-commissions";
import { DownloadReportButton } from "@/components/commission-report";
import { ROLE_LABEL } from "@/lib/stages";

type CommissionSearch = { paid?: "paid" | "unpaid"; month?: string };

export const Route = createFileRoute("/_authenticated/commissions")({
  validateSearch: (search: Record<string, unknown>): CommissionSearch => ({
    paid: search.paid === "paid" || search.paid === "unpaid" ? search.paid : undefined,
    month: typeof search.month === "string" && search.month ? search.month : undefined,
  }),
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
  const navigate = useNavigate();
  const search = Route.useSearch();
  const isAdmin = profile?.role === "admin";
  const isChief = profile?.role === "chief_engineer";
  const seesAll = isAdmin || isChief;

  const canTogglePaid = isAdmin || isChief;
  const togglePaid = useTogglePaid();
  const markAllPaid = useMarkAllPaid();
  const [confirmBulk, setConfirmBulk] = useState(false);

  const [person, setPerson] = useState("all");
  const paidFilter = search.paid ?? "all";
  const month = search.month ?? "all";
  const setSearch = (next: CommissionSearch) =>
    navigate({ to: "/commissions", search: { ...search, ...next }, replace: true });

  const { data: all = [], isLoading } = useCommissions({ userId: profile?.id, all: seesAll });

  const people = useMemo(() => {
    const map = new Map<string, string>();
    all.forEach((r) => map.set(r.user_id, r.profiles?.full_name ?? "Unknown"));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);

  const months = useMemo(
    () => [...new Set(all.map((r) => monthKey(r.computed_at)))].sort().reverse(),
    [all],
  );

  const rows = all.filter(
    (r) =>
      (person === "all" || r.user_id === person) &&
      (paidFilter === "all" || (paidFilter === "paid" ? r.paid : !r.paid)) &&
      (month === "all" || monthKey(r.computed_at) === month),
  );

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const unpaidVisible = rows.filter((r) => !r.paid);

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
          <Select
            value={month}
            onValueChange={(v) => setSearch({ month: v === "all" ? undefined : v })}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {monthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={paidFilter}
            onValueChange={(v) =>
              setSearch({ paid: v === "all" ? undefined : (v as "paid" | "unpaid") })
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
          {canTogglePaid && (
            <Button
              variant="outline"
              disabled={unpaidVisible.length === 0 || markAllPaid.isPending}
              onClick={() => setConfirmBulk(true)}
            >
              <CheckCheck className="h-4 w-4" /> Mark All Paid
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mark {unpaidVisible.length} commission{unpaidVisible.length === 1 ? "" : "s"} as paid?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This applies to every unpaid record currently in view (
              {formatKES(unpaidVisible.reduce((s, r) => s + Number(r.amount), 0))}) and stamps each
              one as paid right now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                markAllPaid.mutate(
                  unpaidVisible.map((r) => r.id),
                  {
                    onSuccess: (n) => {
                      toast.success(`${n} commission${n === 1 ? "" : "s"} marked paid`);
                      setConfirmBulk(false);
                    },
                    onError: (err: unknown) =>
                      toast.error((err as Error).message ?? "Could not update"),
                  },
                );
              }}
            >
              Mark paid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                <tr
                  key={r.id}
                  onClick={() =>
                    navigate({ to: "/fulfillment/$id", params: { id: r.fulfillment_id } })
                  }
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary"
                >
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
                  <td className="px-4 py-3">
                    {canTogglePaid ? (
                      <Button
                        size="sm"
                        variant={r.paid ? "default" : "outline"}
                        disabled={togglePaid.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePaid.mutate(
                            { id: r.id, paid: !r.paid },
                            {
                              onError: (err: unknown) =>
                                toast.error((err as Error).message ?? "Could not update"),
                              onSuccess: () =>
                                toast.success(r.paid ? "Marked unpaid" : "Marked paid"),
                            },
                          );
                        }}
                      >
                        {r.paid ? "Paid" : "Mark paid"}
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">{r.paid ? "Paid" : "Unpaid"}</span>
                    )}
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
