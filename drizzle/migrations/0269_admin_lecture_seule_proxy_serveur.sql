
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Secret partagé entre le relais serveur (adm-ro-proxy) et la base; aucun accès client.
CREATE TABLE public.adm_ro_secret (id boolean PRIMARY KEY DEFAULT true CHECK (id), secret text NOT NULL);
INSERT INTO public.adm_ro_secret (secret) VALUES (encode(extensions.gen_random_bytes(32),'hex'));
REVOKE ALL ON public.adm_ro_secret FROM anon, authenticated;
GRANT ALL ON public.adm_ro_secret TO service_role;
ALTER TABLE public.adm_ro_secret ENABLE ROW LEVEL SECURITY;

-- Vrai seulement pour une requête transmise par le relais serveur journalisé.
CREATE OR REPLACE FUNCTION public.adm_ro_proxied()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-adm-ro-proxy', '') = (SELECT secret FROM adm_ro_secret WHERE id)
$$;
REVOKE ALL ON FUNCTION public.adm_ro_proxied() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin_reader(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM adm_readonly_users r WHERE r.user_id = _uid AND r.active)
     AND NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = _uid AND role = 'admin' AND approved)
     AND public.adm_ro_proxied()
$$;

-- Lecture seule = droits de lecture admin uniquement dans une transaction en lecture seule passée par le relais.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role AND approved = true)
  OR (_role = 'admin' AND _user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.adm_readonly_users r WHERE r.user_id = _user_id AND r.active)
      AND current_setting('transaction_read_only', true) = 'on'
      AND public.adm_ro_proxied())
$function$;

CREATE OR REPLACE FUNCTION public.entcrm_role(_company_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_admin_reader(auth.uid()) THEN 'lecture'
  WHEN public.has_role(auth.uid(),'admin') THEN 'support'
  ELSE (SELECT m.role FROM public.jsc_company_members m WHERE m.company_id=_company_id AND m.user_id=auth.uid() AND m.is_active AND m.archived_at IS NULL LIMIT 1) END
$function$;

CREATE OR REPLACE FUNCTION public.asr_role(_c uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.is_admin_reader(auth.uid()) THEN 'lecture' ELSE coalesce(
    (SELECT m.role FROM jsc_company_members m WHERE m.company_id=_c AND m.user_id=auth.uid() AND m.is_active AND m.archived_at IS NULL LIMIT 1),
    CASE WHEN public.has_role(auth.uid(),'admin') AND EXISTS (SELECT 1 FROM asr_support_access WHERE admin_id=auth.uid() AND company_id=_c AND expires_at > now()) THEN 'support' END) END
$function$;

-- Le journal accepte aussi les lignes serveur du relais (service_role) ; adm_ro_log reste limité au compte de la session.
CREATE OR REPLACE FUNCTION public.adm_ro_log(_action text, _section text DEFAULT NULL, _resource_type text DEFAULT NULL,
  _resource_id text DEFAULT NULL, _result text DEFAULT 'reussi', _detail jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recent int;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM adm_readonly_users WHERE user_id = auth.uid() AND active) THEN RETURN; END IF;
  IF _result NOT IN ('reussi','refuse','erreur') THEN _result := 'erreur'; END IF;
  SELECT count(*) INTO recent FROM adm_activity_log WHERE user_id = auth.uid() AND source='navigateur' AND occurred_at > now() - interval '1 minute';
  IF recent > 300 THEN RETURN; END IF;
  INSERT INTO adm_activity_log (user_id, action, section, resource_type, resource_id, result, source, detail)
  VALUES (auth.uid(), left(_action,60), left(_section,120), left(_resource_type,60), left(_resource_id,120), _result, 'navigateur',
          CASE WHEN pg_column_size(_detail) > 2000 THEN '{"tronque":true}'::jsonb ELSE coalesce(_detail,'{}'::jsonb) END);
END $$;

-- Connexion réussie journalisée côté serveur (mise à jour de last_sign_in_at par le service d'authentification).
CREATE OR REPLACE FUNCTION public.adm_ro_on_sign_in()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at
     AND EXISTS (SELECT 1 FROM adm_readonly_users WHERE user_id = NEW.id AND active) THEN
    INSERT INTO adm_activity_log (user_id, action, section, result, source) VALUES (NEW.id, 'connexion', 'authentification', 'reussi', 'serveur');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; -- ne jamais bloquer une connexion
END $$;
CREATE TRIGGER adm_ro_sign_in AFTER UPDATE OF last_sign_in_at ON auth.users FOR EACH ROW EXECUTE FUNCTION public.adm_ro_on_sign_in();

-- Tables de secrets : jamais lisibles par le compte lecture seule, même via les droits admin de lecture.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['jsc_api_keys','gbp_config','gbp_oauth_state','email_unsubscribe_tokens','crm_push_subscriptions','platform_checkout_locks','ent_employee_invites','adm_ro_secret','email_send_state'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('CREATE POLICY adm_ro_deny ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT public.is_admin_reader(auth.uid()))', t);
    END IF;
  END LOOP;
END $$;
