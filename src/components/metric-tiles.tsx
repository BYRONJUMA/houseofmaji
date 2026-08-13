import { Link } from "@tanstack/react-router";
import { STAGES, STAGE_LABEL, STAGE_DOT, type Stage } from "@/lib/stages";
import { cn } from "@/lib/utils";

export type Metric = {
  label: string;
  value: string;
  hint?: string;
  /** when set, the tile links to the dashboard filtered by this stage */
  stage?: Stage;
  /** explicit destination — wins over `stage` */
  link?: { to: string; search?: Record<string, unknown> };
};

/**
 * Role dashboard summary. Metrics with a `stage` or `link` become clickable and
 * take you to the matching filtered list.
 */
export function MetricTiles({
  title = "Summary",
  metrics,
  homePath,
}: {
  title?: string;
  metrics: Metric[];
  homePath: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => {
          const body = (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {m.label}
              </p>
              <p className="mt-2 text-2xl font-bold tracking-tight">{m.value}</p>
              {m.hint && <p className="mt-1 text-xs text-muted-foreground">{m.hint}</p>}
            </>
          );
          const target = m.link ?? (m.stage ? { to: homePath, search: { stage: m.stage } } : null);
          return target ? (
            <Link
              key={m.label}
              to={target.to}
              search={target.search}
              className="surface-card p-4 transition-all hover:border-primary/40 hover:shadow-lg"
            >
              {body}
            </Link>
          ) : (
            <div key={m.label} className="surface-card p-4">
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}


/** Compact "orders currently in each stage" strip. */
export function StageBreakdown({
  items,
  homePath,
}: {
  items: { current_stage: string }[];
  homePath: string;
}) {
  return (
    <div className="surface-card flex flex-wrap gap-2 p-4">
      {STAGES.map((s) => {
        const n = items.filter((i) => i.current_stage === s).length;
        return (
          <Link
            key={s}
            to={homePath}
            search={{ stage: s }}
            className={cn(
              "flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/50",
            )}
          >
            <span className={`h-2 w-2 rounded-full ${STAGE_DOT[s]}`} />
            {STAGE_LABEL[s]}
            <span className="font-bold">{n}</span>
          </Link>
        );
      })}
    </div>
  );
}
