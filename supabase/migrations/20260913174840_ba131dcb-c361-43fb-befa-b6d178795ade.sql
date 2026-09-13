CREATE POLICY "supplier_logos_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'supplier-logos');
CREATE POLICY "supplier_logos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'supplier-logos' AND public.can_write_store(auth.uid()));
CREATE POLICY "supplier_logos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'supplier-logos' AND public.can_write_store(auth.uid()))
  WITH CHECK (bucket_id = 'supplier-logos' AND public.can_write_store(auth.uid()));
CREATE POLICY "supplier_logos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'supplier-logos' AND public.can_write_store(auth.uid()));