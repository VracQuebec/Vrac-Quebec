-- 1. Lock down the SEO backup table
ALTER TABLE public.seo_pages_links_backup_20260814 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seo_pages_links_backup_20260814 FROM anon, authenticated;
GRANT ALL ON public.seo_pages_links_backup_20260814 TO service_role;
CREATE POLICY "Admins manage seo links backup"
  ON public.seo_pages_links_backup_20260814 FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Track sheet backups so the function can be made idempotent
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS sheet_backup_at timestamptz;

-- 3. lead-photos storage: no more public read
DROP POLICY IF EXISTS "Public can view lead photos" ON storage.objects;
CREATE POLICY "Admins can view lead photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lead-photos' AND public.has_role(auth.uid(), 'admin'::app_role));