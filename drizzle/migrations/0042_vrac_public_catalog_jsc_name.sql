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
             'jsc_material_id', jm.id, 'jsc_name', jm.name,
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