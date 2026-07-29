import { useEffect, useState } from "react";
import { STAGES, STAGE_LABEL, STAGE_DOT, stageIndex, type Stage } from "@/lib/stages";
import { formatDuration } from "@/lib/format";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StageEvent = {
  id: string;
  stage: string;
  actor_id: string | null;
  entered_at: string;
  exited_at: string | null;
};

export function StageProgress({
  currentStage,
  events,
  names,
}: {
  currentStage: string;
  events: StageEvent[];
  names: Record<string, string>;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const currentIdx = stageIndex(currentStage);

  return (
    <div className="surface-card p-5 sm:p-7">
      <h2 className="mb-6 text-lg font-semibold">Fulfillment progress</h2>
      <ol className="flex flex-col gap-6 sm:flex-row sm:gap-0">
        {STAGES.map((stage, i) => {
          const ev = events.find((e) => e.stage === stage);
          const done = i < currentIdx;
          const active = i === currentIdx;
          const duration = ev
            ? (ev.exited_at ? new Date(ev.exited_at).getTime() : now) -
              new Date(ev.entered_at).getTime()
            : null;

          return (
            <li key={stage} className="relative flex flex-1 gap-4 sm:flex-col sm:items-center">
              {i < STAGES.length - 1 && (
                <span
                  className={cn(
                    "absolute left-[21px] top-11 h-[calc(100%+0.75rem)] w-[3px] rounded-full sm:left-auto sm:top-[21px] sm:h-[3px] sm:w-full sm:translate-x-1/2",
                    done ? STAGE_DOT[stage as Stage] : "bg-border",
                  )}
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  "relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[3px] text-sm font-bold transition-colors",
                  done || active
                    ? cn(STAGE_DOT[stage as Stage], "border-transparent text-primary-foreground")
                    : "border-border bg-card text-muted-foreground",
                  active && "ring-4 ring-offset-2 ring-offset-card ring-primary/25",
                )}
              >
                {done ? <Check className="h-5 w-5" /> : i + 1}
              </span>
              <div className="sm:mt-3 sm:px-2 sm:text-center">
                <p className="text-sm font-semibold leading-tight">{STAGE_LABEL[stage]}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ev?.actor_id ? (names[ev.actor_id] ?? "Assigned") : "Unassigned"}
                </p>
                <p
                  className={cn(
                    "mt-1 text-xs font-medium tabular-nums",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {duration === null ? "—" : formatDuration(duration)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
