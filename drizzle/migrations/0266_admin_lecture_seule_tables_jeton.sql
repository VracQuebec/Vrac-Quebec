
-- Jeton public des demandes : jamais lisible par les comptes connectés (les fonctions serveur utilisent service_role).
REVOKE SELECT ON public.submissions FROM authenticated;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ',') INTO cols FROM information_schema.columns
   WHERE table_schema='public' AND table_name='submissions' AND column_name <> 'public_lead_token';
  EXECUTE format('GRANT SELECT (%s) ON public.submissions TO authenticated', cols);
END $$;
COMMENT ON COLUMN public.submissions.public_lead_token IS 'Jeton porteur : SELECT retiré au rôle authenticated; toute nouvelle colonne doit recevoir GRANT SELECT (col) TO authenticated.';

CREATE POLICY adm_ro_select ON public.submissions FOR SELECT TO authenticated USING (public.is_admin_reader(auth.uid()));
CREATE POLICY adm_ro_select ON public.consent_records FOR SELECT TO authenticated USING (public.is_admin_reader(auth.uid()));
CREATE POLICY adm_ro_select ON public.ai_cache FOR SELECT TO authenticated USING (public.is_admin_reader(auth.uid()));
CREATE POLICY adm_ro_select ON public.ai_call_log FOR SELECT TO authenticated USING (public.is_admin_reader(auth.uid()));
CREATE POLICY adm_ro_select ON public.jsc_api_requests FOR SELECT TO authenticated USING (public.is_admin_reader(auth.uid()));
