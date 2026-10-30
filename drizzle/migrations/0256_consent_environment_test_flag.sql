ALTER TABLE public.consent_records ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.consent_records ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'inconnu' CHECK (environment IN ('apercu','publie','inconnu'));
ALTER TABLE public.consent_events ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'inconnu' CHECK (environment IN ('apercu','publie','inconnu'));
COMMENT ON COLUMN public.consent_records.environment IS 'Déclaré par le navigateur selon le nom de domaine (non certifié côté serveur).';
COMMENT ON COLUMN public.consent_records.is_test IS 'Navigateur d''essai marqué par l''administration; exclu des compteurs de production.';
DROP FUNCTION IF EXISTS public.consent_record_choice(uuid,text,boolean,text,text,text);
CREATE OR REPLACE FUNCTION public.consent_record_choice(
  p_consent_id uuid, p_secret text, p_analytics boolean,
  p_banner_version text, p_policy_version text, p_source text, p_environment text DEFAULT 'inconnu')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.consent_settings; r public.consent_records; h text; act text; env text;
BEGIN
  env := CASE WHEN p_environment IN ('apercu','publie') THEN p_environment ELSE 'inconnu' END;
  IF p_consent_id IS NULL OR p_analytics IS NULL OR p_secret IS NULL
     OR length(p_secret) < 32 OR length(p_secret) > 128
     OR p_source NOT IN ('banniere','preferences')
     OR p_banner_version !~ '^[A-Za-z0-9._-]{1,40}$' OR p_policy_version !~ '^[A-Za-z0-9._-]{1,40}$' THEN
    RAISE EXCEPTION 'consent_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM public.consent_settings WHERE id = 1;
  h := encode(sha256(convert_to(p_secret,'UTF8')),'hex');
  SELECT * INTO r FROM public.consent_records WHERE consent_id = p_consent_id FOR UPDATE;
  IF FOUND THEN
    IF r.secret_hash <> h THEN RAISE EXCEPTION 'consent_forbidden' USING ERRCODE = '42501'; END IF;
    IF r.analytics = p_analytics AND r.banner_version = p_banner_version AND r.policy_version = p_policy_version THEN
      RETURN 'inchange';
    END IF;
    -- Un refus/retrait n'est jamais bloqué par la limite (seules les acceptations le sont).
    IF p_analytics AND (SELECT count(*) FROM public.consent_events WHERE consent_id = p_consent_id AND created_at > now() - interval '1 hour') >= s.max_events_per_browser_hour THEN
      RAISE EXCEPTION 'consent_rate_limited' USING ERRCODE = '54000';
    END IF;
  END IF;
  IF (SELECT count(*) FROM public.consent_events WHERE created_at > now() - interval '1 minute') >= s.max_events_per_minute THEN
    RAISE EXCEPTION 'consent_rate_limited' USING ERRCODE = '54000';
  END IF;
  IF r.consent_id IS NULL THEN
    act := 'choix_initial';
    INSERT INTO public.consent_records (consent_id, secret_hash, analytics, banner_version, policy_version, source, withdrawn_at, environment)
    VALUES (p_consent_id, h, p_analytics, p_banner_version, p_policy_version, p_source, NULL, env);
  ELSE
    act := CASE WHEN r.analytics AND NOT p_analytics THEN 'retrait' ELSE 'modification' END;
    UPDATE public.consent_records SET analytics = p_analytics, banner_version = p_banner_version,
      policy_version = p_policy_version, source = p_source, last_changed_at = now(), environment = env,
      withdrawn_at = CASE WHEN act = 'retrait' THEN now() WHEN p_analytics THEN NULL ELSE withdrawn_at END
    WHERE consent_id = p_consent_id;
  END IF;
  INSERT INTO public.consent_events (consent_id, action, analytics, previous_analytics, banner_version, policy_version, source, environment)
  VALUES (p_consent_id, act, p_analytics, r.analytics, p_banner_version, p_policy_version, p_source, env);
  RETURN act;
END $$;
REVOKE ALL ON FUNCTION public.consent_record_choice(uuid,text,boolean,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consent_record_choice(uuid,text,boolean,text,text,text,text) TO anon, authenticated;
GRANT UPDATE (is_test) ON public.consent_records TO authenticated;
CREATE POLICY consent_records_admin_mark_test ON public.consent_records FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));