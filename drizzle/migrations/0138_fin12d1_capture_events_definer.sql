CREATE OR REPLACE FUNCTION public.fin_cap_exp_ok(_cap uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.fin_doc_captures c WHERE c.id = _cap AND c.exp_file_id IS NOT NULL AND NOT public.fin_exp_file_visible(c.exp_file_id)) $$;
REVOKE ALL ON FUNCTION public.fin_cap_exp_ok(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_cap_exp_ok(uuid) TO authenticated;
DROP POLICY IF EXISTS r ON public.fin_doc_capture_events;
CREATE POLICY r ON public.fin_doc_capture_events FOR SELECT TO authenticated
  USING (public.fin_can_read(company_id) AND public.fin_cap_exp_ok(capture_id));