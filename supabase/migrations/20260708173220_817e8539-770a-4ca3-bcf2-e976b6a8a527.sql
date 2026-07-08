
CREATE POLICY "blog-media public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'blog-media');
CREATE POLICY "blog-media admin insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'blog-media' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "blog-media admin update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'blog-media' AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'blog-media' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "blog-media admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'blog-media' AND public.has_role(auth.uid(), 'admin'::app_role));
