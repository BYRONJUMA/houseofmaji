DROP POLICY IF EXISTS "services delete" ON public.services;
CREATE POLICY "services delete" ON public.services
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'chief_engineer')
  OR public.has_role(auth.uid(), 'sales_head')
  OR recorded_by = auth.uid()
  OR assigned_engineer_id = auth.uid()
);