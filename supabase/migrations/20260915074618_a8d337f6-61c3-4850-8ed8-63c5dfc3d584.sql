-- ============ branches ============
CREATE TABLE public.branches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  location text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

INSERT INTO public.branches (id, name, description)
VALUES ('00000000-0000-0000-0000-000000000001', 'Machines',
        'Water machine sales, fulfillment, CRM, services and store');

CREATE TRIGGER touch_branches BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.branch_access (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (branch_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.branch_access TO authenticated;
GRANT ALL ON public.branch_access TO service_role;
ALTER TABLE public.branch_access ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_machines_branch(_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _branch_id = '00000000-0000-0000-0000-000000000001'::uuid;
$$;

CREATE OR REPLACE FUNCTION public.can_use_branch(_user_id uuid, _branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR (public.is_machines_branch(_branch_id) AND public.has_any_role(_user_id))
      OR EXISTS (SELECT 1 FROM public.branch_access
                  WHERE user_id = _user_id AND branch_id = _branch_id);
$$;

CREATE OR REPLACE FUNCTION public.can_write_branch_pos(_user_id uuid, _branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR (public.is_machines_branch(_branch_id) AND public.can_write_store(_user_id))
      OR EXISTS (SELECT 1 FROM public.branch_access
                  WHERE user_id = _user_id AND branch_id = _branch_id);
$$;

REVOKE ALL ON FUNCTION public.is_machines_branch(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_use_branch(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_branch_pos(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_machines_branch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_branch(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_branch_pos(uuid, uuid) TO authenticated;

CREATE POLICY "Anyone with a role can see branches they may use" ON public.branches
  FOR SELECT TO authenticated USING (public.can_use_branch(auth.uid(), id));
CREATE POLICY "Admins manage branches" ON public.branches
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "See own branch grants or all as admin" ON public.branch_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins grant branch access" ON public.branch_access
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins revoke branch access" ON public.branch_access
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ tag existing data with its branch ============
ALTER TABLE public.fulfillments ADD COLUMN branch_id uuid NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.branches(id);
ALTER TABLE public.leads ADD COLUMN branch_id uuid NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.branches(id);
ALTER TABLE public.store_products ADD COLUMN branch_id uuid NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.branches(id);
ALTER TABLE public.sales ADD COLUMN branch_id uuid NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.branches(id);
ALTER TABLE public.pos_customers ADD COLUMN branch_id uuid NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.branches(id);
ALTER TABLE public.services ADD COLUMN branch_id uuid NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.branches(id);
ALTER TABLE public.site_visits ADD COLUMN branch_id uuid NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.branches(id);
ALTER TABLE public.purchase_orders ADD COLUMN branch_id uuid NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.branches(id);
ALTER TABLE public.store_requisitions ADD COLUMN branch_id uuid NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.branches(id);
ALTER TABLE public.schools ADD COLUMN branch_id uuid NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.branches(id);

CREATE INDEX sales_branch_idx ON public.sales (branch_id);
CREATE INDEX store_products_branch_idx ON public.store_products (branch_id);
CREATE INDEX pos_customers_branch_idx ON public.pos_customers (branch_id);

-- ============ branch-aware sale creation ============
DROP FUNCTION IF EXISTS public.pos_create_sale(public.store_location, public.pos_payment_method, jsonb, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.pos_create_sale(
  _branch_id uuid,
  _location public.store_location,
  _payment_method public.pos_payment_method,
  _items jsonb,
  _customer_id uuid DEFAULT NULL,
  _new_customer_name text DEFAULT NULL,
  _new_customer_phone text DEFAULT NULL,
  _additional_info text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _customer uuid := _customer_id;
  _row record;
  _qty numeric;
  _base numeric;
  _disc numeric;
  _tax numeric;
  _line numeric;
  _subtotal numeric := 0;
  _discount_total numeric := 0;
  _tax_total numeric := 0;
  _total numeric := 0;
  _sale_id uuid;
  _invoice text;
  _have numeric;
  _pname text;
  _pbranch uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _branch_id IS NULL THEN RAISE EXCEPTION 'Choose a branch'; END IF;
  IF NOT public.can_write_branch_pos(_uid, _branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to create sales for this branch';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one item to the sale';
  END IF;

  IF _customer IS NULL THEN
    IF coalesce(btrim(coalesce(_new_customer_name, '')), '') = '' THEN
      RAISE EXCEPTION 'Choose or name a customer';
    END IF;
    INSERT INTO public.pos_customers (name, phone, branch_id)
    VALUES (btrim(_new_customer_name), nullif(btrim(coalesce(_new_customer_phone, '')), ''), _branch_id)
    RETURNING id INTO _customer;
  ELSIF NOT EXISTS (SELECT 1 FROM public.pos_customers WHERE id = _customer AND branch_id = _branch_id) THEN
    RAISE EXCEPTION 'That customer belongs to another branch';
  END IF;

  FOR _row IN
    SELECT (i->>'product_id')::uuid AS product_id,
           sum((i->>'quantity')::numeric) AS quantity
      FROM jsonb_array_elements(_items) i
     GROUP BY 1
  LOOP
    SELECT CASE WHEN _location = 'in_house' THEN p.in_house_qty ELSE p.warehouse_qty END,
           p.name, p.branch_id
      INTO _have, _pname, _pbranch
      FROM public.store_products p WHERE p.id = _row.product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF _pbranch <> _branch_id THEN
      RAISE EXCEPTION '% belongs to another branch', _pname;
    END IF;
    IF _have < _row.quantity THEN
      RAISE EXCEPTION 'Not enough stock for % — % available, % needed', _pname, _have, _row.quantity;
    END IF;
  END LOOP;

  _invoice := 'INV-' || lpad(nextval('public.pos_invoice_no_seq')::text, 6, '0');

  INSERT INTO public.sales (invoice_no, customer_id, branch_id, location, payment_method,
                            additional_info, status, created_by)
  VALUES (_invoice, _customer, _branch_id, _location, _payment_method,
          nullif(btrim(coalesce(_additional_info, '')), ''),
          CASE WHEN _payment_method = 'credit' THEN 'pending_payment'::public.pos_sale_status
               ELSE 'completed'::public.pos_sale_status END,
          _uid)
  RETURNING id INTO _sale_id;

  FOR _row IN SELECT * FROM jsonb_array_elements(_items) AS i LOOP
    _qty := (_row.i->>'quantity')::numeric;
    IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Every line needs a quantity above zero'; END IF;
    _base := _qty * coalesce((_row.i->>'unit_price')::numeric, 0);
    _disc := _base * coalesce((_row.i->>'discount_percent')::numeric, 0) / 100;
    _tax := (_base - _disc) * coalesce((_row.i->>'tax_percent')::numeric, 0) / 100;
    _line := _base - _disc + _tax;
    _subtotal := _subtotal + _base;
    _discount_total := _discount_total + _disc;
    _tax_total := _tax_total + _tax;
    _total := _total + _line;

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount_percent,
                                   tax_percent, line_total)
    VALUES (_sale_id, (_row.i->>'product_id')::uuid, _qty,
            coalesce((_row.i->>'unit_price')::numeric, 0),
            coalesce((_row.i->>'discount_percent')::numeric, 0),
            coalesce((_row.i->>'tax_percent')::numeric, 0), _line);

    INSERT INTO public.store_stock_entries (product_id, location, quantity, notes, entered_by)
    VALUES ((_row.i->>'product_id')::uuid, _location, -_qty, 'Sold on invoice ' || _invoice, _uid);
  END LOOP;

  UPDATE public.sales
     SET subtotal = _subtotal, discount_amount = _discount_total,
         tax_amount = _tax_total, total_amount = _total
   WHERE id = _sale_id;

  RETURN jsonb_build_object('sale_id', _sale_id, 'invoice_no', _invoice, 'total_amount', _total);
END;
$$;
REVOKE ALL ON FUNCTION public.pos_create_sale(uuid, public.store_location, public.pos_payment_method, jsonb, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_create_sale(uuid, public.store_location, public.pos_payment_method, jsonb, uuid, text, text, text) TO authenticated;

-- ============ branch-aware void / mark paid ============
CREATE OR REPLACE FUNCTION public.pos_void_sale(_sale_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _sale public.sales;
  _row record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF coalesce(btrim(coalesce(_reason, '')), '') = '' THEN
    RAISE EXCEPTION 'Give a reason for voiding this sale';
  END IF;
  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF NOT public.can_write_branch_pos(_uid, _sale.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to void sales for this branch';
  END IF;
  IF _sale.status = 'voided' THEN RAISE EXCEPTION 'This sale is already voided'; END IF;

  FOR _row IN SELECT product_id, quantity FROM public.sale_items WHERE sale_id = _sale_id LOOP
    INSERT INTO public.store_stock_entries (product_id, location, quantity, notes, entered_by)
    VALUES (_row.product_id, _sale.location, _row.quantity,
            'Returned from voided invoice ' || _sale.invoice_no, _uid);
  END LOOP;

  UPDATE public.sales
     SET status = 'voided', voided_by = _uid, voided_at = now(), void_reason = btrim(_reason)
   WHERE id = _sale_id;

  RETURN jsonb_build_object('invoice_no', _sale.invoice_no, 'status', 'voided');
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_mark_sale_paid(_sale_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _sale public.sales;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF NOT public.can_write_branch_pos(_uid, _sale.branch_id) THEN
    RAISE EXCEPTION 'You do not have permission to update sales for this branch';
  END IF;
  IF _sale.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'Only a pending credit sale can be marked paid';
  END IF;
  UPDATE public.sales SET status = 'completed' WHERE id = _sale_id;
  RETURN jsonb_build_object('invoice_no', _sale.invoice_no, 'status', 'completed');
END;
$$;

-- ============ branch-scoped visibility for POS data ============
DROP POLICY "Role holders can view sales" ON public.sales;
CREATE POLICY "Branch users can view sales" ON public.sales
  FOR SELECT TO authenticated USING (public.can_use_branch(auth.uid(), branch_id));

DROP POLICY "Role holders can view sale items" ON public.sale_items;
CREATE POLICY "Branch users can view sale items" ON public.sale_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s
                  WHERE s.id = sale_id AND public.can_use_branch(auth.uid(), s.branch_id)));

DROP POLICY "Role holders can view customers" ON public.pos_customers;
CREATE POLICY "Branch users can view customers" ON public.pos_customers
  FOR SELECT TO authenticated USING (public.can_use_branch(auth.uid(), branch_id));
DROP POLICY "Store writers can add customers" ON public.pos_customers;
CREATE POLICY "Branch writers can add customers" ON public.pos_customers
  FOR INSERT TO authenticated WITH CHECK (public.can_write_branch_pos(auth.uid(), branch_id));
DROP POLICY "Store writers can edit customers" ON public.pos_customers;
CREATE POLICY "Branch writers can edit customers" ON public.pos_customers
  FOR UPDATE TO authenticated USING (public.can_write_branch_pos(auth.uid(), branch_id));