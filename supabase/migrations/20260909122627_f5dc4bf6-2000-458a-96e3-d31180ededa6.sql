CREATE TYPE public.store_location AS ENUM ('in_house', 'warehouse');

CREATE TABLE public.store_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  sku text,
  category text,
  unit text,
  in_house_qty numeric NOT NULL DEFAULT 0,
  warehouse_qty numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_products TO authenticated;
GRANT ALL ON public.store_products TO service_role;
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.store_stock_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.store_products(id),
  location public.store_location NOT NULL,
  quantity numeric NOT NULL,
  unit_price numeric,
  total_amount numeric GENERATED ALWAYS AS (
    CASE WHEN unit_price IS NULL THEN NULL ELSE quantity * unit_price END
  ) STORED,
  supplier_name text,
  supplier_contact text,
  notes text,
  entered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_stock_entries TO authenticated;
GRANT ALL ON public.store_stock_entries TO service_role;
ALTER TABLE public.store_stock_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX store_stock_entries_product_idx ON public.store_stock_entries(product_id, entered_at DESC);

CREATE TABLE public.store_access (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_access TO authenticated;
GRANT ALL ON public.store_access TO service_role;
ALTER TABLE public.store_access ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_write_store(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'chief_engineer')
      OR EXISTS (SELECT 1 FROM public.store_access WHERE user_id = _user_id)
$$;

CREATE POLICY "store products readable by signed in" ON public.store_products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "store products insert with store access" ON public.store_products
  FOR INSERT TO authenticated WITH CHECK (public.can_write_store(auth.uid()));
CREATE POLICY "store products update with store access" ON public.store_products
  FOR UPDATE TO authenticated USING (public.can_write_store(auth.uid()))
  WITH CHECK (public.can_write_store(auth.uid()));
CREATE POLICY "store products delete with store access" ON public.store_products
  FOR DELETE TO authenticated USING (public.can_write_store(auth.uid()));

CREATE POLICY "store entries readable by signed in" ON public.store_stock_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "store entries insert with store access" ON public.store_stock_entries
  FOR INSERT TO authenticated WITH CHECK (public.can_write_store(auth.uid()));

CREATE POLICY "store access readable by signed in" ON public.store_access
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "store access managed by admin" ON public.store_access
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.store_apply_stock_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.entered_by IS NULL THEN
    NEW.entered_by := auth.uid();
  END IF;
  IF NEW.location = 'in_house' THEN
    UPDATE public.store_products
      SET in_house_qty = in_house_qty + NEW.quantity, updated_at = now()
      WHERE id = NEW.product_id;
  ELSE
    UPDATE public.store_products
      SET warehouse_qty = warehouse_qty + NEW.quantity, updated_at = now()
      WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER store_stock_entry_applied
  BEFORE INSERT ON public.store_stock_entries
  FOR EACH ROW EXECUTE FUNCTION public.store_apply_stock_entry();

CREATE OR REPLACE FUNCTION public.store_block_product_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.store_stock_entries WHERE product_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot delete "%": it still has stock entries. Adjust its in-house and warehouse quantities to zero and clear its stock history first.', OLD.name;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER store_product_delete_guard
  BEFORE DELETE ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.store_block_product_delete();

CREATE TRIGGER store_products_touch
  BEFORE UPDATE ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();