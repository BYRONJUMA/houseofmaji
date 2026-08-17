-- 1. SITE VISITS: assignment workflow
ALTER TABLE public.site_visits
  ADD COLUMN IF NOT EXISTS assigned_engineer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

ALTER TABLE public.site_visits DROP CONSTRAINT IF EXISTS site_visits_status_check;
ALTER TABLE public.site_visits
  ADD CONSTRAINT site_visits_status_check
  CHECK (status = ANY (ARRAY['pending_assignment'::text, 'scheduled'::text, 'completed'::text]));
ALTER TABLE public.site_visits ALTER COLUMN status SET DEFAULT 'pending_assignment';

-- backfill assignment from the legacy engineer_id
UPDATE public.site_visits
  SET assigned_engineer_id = engineer_id
  WHERE assigned_engineer_id IS NULL AND engineer_id IS NOT NULL;

-- notify all chief engineers when a visit is requested
CREATE OR REPLACE FUNCTION public.site_visit_requested()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, message)
  SELECT p.id,
         'New site visit requested — ' || NEW.client_name || ', ' ||
         NEW.visit_type || ', ' || COALESCE(NEW.location, 'no location') || '.'
  FROM public.profiles p
  WHERE p.role = 'chief_engineer';

  IF NEW.assigned_engineer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, message)
    VALUES (NEW.assigned_engineer_id,
      'You''ve been assigned a site visit — ' || NEW.client_name || ', ' ||
      NEW.visit_type || ', ' || NEW.visit_date::text || '.');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS site_visits_requested ON public.site_visits;
CREATE TRIGGER site_visits_requested
AFTER INSERT ON public.site_visits
FOR EACH ROW EXECUTE FUNCTION public.site_visit_requested();

-- notify the engineer when assigned / reassigned
CREATE OR REPLACE FUNCTION public.site_visit_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.assigned_engineer_id IS NOT NULL
     AND NEW.assigned_engineer_id IS DISTINCT FROM OLD.assigned_engineer_id THEN
    INSERT INTO public.notifications (user_id, message)
    VALUES (NEW.assigned_engineer_id,
      'You''ve been assigned a site visit — ' || NEW.client_name || ', ' ||
      NEW.visit_type || ', ' || NEW.visit_date::text || '.');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS site_visits_assigned ON public.site_visits;
CREATE TRIGGER site_visits_assigned
AFTER UPDATE ON public.site_visits
FOR EACH ROW EXECUTE FUNCTION public.site_visit_assigned();

-- RLS: filing/editing is tied to being the assigned engineer
DROP POLICY IF EXISTS "visits read own or manager" ON public.site_visits;
CREATE POLICY "visits read own manager or assigned" ON public.site_visits
FOR SELECT TO authenticated
USING (
  public.is_crm_manager(auth.uid())
  OR public.has_role(auth.uid(), 'chief_engineer')
  OR assigned_engineer_id = auth.uid()
  OR engineer_id = auth.uid()
  OR created_by = auth.uid()
);

DROP POLICY IF EXISTS "visits update own or manager" ON public.site_visits;
CREATE POLICY "visits update assigned or chief" ON public.site_visits
FOR UPDATE TO authenticated
USING (
  assigned_engineer_id = auth.uid()
  OR public.has_role(auth.uid(), 'chief_engineer')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  assigned_engineer_id = auth.uid()
  OR public.has_role(auth.uid(), 'chief_engineer')
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "visit photos read" ON public.site_visit_photos;
CREATE POLICY "visit photos read" ON public.site_visit_photos
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.site_visits v
  WHERE v.id = site_visit_photos.site_visit_id
    AND (public.is_crm_manager(auth.uid())
      OR public.has_role(auth.uid(), 'chief_engineer')
      OR v.assigned_engineer_id = auth.uid()
      OR v.created_by = auth.uid())
));

DROP POLICY IF EXISTS "visit photos insert" ON public.site_visit_photos;
CREATE POLICY "visit photos insert" ON public.site_visit_photos
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.site_visits v
  WHERE v.id = site_visit_photos.site_visit_id
    AND (public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'chief_engineer')
      OR v.assigned_engineer_id = auth.uid())
));

-- 2. SERVICES: link to fulfillments + engineering-owned access
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS fulfillment_id uuid REFERENCES public.fulfillments(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "services readable" ON public.services;
CREATE POLICY "services read" ON public.services
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'chief_engineer')
  OR public.has_role(auth.uid(), 'engineer')
  OR public.has_role(auth.uid(), 'sales_manager')
  OR EXISTS (
    SELECT 1 FROM public.fulfillments f
    WHERE f.id = services.fulfillment_id AND f.sales_rep_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "services insert" ON public.services;
CREATE POLICY "services insert" ON public.services
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'chief_engineer')
  OR public.has_role(auth.uid(), 'engineer')
);

DROP POLICY IF EXISTS "services update" ON public.services;
CREATE POLICY "services update" ON public.services
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'chief_engineer')
  OR public.has_role(auth.uid(), 'engineer')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'chief_engineer')
  OR public.has_role(auth.uid(), 'engineer')
);

DROP POLICY IF EXISTS "services delete manager" ON public.services;
CREATE POLICY "services delete" ON public.services
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'chief_engineer')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;