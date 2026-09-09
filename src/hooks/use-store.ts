import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StoreLocation = "in_house" | "warehouse";

export const STORE_LOCATIONS: { value: StoreLocation; label: string }[] = [
  { value: "in_house", label: "In-House" },
  { value: "warehouse", label: "Warehouse" },
];

export const locationLabel = (l: string) => (l === "warehouse" ? "Warehouse" : "In-House");

export type StoreProduct = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string | null;
  in_house_qty: number;
  warehouse_qty: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StoreStockEntry = {
  id: string;
  product_id: string;
  location: StoreLocation;
  quantity: number;
  unit_price: number | null;
  total_amount: number | null;
  supplier_name: string | null;
  supplier_contact: string | null;
  notes: string | null;
  entered_by: string | null;
  entered_at: string;
};

export type StoreAccessRow = {
  user_id: string;
  granted_by: string | null;
  granted_at: string;
};

export function useStoreProducts() {
  return useQuery({
    queryKey: ["store-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_products")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as StoreProduct[];
    },
  });
}

export function useStoreProduct(id: string) {
  return useQuery({
    queryKey: ["store-product", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_products")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as StoreProduct | null;
    },
  });
}

export function useStoreEntries(productId?: string) {
  return useQuery({
    queryKey: ["store-entries", productId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("store_stock_entries")
        .select("*")
        .order("entered_at", { ascending: false });
      if (productId) q = q.eq("product_id", productId);
      const { data, error } = await q.limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as StoreStockEntry[];
    },
  });
}

export function useStoreAccessList() {
  return useQuery({
    queryKey: ["store-access"],
    queryFn: async () => {
      const { data, error } = await supabase.from("store_access").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as StoreAccessRow[];
    },
  });
}

/** Admin + chief engineer always; anyone explicitly granted store access too. */
export function useCanWriteStore(role?: string | null, userId?: string | null) {
  const { data: access = [] } = useStoreAccessList();
  if (role === "admin" || role === "chief_engineer") return true;
  return !!userId && access.some((a) => a.user_id === userId);
}

function invalidateStore(qc: ReturnType<typeof useQueryClient>, productId?: string) {
  void qc.invalidateQueries({ queryKey: ["store-products"] });
  void qc.invalidateQueries({ queryKey: ["store-entries"] });
  if (productId) {
    void qc.invalidateQueries({ queryKey: ["store-product", productId] });
    void qc.invalidateQueries({ queryKey: ["store-entries", productId] });
  }
}

export function useStoreProductMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      op:
        | { type: "insert"; values: Record<string, unknown> }
        | { type: "update"; id: string; values: Record<string, unknown> }
        | { type: "delete"; id: string },
    ) => {
      const t = supabase.from("store_products");
      const res =
        op.type === "insert"
          ? await t.insert(op.values as never)
          : op.type === "update"
            ? await t.update(op.values as never).eq("id", op.id)
            : await t.delete().eq("id", op.id);
      if (res.error) throw new Error(res.error.message);
      return true;
    },
    onSuccess: () => invalidateStore(qc),
  });
}

export function useStoreEntryMutation(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase
        .from("store_stock_entries")
        .insert({ ...values, product_id: productId } as never);
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: () => invalidateStore(qc, productId),
  });
}

export function useStoreAccessMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (op: { type: "grant" | "revoke"; userId: string; grantedBy?: string }) => {
      const res =
        op.type === "grant"
          ? await supabase
              .from("store_access")
              .insert({ user_id: op.userId, granted_by: op.grantedBy ?? null } as never)
          : await supabase.from("store_access").delete().eq("user_id", op.userId);
      if (res.error) throw new Error(res.error.message);
      return true;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["store-access"] }),
  });
}
