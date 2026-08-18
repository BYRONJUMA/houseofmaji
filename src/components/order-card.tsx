import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MapPin, Cpu, Phone } from "lucide-react";
import { formatKES, formatDate } from "@/lib/format";
import { STAGE_LABEL, STAGE_SOFT, type Stage } from "@/lib/stages";
import { paidPercent } from "@/hooks/use-payments";

export type OrderCardFulfillment = {
  id: string;
  client_name: string | null;
  client_contact?: string | null;
  location?: string | null;
  machine_type?: string | null;
  capacity_lph?: number | null;
  current_stage: string;
  agreed_price: number | string;
  agreed_delivery_date?: string | null;
};

function machineLabel(f: OrderCardFulfillment) {
  const type = f.machine_type?.trim();
  const cap = f.capacity_lph;
  if (type && cap && !type.toLowerCase().includes(String(cap))) return `${type} · ${cap} LPH`;
  if (type) return type;
  if (cap) return `${cap} LPH`;
  return "Machine type not set";
}

/**
 * Single shared order card template used on every dashboard that lists
 * fulfillments (chief engineer kanban, engineer jobs, sales, admin, sales head).
 */
export function OrderCard({
  fulfillment: f,
  paid,
  showPayment = true,
  meta,
  children,
  compact = false,
}: {
  fulfillment: OrderCardFulfillment;
  /** Total paid so far; when provided a payment progress bar is rendered. */
  paid?: number | null;
  showPayment?: boolean;
  /** Extra lines rendered under the price row (assignments, notes, etc). */
  meta?: ReactNode;
  /** Action buttons / controls. Wrapped so clicks don't open the order. */
  children?: ReactNode;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const open = () => navigate({ to: "/fulfillment/$id", params: { id: f.id }, search: { tab: undefined } });
  const stage = f.current_stage as Stage;
  const pct = paidPercent(paid ?? 0, f.agreed_price);

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className={`surface-card cursor-pointer space-y-3 text-left transition-all hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            className={`truncate font-bold leading-tight ${compact ? "text-base" : "text-lg"}`}
            title={f.client_name ?? undefined}
          >
            {f.client_name?.trim() || "Unnamed client"}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Cpu className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{machineLabel(f)}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{f.location?.trim() || "No location"}</span>
          </p>
          {f.client_contact?.trim() && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{f.client_contact}</span>
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${STAGE_SOFT[stage]}`}
        >
          {STAGE_LABEL[stage] ?? f.current_stage}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold">{formatKES(f.agreed_price)}</span>
        <span className="text-xs text-muted-foreground">
          Due {formatDate(f.agreed_delivery_date)}
        </span>
      </div>

      {showPayment && paid != null && (
        <div>
          <div className="flex items-center justify-between text-xs font-semibold">
            <span>{pct.toFixed(0)}% paid</span>
            <span className="text-muted-foreground">{formatKES(paid)}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            />
          </div>
        </div>
      )}

      {meta}

      {children && (
        <div
          className="space-y-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </article>
  );
}
