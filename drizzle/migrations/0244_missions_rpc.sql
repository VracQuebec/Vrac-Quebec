-- Corrigé 2026-10-27 (essai réplique) : contrôle réquisition seulement pour les missions liées; missions ordinaires = règles existantes (user_id + mission ouverte).
-- Same existing RPC bodies with authorization before all paths, including empty batches.
DO $$BEGIN
 IF md5(pg_get_functiondef('public.drv_mission_point(uuid,double precision,double precision,double precision,timestamptz)'::regprocedure))<>'e90183e81735e443e71592342390fc8b' THEN RAISE EXCEPTION 'RPC drv_mission_point divergente : arrêt'; END IF;
 IF md5(pg_get_functiondef('public.drv_mission_end(uuid)'::regprocedure))<>'ae368118fab9b950755e58a157fdb744' THEN RAISE EXCEPTION 'RPC drv_mission_end divergente : arrêt'; END IF;
 IF md5(pg_get_functiondef('public.drv_points_batch(uuid,jsonb,text)'::regprocedure))<>'d2298bdec54e224e506b3f66e0557e34' THEN RAISE EXCEPTION 'RPC drv_points_batch divergente : arrêt'; END IF;
END$$;
CREATE OR REPLACE FUNCTION public.drv_mission_point(_mission uuid, _lat double precision, _lng double precision, _acc double precision, _at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM drv_missions WHERE id=_mission AND requisition_id IS NOT NULL) AND NOT public.driver_mission_access(_mission,true) THEN RAISE EXCEPTION 'Accès mission retiré' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM drv_missions WHERE id=_mission AND user_id=auth.uid() AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'Mission inactive' USING ERRCODE='42501'; END IF;
  IF _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Position invalide'; END IF;
  INSERT INTO drv_points(mission_id, lat, lng, accuracy, recorded_at) VALUES (_mission, _lat, _lng, _acc, least(coalesce(_at, now()), now()));
END $$;
CREATE OR REPLACE FUNCTION public.drv_mission_end(_mission uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM drv_missions WHERE id=_mission AND requisition_id IS NOT NULL) AND NOT public.driver_mission_access(_mission,true) THEN RAISE EXCEPTION 'Accès mission retiré' USING ERRCODE='42501'; END IF;
  UPDATE drv_missions SET ended_at=now() WHERE id=_mission AND user_id=auth.uid() AND ended_at IS NULL;
END $$;
CREATE OR REPLACE FUNCTION public.drv_points_batch(_mission uuid, _points jsonb, _source text DEFAULT 'natif')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p jsonb; n int := 0; dup int := 0; k text; lat float8; lng float8;
BEGIN
  IF EXISTS (SELECT 1 FROM drv_missions WHERE id=_mission AND requisition_id IS NOT NULL) AND NOT public.driver_mission_access(_mission,true) THEN RAISE EXCEPTION 'Accès mission retiré' USING ERRCODE='42501'; END IF;
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
END $$;