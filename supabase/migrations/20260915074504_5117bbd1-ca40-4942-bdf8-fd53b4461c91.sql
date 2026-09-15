-- ============ POS customers ============
CREATE TABLE public.pos_customers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  phone text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.pos_customers TO authenticated;
GRANT ALL ON public.pos_customers TO service_role;
ALTER TABLE public.pos_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Role holders can view customers" ON public.pos_customers
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Store writers can add customers" ON public.pos_customers
  FOR INSERT TO authenticated WITH CHECK (public.can_write_store(auth.uid()));
CREATE POLICY "Store writers can edit customers" ON public.pos_customers
  FOR UPDATE TO authenticated USING (public.can_write_store(auth.uid()));

INSERT INTO public.pos_customers (name) VALUES ('Walk-in Customer');

-- ============ sales ============
CREATE TYPE public.pos_payment_method AS ENUM ('cash', 'mpesa', 'credit', 'bank_transfer');
CREATE TYPE public.pos_sale_status AS ENUM ('completed', 'pending_payment', 'voided');
CREATE SEQUENCE public.pos_invoice_no_seq START 1;

CREATE TABLE public.sales (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_no text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.pos_customers(id) ON DELETE SET NULL,
  location public.store_location NOT NULL,
  payment_method public.pos_payment_method NOT NULL,
  additional_info text,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status public.pos_sale_status NOT NULL DEFAULT 'completed',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_at timestamp with time zone,
  void_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Role holders can view sales" ON public.sales
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

CREATE TABLE public.sale_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.store_products(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  tax_percent numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Role holders can view sale items" ON public.sale_items
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

CREATE INDEX sales_created_at_idx ON public.sales (created_at DESC);
CREATE INDEX sale_items_sale_idx ON public.sale_items (sale_id);

-- ============ create a sale ============
CREATE OR REPLACE FUNCTION public.pos_create_sale(
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
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.can_write_store(_uid) THEN
    RAISE EXCEPTION 'You do not have permission to create sales';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one item to the sale';
  END IF;

  IF _customer IS NULL THEN
    IF coalesce(btrim(_new_customer_name), '') = '' THEN
      RAISE EXCEPTION 'Choose or name a customer';
    END IF;
    INSERT INTO public.pos_customers (name, phone)
    VALUES (btrim(_new_customer_name), nullif(btrim(coalesce(_new_customer_phone, '')), ''))
    RETURNING id INTO _customer;
  END IF;

  -- stock check first, so nothing moves when any line is short
  FOR _row IN
    SELECT (i->>'product_id')::uuid AS product_id,
           sum((i->>'quantity')::numeric) AS quantity
      FROM jsonb_array_elements(_items) i
     GROUP BY 1
  LOOP
    SELECT CASE WHEN _location = 'in_house' THEN p.in_house_qty ELSE p.warehouse_qty END,
           p.name
      INTO _have, _invoice
      FROM public.store_products p WHERE p.id = _row.product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF _have < _row.quantity THEN
      RAISE EXCEPTION 'Not enough stock for % — % available, % needed', _invoice, _have, _row.quantity;
    END IF;
  END LOOP;

  _invoice := 'INV-' || lpad(nextval('public.pos_invoice_no_seq')::text, 6, '0');

  INSERT INTO public.sales (invoice_no, customer_id, location, payment_method, additional_info,
                            status, created_by)
  VALUES (_invoice, _customer, _location, _payment_method, nullif(btrim(coalesce(_additional_info, '')), ''),
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
REVOKE ALL ON FUNCTION public.pos_create_sale(public.store_location, public.pos_payment_method, jsonb, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_create_sale(public.store_location, public.pos_payment_method, jsonb, uuid, text, text, text) TO authenticated;

-- ============ void a sale ============
CREATE OR REPLACE FUNCTION public.pos_void_sale(_sale_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _sale public.sales;
  _row record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.can_write_store(_uid) THEN
    RAISE EXCEPTION 'You do not have permission to void sales';
  END IF;
  IF coalesce(btrim(coalesce(_reason, '')), '') = '' THEN
    RAISE EXCEPTION 'Give a reason for voiding this sale';
  END IF;

  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
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
REVOKE ALL ON FUNCTION public.pos_void_sale(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_void_sale(uuid, text) TO authenticated;

-- ============ mark a credit sale paid ============
CREATE OR REPLACE FUNCTION public.pos_mark_sale_paid(_sale_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _sale public.sales;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.can_write_store(_uid) THEN
    RAISE EXCEPTION 'You do not have permission to update sales';
  END IF;
  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF _sale.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'Only a pending credit sale can be marked paid';
  END IF;
  UPDATE public.sales SET status = 'completed' WHERE id = _sale_id;
  RETURN jsonb_build_object('invoice_no', _sale.invoice_no, 'status', 'completed');
END;
$$;
REVOKE ALL ON FUNCTION public.pos_mark_sale_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_mark_sale_paid(uuid) TO authenticated;