CREATE TABLE public.consent_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retention_days integer CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 36500),
  max_events_per_browser_hour integer NOT NULL DEFAULT 20 CHECK (max_events_per_browser_hour BETWEEN 1 AND 1000),
  max_events_per_minute integer NOT NULL DEFAULT 300 CHECK (max_events_per_minute BETWEEN 1 AND 100000),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
COMMENT ON COLUMN public.consent_settings.retention_days IS 'Durée de conservation choisie par l''administration (NULL = non définie, aucune purge). Ce n''est pas une durée légale.';
INSERT INTO public.consent_settings (id) VALUES (1);

CREATE TABLE public.consent_records (
  consent_id uuid PRIMARY KEY,
  secret_hash text NOT NULL,
  analytics boolean NOT NULL,
  advertising boolean NOT NULL DEFAULT false,
  banner_version text NOT NULL,
  policy_version text NOT NULL,
  source text NOT NULL CHECK (source IN ('banniere','preferences')),
  first_decided_at timestamptz NOT NULL DEFAULT now(),
  last_changed_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz
);
COMMENT ON TABLE public.consent_records IS 'Registre des choix de témoins par navigateur (identifiant aléatoire, aucune donnée nominative, non relié au CRM).';

CREATE TABLE public.consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id uuid NOT NULL REFERENCES public.consent_records(consent_id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('choix_initial','modification','retrait')),
  analytics boolean NOT NULL,
  advertising boolean NOT NULL DEFAULT false,
  previous_analytics boolean,
  banner_version text NOT NULL,
  policy_version text NOT NULL,
  source text NOT NULL CHECK (source IN ('banniere','preferences')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_events_consent_idx ON public.consent_events (consent_id, created_at DESC);
CREATE INDEX consent_events_created_idx ON public.consent_events (created_at DESC);

GRANT SELECT, UPDATE ON public.consent_settings TO authenticated;
GRANT SELECT ON public.consent_records TO authenticated;
GRANT SELECT ON public.consent_events TO authenticated;
GRANT ALL ON public.consent_settings, public.consent_records, public.consent_events TO service_role;

ALTER TABLE public.consent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY consent_settings_admin_read ON public.consent_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY consent_settings_admin_update ON public.consent_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin') AND updated_by = auth.uid());
CREATE POLICY consent_records_admin_read ON public.consent_records FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY consent_events_admin_read ON public.consent_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.consent_record_choice(
  p_consent_id uuid, p_secret text, p_analytics boolean,
  p_banner_version text, p_policy_version text, p_source text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.consent_settings; r public.consent_records; h text; act text;
BEGIN
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
    IF (SELECT count(*) FROM public.consent_events WHERE consent_id = p_consent_id AND created_at > now() - interval '1 hour') >= s.max_events_per_browser_hour THEN
      RAISE EXCEPTION 'consent_rate_limited' USING ERRCODE = '54000';
    END IF;
  END IF;
  IF (SELECT count(*) FROM public.consent_events WHERE created_at > now() - interval '1 minute') >= s.max_events_per_minute THEN
    RAISE EXCEPTION 'consent_rate_limited' USING ERRCODE = '54000';
  END IF;
  IF NOT FOUND OR r.consent_id IS NULL THEN
    act := 'choix_initial';
    INSERT INTO public.consent_records (consent_id, secret_hash, analytics, banner_version, policy_version, source, withdrawn_at)
    VALUES (p_consent_id, h, p_analytics, p_banner_version, p_policy_version, p_source, NULL);
  ELSE
    act := CASE WHEN r.analytics AND NOT p_analytics THEN 'retrait' ELSE 'modification' END;
    UPDATE public.consent_records SET analytics = p_analytics, banner_version = p_banner_version,
      policy_version = p_policy_version, source = p_source, last_changed_at = now(),
      withdrawn_at = CASE WHEN act = 'retrait' THEN now() WHEN p_analytics THEN NULL ELSE withdrawn_at END
    WHERE consent_id = p_consent_id;
  END IF;
  INSERT INTO public.consent_events (consent_id, action, analytics, previous_analytics, banner_version, policy_version, source)
  VALUES (p_consent_id, act, p_analytics, r.analytics, p_banner_version, p_policy_version, p_source);
  RETURN act;
END $$;
REVOKE ALL ON FUNCTION public.consent_record_choice(uuid,text,boolean,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consent_record_choice(uuid,text,boolean,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.consent_purge_expired()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d integer; n integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT retention_days INTO d FROM public.consent_settings WHERE id = 1;
  IF d IS NULL THEN RAISE EXCEPTION 'retention_not_set' USING ERRCODE = '22023'; END IF;
  DELETE FROM public.consent_records WHERE last_changed_at < now() - make_interval(days => d);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.consent_purge_expired() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consent_purge_expired() TO authenticated;