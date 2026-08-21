-- 1. Taxonomy management: include chief_engineer
CREATE OR REPLACE FUNCTION public.can_manage_taxonomy(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_crm_manager(_user_id)
      OR public.has_role(_user_id, 'chief_engineer');
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_taxonomy(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "taxonomy cat manage" ON public.machine_categories;
CREATE POLICY "taxonomy cat manage" ON public.machine_categories
  FOR ALL TO authenticated
  USING (public.can_manage_taxonomy(auth.uid()))
  WITH CHECK (public.can_manage_taxonomy(auth.uid()));

DROP POLICY IF EXISTS "taxonomy type manage" ON public.machine_types;
CREATE POLICY "taxonomy type manage" ON public.machine_types
  FOR ALL TO authenticated
  USING (public.can_manage_taxonomy(auth.uid()))
  WITH CHECK (public.can_manage_taxonomy(auth.uid()));

DROP POLICY IF EXISTS "taxonomy cap manage" ON public.machine_capacities;
CREATE POLICY "taxonomy cap manage" ON public.machine_capacities
  FOR ALL TO authenticated
  USING (public.can_manage_taxonomy(auth.uid()))
  WITH CHECK (public.can_manage_taxonomy(auth.uid()));

-- 2. Services: contact column readable only by chief_engineer / sales_head / admin
CREATE OR REPLACE FUNCTION public.can_see_service_contact(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'chief_engineer')
      OR public.has_role(_user_id, 'sales_head');
$$;

GRANT EXECUTE ON FUNCTION public.can_see_service_contact(uuid) TO authenticated, service_role;

-- Masked view; runs as owner so it must repeat the row-level visibility rule
CREATE OR REPLACE VIEW public.services_secure AS
  SELECT
    s.id,
    s.fulfillment_id,
    s.client_name,
    CASE WHEN public.can_see_service_contact(auth.uid()) THEN s.contact ELSE NULL END AS contact,
    s.machine_type,
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
  WHERE public.has_role(auth.uid(), 'admin')
     OR public.has_role(auth.uid(), 'chief_engineer')
     OR public.has_role(auth.uid(), 'engineer')
     OR public.has_role(auth.uid(), 'sales_head')
     OR EXISTS (
          SELECT 1 FROM public.fulfillments f
          WHERE f.id = s.fulfillment_id AND f.sales_rep_id = auth.uid()
        );

GRANT SELECT ON public.services_secure TO authenticated;
GRANT ALL ON public.services_secure TO service_role;

-- Remove direct read access to the contact column for regular users
REVOKE SELECT ON public.services FROM authenticated;
GRANT SELECT (
  id, fulfillment_id, client_name, machine_type, last_service_date, next_due_date,
  visit_count, recorded_by, assigned_engineer_id, assigned_by, assigned_at,
  created_at, updated_at
) ON public.services TO authenticated;
GRANT SELECT (contact) ON public.services TO service_role;
GRANT ALL ON public.services TO service_role;