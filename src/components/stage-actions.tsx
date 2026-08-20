import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Boxes,
  ClipboardCheck,
  Hammer,
  PackageCheck,
  Truck,
  UserCog,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAYMENT_GATE, PAYMENT_GATE_MESSAGE, type Stage } from "@/lib/stages";
import { paidPercent } from "@/hooks/use-payments";

export type StageActionFulfillment = {
  id: string;
  current_stage: string;
  agreed_price: number | string;
  sales_rep_id: string | null;
  chief_engineer_id?: string | null;
  assembly_engineer_id: string | null;
  installation_engineer_id: string | null;
  delivered_confirmed_at?: string | null;
};

function useEngineerOptions(enabled: boolean) {
  const { profile } = useAuth();
  const { data = [] } = useQuery({
    queryKey: ["profiles"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
  // the chief engineer can also take the job themselves
  return data.filter((p) => p.role === "engineer" || (profile?.id && p.id === profile.id));
}

/**
 * Single source of truth for the machine stage-progression buttons.
 * Rendered on every order card and on the order detail page.
 *
 * received             → Order Frame                  (chief engineer)
 * waiting_for_frame    → Start Material Procurement   (chief engineer)
 * material_procurement → Assign Engineer              (chief engineer)
 * assigned             → Mark Machine Received        (assigned assembly engineer)
 * assembling           → Mark Assembly Complete       (assigned assembly engineer)
 * delivery             → Mark Delivered               (the order's own sales rep)
 * assigned…delivery    → Reassign Engineer            (chief engineer)
 *
 * "installed" has no button: it is set by the engineer's delivery-checklist sign-off.
 */
export function StageActions({
  fulfillment: f,
  paid = 0,
  size = "sm",
  showChecklistLink = true,
}: {
  fulfillment: StageActionFulfillment;
  paid?: number;
  size?: "sm" | "default";
  showChecklistLink?: boolean;
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const stage = f.current_stage as Stage;
  const uid = profile?.id;
  const role = profile?.role;

  const isChief = role === "chief_engineer";
  const isAdmin = role === "admin";
  const chiefCanAct = isChief || isAdmin;
  const isAssemblyEngineer = !!uid && f.assembly_engineer_id === uid;
  const isOwningSalesRep = !!uid && f.sales_rep_id === uid;

  const [asm, setAsm] = useState("");
  const [inst, setInst] = useState("");
  const needsEngineers =
    chiefCanAct && ["material_procurement", "assigned", "assembling", "delivery"].includes(stage);
  const engineers = useEngineerOptions(needsEngineers);

  const mutate = useMutation({
    mutationFn: async (patch: TablesUpdate<"fulfillments">) => {
      const { data, error } = await supabase
        .from("fulfillments")
        .update(patch)
        .eq("id", f.id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Order updated");
      // every dashboard + the detail page reads a different key — refresh them all
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nextStage: Stage | null =
    stage === "received"
      ? "waiting_for_frame"
      : stage === "waiting_for_frame"
        ? "material_procurement"
        : null;
  const gate = nextStage ? (PAYMENT_GATE[nextStage] ?? 0) : 0;
  const gateBlocked = nextStage !== null && paidPercent(paid, f.agreed_price) < gate;
  const busy = mutate.isPending;

  const canReassign = chiefCanAct && ["assigned", "assembling", "delivery"].includes(stage);

  const nothing =
    !(chiefCanAct && ["received", "waiting_for_frame", "material_procurement"].includes(stage)) &&
    !(isAssemblyEngineer && ["assigned", "assembling"].includes(stage)) &&
    !(isOwningSalesRep && stage === "delivery") &&
    !canReassign &&
    !(showChecklistLink && ["assembling", "delivery", "installed"].includes(stage));

  if (nothing) return null;

  return (
    <div
      className="space-y-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {gateBlocked && nextStage && chiefCanAct && (
        <p className="rounded-lg bg-destructive/10 px-2.5 py-2 text-xs font-medium text-destructive">
          {PAYMENT_GATE_MESSAGE[nextStage]}
        </p>
      )}

      {chiefCanAct && stage === "received" && (
        <Button
          size={size}
          className="w-full"
          disabled={busy || gateBlocked}
          onClick={() =>
            mutate.mutate({
              current_stage: "waiting_for_frame",
              chief_engineer_id: f.chief_engineer_id ?? uid,
              frame_ordered_at: new Date().toISOString(),
            })
          }
        >
          <PackageCheck className="h-4 w-4" /> Order Frame
        </Button>
      )}

      {chiefCanAct && stage === "waiting_for_frame" && (
        <Button
          size={size}
          className="w-full"
          disabled={busy || gateBlocked}
          onClick={() =>
            mutate.mutate({
              current_stage: "material_procurement",
              chief_engineer_id: f.chief_engineer_id ?? uid,
            })
          }
        >
          <Boxes className="h-4 w-4" /> Start Material Procurement
        </Button>
      )}

      {chiefCanAct && stage === "material_procurement" && (
        <div className="space-y-2">
          <Select value={asm} onValueChange={setAsm}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Assembly engineer *" />
            </SelectTrigger>
            <SelectContent>
              {engineers.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.full_name}
                  {e.id === uid ? " (me)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={inst} onValueChange={(v) => setInst(v === "same" ? "" : v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Installation engineer (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="same">Same engineer installs</SelectItem>
              {engineers.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.full_name}
                  {e.id === uid ? " (me)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size={size}
            className="w-full"
            disabled={!asm || busy}
            onClick={() =>
              mutate.mutate({
                current_stage: "assigned",
                assembly_engineer_id: asm,
                installation_engineer_id: inst || null,
                chief_engineer_id: f.chief_engineer_id ?? uid,
              })
            }
          >
            <Hammer className="h-4 w-4" /> Assign Engineer
          </Button>
        </div>
      )}

      {isAssemblyEngineer && stage === "assigned" && (
        <Button
          size={size}
          className="w-full"
          disabled={busy}
          onClick={() => mutate.mutate({ current_stage: "assembling" })}
        >
          <PackageCheck className="h-4 w-4" /> Mark Machine Received
        </Button>
      )}

      {isAssemblyEngineer && stage === "assembling" && (
        <Button
          size={size}
          className="w-full"
          disabled={busy}
          onClick={() => mutate.mutate({ current_stage: "delivery" })}
        >
          <Truck className="h-4 w-4" /> Mark Assembly Complete
        </Button>
      )}

      {isOwningSalesRep && stage === "delivery" && (
        <>
          <Button
            size={size}
            className="w-full"
            disabled={busy || !!f.delivered_confirmed_at}
            onClick={() =>
              mutate.mutate({
                delivered_confirmed_at: new Date().toISOString(),
                delivered_confirmed_by: uid,
              })
            }
          >
            <CheckCircle2 className="h-4 w-4" />
            {f.delivered_confirmed_at ? "Delivery Confirmed" : "Mark Delivered"}
          </Button>
          <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
            The order becomes Installed once the chief engineer approves and the assigned engineer
            completes the “Delivered &amp; Installed By” sign-off on the delivery checklist.
          </p>
        </>
      )}

      {showChecklistLink && ["assembling", "delivery", "installed"].includes(stage) && (
        <Button asChild size={size} variant="outline" className="w-full">
          <Link to="/fulfillment/$id" params={{ id: f.id }} search={{ tab: "checklist" }}>
            <ClipboardCheck className="h-4 w-4" /> Delivery Checklist
          </Link>
        </Button>
      )}

      {canReassign && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reassign engineer
          </p>
          <Select value={asm} onValueChange={setAsm}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="New assembly engineer" />
            </SelectTrigger>
            <SelectContent>
              {engineers.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.full_name}
                  {e.id === uid ? " (me)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={inst} onValueChange={(v) => setInst(v === "same" ? "" : v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="New installation engineer (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="same">Same engineer installs</SelectItem>
              {engineers.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.full_name}
                  {e.id === uid ? " (me)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size={size}
            variant="outline"
            className="w-full"
            disabled={
              busy ||
              ((!asm || asm === f.assembly_engineer_id) &&
                (inst || "") === (f.installation_engineer_id ?? ""))
            }
            onClick={() => {
              mutate.mutate({
                assembly_engineer_id: asm || f.assembly_engineer_id,
                installation_engineer_id: inst || f.installation_engineer_id || null,
              });
              setAsm("");
              setInst("");
            }}
          >
            <UserCog className="h-4 w-4" /> Reassign Engineer
          </Button>
        </div>
      )}
    </div>
  );
}
