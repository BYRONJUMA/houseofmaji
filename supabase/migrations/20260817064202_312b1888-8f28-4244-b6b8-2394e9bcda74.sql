DROP POLICY IF EXISTS "leads delete manager" ON public.leads;
CREATE POLICY "leads delete own or manager" ON public.leads FOR DELETE TO authenticated
USING (public.is_crm_manager(auth.uid()) OR rep_id = auth.uid());