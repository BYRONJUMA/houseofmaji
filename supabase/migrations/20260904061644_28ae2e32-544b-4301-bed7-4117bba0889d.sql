CREATE TABLE public.assigned_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  item_description text,
  date_assigned date NOT NULL DEFAULT CURRENT_DATE,
  condition text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assigned_equipment TO authenticated;
GRANT ALL ON public.assigned_equipment TO service_role;

ALTER TABLE public.assigned_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipment readable by signed in" ON public.assigned_equipment
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "equipment insert own or admin" ON public.assigned_equipment
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "equipment update own or admin" ON public.assigned_equipment
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "equipment delete own or admin" ON public.assigned_equipment
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER assigned_equipment_touch BEFORE UPDATE ON public.assigned_equipment
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX assigned_equipment_user_idx ON public.assigned_equipment (user_id);

ALTER TABLE public.services
  ADD COLUMN completed boolean NOT NULL DEFAULT false,
  ADD COLUMN completed_at timestamptz;

DROP VIEW IF EXISTS public.services_secure;

CREATE VIEW public.services_secure AS
SELECT id,
    fulfillment_id,
    client_name,
    CASE WHEN public.can_see_service_contact(auth.uid()) THEN contact ELSE NULL::text END AS contact,
    machine_type,
    machine_service_type,
    last_service_date,
    next_due_date,
    visit_count,
    recorded_by,
    assigned_engineer_id,
    assigned_by,
    assigned_at,
    completed,
    completed_at,
    created_at,
    updated_at
FROM public.services s
WHERE public.has_role(auth.uid(), 'admin')
   OR public.has_role(auth.uid(), 'chief_engineer')
   OR public.has_role(auth.uid(), 'engineer')
   OR public.has_role(auth.uid(), 'sales_head')
   OR EXISTS (SELECT 1 FROM public.fulfillments f WHERE f.id = s.fulfillment_id AND f.sales_rep_id = auth.uid());