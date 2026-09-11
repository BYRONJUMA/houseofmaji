import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { MoreVertical, Plus, Truck } from "lucide-react";
import { EmptyState } from "@/components/app-shell";
import { StoreShell } from "@/components/store-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  useCanWriteStore,
  useSupplierMutation,
  useSuppliers,
  type Supplier,
} from "@/hooks/use-store";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/store/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — Store | Machines" },
      {
        name: "description",
        content: "A managed list of store suppliers with contact details and logos.",
      },
      { property: "og:title", content: "Suppliers — Store | Machines" },
      {
        property: "og:description",
        content: "Keep supplier contacts in one place and link them to stock and purchases.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const { profile } = useAuth();
  const canWrite = useCanWriteStore(profile?.role, profile?.id);
  const { data: suppliers = [], isLoading } = useSuppliers();
  const mutate = useSupplierMutation();
  const [dialog, setDialog] = useState<{ supplier: Supplier | null } | null>(null);

  return (
    <StoreShell
      title="Suppliers"
      subtitle="Who you buy store items from"
      actions={
        canWrite && (
          <Button onClick={() => setDialog({ supplier: null })}>
            <Plus className="h-4 w-4" /> Add supplier
          </Button>
        )
      }
    >
      {suppliers.length === 0 && !isLoading ? (
        <EmptyState
          icon={Truck}
          title="No suppliers yet"
          message={
            canWrite
              ? "Add a supplier so stock deliveries and purchase orders can be linked to them."
              : "No suppliers have been added yet."
          }
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Added</th>
                {canWrite && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium">
                      {s.logo_url ? (
                        <img
                          src={s.logo_url}
                          alt={`${s.name} logo`}
                          className="h-8 w-8 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary">
                          <Truck className="h-4 w-4" />
                        </span>
                      )}
                      {s.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.email || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.phone || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(s.created_at)}</td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" aria-label={`Actions for ${s.name}`}>
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDialog({ supplier: s })}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() =>
                              mutate.mutate(
                                { type: "delete", id: s.id },
                                {
                                  onSuccess: () => toast.success("Supplier deleted"),
                                  onError: (e: Error) => toast.error(e.message),
                                },
                              )
                            }
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog && (
        <SupplierDialog supplier={dialog.supplier} onClose={() => setDialog(null)} />
      )}
    </StoreShell>
  );
}

function SupplierDialog({
  supplier,
  onClose,
}: {
  supplier: Supplier | null;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const mutate = useSupplierMutation();
  const [f, setF] = useState({
    name: supplier?.name ?? "",
    email: supplier?.email ?? "",
    phone: supplier?.phone ?? "",
  });
  const [logoUrl, setLogoUrl] = useState(supplier?.logo_url ?? "");
  const [uploading, setUploading] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const { error } = await supabase.storage.from("supplier-logos").upload(path, file, {
        upsert: true,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("supplier-logos").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    if (!f.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    const values: Record<string, unknown> = {
      name: f.name.trim(),
      email: f.email.trim() || null,
      phone: f.phone.trim() || null,
      logo_url: logoUrl || null,
    };
    if (!supplier) values.created_by = profile?.id ?? null;
    mutate.mutate(
      supplier ? { type: "update", id: supplier.id, values } : { type: "insert", values },
      {
        onSuccess: () => {
          toast.success(supplier ? "Supplier updated" : "Supplier added");
          onClose();
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier ? "Edit supplier" : "Add supplier"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Logo (optional)</Label>
            <div className="flex items-center gap-3">
              {logoUrl && (
                <img src={logoUrl} alt="Supplier logo" className="h-12 w-12 rounded-lg object-cover" />
              )}
              <Input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={f.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
        </div>
        <Button onClick={submit} disabled={mutate.isPending || uploading}>
          {supplier ? "Save changes" : "Add supplier"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
