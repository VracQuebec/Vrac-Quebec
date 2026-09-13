ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS quantity_value numeric,
  ADD COLUMN IF NOT EXISTS quantity_unit text,
  ADD COLUMN IF NOT EXISTS parcours_direction text,
  ADD COLUMN IF NOT EXISTS truck_type_key text,
  ADD COLUMN IF NOT EXISTS access_criteria text[],
  ADD COLUMN IF NOT EXISTS photos_meta jsonb;

COMMENT ON COLUMN public.submissions.quantity_value IS 'Quantité numérique saisie (null = inconnue).';
COMMENT ON COLUMN public.submissions.quantity_unit IS 'Unité normalisée : tonnes | verges3 | m3 | voyages | inconnu.';
COMMENT ON COLUMN public.submissions.parcours_direction IS 'reception = recevoir du matériel ; evacuation = évacuer du matériel.';
COMMENT ON COLUMN public.submissions.truck_type_key IS 'Clé interne stable du type de camion (public.truck_type).';
COMMENT ON COLUMN public.submissions.access_criteria IS 'Critères d''accès structurés (clés stables).';
COMMENT ON COLUMN public.submissions.photos_meta IS 'Photos avec catégorie : [{url, category}].';

-- Backfill direction à partir des champs métier existants (aucune écrasement de valeur déjà présente)
UPDATE public.submissions
SET parcours_direction = CASE
    WHEN service_type = 'remblai_disposition' OR deliver_or_remove ILIKE '%sortir%' THEN 'evacuation'
    WHEN service_type = 'materiel_remplissage' OR deliver_or_remove ILIKE '%livrer%' THEN 'reception'
    ELSE NULL END
WHERE parcours_direction IS NULL
  AND (service_type IS NOT NULL OR deliver_or_remove IS NOT NULL);

-- Backfill quantité à partir du texte libre historique (ex. « 3 voyages de camion »)
UPDATE public.submissions s
SET quantity_value = NULLIF(replace(substring(s.quantity from '([0-9]+([.,][0-9]+)?)'), ',', '.'), '')::numeric,
    quantity_unit = CASE
      WHEN s.quantity ILIKE '%voyage%' THEN 'voyages'
      WHEN s.quantity ILIKE '%tonne%' THEN 'tonnes'
      WHEN s.quantity ILIKE '%verge%' THEN 'verges3'
      WHEN s.quantity ILIKE '%m3%' OR s.quantity ILIKE '%m³%' THEN 'm3'
      ELSE 'inconnu' END
WHERE s.quantity_unit IS NULL
  AND s.quantity IS NOT NULL
  AND s.quantity <> '';

UPDATE public.submissions
SET quantity_unit = 'inconnu'
WHERE quantity_unit IS NULL AND quantity IS NOT NULL AND quantity <> '' ;

CREATE INDEX IF NOT EXISTS submissions_parcours_direction_idx ON public.submissions (parcours_direction);
CREATE INDEX IF NOT EXISTS submissions_truck_type_key_idx ON public.submissions (truck_type_key);