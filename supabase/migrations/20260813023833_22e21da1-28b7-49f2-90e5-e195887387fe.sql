CREATE OR REPLACE FUNCTION public.enforce_signoff_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.engineer_signoff_at IS NOT NULL AND NEW.chief_signoff_at IS NULL THEN
    RAISE EXCEPTION 'Chief Engineer must approve before you can sign off.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS delivery_checklists_signoff_order ON public.delivery_checklists;
CREATE TRIGGER delivery_checklists_signoff_order
BEFORE INSERT OR UPDATE ON public.delivery_checklists
FOR EACH ROW EXECUTE FUNCTION public.enforce_signoff_order();