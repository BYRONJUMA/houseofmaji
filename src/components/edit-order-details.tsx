import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];

export type EditableFulfillment = {
  id: string;
  client_name: string;
  client_contact: string | null;
  location: string;
  machine_type: string;
  capacity_lph: number | null;
  agreed_price: number;
  agreed_delivery_date: string;
  water_analysis_file_url: string | null;
  water_analysis_notes: string | null;
  additional_notes: string | null;
  sales_rep_id: string | null;
};

export function canEditOrderDetails(
  role: string | undefined,
  userId: string | undefined,
  salesRepId: string | null,
) {
  if (!role || !userId) return false;
  if (role === "admin" || role === "chief_engineer") return true;
  return role === "sales_rep" && !!salesRepId && salesRepId === userId;
}

export function EditOrderDetails({ fulfillment }: { fulfillment: EditableFulfillment }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [form, setForm] = useState({
    client_name: fulfillment.client_name,
    client_contact: fulfillment.client_contact ?? "",
    location: fulfillment.location,
    machine_type: fulfillment.machine_type,
    capacity_lph: fulfillment.capacity_lph == null ? "" : String(fulfillment.capacity_lph),
    agreed_price: String(fulfillment.agreed_price),
    agreed_delivery_date: fulfillment.agreed_delivery_date,
    water_analysis_notes: fulfillment.water_analysis_notes ?? "",
    additional_notes: fulfillment.additional_notes ?? "",
  });

  const allowed = canEditOrderDetails(profile?.role, profile?.id, fulfillment.sales_rep_id);
  if (!allowed) return null;

  const reset = () => {
    setForm({
      client_name: fulfillment.client_name,
      client_contact: fulfillment.client_contact ?? "",
      location: fulfillment.location,
      machine_type: fulfillment.machine_type,
      capacity_lph: fulfillment.capacity_lph == null ? "" : String(fulfillment.capacity_lph),
      agreed_price: String(fulfillment.agreed_price),
      agreed_delivery_date: fulfillment.agreed_delivery_date,
      water_analysis_notes: fulfillment.water_analysis_notes ?? "",
      additional_notes: fulfillment.additional_notes ?? "",
    });
    setFile(null);
    setFileKey((k) => k + 1);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.client_name.trim()) throw new Error("Client name is required");
      if (!form.location.trim()) throw new Error("Location is required");
      if (!form.machine_type.trim()) throw new Error("Machine type is required");
      if (!form.agreed_delivery_date) throw new Error("Delivery date is required");

      let filePath = fulfillment.water_analysis_file_url;
      if (file) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          throw new Error("Water analysis must be a PDF, PNG or JPG file");
        }
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "dat";
        filePath = `${profile!.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("water-analysis")
          .upload(filePath, file, { contentType: file.type });
        if (upErr) throw upErr;
      }

      const { error } = await supabase
        .from("fulfillments")
        .update({
          client_name: form.client_name.trim(),
          client_contact: form.client_contact.trim() || null,
          location: form.location.trim(),
          machine_type: form.machine_type.trim(),
          capacity_lph: form.capacity_lph === "" ? null : Number(form.capacity_lph),
          agreed_price: Number(form.agreed_price),
          agreed_delivery_date: form.agreed_delivery_date,
          water_analysis_file_url: filePath,
          water_analysis_notes: form.water_analysis_notes.trim() || null,
          additional_notes: form.additional_notes.trim() || null,
        })
        .eq("id", fulfillment.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Order details updated — change logged in Machine History");
      setOpen(false);
      setFile(null);
      setFileKey((k) => k + 1);
      qc.invalidateQueries({ queryKey: ["fulfillment", fulfillment.id] });
      qc.invalidateQueries({ queryKey: ["fulfillments"] });
      qc.invalidateQueries({ queryKey: ["my-fulfillments"] });
      qc.invalidateQueries({ queryKey: ["delivery-checklists", fulfillment.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit Details
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit order details</DialogTitle>
            <DialogDescription>
              Correct order information. Stage and engineer assignments keep their own dedicated
              actions. Every change is logged in the Machine History.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Client name"
              value={form.client_name}
              onChange={(v) => setForm({ ...form, client_name: v })}
            />
            <Field
              label="Client contact"
              value={form.client_contact}
              onChange={(v) => setForm({ ...form, client_contact: v })}
            />
            <Field
              label="Location"
              value={form.location}
              onChange={(v) => setForm({ ...form, location: v })}
            />
            <Field
              label="Machine type"
              value={form.machine_type}
              onChange={(v) => setForm({ ...form, machine_type: v })}
            />
            <Field
              label="Capacity (LPH)"
              type="number"
              value={form.capacity_lph}
              onChange={(v) => setForm({ ...form, capacity_lph: v })}
            />
            <Field
              label="Agreed price (KES)"
              type="number"
              value={form.agreed_price}
              onChange={(v) => setForm({ ...form, agreed_price: v })}
            />
            <Field
              label="Delivery date"
              type="date"
              value={form.agreed_delivery_date}
              onChange={(v) => setForm({ ...form, agreed_delivery_date: v })}
            />
            <div className="space-y-1.5">
              <Label htmlFor="eod-file">Replace water analysis file</Label>
              <Input
                key={fileKey}
                id="eod-file"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                {fulfillment.water_analysis_file_url
                  ? "A file is attached — uploading replaces it."
                  : "No file attached yet."}
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="eod-wan">Water analysis notes</Label>
              <Textarea
                id="eod-wan"
                rows={3}
                value={form.water_analysis_notes}
                onChange={(e) => setForm({ ...form, water_analysis_notes: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="eod-notes">Additional notes</Label>
              <Textarea
                id="eod-notes"
                rows={3}
                value={form.additional_notes}
                onChange={(e) => setForm({ ...form, additional_notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
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
  const id = `eod-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
