CREATE OR REPLACE FUNCTION public.service_mark_complete(
  _service_id uuid,
  _expected_next_due_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.service_mark_complete(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.service_mark_complete(uuid, date) TO authenticated;