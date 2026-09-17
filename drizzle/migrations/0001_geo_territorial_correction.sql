-- 1. Niveaux géographiques distincts sur le référentiel
ALTER TABLE public.geo_territories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.geo_territories(id),
  ADD COLUMN IF NOT EXISTS mrc text;

-- 2. Traçabilité du rattachement sur les demandes (adresse d'origine jamais touchée)
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS territory_source text,
  ADD COLUMN IF NOT EXISTS territory_reason text,
  ADD COLUMN IF NOT EXISTS territory_sector text;

-- 3. Historique des corrections territoriales
CREATE TABLE IF NOT EXISTS public.geo_territory_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid,
  territory_id uuid,
  previous_territory_id uuid,
  action text NOT NULL,
  reason text,
  actor uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.geo_territory_history TO authenticated;
GRANT ALL ON public.geo_territory_history TO service_role;

ALTER TABLE public.geo_territory_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geo_history_admin_read" ON public.geo_territory_history;
CREATE POLICY "geo_history_admin_read" ON public.geo_territory_history
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "geo_history_admin_write" ON public.geo_territory_history;
CREATE POLICY "geo_history_admin_write" ON public.geo_territory_history
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS geo_territory_history_submission_idx
  ON public.geo_territory_history(submission_id);

-- 4. Normalisation de recherche : accents, casse, tirets, St/Ste
CREATE OR REPLACE FUNCTION public.geo_hay(_txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT ' ' || regexp_replace(
           regexp_replace(
             regexp_replace(' ' || coalesce(public.geo_normalize(_txt), '') || ' ',
                            ' ste ', ' sainte ', 'g'),
             ' st ', ' saint ', 'g'),
           '\s+', ' ', 'g') || ' '
$$;

-- 5. Détection de municipalité à partir de l'adresse complète
CREATE OR REPLACE FUNCTION public.geo_match_address(_address text)
RETURNS TABLE(territory_id uuid, score int)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH hay AS (SELECT public.geo_hay(_address) AS h),
  cand AS (
    SELECT t.id AS tid, public.geo_hay(t.name) AS n
    FROM public.geo_territories t
    WHERE t.status = 'active'
      AND t.merged_into_id IS NULL
      AND t.type IN ('municipalite', 'secteur', 'arrondissement')
    UNION ALL
    SELECT a.territory_id, public.geo_hay(a.alias)
    FROM public.geo_territory_aliases a
    JOIN public.geo_territories t2 ON t2.id = a.territory_id
    WHERE t2.status = 'active'
      AND t2.merged_into_id IS NULL
      AND t2.type IN ('municipalite', 'secteur', 'arrondissement')
  )
  SELECT c.tid, max(length(btrim(c.n)))::int
  FROM cand c CROSS JOIN hay
  WHERE length(btrim(c.n)) >= 5
    AND position(c.n IN hay.h) > 0
  GROUP BY c.tid
$$;

-- 6. Résolution complète : ville saisie, puis adresse complète, sinon à valider
CREATE OR REPLACE FUNCTION public.geo_resolve_location(_city text, _address text)
RETURNS TABLE(territory_id uuid, confidence text, source text, reason text)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_top int;
  v_ids uuid[];
BEGIN
  IF public.geo_normalize(_city) IS NOT NULL THEN
    v_id := public.geo_resolve_territory(_city);
    IF v_id IS NOT NULL THEN
      RETURN QUERY SELECT v_id, 'exacte'::text, 'ville'::text,
                          'Correspondance exacte sur la ville saisie'::text;
      RETURN;
    END IF;
  END IF;

  SELECT max(m.score) INTO v_top FROM public.geo_match_address(_address) m;

  IF v_top IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'aucune'::text, 'adresse'::text,
      CASE WHEN public.geo_normalize(_address) IS NULL
           THEN 'Aucune adresse exploitable'
           ELSE 'Aucune municipalité reconnue dans l''adresse' END::text;
    RETURN;
  END IF;

  SELECT array_agg(m.territory_id) INTO v_ids
  FROM public.geo_match_address(_address) m WHERE m.score = v_top;

  IF array_length(v_ids, 1) = 1 THEN
    RETURN QUERY SELECT v_ids[1], 'adresse'::text, 'adresse'::text,
                        'Municipalité identifiée dans l''adresse complète'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::uuid, 'ambigue'::text, 'adresse'::text,
    ('Arbitrage requis — plusieurs municipalités possibles : ' ||
      coalesce((SELECT string_agg(t.name, ', ' ORDER BY t.name)
                FROM public.geo_territories t WHERE t.id = ANY(v_ids)), '?'))::text;
END
$$;

-- 7. Nouvelles demandes : adresse complète comme source, jamais modifiée
CREATE OR REPLACE FUNCTION public.geo_attach_submission_territory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  t record;
BEGIN
  IF NEW.territory_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO r FROM public.geo_resolve_location(NEW.city, NEW.address) LIMIT 1;

  IF r.territory_id IS NOT NULL THEN
    SELECT * INTO t FROM public.geo_territories WHERE id = r.territory_id;
    NEW.territory_id := r.territory_id;
    NEW.territory_status := 'RATTACHE';
    NEW.territory_confidence := r.confidence;
    NEW.territory_source := r.source;
    NEW.territory_reason := r.reason;
    NEW.territory_sector := CASE WHEN t.type IN ('secteur', 'arrondissement') THEN t.name ELSE NULL END;
  ELSE
    NEW.territory_status := 'TERRITOIRE_A_VALIDER';
    NEW.territory_confidence := r.confidence;
    NEW.territory_source := r.source;
    NEW.territory_reason := r.reason;

    IF public.geo_normalize(NEW.city) IS NOT NULL THEN
      INSERT INTO public.geo_territory_queue (raw_city, normalized_city, request_count, latitude, longitude)
      VALUES (trim(NEW.city), public.geo_normalize(NEW.city), 1, NEW.latitude, NEW.longitude)
      ON CONFLICT (normalized_city) DO UPDATE
        SET request_count = public.geo_territory_queue.request_count + 1;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;