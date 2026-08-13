import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { CrmShell, CrmCard, Badge } from "@/components/crm-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { isCrmManager, BADGE_GOOD, BADGE_NEUTRAL } from "@/lib/crm";
import { useCrmMutation } from "@/hooks/use-crm";
import {
  useMachineCategories,
  useMachineTypes,
  useMachineCapacities,
} from "@/hooks/use-crm-extra";

export const Route = createFileRoute("/_authenticated/crm/machines")({
  head: () => ({
    meta: [
      { title: "Machine Taxonomy — House of Maji CRM" },
      {
        name: "description",
        content:
          "Manage machine categories, types and capacities used across lead intake and reporting.",
      },
      { property: "og:title", content: "Machine Taxonomy — House of Maji CRM" },
      {
        property: "og:description",
        content: "Keep machine categories, types and capacities clean for reporting.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MachinesPage,
});

type Row = { id: string; active: boolean } & Record<string, unknown>;

function MachinesPage() {
  const { profile } = useAuth();
  const allowed = isCrmManager(profile?.role);
  const cats = useMachineCategories();
  const types = useMachineTypes();
  const caps = useMachineCapacities();

  if (!allowed) {
    return (
      <CrmShell title="Machine taxonomy" showBack>
        <CrmCard>
          <p className="text-sm text-muted-foreground">
            Only admins and sales managers can manage the machine taxonomy.
          </p>
        </CrmCard>
      </CrmShell>
    );
  }

  return (
    <CrmShell
      title="Machine taxonomy"
      subtitle="Managed lists that populate every machine dropdown"
      showBack
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <ListEditor
          title="Categories"
          table="machine_categories"
          queryKey="crm-machine-categories"
          field="name"
          rows={(cats.data ?? []) as unknown as Row[]}
        />
        <ListEditor
          title="Machine types"
          table="machine_types"
          queryKey="crm-machine-types"
          field="name"
          rows={(types.data ?? []) as unknown as Row[]}
        />
        <ListEditor
          title="Capacities"
          table="machine_capacities"
          queryKey="crm-machine-capacities"
          field="label"
          rows={(caps.data ?? []) as unknown as Row[]}
        />
      </div>
    </CrmShell>
  );
}

function ListEditor({
  title,
  table,
  queryKey,
  field,
  rows,
}: {
  title: string;
  table: string;
  queryKey: string;
  field: "name" | "label";
  rows: Row[];
}) {
  const mutate = useCrmMutation(table, [queryKey]);
  const [value, setValue] = useState("");

  const add = () => {
    const v = value.trim();
    if (!v) return;
    mutate.mutate(
      { type: "insert", values: { [field]: v } },
      {
        onSuccess: () => {
          setValue("");
          toast.success(`${title} entry added`);
        },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  const patch = (id: string, values: Record<string, unknown>) =>
    mutate.mutate(
      { type: "update", id, values },
      { onError: (e: unknown) => toast.error((e as Error).message) },
    );

  return (
    <CrmCard title={title}>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={`Add ${title.toLowerCase()}`}
        />
        <Button size="icon" onClick={add} disabled={mutate.isPending} aria-label={`Add ${title}`}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
            <Input
              defaultValue={String(r[field] ?? "")}
              className="h-8 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== String(r[field] ?? "")) patch(r.id, { [field]: v });
              }}
            />
            <button onClick={() => patch(r.id, { active: !r.active })}>
              <Badge className={r.active ? BADGE_GOOD : BADGE_NEUTRAL}>
                {r.active ? "Active" : "Inactive"}
              </Badge>
            </button>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="py-3 text-center text-xs text-muted-foreground">Nothing here yet.</p>
        )}
      </div>
    </CrmCard>
  );
}
