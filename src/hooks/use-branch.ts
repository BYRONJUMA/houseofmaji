import { useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hasAnyRole, type RoleInput } from "@/lib/crm";

/** The one seeded branch that holds everything built before branches existed. */
export const MACHINES_BRANCH_ID = "00000000-0000-0000-0000-000000000001";

export type Branch = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  created_by: string | null;
  created_at: string;
};

export type BranchAccessRow = {
  id: string;
  branch_id: string;
  user_id: string;
  granted_by: string | null;
  granted_at: string;
};

/* --------------------------- selected branch --------------------------- */

const KEY = "selected-branch";
const listeners = new Set<() => void>();
let current: string = MACHINES_BRANCH_ID;
let hydrated = false;

function read(): string {
  if (typeof window === "undefined") return MACHINES_BRANCH_ID;
  if (!hydrated) {
    const saved = window.sessionStorage.getItem(KEY);
    if (saved) current = saved;
    hydrated = true;
  }
  return current;
}

export function setSelectedBranch(id: string) {
  current = id;
  hydrated = true;
  if (typeof window !== "undefined") window.sessionStorage.setItem(KEY, id);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Branch selection, kept for the whole browser session. */
export function useSelectedBranch(): [string, (id: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(),
    () => MACHINES_BRANCH_ID,
  );
  return [value, setSelectedBranch];
}

/* --------------------------- data --------------------------- */

export function useBranches() {
  return useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Branch[];
    },
  });
}

/**
 * The branch in use right now. Falls back to the first branch the person can
 * reach, so a stale selection never leaves them looking at nothing.
 */
export function useCurrentBranch() {
  const [selected, setSelected] = useSelectedBranch();
  const { data: branches = [], isLoading } = useBranches();
  const match = branches.find((b) => b.id === selected);
  const branch = match ?? branches[0] ?? null;
  const branchId = branch?.id ?? MACHINES_BRANCH_ID;
  return {
    branchId,
    branch,
    branches,
    isLoading,
    isMachines: branchId === MACHINES_BRANCH_ID,
    setBranch: setSelected,
  };
}

export function useBranchAccessList() {
  return useQuery({
    queryKey: ["branch-access"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branch_access").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as BranchAccessRow[];
    },
  });
}

/** Can this person create sales, void them or mark them paid in this branch? */
export function useCanWriteBranchPos(
  role: RoleInput,
  userId: string | null | undefined,
  branchId: string,
  canWriteStore: boolean,
) {
  const { data: access = [] } = useBranchAccessList();
  if (hasAnyRole(role, "admin")) return true;
  if (branchId === MACHINES_BRANCH_ID) return canWriteStore;
  return !!userId && access.some((a) => a.user_id === userId && a.branch_id === branchId);
}

export function useBranchMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      op:
        | { type: "insert"; values: Record<string, unknown> }
        | { type: "update"; id: string; values: Record<string, unknown> }
        | { type: "delete"; id: string },
    ) => {
      const t = supabase.from("branches");
      const res =
        op.type === "insert"
          ? await t.insert(op.values as never)
          : op.type === "update"
            ? await t.update(op.values as never).eq("id", op.id)
            : await t.delete().eq("id", op.id);
      if (res.error) throw new Error(res.error.message);
      return true;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["branches"] }),
  });
}

export function useBranchAccessMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      op:
        | { type: "grant"; branchId: string; userId: string; grantedBy?: string | null }
        | { type: "revoke"; branchId: string; userId: string },
    ) => {
      const res =
        op.type === "grant"
          ? await supabase.from("branch_access").insert({
              branch_id: op.branchId,
              user_id: op.userId,
              granted_by: op.grantedBy ?? null,
            } as never)
          : await supabase
              .from("branch_access")
              .delete()
              .eq("branch_id", op.branchId)
              .eq("user_id", op.userId);
      if (res.error) throw new Error(res.error.message);
      return true;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["branch-access"] }),
  });
}
