CREATE POLICY "water analysis readable" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'water-analysis');

CREATE POLICY "water analysis uploadable" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'water-analysis'
    AND (public.has_role(auth.uid(), 'sales_rep') OR public.has_role(auth.uid(), 'chief_engineer'))
  );