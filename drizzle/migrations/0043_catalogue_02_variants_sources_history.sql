-- Variantes commercialisables (calibre, couleur, composition, spécification…)
CREATE TABLE IF NOT EXISTS public.material_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.material_catalog(id) ON DELETE RESTRICT,
  code text NOT NULL,
  label_fr text NOT NULL,
  variant_kind text NOT NULL DEFAULT 'calibre'
    CHECK (variant_kind IN ('calibre','couleur','composition','specification','qualite','traitement')),
  specification_code text,
  specification_documented boolean NOT NULL DEFAULT false,
  granulometry_id uuid REFERENCES public.material_granulometries(id),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (material_id, code)
);
GRANT SELECT ON public.material_variants TO anon, authenticated;
GRANT INSERT, UPDATE ON public.material_variants TO authenticated;
GRANT ALL ON public.material_variants TO service_role;
ALTER TABLE public.material_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_variants_read ON public.material_variants FOR SELECT USING (is_active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY material_variants_admin ON public.material_variants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Provenance / devenir de chaque ligne d'inventaire
CREATE TABLE IF NOT EXISTS public.material_catalog_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_ref text NOT NULL UNIQUE,
  lot text NOT NULL,
  proposal_type text NOT NULL CHECK (proposal_type IN ('materiau','variante','synonyme','correspondance','reference')),
  outcome text NOT NULL CHECK (outcome IN ('cree','variante_creee','rattache','proposition_a_valider','a_qualifier','exclu')),
  outcome_reason text,
  material_id uuid REFERENCES public.material_catalog(id),
  variant_id uuid REFERENCES public.material_variants(id),
  proposed_equivalent_id uuid REFERENCES public.material_catalog(id),
  original_name text NOT NULL,
  supplier_name text,
  source_url text,
  region text,
  bulk_evidence text,
  characteristics text,
  verified_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.material_catalog_sources TO authenticated;
GRANT ALL ON public.material_catalog_sources TO service_role;
ALTER TABLE public.material_catalog_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_catalog_sources_admin ON public.material_catalog_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Historique des renommages / désactivations
CREATE TABLE IF NOT EXISTS public.material_catalog_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  old_values jsonb,
  new_values jsonb
);
GRANT SELECT ON public.material_catalog_history TO authenticated;
GRANT ALL ON public.material_catalog_history TO service_role;
ALTER TABLE public.material_catalog_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY material_catalog_history_admin ON public.material_catalog_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.material_catalog_track_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o jsonb; n jsonb;
BEGIN
  IF TG_TABLE_NAME = 'material_catalog' THEN
    o := jsonb_build_object('name_fr',OLD.name_fr,'family',OLD.family,'is_active',OLD.is_active,'vrac_selectable',OLD.vrac_selectable);
    n := jsonb_build_object('name_fr',NEW.name_fr,'family',NEW.family,'is_active',NEW.is_active,'vrac_selectable',NEW.vrac_selectable);
  ELSE
    o := jsonb_build_object('label_fr',OLD.label_fr,'is_active',OLD.is_active);
    n := jsonb_build_object('label_fr',NEW.label_fr,'is_active',NEW.is_active);
  END IF;
  IF o IS DISTINCT FROM n THEN
    INSERT INTO material_catalog_history(entity, entity_id, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, auth.uid(), o, n);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_material_catalog_history ON public.material_catalog;
CREATE TRIGGER trg_material_catalog_history BEFORE UPDATE ON public.material_catalog
  FOR EACH ROW EXECUTE FUNCTION public.material_catalog_track_history();
DROP TRIGGER IF EXISTS trg_material_variants_history ON public.material_variants;
CREATE TRIGGER trg_material_variants_history BEFORE UPDATE ON public.material_variants
  FOR EACH ROW EXECUTE FUNCTION public.material_catalog_track_history();

-- Variante vendable liée au tarif
ALTER TABLE public.jsc_materials ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.material_variants(id);
-- Nature du tarif : vente / transport / réception-évacuation (le moteur de vente ne lit que « vente »)
ALTER TABLE public.jsc_material_prices ADD COLUMN IF NOT EXISTS price_kind text NOT NULL DEFAULT 'vente';
ALTER TABLE public.jsc_material_prices DROP CONSTRAINT IF EXISTS jsc_material_prices_price_kind_check;
ALTER TABLE public.jsc_material_prices ADD CONSTRAINT jsc_material_prices_price_kind_check CHECK (price_kind IN ('vente','transport','reception'));
-- Choix précis conservé dans la demande
ALTER TABLE public.jsc_requests ADD COLUMN IF NOT EXISTS material_variant_id uuid REFERENCES public.material_variants(id);

-- Catalogue public : ajoute les variantes du référentiel (sans prix ni coût)
CREATE OR REPLACE FUNCTION public.vrac_public_catalog()
 RETURNS TABLE(material_id uuid, slug text, name text, family text, family_label text, requires_granulometry boolean, search_terms text[], variants jsonb, price_status text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH valid_prices AS (
    SELECT jm.material_catalog_id, jm.granulometry_id, jm.variant_id, jm.id AS jsc_id
      FROM jsc_materials jm
      JOIN jsc_material_prices p ON p.material_id = jm.id
     WHERE jm.is_active AND jm.archived_at IS NULL
       AND p.is_active AND p.archived_at IS NULL AND p.auto_quote_enabled
       AND p.price_kind = 'vente'
       AND p.selling_price IS NOT NULL
       AND (p.selling_price > 0 OR p.zero_price_confirmed)
       AND (p.valid_from IS NULL OR p.valid_from <= current_date)
       AND (p.valid_to IS NULL OR p.valid_to >= current_date)
  )
  SELECT c.id, c.slug, c.name_fr, c.family, COALESCE(f.name_fr, c.family),
         c.requires_granulometry,
         (c.search_terms
           || COALESCE((SELECT array_agg(DISTINCT a.alias_raw) FROM material_aliases a WHERE a.material_id = c.id AND a.is_active), '{}')
           || COALESCE((SELECT array_agg(DISTINCT s.expression) FROM material_synonyms s WHERE s.normalized_material_id = c.id OR c.slug = ANY(s.material_keys) OR lower(c.name_fr) = ANY(s.material_keys)), '{}')),
         COALESCE((
           SELECT jsonb_agg(v ORDER BY v->>'label') FROM (
             SELECT DISTINCT jsonb_build_object(
               'granulometry_id', jm.granulometry_id, 'variant_id', jm.variant_id,
               'label', COALESCE(mv.label_fr, g.label_fr),
               'jsc_material_id', jm.id, 'jsc_name', jm.name,
               'price_available', EXISTS (SELECT 1 FROM valid_prices vp WHERE vp.jsc_id = jm.id)) v
               FROM jsc_materials jm
               LEFT JOIN material_granulometries g ON g.id = jm.granulometry_id
               LEFT JOIN material_variants mv ON mv.id = jm.variant_id
              WHERE jm.material_catalog_id = c.id AND jm.is_active AND jm.archived_at IS NULL
             UNION
             SELECT jsonb_build_object(
               'granulometry_id', mv.granulometry_id, 'variant_id', mv.id, 'label', mv.label_fr,
               'jsc_material_id', NULL, 'jsc_name', NULL, 'price_available', false)
               FROM material_variants mv
              WHERE mv.material_id = c.id AND mv.is_active
                AND NOT EXISTS (SELECT 1 FROM jsc_materials jm WHERE jm.variant_id = mv.id AND jm.is_active AND jm.archived_at IS NULL)
           ) q
         ), '[]'::jsonb),
         CASE WHEN EXISTS (SELECT 1 FROM valid_prices vp WHERE vp.material_catalog_id = c.id)
              THEN 'prix_disponible' ELSE 'sur_demande' END
    FROM material_catalog c
    LEFT JOIN material_families f ON f.id = c.family_id
   WHERE c.is_active AND c.vrac_selectable
   ORDER BY c.family, c.display_order, c.name_fr;
$function$;
