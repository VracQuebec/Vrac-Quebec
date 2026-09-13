CREATE POLICY "parcours preview photos insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'parcours-preview-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "parcours preview photos read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'parcours-preview-photos'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "parcours preview photos delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'parcours-preview-photos' AND auth.uid()::text = (storage.foldername(name))[1]);