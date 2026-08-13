import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/stages";

export type AdminFulfillment = {
  id: string;
  client_name: string;
  client_contact: string | null;
  location: string;
  machine_type: string;
  capacity_lph: number | string | null;
  agreed_price: number;
  agreed_delivery_date: string;
  assembly_engineer_id: string | null;
  installation_engineer_id: string | null;
  current_stage: string;
};

type Person = { id: string; full_name: string; role: string };

const NONE = "__none__";

export function AdminOrderActions({
  fulfillment,
  people,
}: {
  fulfillment: AdminFulfillment;
  people: Person[];
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState(fulfillment);

  const engineers = people.filter((p) => p.role === "engineer" || p.role === "chief_engineer");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["fulfillments"] });
    qc.invalidateQueries({ queryKey: ["profiles"] });
    qc.invalidateQueries({ queryKey: ["commissions"] });
  };

  const saveOrder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("fulfillments")
        .update({
          client_name: form.client_name,
          client_contact: form.client_contact,
          location: form.location,
          machine_type: form.machine_type,
          capacity_lph: form.capacity_lph === "" || form.capacity_lph === null ? null : Number(form.capacity_lph),
          agreed_price: Number(form.agreed_price),
          agreed_delivery_date: form.agreed_delivery_date,
          assembly_engineer_id: form.assembly_engineer_id,
          installation_engineer_id: form.installation_engineer_id,
          current_stage: form.current_stage,
        })
        .eq("id", fulfillment.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Order updated");
      setEditing(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteOrder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("fulfillments").delete().eq("id", fulfillment.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Order deleted");
      setConfirming(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Button
        size="sm"
        variant="outline"
        aria-label={`Edit order for ${fulfillment.client_name}`}
        onClick={() => {
          setForm(fulfillment);
          setEditing(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        aria-label={`Delete order for ${fulfillment.client_name}`}
        className="text-destructive"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit order</DialogTitle>
            <DialogDescription>
              Admin override — corrections apply immediately. A manual stage change is logged in the
              machine history as an admin override.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Client name"
              value={form.client_name}
              onChange={(v) => setForm({ ...form, client_name: v })}
            />
            <TextField
              label="Client contact"
              value={form.client_contact ?? ""}
              onChange={(v) => setForm({ ...form, client_contact: v || null })}
            />
            <TextField
              label="Location"
              value={form.location}
              onChange={(v) => setForm({ ...form, location: v })}
            />
            <TextField
              label="Machine type"
              value={form.machine_type}
              onChange={(v) => setForm({ ...form, machine_type: v })}
            />
            <TextField
              label="Capacity (LPH)"
              type="number"
              value={form.capacity_lph == null ? "" : String(form.capacity_lph)}
              onChange={(v) => setForm({ ...form, capacity_lph: v === "" ? null : Number(v) })}
            />
            <TextField
              label="Agreed price (KES)"
              type="number"
              value={String(form.agreed_price)}
              onChange={(v) => setForm({ ...form, agreed_price: Number(v) })}
            />
            <TextField
              label="Delivery date"
              type="date"
              value={form.agreed_delivery_date}
              onChange={(v) => setForm({ ...form, agreed_delivery_date: v })}
            />
            <PersonField
              label="Assembly engineer"
              value={form.assembly_engineer_id}
              people={engineers}
              onChange={(v) => setForm({ ...form, assembly_engineer_id: v })}
            />
            <PersonField
              label="Installation engineer"
              value={form.installation_engineer_id}
              people={engineers}
              onChange={(v) => setForm({ ...form, installation_engineer_id: v })}
            />
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Current stage</Label>
              <Select
                value={form.current_stage}
                onValueChange={(v) => setForm({ ...form, current_stage: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STAGE_LABEL[s as Stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveOrder.mutate()} disabled={saveOrder.isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this order and all its history — are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                deleteOrder.mutate();
              }}
            >
              Delete order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  const id = `af-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function PersonField({
  label,
  value,
  people,
  onChange,
}: {
  label: string;
  value: string | null;
  people: Person[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Unassigned</SelectItem>
          {people.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
