CREATE POLICY "Internal service only"
ON public.seo_orchestrator_lease
FOR ALL
TO public
USING (false)
WITH CHECK (false);