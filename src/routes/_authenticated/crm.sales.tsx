import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { CrmShell, CrmCard, StatCard, MiniTile, Bar } from "@/components/crm-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { formatKES, formatDate } from "@/lib/format";
import {
  isCrmManager,
  monthStart,
  monthEnd,
  addMonths,
  monthLabel,
  isoDate,
  pctChange,
  num,
} from "@/lib/crm";
import { useInvoices, useTargets, useTeam, useCrmMutation, nameOf } from "@/hooks/use-crm";

export const Route = createFileRoute("/_authenticated/crm/sales")({
  head: () => ({
    meta: [
      { title: "Sales & Invoices — House of Maji CRM" },
      {
        name: "description",
        content: "Monthly revenue, outstanding balances, invoice records and targets per rep.",
      },
      { property: "og:title", content: "Sales & Invoices — House of Maji CRM" },
      {
        property: "og:description",
        content: "Track invoices, collections and revenue against monthly targets.",
      },
    ],
  }),
  component: SalesPage,
});

function SalesPage() {
  const { profile } = useAuth();
  const manager = isCrmManager(profile?.role);
  const { data: invoices = [] } = useInvoices();
  const { data: targets = [] } = useTargets();
  const { data: team = [] } = useTeam();
  const [creating, setCreating] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);

  const months = useMemo(() => {
    const set = new Map<string, Date>();
    for (let i = 0; i < 12; i++) {
      const d = addMonths(monthStart(new Date()), -i);
      set.set(isoDate(monthStart(d)), monthStart(d));
    }
    for (const i of invoices) set.set(isoDate(monthStart(i.date)), monthStart(i.date));
    return [...set.values()].sort((a, b) => b.getTime() - a.getTime());
  }, [invoices]);

  const [month, setMonth] = useState(isoDate(monthStart(new Date())));
  const selected = new Date(month);
  const from = monthStart(selected);
  const to = monthEnd(from);
  const prevFrom = addMonths(from, -1);

  const inRange = (d: string, a: Date, b: Date) => {
    const t = new Date(d).getTime();
    return t >= a.getTime() && t < b.getTime();
  };
  const rows = invoices.filter((i) => inRange(i.date, from, to));
  const prevRows = invoices.filter((i) => inRange(i.date, prevFrom, from));
  const revenue = rows.reduce((s, i) => s + num(i.amount), 0);
  const prevRevenue = prevRows.reduce((s, i) => s + num(i.amount), 0);
  const outstanding = rows.reduce((s, i) => s + num(i.balance), 0);
  const collected = revenue - outstanding;
  const target = targets.find((t) => isoDate(monthStart(t.month)) === isoDate(from));
  const revenueTarget = num(target?.revenue_target);
  const dealsTarget = num(target?.deals_target);
  const reps = team.filter((t) => t.role === "sales_rep" || t.role === "sales_manager");

  const perRep = reps
    .map((r) => ({
      id: r.id,
      name: r.full_name || "Unnamed",
      revenue: rows.filter((i) => i.rep_id === r.id).reduce((s, i) => s + num(i.amount), 0),
      count: rows.filter((i) => i.rep_id === r.id).length,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return (
    <CrmShell
      title="Sales"
      subtitle={`Invoices and revenue for ${monthLabel(from)}.`}
      actions={
        <div className="flex gap-2">
          {manager && (
            <Button size="sm" variant="outline" onClick={() => setTargetOpen(true)}>
              Set target
            </Button>
          )}
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New invoice
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="surface-card flex flex-wrap items-center gap-3 p-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Month</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[14rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((d) => (
                <SelectItem key={isoDate(d)} value={isoDate(d)}>
                  {monthLabel(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Revenue"
            value={formatKES(revenue)}
            change={pctChange(revenue, prevRevenue)}
            hint={
              revenueTarget
                ? `${Math.round((revenue / revenueTarget) * 100)}% of ${formatKES(revenueTarget)}`
                : "no target set"
            }
          />
          <StatCard label="Collected" value={formatKES(collected)} hint="amount minus balance" />
          <StatCard
            label="Outstanding"
            value={formatKES(outstanding)}
            hint={`${rows.filter((i) => num(i.balance) > 0).length} invoices unpaid`}
          />
          <StatCard
            label="Invoices"
            value={String(rows.length)}
            change={pctChange(rows.length, prevRows.length)}
            hint={dealsTarget ? `target ${dealsTarget}` : "no deal target"}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <CrmCard title="Revenue by rep">
            <div className="space-y-2">
              {perRep.map((r) => (
                <Bar
                  key={r.id}
                  label={r.name}
                  value={r.revenue}
                  max={Math.max(1, ...perRep.map((x) => x.revenue))}
                  sub={`${formatKES(r.revenue)} · ${r.count}`}
                />
              ))}
              {perRep.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No reps yet.</p>
              )}
            </div>
          </CrmCard>

          <CrmCard title="Last 6 months" className="lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => addMonths(from, -i))
                .reverse()
                .map((d) => {
                  const a = monthStart(d);
                  const b = monthEnd(a);
                  const v = invoices
                    .filter((x) => inRange(x.date, a, b))
                    .reduce((s, x) => s + num(x.amount), 0);
                  return (
                    <MiniTile
                      key={isoDate(a)}
                      label={a.toLocaleDateString("en-KE", { month: "short" })}
                      value={formatKES(v)}
                    />
                  );
                })}
            </div>
          </CrmCard>
        </div>

        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Invoice no</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Machine</th>
                <th className="px-3 py-2">Rep</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="border-t border-border transition-colors hover:bg-secondary/50">
                  <td className="px-3 py-2 font-medium">{i.invoice_no}</td>
                  <td className="px-3 py-2">{formatDate(i.date)}</td>
                  <td className="px-3 py-2">{i.client_name}</td>
                  <td className="px-3 py-2">{i.machine || "—"}</td>
                  <td className="px-3 py-2">{nameOf(team, i.rep_id)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKES(i.amount)}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${num(i.balance) > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                  >
                    {formatKES(i.balance)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    No invoices for {monthLabel(from)}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating && <InvoiceDialog onClose={() => setCreating(false)} team={team} />}
      {targetOpen && <TargetDialog onClose={() => setTargetOpen(false)} month={isoDate(from)} />}
    </CrmShell>
  );
}

function InvoiceDialog({
  onClose,
  team,
}: {
  onClose: () => void;
  team: { id: string; full_name: string; role: string }[];
}) {
  const { profile } = useAuth();
  const create = useCrmMutation("invoices", ["crm-invoices"]);
  const [f, setF] = useState({
    invoice_no: "",
    date: isoDate(new Date()),
    client_name: "",
    machine: "",
    amount: "",
    balance: "",
    rep_id: profile?.id ?? "none",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const reps = team.filter((t) => t.role === "sales_rep" || t.role === "sales_manager");

  const submit = () => {
    if (!f.invoice_no.trim() || !f.client_name.trim() || !f.amount) {
      toast.error("Invoice no, client and amount are required");
      return;
    }
    create.mutate(
      {
        type: "insert",
        values: {
          invoice_no: f.invoice_no.trim(),
          date: f.date,
          client_name: f.client_name.trim(),
          machine: f.machine.trim() || null,
          amount: Number(f.amount),
          balance: f.balance ? Number(f.balance) : 0,
          rep_id: f.rep_id === "none" ? null : f.rep_id,
        },
      },
      {
        onSuccess: () => {
          toast.success("Invoice recorded");
          onClose();
        },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Invoice no</Label>
            <Input value={f.invoice_no} onChange={(e) => set("invoice_no", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Input value={f.client_name} onChange={(e) => set("client_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Machine</Label>
            <Input value={f.machine} onChange={(e) => set("machine", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Amount (KES)</Label>
            <Input
              type="number"
              value={f.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Balance (KES)</Label>
            <Input
              type="number"
              value={f.balance}
              onChange={(e) => set("balance", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Rep</Label>
            <Select value={f.rep_id} onValueChange={(v) => set("rep_id", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {reps.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.full_name || "Unnamed"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={submit} disabled={create.isPending}>
          Save invoice
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function TargetDialog({ onClose, month }: { onClose: () => void; month: string }) {
  const { data: targets = [] } = useTargets();
  const existing = targets.find((t) => isoDate(monthStart(t.month)) === month);
  const mutate = useCrmMutation("monthly_targets", ["crm-targets"]);
  const [revenue, setRevenue] = useState(String(existing?.revenue_target ?? ""));
  const [deals, setDeals] = useState(String(existing?.deals_target ?? ""));

  const submit = () => {
    const values = {
      month,
      revenue_target: Number(revenue || 0),
      deals_target: Number(deals || 0),
    };
    mutate.mutate(
      existing ? { type: "update", id: existing.id, values } : { type: "insert", values },
      {
        onSuccess: () => {
          toast.success("Target saved");
          onClose();
        },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Monthly target — {monthLabel(new Date(month))}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Revenue target (KES)</Label>
            <Input
              type="number"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Deals target</Label>
            <Input type="number" value={deals} onChange={(e) => setDeals(e.target.value)} />
          </div>
          <Button onClick={submit} disabled={mutate.isPending} className="w-full">
            Save target
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
