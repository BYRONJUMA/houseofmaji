-- ============ 1. products: brand + auto product code ============
CREATE SEQUENCE IF NOT EXISTS public.store_product_code_seq;
ALTER TABLE public.store_products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.store_products ADD COLUMN IF NOT EXISTS product_code text;

CREATE OR REPLACE FUNCTION public.store_assign_product_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_code IS NULL OR NEW.product_code = '' THEN
    NEW.product_code := 'HOM-' || lpad(nextval('public.store_product_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.store_products WHERE product_code IS NULL ORDER BY created_at LOOP
    UPDATE public.store_products
      SET product_code = 'HOM-' || lpad(nextval('public.store_product_code_seq')::text, 4, '0')
      WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS store_products_product_code_key ON public.store_products (product_code);
DROP TRIGGER IF EXISTS store_products_code ON public.store_products;
CREATE TRIGGER store_products_code BEFORE INSERT ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.store_assign_product_code();

-- ============ 2. suppliers ============
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  logo_url text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_read" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_write" ON public.suppliers FOR ALL TO authenticated
  USING (public.can_write_store(auth.uid())) WITH CHECK (public.can_write_store(auth.uid()));
CREATE TRIGGER suppliers_touch BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 3. requisitions ============
CREATE SEQUENCE IF NOT EXISTS public.store_requisition_no_seq;
CREATE TABLE IF NOT EXISTS public.store_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_no text NOT NULL UNIQUE,
  source_location store_location NOT NULL,
  destination_location store_location NOT NULL,
  description text,
  created_by uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  delivery_status text NOT NULL DEFAULT 'pending_delivery' CHECK (delivery_status IN ('pending_delivery','delivered')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requisition_locations_differ CHECK (source_location <> destination_location)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_requisitions TO authenticated;
GRANT ALL ON public.store_requisitions TO service_role;
ALTER TABLE public.store_requisitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requisitions_read" ON public.store_requisitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "requisitions_write" ON public.store_requisitions FOR ALL TO authenticated
  USING (public.can_write_store(auth.uid())) WITH CHECK (public.can_write_store(auth.uid()));
CREATE TRIGGER store_requisitions_touch BEFORE UPDATE ON public.store_requisitions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.store_assign_requisition_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.requisition_no IS NULL OR NEW.requisition_no = '' THEN
    NEW.requisition_no := 'REQ-' || lpad(nextval('public.store_requisition_no_seq')::text, 6, '0');
  END IF;
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER store_requisitions_no BEFORE INSERT ON public.store_requisitions
  FOR EACH ROW EXECUTE FUNCTION public.store_assign_requisition_no();

CREATE TABLE IF NOT EXISTS public.store_requisition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.store_requisitions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.store_products(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_requisition_items TO authenticated;
GRANT ALL ON public.store_requisition_items TO service_role;
ALTER TABLE public.store_requisition_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requisition_items_read" ON public.store_requisition_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "requisition_items_write" ON public.store_requisition_items FOR ALL TO authenticated
  USING (public.can_write_store(auth.uid())) WITH CHECK (public.can_write_store(auth.uid()));

-- ============ 4. purchase orders ============
CREATE SEQUENCE IF NOT EXISTS public.purchase_order_no_seq;
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lpo_no text NOT NULL UNIQUE,
  supplier_id uuid REFERENCES public.suppliers(id),
  destination_location store_location NOT NULL,
  supplier_invoice_no text,
  description text,
  created_by uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acquired','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_orders_read" ON public.purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_orders_write" ON public.purchase_orders FOR ALL TO authenticated
  USING (public.can_write_store(auth.uid())) WITH CHECK (public.can_write_store(auth.uid()));
CREATE TRIGGER purchase_orders_touch BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.store_assign_lpo_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.lpo_no IS NULL OR NEW.lpo_no = '' THEN
    NEW.lpo_no := 'LPO-' || lpad(nextval('public.purchase_order_no_seq')::text, 6, '0');
  END IF;
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER purchase_orders_no BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.store_assign_lpo_no();

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.store_products(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  tax_percent numeric NOT NULL DEFAULT 0,
  line_total numeric GENERATED ALWAYS AS
    (quantity * unit_price * (1 - discount_percent / 100) * (1 + tax_percent / 100)) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_order_items_read" ON public.purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_order_items_write" ON public.purchase_order_items FOR ALL TO authenticated
  USING (public.can_write_store(auth.uid())) WITH CHECK (public.can_write_store(auth.uid()));

-- ============ 5. stock entry links ============
ALTER TABLE public.store_stock_entries ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id);
ALTER TABLE public.store_stock_entries ADD COLUMN IF NOT EXISTS requisition_id uuid REFERENCES public.store_requisitions(id) ON DELETE SET NULL;
ALTER TABLE public.store_stock_entries ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

-- ============ 6. stock take ============
CREATE TABLE IF NOT EXISTS public.stock_take_variances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.store_products(id) ON DELETE CASCADE,
  location store_location NOT NULL,
  system_quantity numeric NOT NULL,
  counted_quantity numeric NOT NULL,
  variance numeric NOT NULL,
  counted_by uuid REFERENCES public.profiles(id),
  counted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.stock_take_variances TO authenticated;
GRANT ALL ON public.stock_take_variances TO service_role;
ALTER TABLE public.stock_take_variances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_take_read" ON public.stock_take_variances FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_take_insert" ON public.stock_take_variances FOR INSERT TO authenticated
  WITH CHECK (public.can_write_store(auth.uid()));

-- ============ 7. stock-moving actions ============
CREATE OR REPLACE FUNCTION public.store_set_quantity(
  _product_id uuid, _location store_location, _new_qty numeric, _notes text DEFAULT 'Manual stock update'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _current numeric;
BEGIN
  IF NOT public.can_write_store(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to change store stock.';
  END IF;
  SELECT CASE WHEN _location = 'in_house' THEN in_house_qty ELSE warehouse_qty END
    INTO _current FROM public.store_products WHERE id = _product_id;
  IF _current IS NULL THEN RAISE EXCEPTION 'Product not found.'; END IF;
  IF _new_qty = _current THEN RETURN; END IF;
  INSERT INTO public.store_stock_entries (product_id, location, quantity, notes, entered_by)
    VALUES (_product_id, _location, _new_qty - _current, _notes, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.store_requisition_deliver(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.store_requisitions; it record;
BEGIN
  IF NOT public.can_write_store(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to move store stock.';
  END IF;
  SELECT * INTO r FROM public.store_requisitions WHERE id = _id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Requisition not found.'; END IF;
  IF r.status <> 'approved' THEN RAISE EXCEPTION 'Approve the requisition before marking it delivered.'; END IF;
  IF r.delivery_status = 'delivered' THEN RAISE EXCEPTION 'This requisition is already delivered.'; END IF;
  FOR it IN SELECT * FROM public.store_requisition_items WHERE requisition_id = _id LOOP
    INSERT INTO public.store_stock_entries (product_id, location, quantity, notes, entered_by, requisition_id)
      VALUES (it.product_id, r.source_location, -it.quantity, 'Requisition ' || r.requisition_no || ' out', auth.uid(), r.id);
    INSERT INTO public.store_stock_entries (product_id, location, quantity, notes, entered_by, requisition_id)
      VALUES (it.product_id, r.destination_location, it.quantity, 'Requisition ' || r.requisition_no || ' in', auth.uid(), r.id);
  END LOOP;
  UPDATE public.store_requisitions SET delivery_status = 'delivered' WHERE id = _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_purchase_approve(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.purchase_orders; it record;
BEGIN
  IF NOT public.can_write_store(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to approve purchase orders.';
  END IF;
  SELECT * INTO p FROM public.purchase_orders WHERE id = _id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found.'; END IF;
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'This purchase order has already been decided.'; END IF;
  FOR it IN SELECT * FROM public.purchase_order_items WHERE purchase_order_id = _id LOOP
    INSERT INTO public.store_stock_entries
      (product_id, location, quantity, unit_price, notes, entered_by, supplier_id, purchase_order_id)
      VALUES (it.product_id, p.destination_location, it.quantity, it.unit_price,
              'Purchase order ' || p.lpo_no, auth.uid(), p.supplier_id, p.id);
  END LOOP;
  UPDATE public.purchase_orders SET status = 'acquired' WHERE id = _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_stock_take_submit(_location store_location, _rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; _pid uuid; _counted numeric; _system numeric; _n integer := 0;
BEGIN
  IF NOT public.can_write_store(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to submit a stock take.';
  END IF;
  FOR r IN SELECT jsonb_array_elements(_rows) LOOP
    _pid := (r->>'product_id')::uuid;
    _counted := (r->>'counted_quantity')::numeric;
    SELECT CASE WHEN _location = 'in_house' THEN in_house_qty ELSE warehouse_qty END
      INTO _system FROM public.store_products WHERE id = _pid;
    CONTINUE WHEN _system IS NULL OR _counted IS NULL OR _counted = _system;
    INSERT INTO public.stock_take_variances
      (product_id, location, system_quantity, counted_quantity, variance, counted_by)
      VALUES (_pid, _location, _system, _counted, _counted - _system, auth.uid());
    INSERT INTO public.store_stock_entries (product_id, location, quantity, notes, entered_by)
      VALUES (_pid, _location, _counted - _system, 'Stock take adjustment', auth.uid());
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.store_set_quantity(uuid, store_location, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_requisition_deliver(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_purchase_approve(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_stock_take_submit(store_location, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_set_quantity(uuid, store_location, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_requisition_deliver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_purchase_approve(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_stock_take_submit(store_location, jsonb) TO authenticated;