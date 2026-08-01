ALTER TABLE public.fulfillments
  ADD COLUMN IF NOT EXISTS water_analysis_file_url text,
  ADD COLUMN IF NOT EXISTS additional_notes text;

ALTER TABLE public.fulfillments
  ADD CONSTRAINT fulfillments_current_stage_check
  CHECK (current_stage IN ('received','waiting_for_frame','material_procurement','assembling','delivery','installed'));

ALTER TABLE public.stage_events
  ADD CONSTRAINT stage_events_stage_check
  CHECK (stage IN ('received','waiting_for_frame','material_procurement','assembling','delivery','installed'));

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL REFERENCES public.fulfillments(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments readable" ON public.payments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sales and chief record payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by = auth.uid()
    AND (public.has_role(auth.uid(), 'sales_rep') OR public.has_role(auth.uid(), 'chief_engineer'))
  );

CREATE INDEX payments_fulfillment_id_idx ON public.payments(fulfillment_id);

-- Payment gate enforcement
CREATE OR REPLACE FUNCTION public.enforce_payment_gates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _paid numeric;
  _pct numeric;
BEGIN
  IF NEW.current_stage IS NOT DISTINCT FROM OLD.current_stage THEN RETURN NEW; END IF;
  IF NEW.current_stage NOT IN ('waiting_for_frame','material_procurement') THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(amount),0) INTO _paid FROM public.payments WHERE fulfillment_id = NEW.id;
  _pct := CASE WHEN NEW.agreed_price > 0 THEN (_paid / NEW.agreed_price) * 100 ELSE 0 END;

  IF NEW.current_stage = 'waiting_for_frame' AND _pct < 50 THEN
    RAISE EXCEPTION 'At least 50%% payment required before ordering the frame';
  END IF;

  IF NEW.current_stage = 'material_procurement' AND _pct < 80 THEN
    RAISE EXCEPTION 'At least 80%% payment required before starting material procurement';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER fulfillments_payment_gates
  BEFORE UPDATE ON public.fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_gates();

-- stage change handling incl. new stage
CREATE OR REPLACE FUNCTION public.fulfillment_stage_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid;
  _installer uuid;
BEGIN
  IF NEW.current_stage IS NOT DISTINCT FROM OLD.current_stage THEN RETURN NEW; END IF;
  _installer := COALESCE(NEW.installation_engineer_id, NEW.assembly_engineer_id);
  _actor := CASE NEW.current_stage
    WHEN 'waiting_for_frame' THEN NEW.chief_engineer_id
    WHEN 'material_procurement' THEN NEW.chief_engineer_id
    WHEN 'assembling' THEN NEW.assembly_engineer_id
    WHEN 'delivery' THEN _installer
    WHEN 'installed' THEN _installer
    ELSE auth.uid() END;

  UPDATE public.stage_events SET exited_at = now()
  WHERE fulfillment_id = NEW.id AND exited_at IS NULL;

  INSERT INTO public.stage_events (fulfillment_id, stage, actor_id)
  VALUES (NEW.id, NEW.current_stage, _actor);

  IF NEW.current_stage = 'delivery' AND NEW.assembly_engineer_id IS NOT NULL THEN
    INSERT INTO public.commissions (fulfillment_id, user_id, role, amount)
    VALUES (NEW.id, NEW.assembly_engineer_id, 'assembly', 1000)
    ON CONFLICT DO NOTHING;
  END IF;

  IF NEW.current_stage = 'installed' AND _installer IS NOT NULL THEN
    INSERT INTO public.commissions (fulfillment_id, user_id, role, amount)
    VALUES (NEW.id, _installer, 'installation', 1000)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS fulfillments_stage_changed ON public.fulfillments;
CREATE TRIGGER fulfillments_stage_changed
  AFTER UPDATE ON public.fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.fulfillment_stage_changed();

DROP TRIGGER IF EXISTS fulfillments_created ON public.fulfillments;
CREATE TRIGGER fulfillments_created
  AFTER INSERT ON public.fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.fulfillment_created();

DROP TRIGGER IF EXISTS fulfillments_touch_updated_at ON public.fulfillments;
CREATE TRIGGER fulfillments_touch_updated_at
  BEFORE UPDATE ON public.fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Commissions paid toggle: admin only
DROP POLICY IF EXISTS "admins and chiefs toggle paid" ON public.commissions;
CREATE POLICY "admins toggle paid" ON public.commissions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
