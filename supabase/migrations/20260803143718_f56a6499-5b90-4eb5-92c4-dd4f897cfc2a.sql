ALTER TABLE public.entrepreneurs
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS tax_tps text,
  ADD COLUMN IF NOT EXISTS tax_tvq text,
  ADD COLUMN IF NOT EXISTS contact_name text;

GRANT SELECT, UPDATE ON public.entrepreneurs TO authenticated;
GRANT ALL ON public.entrepreneurs TO service_role;

DROP POLICY IF EXISTS "Entrepreneurs can update their own profile" ON public.entrepreneurs;
CREATE POLICY "Entrepreneurs can update their own profile"
ON public.entrepreneurs
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());