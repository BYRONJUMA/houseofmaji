-- payment method options
CREATE TYPE public.service_payment_method AS ENUM ('cash', 'mpesa', 'bank_transfer', 'other');

CREATE TABLE public.service_diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  engineer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  diagnosis_notes text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.service_diagnoses TO authenticated;
GRANT ALL ON public.service_diagnoses TO service_role;
ALTER TABLE public.service_diagnoses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Diagnosis visible to owner and managers" ON public.service_diagnoses
  FOR SELECT TO authenticated USING (
    engineer_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'chief_engineer')
    OR public.has_role(auth.uid(), 'sales_head')
  );
CREATE POLICY "Role holders record a diagnosis" ON public.service_diagnoses
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));

CREATE TABLE public.service_diagnosis_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id uuid NOT NULL REFERENCES public.service_diagnoses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.store_products(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.service_diagnosis_items TO authenticated;
GRANT ALL ON public.service_diagnosis_items TO service_role;
ALTER TABLE public.service_diagnosis_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Diagnosis items follow the diagnosis" ON public.service_diagnosis_items
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.service_diagnoses d
      WHERE d.id = diagnosis_id
        AND (
          d.engineer_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'chief_engineer')
          OR public.has_role(auth.uid(), 'sales_head')
        )
    )
  );
CREATE POLICY "Role holders add diagnosis items" ON public.service_diagnosis_items
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));

CREATE SEQUENCE public.service_invoice_no_seq;

CREATE TABLE public.service_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  diagnosis_id uuid NOT NULL REFERENCES public.service_diagnoses(id) ON DELETE CASCADE,
  invoice_no text NOT NULL UNIQUE,
  subtotal numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'cleared')),
  payment_method public.service_payment_method,
  cleared_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_invoices TO authenticated;
GRANT ALL ON public.service_invoices TO service_role;
ALTER TABLE public.service_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Invoice visible to diagnosing engineer and managers" ON public.service_invoices
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.service_diagnoses d
      WHERE d.id = diagnosis_id AND d.engineer_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'chief_engineer')
    OR public.has_role(auth.uid(), 'sales_head')
  );
-- Only a sales head may clear an invoice.
CREATE POLICY "Sales head clears invoices" ON public.service_invoices
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'sales_head'))
  WITH CHECK (public.has_role(auth.uid(), 'sales_head'));

CREATE INDEX service_diagnoses_service_idx ON public.service_diagnoses(service_id);
CREATE INDEX service_diagnosis_items_diag_idx ON public.service_diagnosis_items(diagnosis_id);
CREATE INDEX service_invoices_service_idx ON public.service_invoices(service_id);

/* ---------- submit a diagnosis: creates items and the invoice ---------- */
CREATE OR REPLACE FUNCTION public.service_submit_diagnosis(
  _service_id uuid,
  _notes text,
  _items jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _svc public.services;
  _diag_id uuid;
  _item jsonb;
  _price numeric;
  _qty numeric;
  _subtotal numeric := 0;
  _no text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  SELECT * INTO _svc FROM public.services WHERE id = _service_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service not found'; END IF;

  IF NOT (
    _svc.assigned_engineer_id = _uid
    OR public.has_role(_uid, 'admin')
    OR public.has_role(_uid, 'chief_engineer')
    OR public.has_role(_uid, 'sales_head')
  ) THEN
    RAISE EXCEPTION 'You are not allowed to diagnose this service';
  END IF;

  IF COALESCE(btrim(_notes), '') = '' THEN
    RAISE EXCEPTION 'Diagnosis notes are required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.service_invoices
    WHERE service_id = _service_id AND status = 'pending_payment'
  ) THEN
    RAISE EXCEPTION 'This service already has an invoice awaiting payment';
  END IF;

  INSERT INTO public.service_diagnoses (service_id, engineer_id, diagnosis_notes)
  VALUES (_service_id, _uid, btrim(_notes))
  RETURNING id INTO _diag_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb))
  LOOP
    _qty := COALESCE((_item->>'quantity')::numeric, 0);
    IF _qty <= 0 THEN CONTINUE; END IF;
    SELECT COALESCE(selling_price, 0) INTO _price
      FROM public.store_products WHERE id = (_item->>'product_id')::uuid;
    IF _price IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
    INSERT INTO public.service_diagnosis_items (diagnosis_id, product_id, quantity, unit_price)
    VALUES (_diag_id, (_item->>'product_id')::uuid, _qty, _price);
    _subtotal := _subtotal + (_qty * _price);
  END LOOP;

  _no := 'INV-SVC-' || lpad(nextval('public.service_invoice_no_seq')::text, 6, '0');

  INSERT INTO public.service_invoices (service_id, diagnosis_id, invoice_no, subtotal)
  VALUES (_service_id, _diag_id, _no, _subtotal);

  RETURN jsonb_build_object('diagnosis_id', _diag_id, 'invoice_no', _no, 'subtotal', _subtotal);
END;
$$;
REVOKE ALL ON FUNCTION public.service_submit_diagnosis(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.service_submit_diagnosis(uuid, text, jsonb) TO authenticated;

/* ---------- clear an invoice: sales head only, moves stock ---------- */
CREATE OR REPLACE FUNCTION public.service_invoice_clear(
  _invoice_id uuid,
  _payment_method public.service_payment_method
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inv public.service_invoices;
  _row record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.has_role(_uid, 'sales_head') THEN
    RAISE EXCEPTION 'Only a sales head can clear a service invoice';
  END IF;
  IF _payment_method IS NULL THEN
    RAISE EXCEPTION 'Select a payment method';
  END IF;

  SELECT * INTO _inv FROM public.service_invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF _inv.status = 'cleared' THEN RAISE EXCEPTION 'This invoice is already cleared'; END IF;

  -- stock check first: never let In-House stock go negative
  FOR _row IN
    SELECT i.product_id, i.quantity, p.name, p.in_house_qty
      FROM public.service_diagnosis_items i
      JOIN public.store_products p ON p.id = i.product_id
     WHERE i.diagnosis_id = _inv.diagnosis_id
     ORDER BY p.name
     FOR UPDATE OF p
  LOOP
    IF _row.in_house_qty < _row.quantity THEN
      RAISE EXCEPTION 'Not enough In-House stock for % — % in stock, % needed',
        _row.name, _row.in_house_qty, _row.quantity;
    END IF;
  END LOOP;

  FOR _row IN
    SELECT i.product_id, i.quantity
      FROM public.service_diagnosis_items i
     WHERE i.diagnosis_id = _inv.diagnosis_id
  LOOP
    INSERT INTO public.store_stock_entries (product_id, location, quantity, notes, entered_by)
    VALUES (
      _row.product_id,
      'in_house',
      -_row.quantity,
      'Used in Service ' || _inv.service_id::text || ' — Invoice ' || _inv.invoice_no,
      _uid
    );
  END LOOP;

  UPDATE public.service_invoices
     SET status = 'cleared',
         payment_method = _payment_method,
         cleared_by = _uid,
         cleared_at = now()
   WHERE id = _invoice_id;

  RETURN jsonb_build_object('invoice_no', _inv.invoice_no, 'status', 'cleared');
END;
$$;
REVOKE ALL ON FUNCTION public.service_invoice_clear(uuid, public.service_payment_method) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.service_invoice_clear(uuid, public.service_payment_method) TO authenticated;

/* ---------- completion gate: uncleared invoice blocks completion ---------- */
CREATE OR REPLACE FUNCTION public.service_mark_complete(_service_id uuid, _expected_next_due_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _svc public.services;
  _uid uuid := auth.uid();
  _now timestamptz := now();
  _today date;
  _months int;
  _next_due date;
  _amount numeric := 0;
  _commission_recorded boolean := false;
  _prev record;
  _prev_name text;
  _pending text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO _svc FROM public.services WHERE id = _service_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found';
  END IF;

  IF NOT (
    _svc.assigned_engineer_id = _uid
    OR public.has_role(_uid, 'admin')
    OR public.has_role(_uid, 'chief_engineer')
    OR public.has_role(_uid, 'sales_head')
  ) THEN
    RAISE EXCEPTION 'You are not allowed to complete this service';
  END IF;

  IF _svc.assigned_engineer_id IS NULL THEN
    RAISE EXCEPTION 'This service has no assigned engineer';
  END IF;

  SELECT invoice_no INTO _pending
    FROM public.service_invoices
   WHERE service_id = _service_id AND status <> 'cleared'
   ORDER BY created_at DESC
   LIMIT 1;
  IF _pending IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice % must be cleared by a sales head before this service can be completed', _pending;
  END IF;

  -- Concurrency guard: the cycle already moved on, so a completion already went through.
  IF _svc.next_due_date IS DISTINCT FROM _expected_next_due_date THEN
    SELECT l.completed_at, p.full_name
      INTO _prev
      FROM public.service_visit_log l
      LEFT JOIN public.profiles p ON p.id = l.completed_by
     WHERE l.service_id = _service_id
     ORDER BY l.completed_at DESC
     LIMIT 1;

    _prev_name := COALESCE(_prev.full_name, 'someone else');
    RAISE EXCEPTION 'Already marked complete by % at % — this service has already been rescheduled',
      _prev_name,
      to_char(COALESCE(_prev.completed_at, _now) AT TIME ZONE 'Africa/Nairobi', 'DD Mon YYYY HH24:MI');
  END IF;

  _today := (_now AT TIME ZONE 'Africa/Nairobi')::date;

  IF _svc.machine_service_type = 'undersink' THEN
    _months := public.setting_number('service_interval_undersink_months', 12)::int;
  ELSIF _svc.machine_service_type = 'commercial_industrial' THEN
    _months := public.setting_number('service_interval_commercial_months', 6)::int;
  ELSE
    _months := LEAST(
      public.setting_number('service_interval_commercial_months', 6)::int,
      public.setting_number('service_interval_undersink_months', 12)::int
    );
  END IF;

  _next_due := _today + (_months || ' months')::interval;

  INSERT INTO public.service_visit_log (service_id, completed_at, completed_by, next_due_date_set_to)
  VALUES (_service_id, _now, _uid, _next_due);

  IF _svc.machine_service_type IS NOT NULL THEN
    _amount := CASE
      WHEN _svc.machine_service_type = 'undersink'
        THEN public.setting_number('service_commission_undersink_kes', 200)
      ELSE public.setting_number('service_commission_commercial_kes', 500)
    END;
    INSERT INTO public.service_commissions (service_id, user_id, amount_kes)
    VALUES (_service_id, _svc.assigned_engineer_id, _amount);
    _commission_recorded := true;
  END IF;

  UPDATE public.services
     SET completed = false,
         completed_at = NULL,
         last_service_date = _today,
         next_due_date = _next_due,
         visit_count = COALESCE(visit_count, 0) + 1,
         updated_at = _now
   WHERE id = _service_id;

  RETURN jsonb_build_object(
    'next_due_date', _next_due,
    'commission_recorded', _commission_recorded,
    'amount_kes', _amount,
    'machine_service_type', _svc.machine_service_type
  );
END;
$function$;