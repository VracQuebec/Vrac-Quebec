-- 00 — Correctif de défaut EXISTANT (préalable à EXEC-02, autorisation distincte requise).
-- Défaut démontré sur réplique fidèle : trips_status_audit (BEFORE INSERT) insère trip_status_history
-- avant que le voyage existe; la clé étrangère non différable refuse TOUTE création de voyage (serveur : 0 voyage).
-- Même contenu journalisé; seule l'écriture à la création passe après l'insertion. Aucune donnée modifiée.
DO $$BEGIN
 IF md5(pg_get_functiondef('public.trips_status_audit()'::regprocedure))<>'c2a40a12550bc5a97761c8e9671bc63e' THEN RAISE EXCEPTION 'trips_status_audit divergente : arrêt'; END IF;
END$$;
CREATE OR REPLACE FUNCTION public.trips_status_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _from public.trip_status;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _from := NULL;
  ELSE
    _from := OLD.status;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF TG_OP <> 'INSERT' THEN -- création : journal écrit APRÈS insertion (trips_status_history_after_insert)
      INSERT INTO public.trip_status_history(trip_id, from_status, to_status, changed_by)
        VALUES (NEW.id, _from, NEW.status, auth.uid());
    END IF;

    -- CRM activity: journalise si owner_type/owner_id disponibles
    IF NEW.client_id IS NOT NULL THEN
      INSERT INTO public.crm_activities(owner_type, owner_id, type, title, meta, created_by)
      VALUES ('client', NEW.client_id, 'status_change',
              'Voyage ' || NEW.trip_number || ' → ' || NEW.status::text,
              jsonb_build_object('trip_id', NEW.id, 'from', _from, 'to', NEW.status), auth.uid());
      UPDATE public.clients SET last_activity_at = now() WHERE id = NEW.client_id;
    END IF;
    IF NEW.carrier_id IS NOT NULL THEN
      UPDATE public.carriers SET last_activity_at = now() WHERE id = NEW.carrier_id;
    END IF;
    IF NEW.dump_id IS NOT NULL THEN
      UPDATE public.dumps SET last_activity_at = now() WHERE id = NEW.dump_id;
    END IF;

    -- Sync statut demande de transport (mapping simple)
    IF NEW.transport_request_id IS NOT NULL AND NEW.status IN ('planifie','en_route','chargement','transport','livraison','termine','annule') THEN
      UPDATE public.transport_requests SET status =
        CASE NEW.status
          WHEN 'planifie' THEN 'planifiee'::transport_request_status
          WHEN 'en_route' THEN 'en_cours'::transport_request_status
          WHEN 'chargement' THEN 'en_cours'::transport_request_status
          WHEN 'transport' THEN 'en_cours'::transport_request_status
          WHEN 'livraison' THEN 'en_cours'::transport_request_status
          WHEN 'termine' THEN 'terminee'::transport_request_status
          WHEN 'annule' THEN 'annulee'::transport_request_status
          ELSE status
        END
      WHERE id = NEW.transport_request_id;
    END IF;

    -- Timestamps auto
    IF NEW.status = 'en_route' AND NEW.started_at IS NULL THEN NEW.started_at := now(); END IF;
    IF NEW.status = 'chargement' AND NEW.loaded_at IS NULL THEN NEW.loaded_at := now(); END IF;
    IF NEW.status = 'livraison' AND NEW.delivered_at IS NULL THEN NEW.delivered_at := now(); END IF;
    IF NEW.status = 'termine' AND NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
  END IF;

  RETURN NEW;
END $function$;
CREATE FUNCTION public.trips_status_history_after_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
BEGIN
  INSERT INTO public.trip_status_history(trip_id, from_status, to_status, changed_by) VALUES (NEW.id, NULL, NEW.status, auth.uid());
  RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION public.trips_status_history_after_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_trips_status_history_after_insert AFTER INSERT ON public.trips FOR EACH ROW EXECUTE FUNCTION public.trips_status_history_after_insert();