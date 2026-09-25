-- 1. Catalogue central : sélection Vrac explicite
ALTER TABLE public.material_catalog
  ADD COLUMN IF NOT EXISTS vrac_selectable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vrac_exclusion_reason text;

UPDATE public.material_catalog
   SET vrac_selectable = false,
       vrac_exclusion_reason = 'Entrée technique de qualification (matériau non identifié), pas un produit vendable.'
 WHERE slug = 'materiau-non-identifie' AND vrac_exclusion_reason IS NULL;

-- 2. Produits Vrac rattachés au catalogue central (variante = granulométrie)
ALTER TABLE public.jsc_materials
  ADD COLUMN IF NOT EXISTS material_catalog_id uuid REFERENCES public.material_catalog(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS granulometry_id uuid REFERENCES public.material_granulometries(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS jsc_materials_catalog_idx ON public.jsc_materials(material_catalog_id, granulometry_id);

UPDATE public.jsc_materials m SET material_catalog_id = c.id, granulometry_id = g.id
  FROM public.material_catalog c, public.material_granulometries g
 WHERE m.material_catalog_id IS NULL AND m.name = 'Pierre concassée 0-3/4' AND c.slug='pierre-concassee' AND g.code='0-3/4';
UPDATE public.jsc_materials m SET material_catalog_id = c.id, granulometry_id = g.id
  FROM public.material_catalog c, public.material_granulometries g
 WHERE m.material_catalog_id IS NULL AND m.name = 'Pierre concassée 3/4 net' AND c.slug='pierre-concassee' AND g.code='net 3/4';
UPDATE public.jsc_materials m SET material_catalog_id = c.id
  FROM public.material_catalog c
 WHERE m.material_catalog_id IS NULL AND (
       (m.name='Poussière de pierre' AND c.slug='poussiere-de-pierre')
    OR (m.name='Sable' AND c.slug='sable')
    OR (m.name='Sable à compaction' AND c.slug='sable-compaction')
    OR (m.name='Terre tamisée' AND c.slug='terre-tamisee'));

-- 3. Tarifs : prix vide possible (jamais 0 implicite), validité, zone, paliers, activation auto
ALTER TABLE public.jsc_material_prices
  ALTER COLUMN selling_price DROP NOT NULL,
  ALTER COLUMN selling_price DROP DEFAULT,
  ALTER COLUMN purchase_price DROP NOT NULL,
  ALTER COLUMN purchase_price DROP DEFAULT,
  ADD COLUMN IF NOT EXISTS max_quantity numeric,
  ADD COLUMN IF NOT EXISTS zone_label text,
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_to date,
  ADD COLUMN IF NOT EXISTS transport_included boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_quote_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS zero_price_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

-- 4. Demandes Vrac : matériau central, variante, motif manuel, matériau introuvable
ALTER TABLE public.jsc_requests
  ADD COLUMN IF NOT EXISTS material_catalog_id uuid REFERENCES public.material_catalog(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS granulometry_id uuid REFERENCES public.material_granulometries(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS manual_reason text,
  ADD COLUMN IF NOT EXISTS custom_material_description text;

-- 5. Correspondance explicite des anciens libellés (formulaire Remblai)
CREATE TABLE IF NOT EXISTS public.material_catalog_legacy_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  legacy_label text NOT NULL,
  material_id uuid REFERENCES public.material_catalog(id) ON DELETE RESTRICT,
  granulometry_id uuid REFERENCES public.material_granulometries(id) ON DELETE RESTRICT,
  mapping_status text NOT NULL DEFAULT 'exact',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, legacy_label)
);
GRANT SELECT ON public.material_catalog_legacy_map TO authenticated;
GRANT ALL ON public.material_catalog_legacy_map TO service_role;
ALTER TABLE public.material_catalog_legacy_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "legacy map read members" ON public.material_catalog_legacy_map FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "legacy map admin write" ON public.material_catalog_legacy_map FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.material_catalog_legacy_map (source, legacy_label, material_id, granulometry_id, mapping_status, note)
SELECT 'remblai_form', v.label, c.id, g.id, v.status, v.note
FROM (VALUES
  ('Terre','terre',NULL,'exact',NULL),
  ('Terre mélangée','terre-melangee',NULL,'exact',NULL),
  ('Sable','sable',NULL,'exact',NULL),
  ('Pierre concassée 0-3/4','pierre-concassee','0-3/4','exact',NULL),
  ('Pierre concassée 3/4 net','pierre-concassee','net 3/4','ambigu','Peut aussi correspondre à « Pierre nette »; aucune fusion automatique.'),
  ('Poussière de pierre','poussiere-de-pierre',NULL,'exact',NULL),
  ('Gravier','gravier',NULL,'exact',NULL),
  ('Roches','roche',NULL,'ambigu','Libellé générique : roche, blocs, roc excavé ou roches concassées.'),
  ('Béton','beton',NULL,'exact',NULL),
  ('Asphalte','asphalte',NULL,'exact',NULL),
  ('Souches','souches',NULL,'exact',NULL),
  ('Pierre','pierre',NULL,'exact','Ancien libellé conservé pour les données historiques.'),
  ('Autre',NULL,NULL,'non_rattache','Terme libre : qualification manuelle.'),
  ('Je ne suis pas certain','materiau-non-identifie',NULL,'non_rattache','Incertitude du client, pas un produit.')
) AS v(label, slug, gcode, status, note)
LEFT JOIN public.material_catalog c ON c.slug = v.slug
LEFT JOIN public.material_granulometries g ON g.code = v.gcode
ON CONFLICT (source, legacy_label) DO NOTHING;

-- 6. Catalogue public Vrac : aucune donnée de coût, prix ou marge
CREATE OR REPLACE FUNCTION public.vrac_public_catalog()
RETURNS TABLE (
  material_id uuid, slug text, name text, family text, family_label text,
  requires_granulometry boolean, search_terms text[],
  variants jsonb, price_status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH valid_prices AS (
    SELECT jm.material_catalog_id, jm.granulometry_id, jm.id AS jsc_id
      FROM jsc_materials jm
      JOIN jsc_material_prices p ON p.material_id = jm.id
     WHERE jm.is_active AND jm.archived_at IS NULL
       AND p.is_active AND p.archived_at IS NULL AND p.auto_quote_enabled
       AND p.selling_price IS NOT NULL
       AND (p.selling_price > 0 OR p.zero_price_confirmed)
       AND (p.valid_from IS NULL OR p.valid_from <= current_date)
       AND (p.valid_to IS NULL OR p.valid_to >= current_date)
  )
  SELECT c.id, c.slug, c.name_fr, c.family, COALESCE(f.name_fr, c.family),
         c.requires_granulometry,
         (c.search_terms
           || COALESCE((SELECT array_agg(DISTINCT a.alias_raw) FROM material_aliases a WHERE a.material_id = c.id), '{}')
           || COALESCE((SELECT array_agg(DISTINCT s.expression) FROM material_synonyms s WHERE s.normalized_material_id = c.id OR c.slug = ANY(s.material_keys) OR lower(c.name_fr) = ANY(s.material_keys)), '{}')),
         COALESCE((
           SELECT jsonb_agg(DISTINCT jsonb_build_object(
             'granulometry_id', jm.granulometry_id,
             'label', g.label_fr,
             'jsc_material_id', jm.id,
             'price_available', EXISTS (SELECT 1 FROM valid_prices vp WHERE vp.jsc_id = jm.id)))
             FROM jsc_materials jm LEFT JOIN material_granulometries g ON g.id = jm.granulometry_id
            WHERE jm.material_catalog_id = c.id AND jm.is_active AND jm.archived_at IS NULL
         ), '[]'::jsonb),
         CASE WHEN EXISTS (SELECT 1 FROM valid_prices vp WHERE vp.material_catalog_id = c.id)
              THEN 'prix_disponible' ELSE 'sur_demande' END
    FROM material_catalog c
    LEFT JOIN material_families f ON f.id = c.family_id
   WHERE c.is_active AND c.vrac_selectable
   ORDER BY c.family, c.display_order, c.name_fr;
$$;
REVOKE ALL ON FUNCTION public.vrac_public_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vrac_public_catalog() TO anon, authenticated, service_role;