-- Hiérarchie CRM : région > MRC > municipalité > secteur/arrondissement.
-- Une demande est toujours rattachée à une MUNICIPALITÉ ; le secteur ou
-- l'arrondissement devient une information secondaire. Une région ou une
-- MRC ne peut jamais servir de municipalité de remplacement.
CREATE OR REPLACE FUNCTION public.geo_attach_submission_territory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  t record;
  p record;
BEGIN
  IF NEW.territory_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO r FROM public.geo_resolve_location(NEW.city, NEW.address) LIMIT 1;

  IF r.territory_id IS NOT NULL THEN
    SELECT * INTO t FROM public.geo_territories WHERE id = r.territory_id;

    IF t.type IN ('secteur', 'arrondissement') AND t.parent_id IS NOT NULL THEN
      SELECT * INTO p FROM public.geo_territories WHERE id = t.parent_id;
      NEW.territory_id := p.id;
      NEW.territory_sector := t.name;
      NEW.territory_status := 'RATTACHE';
      NEW.territory_confidence := r.confidence;
      NEW.territory_source := r.source;
      NEW.territory_reason := r.reason || ' (secteur/arrondissement « ' || t.name || ' » conservé en information secondaire)';
      RETURN NEW;
    END IF;

    IF t.type IN ('region', 'mrc', 'inconnu') THEN
      NEW.territory_id := NULL;
      NEW.territory_sector := NULL;
      NEW.territory_status := 'TERRITOIRE_A_VALIDER';
      NEW.territory_confidence := NULL;
      NEW.territory_source := r.source;
      NEW.territory_reason := 'Seule une région ou une MRC a été reconnue — municipalité à valider manuellement';
      RETURN NEW;
    END IF;

    NEW.territory_id := t.id;
    NEW.territory_sector := NULL;
    NEW.territory_status := 'RATTACHE';
    NEW.territory_confidence := r.confidence;
    NEW.territory_source := r.source;
    NEW.territory_reason := r.reason;
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
$function$;