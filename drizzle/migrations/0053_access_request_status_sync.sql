ALTER TYPE public.transport_request_status ADD VALUE IF NOT EXISTS 'informations_requises';

-- Correspondance unique statut admin -> étape entrepreneur (et inverse).
CREATE OR REPLACE FUNCTION public.trq_status_to_lifecycle(_s text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _s
    WHEN 'nouvelle' THEN 'a_valider' WHEN 'a_rappeler' THEN 'a_valider'
    WHEN 'en_analyse' THEN 'a_valider' WHEN 'informations_requises' THEN 'a_valider'
    WHEN 'en_attente_proprietaire' THEN 'attente_confirmation_dompe'
    WHEN 'soumission_envoyee' THEN 'attente_confirmation_dompe'
    WHEN 'acceptee' THEN 'confirmee' WHEN 'planifiee' THEN 'prete_transport'
    WHEN 'en_cours' THEN 'en_cours' WHEN 'terminee' THEN 'terminee'
    WHEN 'annulee' THEN 'annulee' WHEN 'refusee' THEN 'refusee'
    ELSE NULL END $$;

CREATE OR REPLACE FUNCTION public.trq_lifecycle_to_status(_l text, _current text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _l
    WHEN 'a_valider' THEN CASE WHEN _current IN ('nouvelle','a_rappeler','en_analyse','informations_requises') THEN _current ELSE 'en_analyse' END
    WHEN 'revalidation_requise' THEN 'en_analyse'
    WHEN 'attente_confirmation_dompe' THEN CASE WHEN _current IN ('en_attente_proprietaire','soumission_envoyee') THEN _current ELSE 'en_attente_proprietaire' END
    WHEN 'confirmee' THEN 'acceptee' WHEN 'prete_transport' THEN 'planifiee'
    WHEN 'en_cours' THEN 'en_cours' WHEN 'terminee' THEN 'terminee'
    WHEN 'annulee' THEN 'annulee' WHEN 'refusee' THEN 'refusee'
    WHEN 'expiree' THEN 'annulee'
    ELSE _current END $$;

-- S'exécute APRÈS trq_lifecycle_guard (ordre alphabétique) : aucun contournement du verrou.
CREATE OR REPLACE FUNCTION public.trq_zz_sync_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.lifecycle_status IS NOT DISTINCT FROM OLD.lifecycle_status THEN
    l := trq_status_to_lifecycle(NEW.status::text);
    IF l IS NOT NULL AND l IS DISTINCT FROM NEW.lifecycle_status
       AND NOT (l = 'a_valider' AND NEW.lifecycle_status = 'revalidation_requise') THEN
      NEW.lifecycle_status := l;
      IF l = 'annulee' AND NEW.cancelled_at IS NULL THEN NEW.cancelled_at := now(); NEW.cancelled_by := auth.uid(); END IF;
      INSERT INTO transport_request_events(request_id,action,from_status,to_status,version,reason,actor_id,actor_role,origin)
      VALUES (NEW.id,'transition',OLD.lifecycle_status,l,NEW.current_version,
              'Statut administrateur : '||NEW.status::text,auth.uid(),'admin','admin');
    END IF;
  ELSIF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    NEW.status := trq_lifecycle_to_status(NEW.lifecycle_status, NEW.status::text)::transport_request_status;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.trq_zz_sync_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trq_zz_sync_status ON public.transport_requests;
CREATE TRIGGER trq_zz_sync_status BEFORE UPDATE ON public.transport_requests
FOR EACH ROW EXECUTE FUNCTION public.trq_zz_sync_status();

CREATE OR REPLACE FUNCTION public.entr_status_label(_status text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _status
    WHEN 'nouvelle' THEN 'Reçue' WHEN 'nouveau' THEN 'Reçue'
    WHEN 'a_rappeler' THEN 'En analyse' WHEN 'en_analyse' THEN 'En analyse'
    WHEN 'informations_requises' THEN 'Informations requises'
    WHEN 'soumission_envoyee' THEN 'En attente du propriétaire'
    WHEN 'acceptee' THEN 'Acceptée' WHEN 'refusee' THEN 'Refusée'
    WHEN 'planifiee' THEN 'Acceptée' WHEN 'en_cours' THEN 'Acceptée'
    WHEN 'terminee' THEN 'Terminée' WHEN 'annulee' THEN 'Annulée'
    WHEN 'en_attente_proprietaire' THEN 'En attente du propriétaire'
    ELSE replace(coalesce(_status,''), '_', ' ') END $$;

CREATE OR REPLACE FUNCTION public.notify_entrepreneur_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_label text;
BEGIN
  IF NEW.user_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_label := CASE NEW.status::text
    WHEN 'nouvelle' THEN 'Votre demande d''accès a bien été reçue.'
    WHEN 'en_analyse' THEN 'Votre demande d''accès est en analyse.'
    WHEN 'a_rappeler' THEN 'Votre demande d''accès est en analyse.'
    WHEN 'informations_requises' THEN 'Des informations supplémentaires sont requises : ouvrez votre demande pour la compléter.'
    WHEN 'en_attente_proprietaire' THEN 'Nous avons contacté le propriétaire de la dompe.'
    WHEN 'soumission_envoyee' THEN 'Nous avons contacté le propriétaire de la dompe.'
    WHEN 'acceptee' THEN 'Bonne nouvelle : votre demande d''accès est acceptée.'
    WHEN 'refusee' THEN 'Votre demande d''accès a été refusée.'
    WHEN 'terminee' THEN 'Votre demande d''accès est terminée.'
    WHEN 'annulee' THEN 'Votre demande d''accès a été annulée.'
    ELSE 'Le suivi de votre demande d''accès a été mis à jour.' END;
  INSERT INTO public.jsc_notifications (audience, user_id, channel, title, body, entity_type, entity_id, status)
  VALUES ('client', NEW.user_id, 'in_app', COALESCE(NEW.request_number, 'Demande d''accès'),
          v_label, 'access_request', NEW.id, 'sent');
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='transport_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transport_requests;
  END IF;
END $$;