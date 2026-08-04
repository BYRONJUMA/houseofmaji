import { Link } from "@tanstack/react-router";
import { STAGES, STAGE_LABEL, STAGE_SOFT, type Stage } from "@/lib/stages";

type Item = { current_stage: string };

/**
 * Clickable stage-count tiles. Clicking a tile filters the current dashboard
 * list by that stage (via the `stage` search param).
 */
export function StageTiles({
  items,
  homePath,
  activeStage,
}: {
  items: Item[];
  homePath: string;
  activeStage?: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Pipeline by stage</h2>
        {activeStage && (
          <Link
            to={homePath as "/chief"}
            search={{ stage: undefined }}
            className="text-sm font-medium text-primary underline"
          >
            Clear filter
          </Link>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((stage: Stage) => (
          <Link
            key={stage}
            to={homePath as "/chief"}
            search={{ stage: activeStage === stage ? undefined : stage }}
            className={`rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${STAGE_SOFT[stage]} ${
              activeStage === stage
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                : ""
            }`}
          >
            <p className="text-2xl font-bold">
              {items.filter((f) => f.current_stage === stage).length}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wide">{STAGE_LABEL[stage]}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function stageSearchSchema(search: Record<string, unknown>): { stage?: Stage } {
  const stage = search.stage;
  return {
    stage:
      typeof stage === "string" && STAGES.includes(stage as Stage) ? (stage as Stage) : undefined,
  };
}
