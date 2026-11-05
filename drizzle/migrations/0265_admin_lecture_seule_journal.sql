
CREATE TABLE public.adm_readonly_users (
  user_id uuid PRIMARY KEY,
  label text NOT NULL DEFAULT 'Administration — Lecture seule',
  active boolean NOT NULL DEFAULT true,
  is_test boolean NOT NULL DEFAULT false,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.adm_readonly_users TO authenticated;
GRANT ALL ON public.adm_readonly_users TO service_role;
ALTER TABLE public.adm_readonly_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or admin read" ON public.adm_readonly_users FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.is_admin_reader(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.adm_readonly_users r WHERE r.user_id = _uid AND r.active)
     AND NOT public.has_role(_uid,'admin')
$$;

CREATE TABLE public.adm_activity_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  retention_days integer CHECK (retention_days IS NULL OR retention_days >= 30),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.adm_activity_settings (id, retention_days) VALUES (true, NULL);
GRANT SELECT ON public.adm_activity_settings TO authenticated;
GRANT ALL ON public.adm_activity_settings TO service_role;
ALTER TABLE public.adm_activity_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read" ON public.adm_activity_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.adm_activity_log (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  section text,
  resource_type text,
  resource_id text,
  result text NOT NULL CHECK (result IN ('reussi','refuse','erreur')),
  source text NOT NULL CHECK (source IN ('navigateur','serveur')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX adm_activity_log_user_time ON public.adm_activity_log (user_id, occurred_at DESC);
CREATE INDEX adm_activity_log_time ON public.adm_activity_log (occurred_at DESC);
GRANT SELECT ON public.adm_activity_log TO authenticated;
GRANT ALL ON public.adm_activity_log TO service_role;
ALTER TABLE public.adm_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read" ON public.adm_activity_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Journal figé : aucune modification; suppression seulement par la purge de rétention.
CREATE OR REPLACE FUNCTION public.adm_activity_log_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('adm.purge', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Journal d''activité figé : modification interdite';
END $$;
CREATE TRIGGER adm_activity_log_frozen BEFORE UPDATE OR DELETE ON public.adm_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.adm_activity_log_guard();
CREATE TRIGGER adm_activity_log_no_truncate BEFORE TRUNCATE ON public.adm_activity_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.adm_activity_log_guard();

CREATE OR REPLACE FUNCTION public.adm_ro_log(_action text, _section text DEFAULT NULL, _resource_type text DEFAULT NULL,
  _resource_id text DEFAULT NULL, _result text DEFAULT 'reussi', _detail jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recent int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_reader(auth.uid()) THEN RETURN; END IF;
  IF _result NOT IN ('reussi','refuse','erreur') THEN _result := 'erreur'; END IF;
  SELECT count(*) INTO recent FROM adm_activity_log WHERE user_id = auth.uid() AND occurred_at > now() - interval '1 minute';
  IF recent > 300 THEN RETURN; END IF;
  INSERT INTO adm_activity_log (user_id, action, section, resource_type, resource_id, result, source, detail)
  VALUES (auth.uid(), left(_action,60), left(_section,120), left(_resource_type,60), left(_resource_id,120), _result, 'navigateur',
          CASE WHEN pg_column_size(_detail) > 2000 THEN '{"tronque":true}'::jsonb ELSE coalesce(_detail,'{}'::jsonb) END);
END $$;
REVOKE ALL ON FUNCTION public.adm_ro_log(text,text,text,text,text,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.adm_ro_log(text,text,text,text,text,jsonb) TO authenticated;

-- Connexion échouée : consignée seulement si l'adresse appartient à un compte lecture seule (réponse identique sinon).
CREATE OR REPLACE FUNCTION public.adm_ro_log_login_failure(_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE uid uuid; recent int;
BEGIN
  SELECT u.id INTO uid FROM auth.users u JOIN public.adm_readonly_users r ON r.user_id = u.id AND r.active
   WHERE lower(u.email) = lower(trim(_email)) LIMIT 1;
  IF uid IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO recent FROM adm_activity_log WHERE user_id = uid AND action='connexion' AND occurred_at > now() - interval '10 minutes';
  IF recent > 20 THEN RETURN; END IF;
  INSERT INTO adm_activity_log (user_id, action, section, result, source) VALUES (uid, 'connexion', 'authentification', 'refuse', 'navigateur');
END $$;
REVOKE ALL ON FUNCTION public.adm_ro_log_login_failure(text) FROM public;
GRANT EXECUTE ON FUNCTION public.adm_ro_log_login_failure(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.adm_activity_set_retention(_days integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Réservé aux super administrateurs'; END IF;
  IF _days IS NOT NULL AND _days < 30 THEN RAISE EXCEPTION 'Minimum 30 jours'; END IF;
  UPDATE adm_activity_settings SET retention_days = _days, updated_at = now(), updated_by = auth.uid() WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.adm_activity_set_retention(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.adm_activity_set_retention(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.adm_activity_purge()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d int; n int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Réservé aux super administrateurs'; END IF;
  SELECT retention_days INTO d FROM adm_activity_settings WHERE id;
  IF d IS NULL THEN RETURN 0; END IF; -- durée non décidée : aucune purge
  PERFORM set_config('adm.purge','on', true);
  DELETE FROM adm_activity_log WHERE occurred_at < now() - make_interval(days => d);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('adm.purge','off', true);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.adm_activity_purge() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.adm_activity_purge() TO authenticated;

-- Lecture seule côté serveur : politiques SELECT uniquement, jamais d'écriture.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relrowsecurity
      AND c.relname NOT IN ('adm_readonly_users','adm_activity_log','adm_activity_settings','cron_auth','gbp_config','gbp_oauth_state',
                            'jsc_api_keys','public_request_guard','platform_checkout_locks','email_unsubscribe_tokens','crm_push_subscriptions')
      AND c.relname !~ '(token|secret|oauth|api_key|password|credential|push_sub)'
      AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
                      AND a.attname ~ '(token|secret|password|api_key|key_hash|code_hash)')
      AND (
        EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname AND p.cmd IN ('SELECT','ALL')
                AND (p.qual ~ 'has_role\(auth\.uid\(\), ''admin''' OR p.qual ~ 'mkt_is_admin\(\)'))
        OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='company_id' AND NOT a.attisdropped)
      )
  LOOP
    EXECUTE format('CREATE POLICY adm_ro_select ON public.%I FOR SELECT TO authenticated USING (public.is_admin_reader(auth.uid()))', t.relname);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t.relname);
  END LOOP;
END $$;
