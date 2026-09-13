-- ============================================================
-- LOT 2 — CAPACITÉS DE TRANSPORT (additif, non destructif)
-- Aucune donnée existante n'est modifiée.
-- ============================================================

-- 1) Configurations de véhicules (extensible)
CREATE TABLE public.transport_vehicle_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  vehicle_class text NOT NULL CHECK (vehicle_class IN ('porteur','semi_remorque','autre')),
  truck_type text,
  axle_count integer CHECK (axle_count IS NULL OR axle_count > 0),
  trailer_axle_count integer CHECK (trailer_axle_count IS NULL OR trailer_axle_count > 0),
  axle_configuration text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.transport_vehicle_configs TO authenticated;
GRANT ALL ON public.transport_vehicle_configs TO service_role;
ALTER TABLE public.transport_vehicle_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "configs lisibles par les membres" ON public.transport_vehicle_configs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "configs gerees par admin" ON public.transport_vehicle_configs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_tvc_touch BEFORE UPDATE ON public.transport_vehicle_configs
  FOR EACH ROW EXECUTE FUNCTION public.material_touch_updated_at();

-- 2) Règles réglementaires versionnées (aucune valeur inventée)
CREATE TABLE public.transport_weight_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid REFERENCES public.transport_vehicle_configs(id) ON DELETE RESTRICT,
  jurisdiction text NOT NULL DEFAULT 'QC',
  version integer NOT NULL DEFAULT 1,
  season text NOT NULL DEFAULT 'normale' CHECK (season IN ('normale','degel','special')),
  axle_group text,
  axle_spacing_m numeric,
  max_group_mass_kg numeric CHECK (max_group_mass_kg IS NULL OR max_group_mass_kg > 0),
  max_total_mass_kg numeric CHECK (max_total_mass_kg IS NULL OR max_total_mass_kg > 0),
  restrictions text,
  special_permit_notes text,
  effective_from date,
  effective_to date,
  regulatory_source text,
  last_verified_at date,
  validation_status text NOT NULL DEFAULT 'a_valider'
    CHECK (validation_status IN ('a_valider','valide','obsolete')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_twr_config ON public.transport_weight_rules(config_id, season, version);
GRANT SELECT, INSERT, UPDATE ON public.transport_weight_rules TO authenticated;
GRANT ALL ON public.transport_weight_rules TO service_role;
ALTER TABLE public.transport_weight_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regles lisibles par les membres" ON public.transport_weight_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "regles gerees par admin" ON public.transport_weight_rules
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_twr_touch BEFORE UPDATE ON public.transport_weight_rules
  FOR EACH ROW EXECUTE FUNCTION public.material_touch_updated_at();

-- 3) Capacité réelle par équipement
CREATE TABLE public.transport_vehicle_capacities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.transport_vehicle_configs(id) ON DELETE RESTRICT,
  truck_id uuid REFERENCES public.jsc_trucks(id) ON DELETE SET NULL,
  company_id uuid,
  carrier_id uuid,
  label text,
  axle_count integer CHECK (axle_count IS NULL OR axle_count > 0),
  axle_configuration text,
  tractor_tare_kg numeric CHECK (tractor_tare_kg IS NULL OR tractor_tare_kg >= 0),
  trailer_tare_kg numeric CHECK (trailer_tare_kg IS NULL OR trailer_tare_kg >= 0),
  combo_tare_kg numeric CHECK (combo_tare_kg IS NULL OR combo_tare_kg >= 0),
  gross_admissible_kg numeric CHECK (gross_admissible_kg IS NULL OR gross_admissible_kg > 0),
  weight_rule_id uuid REFERENCES public.transport_weight_rules(id) ON DELETE SET NULL,
  payload_kg numeric GENERATED ALWAYS AS (
    CASE
      WHEN gross_admissible_kg IS NULL THEN NULL
      WHEN COALESCE(combo_tare_kg, tractor_tare_kg + trailer_tare_kg, tractor_tare_kg, trailer_tare_kg) IS NULL THEN NULL
      ELSE gross_admissible_kg - COALESCE(combo_tare_kg, tractor_tare_kg + trailer_tare_kg, tractor_tare_kg, trailer_tare_kg)
    END
  ) STORED,
  operational_capacity_kg numeric CHECK (operational_capacity_kg IS NULL OR operational_capacity_kg > 0),
  volume_capacity numeric CHECK (volume_capacity IS NULL OR volume_capacity > 0),
  volume_unit text CHECK (volume_unit IS NULL OR volume_unit IN ('m3','verge3')),
  data_source text,
  validated_at date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tvcap_config ON public.transport_vehicle_capacities(config_id);
CREATE INDEX idx_tvcap_truck ON public.transport_vehicle_capacities(truck_id);
GRANT SELECT, INSERT, UPDATE ON public.transport_vehicle_capacities TO authenticated;
GRANT ALL ON public.transport_vehicle_capacities TO service_role;
ALTER TABLE public.transport_vehicle_capacities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "capacites lisibles par les membres" ON public.transport_vehicle_capacities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "capacites gerees par admin" ON public.transport_vehicle_capacities
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_tvcap_touch BEFORE UPDATE ON public.transport_vehicle_capacities
  FOR EACH ROW EXECUTE FUNCTION public.material_touch_updated_at();

-- Garde-fou : capacité opérationnelle jamais supérieure à la charge utile calculée
CREATE OR REPLACE FUNCTION public.transport_capacity_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_payload numeric;
BEGIN
  v_payload := CASE
    WHEN NEW.gross_admissible_kg IS NULL THEN NULL
    ELSE NEW.gross_admissible_kg - COALESCE(NEW.combo_tare_kg,
           NEW.tractor_tare_kg + NEW.trailer_tare_kg, NEW.tractor_tare_kg, NEW.trailer_tare_kg)
  END;
  IF v_payload IS NOT NULL AND v_payload <= 0 THEN
    RAISE EXCEPTION 'Charge utile invalide : le poids à vide dépasse la masse totale admissible.';
  END IF;
  IF NEW.operational_capacity_kg IS NOT NULL AND v_payload IS NOT NULL
     AND NEW.operational_capacity_kg > v_payload THEN
    RAISE EXCEPTION 'La capacité opérationnelle (% kg) ne peut pas dépasser la charge utile calculée (% kg).',
      NEW.operational_capacity_kg, v_payload;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_tvcap_guard BEFORE INSERT OR UPDATE ON public.transport_vehicle_capacities
  FOR EACH ROW EXECUTE FUNCTION public.transport_capacity_guard();

-- 4) Densités de matériaux (toujours des estimations)
CREATE TABLE public.transport_material_densities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_catalog_id uuid REFERENCES public.material_catalog(id) ON DELETE CASCADE,
  material_slug text,
  density_avg_kg_m3 numeric CHECK (density_avg_kg_m3 IS NULL OR density_avg_kg_m3 > 0),
  density_min_kg_m3 numeric CHECK (density_min_kg_m3 IS NULL OR density_min_kg_m3 > 0),
  density_max_kg_m3 numeric CHECK (density_max_kg_m3 IS NULL OR density_max_kg_m3 > 0),
  is_estimate boolean NOT NULL DEFAULT true,
  moisture_note text,
  data_source text,
  validated_at date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT density_range_coherent CHECK (
    density_min_kg_m3 IS NULL OR density_max_kg_m3 IS NULL OR density_min_kg_m3 <= density_max_kg_m3
  )
);
CREATE INDEX idx_tmd_material ON public.transport_material_densities(material_catalog_id);
GRANT SELECT, INSERT, UPDATE ON public.transport_material_densities TO authenticated;
GRANT ALL ON public.transport_material_densities TO service_role;
ALTER TABLE public.transport_material_densities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "densites lisibles par les membres" ON public.transport_material_densities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "densites gerees par admin" ON public.transport_material_densities
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_tmd_touch BEFORE UPDATE ON public.transport_material_densities
  FOR EACH ROW EXECUTE FUNCTION public.material_touch_updated_at();

-- 5) Configurations de base (structure uniquement, aucune limite légale inventée)
INSERT INTO public.transport_vehicle_configs (code, label, vehicle_class, truck_type, axle_count, trailer_axle_count, axle_configuration, description, sort_order)
VALUES
  ('porteur_10_roues','Camion 10 roues','porteur','10_roues',3,NULL,'1 directeur + tandem','Camion porteur dompeur à essieu tandem.',10),
  ('porteur_12_roues','Camion 12 roues','porteur','12_roues',4,NULL,'1 directeur + tridem','Camion porteur dompeur tri-essieux.',20),
  ('semi_2_essieux','Semi-remorque 2 essieux','semi_remorque','semi_remorque',5,2,'tracteur + remorque tandem','Ensemble tracteur et semi-remorque à deux essieux.',30),
  ('semi_3_essieux','Semi-remorque 3 essieux','semi_remorque','semi_remorque',6,3,'tracteur + remorque tridem','Ensemble tracteur et semi-remorque à trois essieux.',40),
  ('semi_4_essieux','Semi-remorque 4 essieux','semi_remorque','semi_remorque',7,4,'tracteur + remorque quadri','Ensemble tracteur et semi-remorque à quatre essieux.',50);

-- 6) Emplacements réglementaires à valider (masses volontairement vides)
INSERT INTO public.transport_weight_rules (config_id, season, version, validation_status, notes)
SELECT id, s.season, 1, 'a_valider',
  'Emplacement créé par le lot 2. Les masses admissibles doivent être saisies et validées contre la réglementation officielle du Québec avant tout usage comme limite légale.'
FROM public.transport_vehicle_configs c
CROSS JOIN (VALUES ('normale'),('degel')) AS s(season);