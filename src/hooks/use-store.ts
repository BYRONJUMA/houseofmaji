import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StoreLocation = "in_house" | "warehouse";

export const STORE_LOCATIONS: { value: StoreLocation; label: string }[] = [
  { value: "in_house", label: "In-House" },
  { value: "warehouse", label: "Warehouse" },
];

export const locationLabel = (l: string) => (l === "warehouse" ? "Warehouse" : "In-House");

export const otherLocation = (l: StoreLocation): StoreLocation =>
  l === "in_house" ? "warehouse" : "in_house";

export type StoreProduct = {
  id: string;
  name: string;
  product_code: string | null;
  sku: string | null;
  brand: string | null;
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
  supplier_id: string | null;
  requisition_id: string | null;
  purchase_order_id: string | null;
  notes: string | null;
  entered_by: string | null;
  entered_at: string;
};

export type StoreAccessRow = {
  user_id: string;
  granted_by: string | null;
  granted_at: string;
};

export type Supplier = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  created_at: string;
};

export type Requisition = {
  id: string;
  requisition_no: string;
  source_location: StoreLocation;
  destination_location: StoreLocation;
  description: string | null;
  created_by: string | null;
  status: "pending" | "approved" | "rejected";
  delivery_status: "pending_delivery" | "delivered";
  created_at: string;
};

export type RequisitionItem = {
  id: string;
  requisition_id: string;
  product_id: string;
  quantity: number;
};

export type PurchaseOrder = {
  id: string;
  lpo_no: string;
  supplier_id: string | null;
  destination_location: StoreLocation;
  supplier_invoice_no: string | null;
  description: string | null;
  created_by: string | null;
  status: "pending" | "acquired" | "rejected";
  created_at: string;
};

export type PurchaseOrderItem = {
  id: string;
  purchase_order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  line_total: number | null;
};

export type StockTakeVariance = {
  id: string;
  product_id: string;
  location: StoreLocation;
  system_quantity: number;
  counted_quantity: number;
  variance: number;
  counted_by: string | null;
  counted_at: string;
};

/* ------------------------------ products ------------------------------ */

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

/** Sets a product's quantity at a location outright; the difference is logged. */
export function useSetQuantity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      productId: string;
      location: StoreLocation;
      newQty: number;
      notes?: string;
    }) => {
      const { error } = await supabase.rpc("store_set_quantity", {
        _product_id: v.productId,
        _location: v.location,
        _new_qty: v.newQty,
        _notes: v.notes ?? "Manual stock update",
      });
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: (_d, v) => invalidateStore(qc, v.productId),
  });
}

/* ------------------------------ suppliers ------------------------------ */

export function useSuppliers() {
  return useQuery({
    queryKey: ["store-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Supplier[];
    },
  });
}

export function useSupplierMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      op:
        | { type: "insert"; values: Record<string, unknown> }
        | { type: "update"; id: string; values: Record<string, unknown> }
        | { type: "delete"; id: string },
    ) => {
      const t = supabase.from("suppliers");
      const res =
        op.type === "insert"
          ? await t.insert(op.values as never)
          : op.type === "update"
            ? await t.update(op.values as never).eq("id", op.id)
            : await t.delete().eq("id", op.id);
      if (res.error) throw new Error(res.error.message);
      return true;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["store-suppliers"] }),
  });
}

/* ------------------------------ requisitions ------------------------------ */

export function useRequisitions() {
  return useQuery({
    queryKey: ["store-requisitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_requisitions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Requisition[];
    },
  });
}

export function useRequisitionItems() {
  return useQuery({
    queryKey: ["store-requisition-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("store_requisition_items").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as RequisitionItem[];
    },
  });
}

export function useCreateRequisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      source_location: StoreLocation;
      destination_location: StoreLocation;
      description: string | null;
      items: { product_id: string; quantity: number }[];
    }) => {
      const { data, error } = await supabase
        .from("store_requisitions")
        .insert({
          source_location: v.source_location,
          destination_location: v.destination_location,
          description: v.description,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const id = (data as { id: string }).id;
      const { error: itemErr } = await supabase
        .from("store_requisition_items")
        .insert(v.items.map((i) => ({ ...i, requisition_id: id })) as never);
      if (itemErr) throw new Error(itemErr.message);
      return id;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["store-requisitions"] });
      void qc.invalidateQueries({ queryKey: ["store-requisition-items"] });
    },
  });
}

export function useRequisitionAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (op: { type: "approve" | "reject" | "deliver"; id: string }) => {
      if (op.type === "deliver") {
        const { error } = await supabase.rpc("store_requisition_deliver", { _id: op.id });
        if (error) throw new Error(error.message);
        return true;
      }
      const { error } = await supabase
        .from("store_requisitions")
        .update({ status: op.type === "approve" ? "approved" : "rejected" } as never)
        .eq("id", op.id);
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["store-requisitions"] });
      invalidateStore(qc);
    },
  });
}

/* ------------------------------ purchase orders ------------------------------ */

export function usePurchaseOrders() {
  return useQuery({
    queryKey: ["store-purchase-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PurchaseOrder[];
    },
  });
}

export function usePurchaseOrderItems() {
  return useQuery({
    queryKey: ["store-purchase-order-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_order_items").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as PurchaseOrderItem[];
    },
  });
}

export type NewPurchaseItem = {
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
};

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      supplier_id: string | null;
      destination_location: StoreLocation;
      supplier_invoice_no: string | null;
      description: string | null;
      items: NewPurchaseItem[];
    }) => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .insert({
          supplier_id: v.supplier_id,
          destination_location: v.destination_location,
          supplier_invoice_no: v.supplier_invoice_no,
          description: v.description,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const id = (data as { id: string }).id;
      const { error: itemErr } = await supabase
        .from("purchase_order_items")
        .insert(v.items.map((i) => ({ ...i, purchase_order_id: id })) as never);
      if (itemErr) throw new Error(itemErr.message);
      return id;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["store-purchase-orders"] });
      void qc.invalidateQueries({ queryKey: ["store-purchase-order-items"] });
    },
  });
}

export function usePurchaseOrderAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (op: { type: "approve" | "reject"; id: string }) => {
      if (op.type === "approve") {
        const { error } = await supabase.rpc("store_purchase_approve", { _id: op.id });
        if (error) throw new Error(error.message);
        return true;
      }
      const { error } = await supabase
        .from("purchase_orders")
        .update({ status: "rejected" } as never)
        .eq("id", op.id);
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["store-purchase-orders"] });
      invalidateStore(qc);
    },
  });
}

/* ------------------------------ stock take ------------------------------ */

export function useStockTakeVariances() {
  return useQuery({
    queryKey: ["store-stock-take"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_take_variances")
        .select("*")
        .order("counted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as StockTakeVariance[];
    },
  });
}

export function useSubmitStockTake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      location: StoreLocation;
      rows: { product_id: string; counted_quantity: number }[];
    }) => {
      const { data, error } = await supabase.rpc("store_stock_take_submit", {
        _location: v.location,
        _rows: v.rows,
      });
      if (error) throw new Error(error.message);
      return (data ?? 0) as number;
    },
    onSuccess: () => {
      invalidateStore(qc);
      void qc.invalidateQueries({ queryKey: ["store-stock-take"] });
    },
  });
}

/* ------------------------------ status helper ------------------------------ */

export type StockStatus = "IN_STOCK" | "LOW" | "OUT_OF_STOCK";

export function stockStatus(qty: number, threshold: number): StockStatus {
  if (qty <= 0) return "OUT_OF_STOCK";
  if (qty <= threshold) return "LOW";
  return "IN_STOCK";
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  IN_STOCK: "In stock",
  LOW: "Low",
  OUT_OF_STOCK: "Out of stock",
};
