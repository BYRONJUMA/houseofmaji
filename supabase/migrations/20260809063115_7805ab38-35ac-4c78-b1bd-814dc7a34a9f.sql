-- 1. multiple checklists per fulfillment
ALTER TABLE public.delivery_checklists DROP CONSTRAINT IF EXISTS delivery_checklists_fulfillment_id_key;

-- 2. global sequences for delivery_no / machine_serial_no
CREATE SEQUENCE IF NOT EXISTS public.machine_serial_seq START 1;

DO $$
DECLARE _max int;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(delivery_no, '\D', '', 'g'), '')::int), 0)
    INTO _max FROM public.delivery_checklists;
  IF _max >= 1000 THEN _max := 0; END IF;
  PERFORM setval('public.delivery_no_seq', GREATEST(_max, 1), _max > 0);
END $$;

ALTER TABLE public.delivery_checklists
  ALTER COLUMN delivery_no SET DEFAULT ('HOM' || lpad(nextval('public.delivery_no_seq')::text, 3, '0')),
  ALTER COLUMN machine_serial_no SET DEFAULT ('HOM-SN-' || lpad(nextval('public.machine_serial_seq')::text, 4, '0'));

UPDATE public.delivery_checklists
  SET machine_serial_no = 'HOM-SN-' || lpad(nextval('public.machine_serial_seq')::text, 4, '0')
  WHERE machine_serial_no IS NULL OR machine_serial_no = '';

ALTER TABLE public.delivery_checklists ALTER COLUMN machine_serial_no SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_checklists_delivery_no_key ON public.delivery_checklists (delivery_no);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_checklists_serial_no_key ON public.delivery_checklists (machine_serial_no);

-- lock generated identifiers
CREATE OR REPLACE FUNCTION public.lock_checklist_identifiers()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.delivery_no := OLD.delivery_no;
  NEW.machine_serial_no := OLD.machine_serial_no;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS delivery_checklists_lock_ids ON public.delivery_checklists;
CREATE TRIGGER delivery_checklists_lock_ids
  BEFORE UPDATE ON public.delivery_checklists
  FOR EACH ROW EXECUTE FUNCTION public.lock_checklist_identifiers();

REVOKE EXECUTE ON FUNCTION public.lock_checklist_identifiers() FROM PUBLIC, anon, authenticated;

-- 3. commissions paid toggle for chief_engineer + admin
DROP POLICY IF EXISTS "admins toggle paid" ON public.commissions;
CREATE POLICY "chief and admins toggle paid" ON public.commissions
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'chief_engineer'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'chief_engineer'));

CREATE OR REPLACE FUNCTION public.commissions_paid_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- only the paid flag may change; paid_at is derived
  IF NEW.fulfillment_id IS DISTINCT FROM OLD.fulfillment_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'Only the paid status of a commission can be changed';
  END IF;
  NEW.paid_at := CASE WHEN NEW.paid THEN COALESCE(OLD.paid_at, now()) ELSE NULL END;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS commissions_paid_only ON public.commissions;
CREATE TRIGGER commissions_paid_only
  BEFORE UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.commissions_paid_only();

REVOKE EXECUTE ON FUNCTION public.commissions_paid_only() FROM PUBLIC, anon, authenticated;