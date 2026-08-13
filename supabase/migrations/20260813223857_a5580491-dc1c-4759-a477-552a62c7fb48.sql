DROP POLICY "Anyone can submit a request" ON public.submissions;
CREATE POLICY "Anyone can submit a request" ON public.submissions
FOR INSERT TO anon, authenticated
WITH CHECK (
  ((auth.uid() IS NOT NULL) AND has_role(auth.uid(), 'admin'::app_role))
  OR (
    (creation_origin = 'public_form'::text)
    AND (status = 'nouveau'::text)
    AND (priority = 'normal'::text)
    AND (assigned_entrepreneur IS NULL)
    AND (created_by IS NULL)
    AND (lead_source = 'vracquebec.ca'::text)
    AND (lead_category IS NOT NULL)
    AND (latitude IS NULL)
    AND (longitude IS NULL)
  )
);