ALTER TABLE public.drv_points
  ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'position',
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web';
COMMENT ON COLUMN public.drv_points.recorded_at IS 'Heure de constatation sur l''appareil (jamais dans le futur)';
COMMENT ON COLUMN public.drv_points.received_at IS 'Heure de réception par le serveur';
ALTER TABLE public.drv_points ADD CONSTRAINT drv_points_kind_chk CHECK (kind IN ('position','arrivee','depart','arret','pause','reprise','interruption'));
CREATE UNIQUE INDEX IF NOT EXISTS drv_points_client_uniq ON public.drv_points(mission_id, client_id) WHERE client_id IS NOT NULL;

-- Lot envoyé par l'application native (file locale hors réseau) : idempotent par client_id, aucun doublon au rejeu.
-- Un arrêt détecté reste une observation : il ne confirme ni voyage ni heures payables.
CREATE OR REPLACE FUNCTION public.drv_points_batch(_mission uuid, _points jsonb, _source text DEFAULT 'natif')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END $$;
GRANT EXECUTE ON FUNCTION public.drv_points_batch(uuid,jsonb,text) TO authenticated;