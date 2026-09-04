import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDate } from "@/lib/format";

export type Equipment = {
  id: string;
  user_id: string;
  item_name: string;
  item_description: string | null;
  date_assigned: string;
  condition: string | null;
  notes: string | null;
  created_at: string;
};

const CONDITIONS = ["New", "Good", "Fair", "Poor"];

export function useEquipment(userId?: string) {
  return useQuery({
    queryKey: ["assigned-equipment", userId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("assigned_equipment")
        .select("*")
        .order("date_assigned", { ascending: false });
      if (userId) q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Equipment[];
    },
  });
}

/** Company equipment/products currently held by a person. */
export function EquipmentPanel({
  userId,
  canEdit,
  title = "Assigned equipment",
}: {
  userId: string;
  canEdit: boolean;
  title?: string;
}) {
  const { data: rows = [] } = useEquipment(userId);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <section className="surface-card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Boxes className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {rows.length}
        </span>
        {canEdit && (
          <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add item
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          No company equipment recorded yet.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((e) => (
            <div key={e.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{e.item_name}</p>
                <div className="flex items-center gap-2">
                  {e.condition && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      {e.condition}
                    </span>
                  )}
                  {canEdit && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Edit ${e.item_name}`}
                        onClick={() => setEditing(e)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <RemoveItem item={e} />
                    </>
                  )}
                </div>
              </div>
              {e.item_description && (
                <p className="mt-1 text-xs text-muted-foreground">{e.item_description}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Assigned {formatDate(e.date_assigned)}
                {e.notes ? ` · ${e.notes}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <EquipmentDialog
          userId={userId}
          item={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function useEquipmentMutation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      op:
        | { type: "insert"; values: Record<string, unknown> }
        | { type: "update"; id: string; values: Record<string, unknown> }
        | { type: "delete"; id: string },
    ) => {
      const t = supabase.from("assigned_equipment");
      const res =
        op.type === "insert"
          ? await t.insert(op.values as never)
          : op.type === "update"
            ? await t.update(op.values as never).eq("id", op.id)
            : await t.delete().eq("id", op.id);
      if (res.error) throw new Error(res.error.message);
      return true;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["assigned-equipment", userId] });
      void qc.invalidateQueries({ queryKey: ["assigned-equipment", "all"] });
    },
  });
}

function RemoveItem({ item }: { item: Equipment }) {
  const mutate = useEquipmentMutation(item.user_id);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          aria-label={`Remove ${item.item_name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {item.item_name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the item from the assigned equipment list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() =>
              mutate.mutate(
                { type: "delete", id: item.id },
                {
                  onSuccess: () => toast.success("Item removed"),
                  onError: (e: Error) => toast.error(e.message),
                },
              )
            }
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EquipmentDialog({
  userId,
  item,
  onClose,
}: {
  userId: string;
  item: Equipment | null;
  onClose: () => void;
}) {
  const mutate = useEquipmentMutation(userId);
  const [f, setF] = useState({
    item_name: item?.item_name ?? "",
    item_description: item?.item_description ?? "",
    date_assigned: item?.date_assigned ?? new Date().toISOString().slice(0, 10),
    condition: item?.condition ?? "",
    notes: item?.notes ?? "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!f.item_name.trim()) {
      toast.error("Item name is required");
      return;
    }
    const values = {
      user_id: userId,
      item_name: f.item_name.trim(),
      item_description: f.item_description.trim() || null,
      date_assigned: f.date_assigned || new Date().toISOString().slice(0, 10),
      condition: f.condition || null,
      notes: f.notes.trim() || null,
    };
    mutate.mutate(item ? { type: "update", id: item.id, values } : { type: "insert", values }, {
      onSuccess: () => {
        toast.success(item ? "Item updated" : "Item added");
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit equipment" : "Add equipment"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Item name</Label>
            <Input
              value={f.item_name}
              onChange={(e) => set("item_name", e.target.value)}
              placeholder="Company phone, Laptop, Demo RO unit…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={f.item_description}
              onChange={(e) => set("item_description", e.target.value)}
              placeholder="Make, model or serial number"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Date assigned</Label>
              <Input
                type="date"
                value={f.date_assigned}
                onChange={(e) => set("date_assigned", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Condition</Label>
              <Select
                value={f.condition || "none"}
                onValueChange={(v) => set("condition", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not stated" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not stated</SelectItem>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={f.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anything worth tracking"
            />
          </div>
        </div>
        <Button onClick={submit} disabled={mutate.isPending}>
          {item ? "Save changes" : "Add item"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
