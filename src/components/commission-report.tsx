import { Download } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { commissionsFilename, downloadCsv, toCsv } from "@/lib/csv";
import { downloadPdf, downloadXlsx } from "@/lib/export-report";
import { COMMISSION_TYPE_LABEL, type CommissionRow } from "@/hooks/use-commissions";
import { ROLE_LABEL } from "@/lib/stages";
import { formatDate, formatKES } from "@/lib/format";

const HEADERS = [
  "Person",
  "Role",
  "Commission type",
  "Amount (KES)",
  "Client",
  "Machine",
  "Paid status",
  "Date",
];

function toMatrix(rows: CommissionRow[], fallbackName: string): (string | number)[][] {
  return rows.map((r) => [
    r.profiles?.full_name ?? fallbackName,
    ROLE_LABEL[r.profiles?.role ?? ""] ?? r.profiles?.role ?? "",
    COMMISSION_TYPE_LABEL[r.role] ?? r.role,
    Number(r.amount),
    r.fulfillments?.client_name ?? "",
    r.fulfillments?.machine_type ?? "",
    r.paid ? "Paid" : "Unpaid",
    (r.paid_at ?? r.computed_at)?.slice(0, 10) ?? "",
  ]);
}

export function exportCommissions(rows: CommissionRow[], fallbackName: string, scope?: string) {
  downloadCsv(commissionsFilename(scope), toCsv(HEADERS, toMatrix(rows, fallbackName)));
}

/** CSV / PDF / Excel export menu for the currently visible commission rows. */
export function DownloadReportButton({
  rows,
  fallbackName,
  scope,
  size = "sm",
}: {
  rows: CommissionRow[];
  fallbackName: string;
  scope?: string;
  size?: "sm" | "default";
}) {
  const matrix = () => toMatrix(rows, fallbackName);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size={size} disabled={rows.length === 0}>
          <Download className="h-4 w-4" /> Download Report
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportCommissions(rows, fallbackName, scope)}>
          Download CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void downloadPdf(HEADERS, matrix(), scope)}>
          Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void downloadXlsx(HEADERS, matrix(), scope)}>
          Download Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Compact "My Commissions" block for the sales rep and engineer dashboards. */
export function MyCommissionsCard({
  rows,
  fallbackName,
  scope,
}: {
  rows: CommissionRow[];
  fallbackName: string;
  scope?: string;
}) {
  const navigate = useNavigate();
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  return (
    <section className="surface-card mt-8 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">My Commissions</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} record{rows.length === 1 ? "" : "s"} · {formatKES(total)} total
          </p>
        </div>
        <DownloadReportButton rows={rows} fallbackName={fallbackName} scope={scope} />
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Commissions appear here automatically as machines move through the pipeline.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Client</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 6).map((r) => (
                <tr
                  key={r.id}
                  onClick={() =>
                    navigate({
                      to: "/fulfillment/$id",
                      params: { id: r.fulfillment_id },
                      search: { tab: undefined },
                    })
                  }
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary"
                >
                  <td className="py-2 pr-4 font-medium">{r.fulfillments?.client_name ?? "—"}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {COMMISSION_TYPE_LABEL[r.role] ?? r.role}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{r.paid ? "Paid" : "Unpaid"}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {formatDate(r.paid_at ?? r.computed_at)}
                  </td>
                  <td className="py-2 text-right font-semibold">{formatKES(Number(r.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
