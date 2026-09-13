
-- ============ LOT 3 — GABARITS, DIMENSIONS, ACCESSIBILITÉ (ADDITIF) ============
DO $$ BEGIN
  CREATE TYPE public.transport_dimension_source AS ENUM (
    'ACTUAL_MEASURED','MANUFACTURER_SPEC','REGULATORY_LIMIT','OPERATIONAL_ESTIMATE','DEFAULT_ESTIMATE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Camion porteur 6 roues (additif)
INSERT INTO public.transport_vehicle_configs
  (code, label, vehicle_class, axle_count, trailer_axle_count, axle_configuration, sort_order, is_active)
VALUES
  ('porteur_6_roues','Camion porteur 6 roues','porteur',2,NULL,'6 roues (2 essieux)',5,true)
ON CONFLICT (code) DO NOTHING;

-- 2. Dimensions réelles par véhicule (unité normalisée : mètres)
CREATE TABLE IF NOT EXISTS public.transport_vehicle_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capacity_id uuid REFERENCES public.transport_vehicle_capacities(id) ON DELETE CASCADE,
  config_id uuid REFERENCES public.transport_vehicle_configs(id) ON DELETE SET NULL,
  label text,
  -- véhicule / ensemble
  overall_length_m numeric,
  body_width_m numeric,                 -- largeur sans rétroviseurs
  mirror_left_offset_m numeric,
  mirror_right_offset_m numeric,
  mirror_to_mirror_width_m numeric,     -- largeur physique réelle miroir à miroir
  overall_height_m numeric,             -- sol → point fixe le plus élevé
  wheelbase_m numeric,
  front_overhang_m numeric,
  rear_overhang_m numeric,
  turning_radius_m numeric,
  turning_diameter_m numeric,
  ground_clearance_m numeric,
  -- tracteur
  tractor_length_m numeric,
  tractor_body_width_m numeric,
  tractor_mirror_to_mirror_width_m numeric,
  tractor_height_m numeric,
  tractor_wheelbase_m numeric,
  -- semi-remorque
  trailer_axle_count integer,
  trailer_length_m numeric,
  trailer_body_width_m numeric,
  trailer_height_m numeric,
  trailer_wheelbase_m numeric,
  trailer_overhang_m numeric,
  kingpin_setback_m numeric,            -- position du pivot d'attelage
  -- ensemble complet
  combo_measured_length_m numeric,      -- longueur hors tout RÉELLEMENT MESURÉE
  combo_max_width_m numeric,
  combo_max_height_m numeric,
  combo_turning_radius_m numeric,
  data_source public.transport_dimension_source NOT NULL DEFAULT 'DEFAULT_ESTIMATE',
  measured_unit text NOT NULL DEFAULT 'm',
  validated_at date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transport_vehicle_dimensions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.transport_vehicle_dimensions TO authenticated;
GRANT ALL ON public.transport_vehicle_dimensions TO service_role;
ALTER TABLE public.transport_vehicle_dimensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dimensions readable by authenticated" ON public.transport_vehicle_dimensions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dimensions managed by admin" ON public.transport_vehicle_dimensions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 3. Dimensions TYPIQUES par catégorie (jamais une limite légale)
CREATE TABLE IF NOT EXISTS public.transport_dimension_typicals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.transport_vehicle_configs(id) ON DELETE CASCADE,
  dimension_key text NOT NULL,
  min_m numeric,
  typical_m numeric,
  max_m numeric,
  data_source public.transport_dimension_source NOT NULL DEFAULT 'DEFAULT_ESTIMATE',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_id, dimension_key)
);
GRANT SELECT ON public.transport_dimension_typicals TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.transport_dimension_typicals TO authenticated;
GRANT ALL ON public.transport_dimension_typicals TO service_role;
ALTER TABLE public.transport_dimension_typicals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "typicals readable by authenticated" ON public.transport_dimension_typicals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "typicals managed by admin" ON public.transport_dimension_typicals
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. Limites réglementaires de DIMENSIONS, versionnées
CREATE TABLE IF NOT EXISTS public.transport_dimension_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text NOT NULL,
  label text NOT NULL,
  applies_to text NOT NULL,             -- 'general' | 'porteur' | 'remorque' | 'ensemble_semi_type_1' ...
  config_id uuid REFERENCES public.transport_vehicle_configs(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  max_height_m numeric,
  max_regulatory_width_m numeric,       -- rétroviseurs EXCLUS
  mirrors_excluded boolean NOT NULL DEFAULT true,
  max_vehicle_length_m numeric,
  max_combination_length_m numeric,
  max_trailer_length_m numeric,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  regulatory_source text,
  regulatory_article text,
  effective_from date,
  effective_to date,
  last_verified_at date,
  validation_status text NOT NULL DEFAULT 'a_valider',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_code, version)
);
GRANT SELECT ON public.transport_dimension_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.transport_dimension_rules TO authenticated;
GRANT ALL ON public.transport_dimension_rules TO service_role;
ALTER TABLE public.transport_dimension_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dimension rules readable by authenticated" ON public.transport_dimension_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dimension rules managed by admin" ON public.transport_dimension_rules
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.transport_dimension_rules
  (rule_code, label, applies_to, max_height_m, max_regulatory_width_m, max_vehicle_length_m,
   max_combination_length_m, max_trailer_length_m, conditions, regulatory_source, validation_status, notes)
VALUES
  ('qc_hauteur_generale','Hauteur maximale générale','general',4.15,NULL,NULL,NULL,NULL,
   '{"portee":"regle generale"}'::jsonb,
   'Règlement sur les normes de charges et de dimensions (Québec)','a_valider',
   'Hauteur réglementaire générale. À confirmer contre le texte officiel avant usage légal.'),
  ('qc_largeur_generale','Largeur réglementaire générale (rétroviseurs exclus)','general',NULL,2.6,NULL,NULL,NULL,
   '{"retroviseurs":"exclus"}'::jsonb,
   'Règlement sur les normes de charges et de dimensions (Québec)','a_valider',
   'Ne jamais convertir cette valeur en largeur miroir à miroir.'),
  ('qc_largeur_remorque_generale','Largeur générale applicable aux remorques/semi-remorques','remorque',NULL,2.5,NULL,NULL,NULL,
   '{"retroviseurs":"exclus","condition":"lorsque aucune autre disposition ne s applique"}'::jsonb,
   'Règlement sur les normes de charges et de dimensions (Québec)','a_valider',
   '2,6 m possible sous conditions réglementaires; 2,5 m en règle générale.'),
  ('qc_longueur_porteur_conditionnelle','Longueur maximale d''un véhicule motorisé satisfaisant aux conditions','porteur',NULL,NULL,12.5,NULL,NULL,
   '{"condition":"conditions reglementaires correspondantes"}'::jsonb,
   'Règlement sur les normes de charges et de dimensions (Québec)','a_valider',
   'Ne pas associer automatiquement une longueur au nombre de roues.'),
  ('qc_longueur_porteur_generale','Longueur maximale — règle générale','porteur',NULL,NULL,11.0,NULL,NULL,
   '{"condition":"regle generale applicable"}'::jsonb,
   'Règlement sur les normes de charges et de dimensions (Québec)','a_valider',
   'Ne pas associer automatiquement une longueur au nombre de roues.'),
  ('qc_ensemble_semi_type_1','Ensemble tracteur + semi-remorque de type 1','ensemble_semi_type_1',NULL,NULL,NULL,23.0,16.2,
   '{"verifications":["type de semi-remorque","tracteur","empattement","entraxe","pivot d attelage","porte-a-faux","groupe d essieux"]}'::jsonb,
   'Règlement sur les normes de charges et de dimensions (Québec)','a_valider',
   'À n''appliquer qu''après vérification de la catégorie réglementaire réelle.')
ON CONFLICT (rule_code, version) DO NOTHING;

-- 5. Marges de sécurité opérationnelles (règle interne Vrac Québec, PAS une norme)
CREATE TABLE IF NOT EXISTS public.transport_safety_margins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'default',
  config_id uuid REFERENCES public.transport_vehicle_configs(id) ON DELETE CASCADE,
  width_margin_m numeric,
  height_margin_m numeric,
  length_margin_m numeric,
  is_regulatory boolean NOT NULL DEFAULT false,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transport_safety_margins TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.transport_safety_margins TO authenticated;
GRANT ALL ON public.transport_safety_margins TO service_role;
ALTER TABLE public.transport_safety_margins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "margins readable by authenticated" ON public.transport_safety_margins
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "margins managed by admin" ON public.transport_safety_margins
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.transport_safety_margins (scope, width_margin_m, height_margin_m, length_margin_m, is_regulatory, notes)
SELECT 'default', 0.30, 0.30, 1.00, false,
       'Marge opérationnelle Vrac Québec (configurable) — ce n''est pas une norme réglementaire.'
WHERE NOT EXISTS (SELECT 1 FROM public.transport_safety_margins WHERE scope = 'default');

-- 6. Contraintes d'accès des demandes de remblai (table séparée, additive)
CREATE TABLE IF NOT EXISTS public.submission_access_constraints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE REFERENCES public.submissions(id) ON DELETE CASCADE,
  access_width_m numeric,
  clear_height_m numeric,
  max_practical_length_m numeric,
  maneuvering_space_m2 numeric,
  turning_radius_m numeric,
  slope_percent numeric,
  surface_type text,
  weight_restriction_kg numeric,
  narrow_entrance boolean,
  bridge_or_culvert boolean,
  overhead_obstacles boolean,
  gate boolean,
  gate_width_m numeric,
  backing_required boolean,
  turnaround_space boolean,
  accepts_semi_trailer boolean,
  accepts_12_roues boolean,
  accepts_10_roues boolean,
  accepts_6_roues boolean,
  driver_access_notes text,
  data_source public.transport_dimension_source NOT NULL DEFAULT 'DEFAULT_ESTIMATE',
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_access_constraints TO authenticated;
GRANT ALL ON public.submission_access_constraints TO service_role;
ALTER TABLE public.submission_access_constraints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access constraints readable by authenticated" ON public.submission_access_constraints
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "access constraints managed by admin" ON public.submission_access_constraints
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 7. Horodatage
CREATE OR REPLACE FUNCTION public.transport_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $fn$;

DROP TRIGGER IF EXISTS trg_tvd_touch ON public.transport_vehicle_dimensions;
CREATE TRIGGER trg_tvd_touch BEFORE UPDATE ON public.transport_vehicle_dimensions
  FOR EACH ROW EXECUTE FUNCTION public.transport_touch_updated_at();
DROP TRIGGER IF EXISTS trg_tdt_touch ON public.transport_dimension_typicals;
CREATE TRIGGER trg_tdt_touch BEFORE UPDATE ON public.transport_dimension_typicals
  FOR EACH ROW EXECUTE FUNCTION public.transport_touch_updated_at();
DROP TRIGGER IF EXISTS trg_tdr_touch ON public.transport_dimension_rules;
CREATE TRIGGER trg_tdr_touch BEFORE UPDATE ON public.transport_dimension_rules
  FOR EACH ROW EXECUTE FUNCTION public.transport_touch_updated_at();
DROP TRIGGER IF EXISTS trg_tsm_touch ON public.transport_safety_margins;
CREATE TRIGGER trg_tsm_touch BEFORE UPDATE ON public.transport_safety_margins
  FOR EACH ROW EXECUTE FUNCTION public.transport_touch_updated_at();
DROP TRIGGER IF EXISTS trg_sac_touch ON public.submission_access_constraints;
CREATE TRIGGER trg_sac_touch BEFORE UPDATE ON public.submission_access_constraints
  FOR EACH ROW EXECUTE FUNCTION public.transport_touch_updated_at();
