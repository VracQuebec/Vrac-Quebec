-- ============================================================
-- TRANSPORT JSC — FONDATION ADMINISTRATIVE (Module 1)
-- Source de vérité unique pour tous les paramètres métier.
-- Aucun calcul ici : uniquement la configuration.
-- ============================================================

-- ---------- ZONES DESSERVIES ----------
CREATE TABLE public.jsc_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  region text,
  center_address text,
  center_lat double precision,
  center_lng double precision,
  radius_km numeric,
  distance_surcharge numeric NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- FOURNISSEURS ----------
CREATE TABLE public.jsc_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  zone_id uuid REFERENCES public.jsc_zones(id) ON DELETE SET NULL,
  payment_terms text,
  internal_notes text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- LIEUX DE CHARGEMENT ----------
CREATE TABLE public.jsc_pickup_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.jsc_suppliers(id) ON DELETE SET NULL,
  zone_id uuid REFERENCES public.jsc_zones(id) ON DELETE SET NULL,
  name text NOT NULL,
  address text NOT NULL,
  city text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  opening_hours text,
  loading_time_minutes integer NOT NULL DEFAULT 0,
  access_notes text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- MATÉRIAUX ----------
CREATE TABLE public.jsc_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  category text,
  unit text NOT NULL DEFAULT 'tonne',
  density_kg_per_m3 numeric,
  purchase_price numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  is_taxable boolean NOT NULL DEFAULT true,
  public_description text,
  internal_notes text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- PRIX MATÉRIAU PAR FOURNISSEUR / LIEU ----------
CREATE TABLE public.jsc_material_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.jsc_materials(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.jsc_suppliers(id) ON DELETE CASCADE,
  pickup_location_id uuid REFERENCES public.jsc_pickup_locations(id) ON DELETE CASCADE,
  unit text NOT NULL DEFAULT 'tonne',
  purchase_price numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  minimum_quantity numeric,
  is_preferred boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- CAMIONS ----------
CREATE TABLE public.jsc_trucks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  truck_type text,
  capacity_tonnes numeric NOT NULL DEFAULT 0,
  capacity_m3 numeric,
  hourly_rate numeric NOT NULL DEFAULT 0,
  loading_time_minutes integer NOT NULL DEFAULT 0,
  unloading_time_minutes integer NOT NULL DEFAULT 0,
  fixed_time_minutes integer NOT NULL DEFAULT 0,
  is_subcontracted boolean NOT NULL DEFAULT false,
  internal_notes text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- TARIFS DE TRANSPORT ----------
CREATE TABLE public.jsc_transport_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rate_mode text NOT NULL DEFAULT 'hourly',
  truck_id uuid REFERENCES public.jsc_trucks(id) ON DELETE SET NULL,
  zone_id uuid REFERENCES public.jsc_zones(id) ON DELETE SET NULL,
  hourly_rate numeric NOT NULL DEFAULT 0,
  rate_per_km numeric NOT NULL DEFAULT 0,
  rate_per_trip numeric NOT NULL DEFAULT 0,
  flat_rate numeric NOT NULL DEFAULT 0,
  minimum_charge numeric NOT NULL DEFAULT 0,
  minimum_hours numeric NOT NULL DEFAULT 0,
  distance_from_km numeric,
  distance_to_km numeric,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- TAXES ----------
CREATE TABLE public.jsc_taxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  rate_percent numeric NOT NULL DEFAULT 0,
  registration_number text,
  apply_order integer NOT NULL DEFAULT 0,
  compound boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- PARAMÈTRES DU SYSTÈME ----------
CREATE TABLE public.jsc_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  value_type text NOT NULL DEFAULT 'number',
  value text,
  unit text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- GRANTS (obligatoires) — admin only, aucun accès anon
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_zones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_pickup_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_material_prices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_trucks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_transport_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_taxes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_settings TO authenticated;

GRANT ALL ON public.jsc_zones TO service_role;
GRANT ALL ON public.jsc_suppliers TO service_role;
GRANT ALL ON public.jsc_pickup_locations TO service_role;
GRANT ALL ON public.jsc_materials TO service_role;
GRANT ALL ON public.jsc_material_prices TO service_role;
GRANT ALL ON public.jsc_trucks TO service_role;
GRANT ALL ON public.jsc_transport_rates TO service_role;
GRANT ALL ON public.jsc_taxes TO service_role;
GRANT ALL ON public.jsc_settings TO service_role;

-- ============================================================
-- RLS — administrateurs uniquement
-- ============================================================
ALTER TABLE public.jsc_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jsc_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jsc_pickup_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jsc_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jsc_material_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jsc_trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jsc_transport_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jsc_taxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jsc_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage jsc_zones" ON public.jsc_zones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage jsc_suppliers" ON public.jsc_suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage jsc_pickup_locations" ON public.jsc_pickup_locations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage jsc_materials" ON public.jsc_materials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage jsc_material_prices" ON public.jsc_material_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage jsc_trucks" ON public.jsc_trucks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage jsc_transport_rates" ON public.jsc_transport_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage jsc_taxes" ON public.jsc_taxes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage jsc_settings" ON public.jsc_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
CREATE TRIGGER trg_jsc_zones_updated BEFORE UPDATE ON public.jsc_zones
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_jsc_suppliers_updated BEFORE UPDATE ON public.jsc_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_jsc_pickup_locations_updated BEFORE UPDATE ON public.jsc_pickup_locations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_jsc_materials_updated BEFORE UPDATE ON public.jsc_materials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_jsc_material_prices_updated BEFORE UPDATE ON public.jsc_material_prices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_jsc_trucks_updated BEFORE UPDATE ON public.jsc_trucks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_jsc_transport_rates_updated BEFORE UPDATE ON public.jsc_transport_rates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_jsc_taxes_updated BEFORE UPDATE ON public.jsc_taxes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_jsc_settings_updated BEFORE UPDATE ON public.jsc_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_jsc_pickup_supplier ON public.jsc_pickup_locations(supplier_id);
CREATE INDEX idx_jsc_material_prices_material ON public.jsc_material_prices(material_id);
CREATE INDEX idx_jsc_material_prices_supplier ON public.jsc_material_prices(supplier_id);
CREATE INDEX idx_jsc_rates_truck ON public.jsc_transport_rates(truck_id);
CREATE INDEX idx_jsc_rates_zone ON public.jsc_transport_rates(zone_id);
CREATE INDEX idx_jsc_settings_category ON public.jsc_settings(category);

-- ============================================================
-- PARAMÈTRES DE DÉPART (structure seulement, valeurs modifiables)
-- ============================================================
INSERT INTO public.jsc_settings (key, label, category, value_type, value, unit, description, sort_order) VALUES
  ('currency', 'Devise', 'general', 'text', 'CAD', NULL, 'Devise utilisée pour tous les montants', 1),
  ('default_margin_percent', 'Marge par défaut', 'tarification', 'number', '0', '%', 'Marge appliquée sur le coût interne', 2),
  ('rounding_increment', 'Arrondi des montants', 'tarification', 'number', '0.05', '$', 'Incrément d''arrondi des totaux', 3),
  ('buffer_time_minutes', 'Temps tampon par voyage', 'operations', 'number', '0', 'min', 'Temps fixe ajouté à chaque voyage', 4),
  ('workday_start', 'Début de journée', 'operations', 'text', '07:00', NULL, 'Heure de début des opérations', 5),
  ('workday_end', 'Fin de journée', 'operations', 'text', '17:00', NULL, 'Heure de fin des opérations', 6),
  ('quote_validity_days', 'Validité des soumissions', 'soumissions', 'number', '30', 'jours', 'Durée de validité d''une estimation', 7),
  ('min_order_amount', 'Montant minimum de commande', 'soumissions', 'number', '0', '$', 'Montant minimum facturable', 8),
  ('show_estimate_range', 'Afficher une fourchette au client', 'soumissions', 'boolean', 'true', NULL, 'Présente une estimation sous forme de fourchette', 9),
  ('estimate_range_percent', 'Amplitude de la fourchette', 'soumissions', 'number', '10', '%', 'Écart appliqué de part et d''autre de l''estimation', 10);