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
  _item jsonb;
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
    SELECT (value->>'product_id')::uuid AS product_id,
           sum((value->>'quantity')::numeric) AS quantity
      FROM jsonb_array_elements(_items)
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

  FOR _item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    _qty := (_item->>'quantity')::numeric;
    IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Every line needs a quantity above zero'; END IF;
    _base := _qty * coalesce((_item->>'unit_price')::numeric, 0);
    _disc := _base * coalesce((_item->>'discount_percent')::numeric, 0) / 100;
    _tax := (_base - _disc) * coalesce((_item->>'tax_percent')::numeric, 0) / 100;
    _line := _base - _disc + _tax;
    _subtotal := _subtotal + _base;
    _discount_total := _discount_total + _disc;
    _tax_total := _tax_total + _tax;
    _total := _total + _line;

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount_percent,
                                   tax_percent, line_total)
    VALUES (_sale_id, (_item->>'product_id')::uuid, _qty,
            coalesce((_item->>'unit_price')::numeric, 0),
            coalesce((_item->>'discount_percent')::numeric, 0),
            coalesce((_item->>'tax_percent')::numeric, 0), _line);

    INSERT INTO public.store_stock_entries (product_id, location, quantity, notes, entered_by)
    VALUES ((_item->>'product_id')::uuid, _location, -_qty, 'Sold on invoice ' || _invoice, _uid);
  END LOOP;

  UPDATE public.sales
     SET subtotal = _subtotal, discount_amount = _discount_total,
         tax_amount = _tax_total, total_amount = _total
   WHERE id = _sale_id;

  RETURN jsonb_build_object('sale_id', _sale_id, 'invoice_no', _invoice, 'total_amount', _total);
END;
$$;