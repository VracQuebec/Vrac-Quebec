-- RETOUR ARRIÈRE COMPLET du paquet (fichiers 00 à 10) — vérifié sur réplique : état fonctions/règles/déclencheurs identique au serveur.
-- Généré depuis l'état RÉEL du serveur (lecture 2026-10-27 14:10:26.457269+00).
-- Restaure les définitions et droits archivés, retire déclencheurs/règles/fonctions ajoutés.
-- CONSERVE volontairement tables et colonnes ajoutées et leurs données (retour sans perte).
-- Retour partiel du seul correctif 00 : retour/00_trips_journal_creation.sql.

DROP TRIGGER IF EXISTS "driver_mission_write_guard" ON public."drv_missions";
DROP TRIGGER IF EXISTS "driver_tracking_write_guard" ON public."drv_points";
DROP TRIGGER IF EXISTS "driver_invite_identity_guard" ON public."ent_employee_invites";
DROP TRIGGER IF EXISTS "driver_delivery_access_guard" ON public."jsc_deliveries";
DROP TRIGGER IF EXISTS "reception_debit_immutable" ON public."submission_reception_debits";
DROP TRIGGER IF EXISTS "reception_measurement_immutable" ON public."submission_reception_measurements";
DROP TRIGGER IF EXISTS "workbench_submission_guard" ON public."submissions";
DROP TRIGGER IF EXISTS "workbench_submission_insert_guard" ON public."submissions";
DROP TRIGGER IF EXISTS "workbench_legacy_transport_guard" ON public."transport_requests";
DROP TRIGGER IF EXISTS "workbench_requisition_guard" ON public."transport_requests";
DROP TRIGGER IF EXISTS "workbench_requisition_insert_guard" ON public."transport_requests";
DROP TRIGGER IF EXISTS "trg_trips_status_history_after_insert" ON public."trips";
DROP POLICY IF EXISTS "r" ON public."ent_employee_invites";
DROP POLICY IF EXISTS "reception_dispatch_service" ON public."submission_portal_dispatches";
DROP POLICY IF EXISTS "reception_debit_service" ON public."submission_reception_debits";
DROP POLICY IF EXISTS "reception_measurement_service" ON public."submission_reception_measurements";
DROP POLICY IF EXISTS "reception_operation_service" ON public."submission_reception_operations";
DROP POLICY IF EXISTS "reception_reservation_service" ON public."submission_reception_reservations";
DROP POLICY IF EXISTS "missions read" ON public.drv_missions; CREATE POLICY "missions read" ON public.drv_missions AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR (entrepreneur_id = cpn_my_entrepreneur())));
DROP POLICY IF EXISTS "points read" ON public.drv_points; CREATE POLICY "points read" ON public.drv_points AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM drv_missions m
  WHERE ((m.id = drv_points.mission_id) AND ((m.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR (m.entrepreneur_id = cpn_my_entrepreneur()))))));
CREATE OR REPLACE FUNCTION public.drv_mission_end(_mission uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE drv_missions SET ended_at=now() WHERE id=_mission AND user_id=auth.uid() AND ended_at IS NULL;
END $function$;
REVOKE ALL ON FUNCTION public.drv_mission_end(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.drv_mission_end(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.drv_mission_end(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.drv_mission_point(_mission uuid, _lat double precision, _lng double precision, _acc double precision, _at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drv_missions WHERE id=_mission AND user_id=auth.uid() AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'Mission inactive' USING ERRCODE='42501'; END IF;
  IF _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Position invalide'; END IF;
  INSERT INTO drv_points(mission_id, lat, lng, accuracy, recorded_at) VALUES (_mission, _lat, _lng, _acc, least(coalesce(_at, now()), now()));
END $function$;
REVOKE ALL ON FUNCTION public.drv_mission_point(uuid,double precision,double precision,double precision,timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.drv_mission_point(uuid,double precision,double precision,double precision,timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.drv_mission_point(uuid,double precision,double precision,double precision,timestamp with time zone) TO service_role;
CREATE OR REPLACE FUNCTION public.drv_points_batch(_mission uuid, _points jsonb, _source text DEFAULT 'natif'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p jsonb; n int := 0; dup int := 0; k text; lat float8; lng float8;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drv_missions WHERE id=_mission AND user_id=auth.uid() AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'Mission inactive' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(_points) <> 'array' OR jsonb_array_length(_points) > 500 THEN RAISE EXCEPTION 'Lot invalide (500 points max)'; END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(_points) LOOP
    k := coalesce(p->>'kind','position'); lat := (p->>'lat')::float8; lng := (p->>'lng')::float8;
    IF (p->>'client_id') IS NULL THEN RAISE EXCEPTION 'client_id requis'; END IF;
    IF k NOT IN ('position','arrivee','depart','arret','pause','reprise','interruption') THEN RAISE EXCEPTION 'Type inconnu %', k; END IF;
    IF lat NOT BETWEEN -90 AND 90 OR lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Position invalide'; END IF;
    INSERT INTO drv_points(mission_id, lat, lng, accuracy, recorded_at, kind, client_id, source)
    VALUES (_mission, lat, lng, (p->>'acc')::float8, least(coalesce((p->>'at')::timestamptz, now()), now()), k, (p->>'client_id')::uuid, left(_source,20))
    ON CONFLICT (mission_id, client_id) WHERE client_id IS NOT NULL DO NOTHING;
    IF FOUND THEN n := n+1; ELSE dup := dup+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('added',n,'duplicates',dup);
END $function$;
REVOKE ALL ON FUNCTION public.drv_points_batch(uuid,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.drv_points_batch(uuid,jsonb,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.drv_points_batch(uuid,jsonb,text) TO anon;
GRANT EXECUTE ON FUNCTION public.drv_points_batch(uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.drv_points_batch(uuid,jsonb,text) TO service_role;
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
    INSERT INTO public.trip_status_history(trip_id, from_status, to_status, changed_by)
      VALUES (NEW.id, _from, NEW.status, auth.uid());

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
REVOKE ALL ON FUNCTION public.trips_status_audit() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trips_status_audit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trips_status_audit() TO service_role;
DROP FUNCTION IF EXISTS public.driver_delivery_access_guard();
DROP FUNCTION IF EXISTS public.driver_invite_accept(text);
DROP FUNCTION IF EXISTS public.driver_invite_capture(uuid,uuid,text,text,text,text,uuid);
DROP FUNCTION IF EXISTS public.driver_invite_identity_guard();
DROP FUNCTION IF EXISTS public.driver_invite_options(uuid);
DROP FUNCTION IF EXISTS public.driver_invite_prepare(uuid,uuid,text,text,text);
DROP FUNCTION IF EXISTS public.driver_invite_renew(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.driver_invite_revoke(uuid);
DROP FUNCTION IF EXISTS public.driver_mission_access(uuid,boolean);
DROP FUNCTION IF EXISTS public.driver_tracking_start(uuid,boolean);
DROP FUNCTION IF EXISTS public.driver_tracking_write_guard();
DROP FUNCTION IF EXISTS public.exec02_defer_message(bigint,integer);
DROP FUNCTION IF EXISTS public.exec02_dispatch(jsonb);
DROP FUNCTION IF EXISTS public.exec02_dispatch_base(jsonb);
DROP FUNCTION IF EXISTS public.exec02_due();
DROP FUNCTION IF EXISTS public.exec02_exception(uuid,text,text,uuid);
DROP FUNCTION IF EXISTS public.exec02_message_current(jsonb);
DROP FUNCTION IF EXISTS public.exec02_message_delay(jsonb);
DROP FUNCTION IF EXISTS public.pun_invite_accept(text);
DROP FUNCTION IF EXISTS public.pun_invite_prepare(uuid,text,text,text,text);
DROP FUNCTION IF EXISTS public.pun_invite_revoke(uuid);
DROP FUNCTION IF EXISTS public.request_update_versioned(uuid,integer,jsonb,uuid,boolean);
DROP FUNCTION IF EXISTS public.requisition_access(transport_requests);
DROP FUNCTION IF EXISTS public.requisition_action(uuid,uuid,integer,text,text,uuid,boolean);
DROP FUNCTION IF EXISTS public.requisition_assign(uuid,uuid,integer,jsonb,uuid,boolean);
DROP FUNCTION IF EXISTS public.requisition_options(uuid);
DROP FUNCTION IF EXISTS public.requisition_read(uuid);
DROP FUNCTION IF EXISTS public.submission_edit_bind(uuid,uuid,boolean,text);
DROP FUNCTION IF EXISTS public.submission_edit_read(uuid);
DROP FUNCTION IF EXISTS public.submission_edit_save(uuid,uuid,integer,jsonb,uuid,boolean);
DROP FUNCTION IF EXISTS public.submission_edit_values(submissions);
DROP FUNCTION IF EXISTS public.trips_status_history_after_insert();
DROP FUNCTION IF EXISTS public.workbench_invalidate_reservations(uuid,uuid,uuid);
DROP FUNCTION IF EXISTS public.workbench_legacy_transport_guard();
DROP FUNCTION IF EXISTS public.workbench_manager(uuid);
DROP FUNCTION IF EXISTS public.workbench_write_guard();
