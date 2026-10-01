REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.fin_credit_notes FROM authenticated, anon;
REVOKE ALL ON public.fin_credit_notes FROM anon;
GRANT SELECT ON public.fin_credit_notes TO authenticated;