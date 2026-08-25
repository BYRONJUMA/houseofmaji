DO $$ BEGIN
  CREATE TYPE public.machine_service_type AS ENUM ('commercial_industrial','undersink');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.services ADD COLUMN IF NOT EXISTS machine_service_type public.machine_service_type;

DROP POLICY IF EXISTS "services delete" ON public.services;
CREATE POLICY "services delete" ON public.services FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'chief_engineer'::app_role)
  OR has_role(auth.uid(), 'sales_head'::app_role)
);

DROP VIEW IF EXISTS public.services_secure;
CREATE VIEW public.services_secure
WITH (security_invoker = false)
AS
SELECT s.id,
    s.fulfillment_id,
    s.client_name,
    CASE WHEN can_see_service_contact(auth.uid()) THEN s.contact ELSE NULL::text END AS contact,
    s.machine_type,
    s.machine_service_type,
    s.last_service_date,
    s.next_due_date,
    s.visit_count,
    s.recorded_by,
    s.assigned_engineer_id,
    s.assigned_by,
    s.assigned_at,
    s.created_at,
    s.updated_at
FROM public.services s
WHERE has_role(auth.uid(), 'admin'::app_role)
   OR has_role(auth.uid(), 'chief_engineer'::app_role)
   OR has_role(auth.uid(), 'engineer'::app_role)
   OR has_role(auth.uid(), 'sales_head'::app_role)
   OR (EXISTS (SELECT 1 FROM public.fulfillments f WHERE f.id = s.fulfillment_id AND f.sales_rep_id = auth.uid()));

GRANT SELECT ON public.services_secure TO authenticated;