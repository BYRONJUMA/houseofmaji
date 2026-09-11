import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, MoreVertical, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/app-shell";
import { StoreShell, StatusPill } from "@/components/store-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { nameOf, useTeam } from "@/hooks/use-crm";
import { useStoreLocation } from "@/hooks/use-store-location";
import {
  locationLabel,
  otherLocation,
  useCanWriteStore,
  useCreateRequisition,
  useRequisitionAction,
  useRequisitionItems,
  useRequisitions,
  useStoreProducts,
  type StoreLocation,
} from "@/hooks/use-store";
import { formatDate } from "@/lib/format";
import { num } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/store/requisitions")({
  head: () => ({
    meta: [
      { title: "Product Requisitions — Store | Machines" },
      {
        name: "description",
        content:
          "Request stock transfers between the in-house store and the warehouse, then approve and deliver them.",
      },
      { property: "og:title", content: "Product Requisitions — Store | Machines" },
      {
        property: "og:description",
        content: "Stock transfers move only once a requisition is approved and delivered.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RequisitionsPage,
});

function RequisitionsPage() {
  const { profile } = useAuth();
  const canWrite = useCanWriteStore(profile?.role, profile?.id);
  const [location] = useStoreLocation();
  const { data: requisitions = [], isLoading } = useRequisitions();
  const { data: items = [] } = useRequisitionItems();
  const { data: team = [] } = useTeam();
  const action = useRequisitionAction();
  const [creating, setCreating] = useState(false);

  const rows = requisitions.filter(
    (r) => r.source_location === location || r.destination_location === location,
  );
  const qtyOf = (id: string) =>
    items.filter((i) => i.requisition_id === id).reduce((s, i) => s + num(i.quantity), 0);

  const run = (type: "approve" | "reject" | "deliver", id: string) =>
    action.mutate(
      { type, id },
      {
        onSuccess: () =>
          toast.success(
            type === "approve"
              ? "Requisition approved"
              : type === "reject"
                ? "Requisition rejected"
                : "Marked delivered — stock moved",
          ),
        onError: (e: Error) => toast.error(e.message),
      },
    );

  return (
    <StoreShell
      title="Product requisitions"
      subtitle={`Transfers involving the ${locationLabel(location)} store`}
      actions={
        canWrite && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Create requisition
          </Button>
        )
      }
    >
      {rows.length === 0 && !isLoading ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No requisitions yet"
          message={
            canWrite
              ? "Create a requisition to move stock between the in-house store and the warehouse."
              : "No stock transfers have been requested yet."
          }
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3">Created by</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Delivery</th>
                {canWrite && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{r.requisition_no}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-3">{locationLabel(r.source_location)}</td>
                  <td className="px-4 py-3">{locationLabel(r.destination_location)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {qtyOf(r.id)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{nameOf(team, r.created_by)}</td>
                  <td className="px-4 py-3">
                    <StatusPill
                      tone={
                        r.status === "approved" ? "good" : r.status === "rejected" ? "bad" : "neutral"
                      }
                    >
                      {r.status === "approved"
                        ? "Approved"
                        : r.status === "rejected"
                          ? "Rejected"
                          : "Pending"}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone={r.delivery_status === "delivered" ? "good" : "neutral"}>
                      {r.delivery_status === "delivered" ? "Delivered" : "Pending delivery"}
                    </StatusPill>
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Actions for ${r.requisition_no}`}
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {r.status === "pending" && (
                            <>
                              <DropdownMenuItem onClick={() => run("approve", r.id)}>
                                Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => run("reject", r.id)}
                              >
                                Reject
                              </DropdownMenuItem>
                            </>
                          )}
                          {r.status === "approved" && r.delivery_status === "pending_delivery" && (
                            <DropdownMenuItem onClick={() => run("deliver", r.id)}>
                              Mark delivered
                            </DropdownMenuItem>
                          )}
                          {r.status === "rejected" && (
                            <DropdownMenuItem disabled>No actions</DropdownMenuItem>
                          )}
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

      {creating && <CreateRequisitionDialog onClose={() => setCreating(false)} />}
    </StoreShell>
  );
}

type Line = { product_id: string; quantity: string };

function CreateRequisitionDialog({ onClose }: { onClose: () => void }) {
  const [location] = useStoreLocation();
  const { data: products = [] } = useStoreProducts();
  const create = useCreateRequisition();
  const [source, setSource] = useState<StoreLocation>(location);
  const [destination, setDestination] = useState<StoreLocation>(otherLocation(location));
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_id: "", quantity: "" }]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = () => {
    if (source === destination) {
      toast.error("Source and destination must be different stores");
      return;
    }
    const items = lines
      .filter((l) => l.product_id && Number(l.quantity) > 0)
      .map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) }));
    if (items.length === 0) {
      toast.error("Add at least one item with a quantity");
      return;
    }
    create.mutate(
      {
        source_location: source,
        destination_location: destination,
        description: description.trim() || null,
        items,
      },
      {
        onSuccess: () => {
          toast.success("Requisition created");
          onClose();
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create requisition</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Source store</Label>
              <Select
                value={source}
                onValueChange={(v) => {
                  setSource(v as StoreLocation);
                  setDestination(otherLocation(v as StoreLocation));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_house">In-House</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Destination store</Label>
              <Select value={destination} onValueChange={(v) => setDestination(v as StoreLocation)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_house">In-House</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description / notes</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <Select
                    value={l.product_id}
                    onValueChange={(v) => setLine(i, { product_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Item name" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="number"
                  className="w-28"
                  placeholder="Qty"
                  value={l.quantity}
                  onChange={(e) => setLine(i, { quantity: e.target.value })}
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Remove item"
                  onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLines((p) => [...p, { product_id: "", quantity: "" }])}
            >
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </div>
        </div>
        <Button onClick={submit} disabled={create.isPending}>
          Create requisition
        </Button>
      </DialogContent>
    </Dialog>
  );
}
