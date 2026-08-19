ALTER TABLE public.fulfillments
  ADD COLUMN IF NOT EXISTS delivered_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_confirmed_by uuid REFERENCES public.profiles(id);

CREATE OR REPLACE FUNCTION public.guard_delivery_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _target uuid;
BEGIN
  IF NEW.delivered_confirmed_at IS NOT DISTINCT FROM OLD.delivered_confirmed_at THEN
    RETURN NEW;
  END IF;

  IF NEW.delivered_confirmed_at IS NULL THEN
    IF NOT public.has_role(_uid, 'admin') THEN
      RAISE EXCEPTION 'Only an admin can undo a delivery confirmation';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT public.has_role(_uid, 'admin') THEN
    IF OLD.sales_rep_id IS NULL OR OLD.sales_rep_id <> _uid THEN
      RAISE EXCEPTION 'Only the sales rep who created this order can mark it delivered';
    END IF;
    IF OLD.current_stage <> 'delivery' THEN
      RAISE EXCEPTION 'The order must be at the Delivery stage before it can be marked delivered';
    END IF;
  END IF;

  NEW.delivered_confirmed_by := COALESCE(NEW.delivered_confirmed_by, _uid);

  _target := COALESCE(NEW.installation_engineer_id, NEW.assembly_engineer_id);
  IF _target IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, message, fulfillment_id)
    VALUES (
      _target,
      'Delivery confirmed for ' || COALESCE(NEW.client_name, 'an order') ||
      ' — complete your delivery checklist sign-off to mark it installed.',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fulfillments_guard_delivery_confirmation ON public.fulfillments;
CREATE TRIGGER fulfillments_guard_delivery_confirmation
BEFORE UPDATE ON public.fulfillments
FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_confirmation();