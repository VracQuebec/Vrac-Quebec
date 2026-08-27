-- 1) jsc_listings : le créateur est toujours l'utilisateur authentifié (non usurpable)
ALTER TABLE public.jsc_listings ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.jsc_listings ALTER COLUMN created_by SET NOT NULL;

DROP POLICY IF EXISTS "Users manage own listings" ON public.jsc_listings;
CREATE POLICY "Users read own listings" ON public.jsc_listings
  FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Users create own listings" ON public.jsc_listings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users update own listings" ON public.jsc_listings
  FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users delete own listings" ON public.jsc_listings
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- 2) Tables de sauvegarde SEO : accès admin explicite, fail-closed pour les autres
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_pages_links_backup_20260814 TO authenticated;
GRANT ALL ON public.seo_pages_links_backup_20260814 TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_pages_meta_backup_20260814 TO authenticated;
GRANT ALL ON public.seo_pages_meta_backup_20260814 TO service_role;
REVOKE ALL ON public.seo_pages_links_backup_20260814 FROM anon;
REVOKE ALL ON public.seo_pages_meta_backup_20260814 FROM anon;

ALTER TABLE public.seo_pages_meta_backup_20260814 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage seo meta backup" ON public.seo_pages_meta_backup_20260814;
CREATE POLICY "Admins manage seo meta backup" ON public.seo_pages_meta_backup_20260814
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));