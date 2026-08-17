CREATE TABLE public.fulfillment_edits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fulfillment_id uuid NOT NULL REFERENCES public.fulfillments(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  field_label text NOT NULL,
  old_value text,
  new_value text,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fulfillment_edits TO authenticated;
GRANT ALL ON public.fulfillment_edits TO service_role;
ALTER TABLE public.fulfillment_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fulfillment edits readable" ON public.fulfillment_edits
  FOR SELECT TO authenticated USING (true);

CREATE INDEX fulfillment_edits_fulfillment_idx ON public.fulfillment_edits (fulfillment_id, changed_at);

CREATE OR REPLACE FUNCTION public.can_edit_fulfillment_details(_uid uuid, _sales_rep_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND (
    _uid = _sales_rep_id
    OR public.has_role(_uid, 'chief_engineer')
    OR public.has_role(_uid, 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_fulfillment_details(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_fulfillment_detail_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _changed boolean;
BEGIN
  _changed :=
    NEW.client_name IS DISTINCT FROM OLD.client_name
    OR NEW.client_contact IS DISTINCT FROM OLD.client_contact
    OR NEW.location IS DISTINCT FROM OLD.location
    OR NEW.machine_type IS DISTINCT FROM OLD.machine_type
    OR NEW.capacity_lph IS DISTINCT FROM OLD.capacity_lph
    OR NEW.agreed_price IS DISTINCT FROM OLD.agreed_price
    OR NEW.agreed_delivery_date IS DISTINCT FROM OLD.agreed_delivery_date
    OR NEW.water_analysis_file_url IS DISTINCT FROM OLD.water_analysis_file_url
    OR NEW.water_analysis_notes IS DISTINCT FROM OLD.water_analysis_notes
    OR NEW.additional_notes IS DISTINCT FROM OLD.additional_notes;

  IF NOT _changed THEN RETURN NEW; END IF;

  IF NOT public.can_edit_fulfillment_details(auth.uid(), OLD.sales_rep_id) THEN
    RAISE EXCEPTION 'Only the sales rep who created this order, a chief engineer, or an admin can edit order details';
  END IF;

  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.log_fulfillment_detail_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF NEW.client_name IS DISTINCT FROM OLD.client_name THEN
    INSERT INTO public.fulfillment_edits (fulfillment_id, actor_id, field_label, old_value, new_value)
    VALUES (NEW.id, _actor, 'Client name', OLD.client_name, NEW.client_name);
  END IF;
  IF NEW.client_contact IS DISTINCT FROM OLD.client_contact THEN
    INSERT INTO public.fulfillment_edits (fulfillment_id, actor_id, field_label, old_value, new_value)
    VALUES (NEW.id, _actor, 'Client contact', OLD.client_contact, NEW.client_contact);
  END IF;
  IF NEW.location IS DISTINCT FROM OLD.location THEN
    INSERT INTO public.fulfillment_edits (fulfillment_id, actor_id, field_label, old_value, new_value)
    VALUES (NEW.id, _actor, 'Location', OLD.location, NEW.location);
  END IF;
  IF NEW.machine_type IS DISTINCT FROM OLD.machine_type THEN
    INSERT INTO public.fulfillment_edits (fulfillment_id, actor_id, field_label, old_value, new_value)
    VALUES (NEW.id, _actor, 'Machine type', OLD.machine_type, NEW.machine_type);
  END IF;
  IF NEW.capacity_lph IS DISTINCT FROM OLD.capacity_lph THEN
    INSERT INTO public.fulfillment_edits (fulfillment_id, actor_id, field_label, old_value, new_value)
    VALUES (NEW.id, _actor, 'Capacity (LPH)', OLD.capacity_lph::text, NEW.capacity_lph::text);
  END IF;
  IF NEW.agreed_price IS DISTINCT FROM OLD.agreed_price THEN
    INSERT INTO public.fulfillment_edits (fulfillment_id, actor_id, field_label, old_value, new_value)
    VALUES (NEW.id, _actor, 'Agreed price', OLD.agreed_price::text, NEW.agreed_price::text);
  END IF;
  IF NEW.agreed_delivery_date IS DISTINCT FROM OLD.agreed_delivery_date THEN
    INSERT INTO public.fulfillment_edits (fulfillment_id, actor_id, field_label, old_value, new_value)
    VALUES (NEW.id, _actor, 'Delivery date', OLD.agreed_delivery_date::text, NEW.agreed_delivery_date::text);
  END IF;
  IF NEW.water_analysis_file_url IS DISTINCT FROM OLD.water_analysis_file_url THEN
    INSERT INTO public.fulfillment_edits (fulfillment_id, actor_id, field_label, old_value, new_value)
    VALUES (NEW.id, _actor, 'Water analysis file',
      CASE WHEN OLD.water_analysis_file_url IS NULL THEN NULL ELSE 'attached file' END,
      CASE WHEN NEW.water_analysis_file_url IS NULL THEN NULL ELSE 'attached file' END);
  END IF;
  IF NEW.water_analysis_notes IS DISTINCT FROM OLD.water_analysis_notes THEN
    INSERT INTO public.fulfillment_edits (fulfillment_id, actor_id, field_label, old_value, new_value)
    VALUES (NEW.id, _actor, 'Water analysis notes', OLD.water_analysis_notes, NEW.water_analysis_notes);
  END IF;
  IF NEW.additional_notes IS DISTINCT FROM OLD.additional_notes THEN
    INSERT INTO public.fulfillment_edits (fulfillment_id, actor_id, field_label, old_value, new_value)
    VALUES (NEW.id, _actor, 'Additional notes', OLD.additional_notes, NEW.additional_notes);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS fulfillments_guard_detail_edits ON public.fulfillments;
CREATE TRIGGER fulfillments_guard_detail_edits
  BEFORE UPDATE ON public.fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.guard_fulfillment_detail_edits();

DROP TRIGGER IF EXISTS fulfillments_log_detail_edits ON public.fulfillments;
CREATE TRIGGER fulfillments_log_detail_edits
  AFTER UPDATE ON public.fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.log_fulfillment_detail_edits();