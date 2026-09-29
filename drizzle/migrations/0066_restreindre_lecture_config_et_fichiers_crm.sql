DROP POLICY IF EXISTS "read critical fields" ON public.request_critical_fields;
CREATE POLICY "admin read critical fields" ON public.request_critical_fields FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "read transitions" ON public.request_lifecycle_transitions;
CREATE POLICY "admin read transitions" ON public.request_lifecycle_transitions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "entcrm files read" ON storage.objects;
CREATE POLICY "entcrm files read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'entcrm-files'
  AND public.entcrm_can_read(public.entcrm_path_company(name))
  AND EXISTS (SELECT 1 FROM public.ent_crm_files f WHERE f.storage_path = objects.name)
);