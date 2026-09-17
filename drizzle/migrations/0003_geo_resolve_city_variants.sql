-- Reconnaissance des variantes orthographiques de ville (St/Ste, tirets, accents)
-- avant de retomber sur l'adresse complète. Aucune donnée n'est modifiée ici.
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

    -- Variante orthographique de la ville saisie (St/Ste, tirets, accents).
    SELECT max(m.score) INTO v_top FROM public.geo_match_address(_city) m;
    IF v_top IS NOT NULL THEN
      SELECT array_agg(m.territory_id) INTO v_ids
      FROM public.geo_match_address(_city) m WHERE m.score = v_top;
      IF array_length(v_ids, 1) = 1 THEN
        RETURN QUERY SELECT v_ids[1], 'variante'::text, 'ville'::text,
                            'Variante orthographique reconnue de la ville saisie'::text;
        RETURN;
      END IF;
    END IF;
    v_top := NULL; v_ids := NULL;
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