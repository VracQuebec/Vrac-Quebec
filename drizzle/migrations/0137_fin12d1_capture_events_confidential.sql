DROP POLICY IF EXISTS r ON public.fin_doc_capture_events;
CREATE POLICY r ON public.fin_doc_capture_events FOR SELECT TO authenticated
  USING (public.fin_can_read(company_id) AND NOT EXISTS (SELECT 1 FROM public.fin_doc_captures c WHERE c.id = capture_id AND c.exp_file_id IS NOT NULL AND NOT public.fin_exp_file_visible(c.exp_file_id)));