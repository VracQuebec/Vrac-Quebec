-- ============================================================
-- SÉCURITÉ — LECTURES DE RÉFÉRENCE TROP LARGES
-- Les tarifs de transport (donnée stratégique) ne doivent jamais être
-- lisibles publiquement. Les tables de référence internes deviennent
-- réservées aux comptes possédant réellement un rôle sur la plateforme.
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid) FROM anon;

-- Tarifs de transport : stratégiques, réservés à l'administration.
DROP POLICY IF EXISTS "Tarifs de transport lisibles par tous" ON public.transport_truck_rates;
CREATE POLICY "transport_truck_rates admin read"
  ON public.transport_truck_rates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE SELECT ON public.transport_truck_rates FROM anon;

-- Taux de taxes : plus de lecture anonyme.
DROP POLICY IF EXISTS "Taux de taxes lisibles par tous" ON public.transport_tax_rates;
CREATE POLICY "transport_tax_rates read members"
  ON public.transport_tax_rates FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
REVOKE SELECT ON public.transport_tax_rates FROM anon;

-- Granulométries : référence interne, plus de lecture anonyme.
DROP POLICY IF EXISTS "granulometries readable" ON public.material_granulometries;
CREATE POLICY "material_granulometries read members"
  ON public.material_granulometries FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
REVOKE SELECT ON public.material_granulometries FROM anon;

-- Tables de référence internes : réservées aux comptes ayant un rôle.
DROP POLICY IF EXISTS "capacites lisibles par les membres" ON public.transport_vehicle_capacities;
CREATE POLICY "transport_vehicle_capacities read members"
  ON public.transport_vehicle_capacities FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "configs lisibles par les membres" ON public.transport_vehicle_configs;
CREATE POLICY "transport_vehicle_configs read members"
  ON public.transport_vehicle_configs FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "dimensions readable by authenticated" ON public.transport_vehicle_dimensions;
CREATE POLICY "transport_vehicle_dimensions read members"
  ON public.transport_vehicle_dimensions FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "regles lisibles par les membres" ON public.transport_weight_rules;
CREATE POLICY "transport_weight_rules read members"
  ON public.transport_weight_rules FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "densites lisibles par les membres" ON public.transport_material_densities;
CREATE POLICY "transport_material_densities read members"
  ON public.transport_material_densities FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "margins readable by authenticated" ON public.transport_safety_margins;
CREATE POLICY "transport_safety_margins read members"
  ON public.transport_safety_margins FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "dimension rules readable by authenticated" ON public.transport_dimension_rules;
CREATE POLICY "transport_dimension_rules read members"
  ON public.transport_dimension_rules FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "typicals readable by authenticated" ON public.transport_dimension_typicals;
CREATE POLICY "transport_dimension_typicals read members"
  ON public.transport_dimension_typicals FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "access constraints readable by authenticated" ON public.submission_access_constraints;
CREATE POLICY "submission_access_constraints read members"
  ON public.submission_access_constraints FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "settings readable by authenticated" ON public.dompe_availability_settings;
CREATE POLICY "dompe_availability_settings read members"
  ON public.dompe_availability_settings FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "geo_services_read" ON public.geo_services;
CREATE POLICY "geo_services read members"
  ON public.geo_services FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read lead_statuses" ON public.lead_statuses;
CREATE POLICY "lead_statuses read members"
  ON public.lead_statuses FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "Auth reads waves" ON public.seo_waves;
CREATE POLICY "seo_waves admin read"
  ON public.seo_waves FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Vocabulaire matériaux : réservé aux comptes ayant un rôle.
DROP POLICY IF EXISTS "material_catalog_read" ON public.material_catalog;
CREATE POLICY "material_catalog read members"
  ON public.material_catalog FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "material_aliases_read" ON public.material_aliases;
CREATE POLICY "material_aliases read members"
  ON public.material_aliases FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "material_synonyms_read_authenticated" ON public.material_synonyms;
CREATE POLICY "material_synonyms read members"
  ON public.material_synonyms FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "material_review_terms_read" ON public.material_review_terms;
CREATE POLICY "material_review_terms admin read"
  ON public.material_review_terms FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
