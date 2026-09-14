CREATE TABLE public.material_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_type text NOT NULL DEFAULT 'admin_manual',
  source_id uuid NULL,
  owner_user_id uuid NULL,
  status text NOT NULL DEFAULT 'draft',
  qualification_status text NOT NULL DEFAULT 'unqualified',
  raw_description text NULL,
  quantity_value numeric NULL,
  quantity_unit text NULL,
  quantity_approximate boolean NOT NULL DEFAULT false,
  trip_count integer NULL,
  vehicle_type text NULL,
  principal_material text NULL,
  secondary_materials text[] NOT NULL DEFAULT '{}',
  trace_materials text[] NOT NULL DEFAULT '{}',
  granulometry_min_inches numeric NULL,
  granulometry_max_inches numeric NULL,
  granulometry_approximate boolean NOT NULL DEFAULT false,
  declared_clean boolean NULL,
  declared_contaminated boolean NULL,
  environmental_status text NOT NULL DEFAULT 'unknown',
  location_raw text NULL,
  address text NULL,
  sector text NULL,
  city text NULL,
  region text NULL,
  latitude double precision NULL,
  longitude double precision NULL,
  geocoding_source text NULL,
  availability_start date NULL,
  availability_end date NULL,
  max_radius_km numeric NULL,
  notes text NULL,
  parser_confidence numeric NULL,
  parser_version text NULL,
  CONSTRAINT material_offers_status_chk CHECK (status IN ('draft','parsed','needs_confirmation','ready_for_matching','archived','fulfilled','cancelled')),
  CONSTRAINT material_offers_source_chk CHECK (source_type IN ('admin_manual','free_text_parser','user_form','transport_request','chantier','quote_request','historical_import')),
  CONSTRAINT material_offers_env_chk CHECK (environmental_status IN ('unknown','stated_clean_by_user','stated_contaminated_by_user','characterized','not_characterized')),
  CONSTRAINT material_offers_qualif_chk CHECK (qualification_status IN ('unqualified','partially_qualified','qualified'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_offers TO authenticated;
GRANT ALL ON public.material_offers TO service_role;

ALTER TABLE public.material_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage material offers"
  ON public.material_offers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_material_offers_status ON public.material_offers (status);
CREATE INDEX idx_material_offers_principal ON public.material_offers (principal_material);
CREATE INDEX idx_material_offers_created_at ON public.material_offers (created_at DESC);
CREATE INDEX idx_material_offers_source ON public.material_offers (source_type, source_id);
CREATE INDEX idx_material_offers_geo ON public.material_offers (latitude, longitude);

CREATE OR REPLACE FUNCTION public.material_offers_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_material_offers_updated_at
BEFORE UPDATE ON public.material_offers
FOR EACH ROW EXECUTE FUNCTION public.material_offers_touch_updated_at();