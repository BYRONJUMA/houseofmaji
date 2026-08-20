import { useState } from "react";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useSiteVisits } from "@/hooks/use-crm-extra";
import { useCrmMutation, useTeam } from "@/hooks/use-crm";
import { label } from "@/lib/crm";
import { formatDate } from "@/lib/format";

/** Chief engineer view: site visits waiting for an engineer to be assigned. */
export function SiteVisitsAwaitingAssignment() {
  const { profile } = useAuth();
  const { data: visits = [] } = useSiteVisits();
  const { data: team = [] } = useTeam();
  const assign = useCrmMutation("site_visits", ["crm-site-visits"]);
  const [picks, setPicks] = useState<Record<string, string>>({});

  const pending = visits.filter((v) => v.status === "pending_assignment");
  const engineers = team.filter(
    (t) => t.role === "engineer" || (profile?.id && t.id === profile.id),
  );

  const submit = (id: string) => {
    const engineerId = picks[id];
    if (!engineerId) {
      toast.error("Pick an engineer first");
      return;
    }
    assign.mutate(
      {
        type: "update",
        id,
        values: {
          assigned_engineer_id: engineerId,
          engineer_id: engineerId,
          assigned_by: profile?.id ?? null,
          assigned_at: new Date().toISOString(),
          status: "scheduled",
        },
      },
      {
        onSuccess: () => toast.success("Engineer assigned"),
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <section className="surface-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Site visits awaiting assignment</h2>
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {pending.length}
        </span>
      </div>

      {pending.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          No site visits waiting for an engineer.
        </p>
      ) : (
        <div className="space-y-2">
          {pending.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div>
                <p className="text-sm font-semibold">{v.client_name}</p>
                <p className="text-xs text-muted-foreground">
                  {label(v.visit_type)} · {v.location || "no location"} · {formatDate(v.visit_date)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={picks[v.id] ?? ""}
                  onValueChange={(val) => setPicks((p) => ({ ...p, [v.id]: val }))}
                >
                  <SelectTrigger className="w-[12rem]">
                    <SelectValue placeholder="Select engineer" />
                  </SelectTrigger>
                  <SelectContent>
                    {engineers.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name || "Unnamed"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" disabled={assign.isPending} onClick={() => submit(v.id)}>
                  Assign engineer
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
