-- Consentement exprès aux promotions (preuve conservée) et état de synchronisation Mailchimp.
CREATE TABLE public.mkt_sender_identity (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  legal_name text, postal_address text, contact text,
  consent_text text NOT NULL DEFAULT 'Je souhaite recevoir par courriel les offres, promotions et nouvelles de Vrac Québec. Je peux me désabonner à tout moment.',
  consent_version text NOT NULL DEFAULT 'promo-v1',
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.mkt_sender_identity(id) VALUES (true);
GRANT SELECT ON public.mkt_sender_identity TO anon, authenticated;
GRANT ALL ON public.mkt_sender_identity TO service_role;
ALTER TABLE public.mkt_sender_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY mkt_sender_read ON public.mkt_sender_identity FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.mkt_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(trim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id uuid,
  entity text NOT NULL DEFAULT 'vrac_quebec',
  scope text NOT NULL DEFAULT 'promotions_courriel',
  consent_text text NOT NULL, consent_version text NOT NULL,
  sender_snapshot jsonb NOT NULL,
  source text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz, withdrawn_source text,
  mc_status text NOT NULL DEFAULT 'a_synchroniser' CHECK (mc_status IN ('a_synchroniser','pending','subscribed','unsubscribed','erreur')),
  mc_last_sync_at timestamptz, mc_error text, mc_attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mkt_consents_one_active ON public.mkt_consents(email, entity, scope) WHERE withdrawn_at IS NULL;
GRANT SELECT ON public.mkt_consents TO authenticated;
GRANT ALL ON public.mkt_consents TO service_role;
ALTER TABLE public.mkt_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY mkt_consents_admin ON public.mkt_consents FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR user_id = auth.uid());

CREATE TABLE public.mkt_sync_log (
  id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(),
  direction text NOT NULL, action text NOT NULL, email text, ok boolean NOT NULL, detail text
);
GRANT SELECT ON public.mkt_sync_log TO authenticated;
GRANT ALL ON public.mkt_sync_log TO service_role;
GRANT USAGE ON SEQUENCE public.mkt_sync_log_id_seq TO service_role;
ALTER TABLE public.mkt_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY mkt_sync_admin ON public.mkt_sync_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.mkt_promo_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL, campaign text NOT NULL, sent_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mkt_promo_sends TO authenticated;
GRANT ALL ON public.mkt_promo_sends TO service_role;
ALTER TABLE public.mkt_promo_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY mkt_sends_admin ON public.mkt_promo_sends FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Enregistrement du consentement (formulaires publics) : case décochée par défaut côté écran, refus si identité de l'expéditeur incomplète.
CREATE OR REPLACE FUNCTION public.mkt_consent_record(_email text, _source text, _version text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s record; e text := lower(trim(_email));
BEGIN
  SELECT * INTO s FROM mkt_sender_identity WHERE id;
  IF s.legal_name IS NULL OR s.postal_address IS NULL OR s.contact IS NULL THEN RAISE EXCEPTION 'Identité de l''expéditeur incomplète : consentement non recueilli'; END IF;
  IF _version IS DISTINCT FROM s.consent_version THEN RAISE EXCEPTION 'Texte de consentement périmé : rechargez la page'; END IF;
  IF e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Courriel invalide'; END IF;
  IF EXISTS (SELECT 1 FROM mkt_consents WHERE email=e AND entity='vrac_quebec' AND scope='promotions_courriel' AND withdrawn_at IS NULL) THEN RETURN; END IF;
  INSERT INTO mkt_consents(email,user_id,consent_text,consent_version,sender_snapshot,source)
  VALUES (e, auth.uid(), s.consent_text, s.consent_version,
          jsonb_build_object('legal_name',s.legal_name,'postal_address',s.postal_address,'contact',s.contact), left(coalesce(_source,'inconnu'),60));
END $$;
GRANT EXECUTE ON FUNCTION public.mkt_consent_record(text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mkt_consent_withdraw(_email text, _source text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR lower(trim(_email)) = lower(public.current_user_email())) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  UPDATE mkt_consents SET withdrawn_at=now(), withdrawn_source=left(_source,60), mc_status=CASE WHEN mc_status IN ('pending','subscribed') THEN 'a_synchroniser' ELSE mc_status END
   WHERE email=lower(trim(_email)) AND withdrawn_at IS NULL;
END $$;
GRANT EXECUTE ON FUNCTION public.mkt_consent_withdraw(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mkt_sender_save(_legal text, _addr text, _contact text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  UPDATE mkt_sender_identity SET legal_name=nullif(trim(_legal),''), postal_address=nullif(trim(_addr),''), contact=nullif(trim(_contact),''), updated_by=auth.uid(), updated_at=now() WHERE id;
END $$;
GRANT EXECUTE ON FUNCTION public.mkt_sender_save(text,text,text) TO authenticated;

-- Admissibilité vérifiée au moment de l'envoi : consentement actif, confirmé dans Mailchimp, plafond 1 promotion / 7 jours glissants.
CREATE OR REPLACE FUNCTION public.mkt_promo_eligible(_email text, _at timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e text := lower(trim(_email)); c record; last timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM mkt_consents WHERE email=e AND entity='vrac_quebec' AND scope='promotions_courriel' AND withdrawn_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','aucun consentement exprès actif'); END IF;
  IF c.mc_status <> 'subscribed' THEN RETURN jsonb_build_object('ok',false,'reason','inscription non confirmée ('||c.mc_status||')'); END IF;
  SELECT max(sent_at) INTO last FROM mkt_promo_sends WHERE email=e AND sent_at > _at - interval '7 days';
  IF last IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'reason','plafond : une promotion déjà envoyée le '||to_char(last AT TIME ZONE 'America/Toronto','YYYY-MM-DD HH24:MI')); END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
GRANT EXECUTE ON FUNCTION public.mkt_promo_eligible(text,timestamptz) TO authenticated;