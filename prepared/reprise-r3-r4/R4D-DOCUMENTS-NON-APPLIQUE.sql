-- Preserve subscription/admin-support semantics; tighten only bound personal-driver identities.
CREATE FUNCTION public.driver_identity_current(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM jsc_drivers WHERE company_id=c AND user_id=auth.uid()) OR driver_company_active(c);
$$;
REVOKE ALL ON FUNCTION public.driver_identity_current(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.driver_identity_current(uuid) TO authenticated;
ALTER POLICY "ecd_read" ON public.ent_company_documents USING(entcrm_can_read(company_id) AND driver_identity_current(company_id));
ALTER POLICY "company_docs_read" ON storage.objects USING(bucket_id='company-docs' AND entcrm_can_read(((storage.foldername(name))[1])::uuid) AND driver_identity_current(((storage.foldername(name))[1])::uuid));
ALTER POLICY "asr_files_read" ON storage.objects USING(bucket_id='asr-files' AND driver_identity_current(((storage.foldername(name))[1])::uuid) AND (asr_can_read(((storage.foldername(name))[1])::uuid) OR EXISTS(SELECT 1 FROM asr_documents d WHERE d.storage_path=objects.name AND asr_driver_doc_ok(d.id))));
-- Authenticated download rechecks these policies. Already-issued signed URLs or
-- already-downloaded files are not revoked by RLS; never certify immediate bearer invalidation.