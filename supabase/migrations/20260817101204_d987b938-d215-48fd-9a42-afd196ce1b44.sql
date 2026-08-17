ALTER TYPE public.app_role RENAME VALUE 'sales_manager' TO 'sales_head';

CREATE OR REPLACE FUNCTION public.is_crm_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role::text IN ('admin','sales_head')
  );
$$;

DROP POLICY IF EXISTS "services insert" ON public.services;
CREATE POLICY "services insert" ON public.services
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'chief_engineer')
  OR has_role(auth.uid(), 'engineer') OR has_role(auth.uid(), 'sales_head')
);

DROP POLICY IF EXISTS "services update" ON public.services;
CREATE POLICY "services update" ON public.services
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'chief_engineer')
  OR has_role(auth.uid(), 'engineer') OR has_role(auth.uid(), 'sales_head')
)
WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'chief_engineer')
  OR has_role(auth.uid(), 'engineer') OR has_role(auth.uid(), 'sales_head')
);

DROP POLICY IF EXISTS "services delete" ON public.services;
CREATE POLICY "services delete" ON public.services
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'chief_engineer')
  OR has_role(auth.uid(), 'sales_head')
);