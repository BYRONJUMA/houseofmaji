DROP POLICY IF EXISTS "visits delete manager" ON public.site_visits;
CREATE POLICY "visits delete owner assigned or chief" ON public.site_visits
FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR assigned_engineer_id = auth.uid()
  OR public.has_role(auth.uid(), 'chief_engineer')
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "visit photos delete" ON public.site_visit_photos;
CREATE POLICY "visit photos delete" ON public.site_visit_photos
FOR DELETE TO authenticated
USING (
  uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.site_visits v
    WHERE v.id = site_visit_photos.site_visit_id
      AND (v.created_by = auth.uid()
        OR v.assigned_engineer_id = auth.uid()
        OR public.has_role(auth.uid(), 'chief_engineer')
        OR public.has_role(auth.uid(), 'admin'))
  )
);