-- ============ Écosystème Vrac Québec — Sprint 5 ============

-- 1. Fiches marketplace
CREATE TABLE public.jsc_marketplace_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id),
  supplier_id uuid REFERENCES public.jsc_suppliers(id),
  carrier_company_id uuid REFERENCES public.jsc_companies(id),
  partner_type text NOT NULL DEFAULT 'supplier',
  name text NOT NULL,
  slug text UNIQUE,
  tagline text,
  description text,
  logo_url text,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  address text,
  city text,
  postal_code text,
  region text,
  latitude numeric,
  longitude numeric,
  service_radius_km numeric,
  phone text,
  email text,
  website text,
  rating_average numeric NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.jsc_marketplace_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_marketplace_profiles TO authenticated;
GRANT ALL ON public.jsc_marketplace_profiles TO service_role;
ALTER TABLE public.jsc_marketplace_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads published profiles" ON public.jsc_marketplace_profiles
  FOR SELECT USING (is_published AND is_active AND archived_at IS NULL);
CREATE POLICY "Admins manage marketplace profiles" ON public.jsc_marketplace_profiles
  FOR ALL TO authenticated USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 2. Évaluations
CREATE TABLE public.jsc_marketplace_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.jsc_marketplace_profiles(id) ON DELETE CASCADE,
  author_user_id uuid,
  author_name text,
  rating integer NOT NULL,
  comment text,
  is_approved boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.jsc_marketplace_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_marketplace_reviews TO authenticated;
GRANT ALL ON public.jsc_marketplace_reviews TO service_role;
ALTER TABLE public.jsc_marketplace_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads approved reviews" ON public.jsc_marketplace_reviews
  FOR SELECT USING (is_approved AND archived_at IS NULL);
CREATE POLICY "Users write own review" ON public.jsc_marketplace_reviews
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_user_id AND is_approved = false);
CREATE POLICY "Admins manage reviews" ON public.jsc_marketplace_reviews
  FOR ALL TO authenticated USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));

CREATE OR REPLACE FUNCTION public.jsc_refresh_profile_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  pid := COALESCE(NEW.profile_id, OLD.profile_id);
  UPDATE public.jsc_marketplace_profiles p
     SET rating_average = COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 2) FROM public.jsc_marketplace_reviews r
            WHERE r.profile_id = pid AND r.is_approved AND r.archived_at IS NULL), 0),
         rating_count = COALESCE((SELECT COUNT(*) FROM public.jsc_marketplace_reviews r
            WHERE r.profile_id = pid AND r.is_approved AND r.archived_at IS NULL), 0),
         updated_at = now()
   WHERE p.id = pid;
  RETURN NULL;
END; $$;
CREATE TRIGGER jsc_reviews_rating AFTER INSERT OR UPDATE OR DELETE ON public.jsc_marketplace_reviews
  FOR EACH ROW EXECUTE FUNCTION public.jsc_refresh_profile_rating();

-- 3. Disponibilités temps réel
CREATE TABLE public.jsc_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id),
  profile_id uuid REFERENCES public.jsc_marketplace_profiles(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.jsc_suppliers(id),
  pickup_location_id uuid REFERENCES public.jsc_pickup_locations(id),
  material_id uuid REFERENCES public.jsc_materials(id),
  status text NOT NULL DEFAULT 'available',
  available_quantity numeric,
  unit text,
  lead_time_days numeric,
  wait_time_minutes numeric,
  daily_capacity_tonnes numeric,
  price_indication numeric,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.jsc_availability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_availability TO authenticated;
GRANT ALL ON public.jsc_availability TO service_role;
ALTER TABLE public.jsc_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads availability of published profiles" ON public.jsc_availability
  FOR SELECT USING (
    is_active AND archived_at IS NULL AND EXISTS (
      SELECT 1 FROM public.jsc_marketplace_profiles p
       WHERE p.id = jsc_availability.profile_id AND p.is_published AND p.is_active AND p.archived_at IS NULL));
CREATE POLICY "Admins manage availability" ON public.jsc_availability
  FOR ALL TO authenticated USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 4. Demandes publiques
CREATE TABLE public.jsc_public_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id),
  request_id uuid REFERENCES public.jsc_requests(id),
  client_id uuid REFERENCES public.jsc_clients(id),
  created_by uuid,
  title text NOT NULL,
  material_id uuid REFERENCES public.jsc_materials(id),
  material_label text,
  quantity numeric,
  quantity_unit text DEFAULT 'tonne',
  delivery_address text,
  delivery_city text,
  latitude numeric,
  longitude numeric,
  desired_date date,
  deadline_at timestamptz,
  budget_max numeric,
  details text,
  status text NOT NULL DEFAULT 'open',
  visibility text NOT NULL DEFAULT 'network',
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_public_requests TO authenticated;
GRANT ALL ON public.jsc_public_requests TO service_role;
ALTER TABLE public.jsc_public_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated reads open network requests" ON public.jsc_public_requests
  FOR SELECT TO authenticated USING (is_active AND archived_at IS NULL);
CREATE POLICY "Users create own public request" ON public.jsc_public_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users update own public request" ON public.jsc_public_requests
  FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins manage public requests" ON public.jsc_public_requests
  FOR ALL TO authenticated USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 5. Offres
CREATE TABLE public.jsc_public_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_request_id uuid NOT NULL REFERENCES public.jsc_public_requests(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.jsc_marketplace_profiles(id),
  company_id uuid REFERENCES public.jsc_companies(id),
  supplier_id uuid REFERENCES public.jsc_suppliers(id),
  responder_user_id uuid,
  material_price numeric,
  transport_price numeric,
  total_price numeric,
  lead_time_days numeric,
  available_date date,
  message text,
  status text NOT NULL DEFAULT 'invited',
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_public_offers TO authenticated;
GRANT ALL ON public.jsc_public_offers TO service_role;
ALTER TABLE public.jsc_public_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Request owner reads offers" ON public.jsc_public_offers
  FOR SELECT TO authenticated USING (
    responder_user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.jsc_public_requests r
       WHERE r.id = jsc_public_offers.public_request_id AND r.created_by = auth.uid()));
CREATE POLICY "Responder creates offer" ON public.jsc_public_offers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = responder_user_id);
CREATE POLICY "Responder updates own offer" ON public.jsc_public_offers
  FOR UPDATE TO authenticated USING (auth.uid() = responder_user_id) WITH CHECK (auth.uid() = responder_user_id);
CREATE POLICY "Admins manage offers" ON public.jsc_public_offers
  FOR ALL TO authenticated USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 6. Contrats
CREATE TABLE public.jsc_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id),
  client_id uuid REFERENCES public.jsc_clients(id),
  supplier_id uuid REFERENCES public.jsc_suppliers(id),
  contract_number text,
  name text NOT NULL,
  contract_type text NOT NULL DEFAULT 'annual',
  status text NOT NULL DEFAULT 'draft',
  starts_on date,
  ends_on date,
  discount_percent numeric,
  negotiated_prices jsonb NOT NULL DEFAULT '[]'::jsonb,
  transport_terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  credit_limit numeric,
  payment_terms_days integer,
  delivery_conditions text,
  minimum_volume numeric,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_contracts TO authenticated;
GRANT ALL ON public.jsc_contracts TO service_role;
ALTER TABLE public.jsc_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage contracts" ON public.jsc_contracts
  FOR ALL TO authenticated USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));

-- 7. Annonces place de marché
CREATE TABLE public.jsc_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id),
  profile_id uuid REFERENCES public.jsc_marketplace_profiles(id) ON DELETE CASCADE,
  created_by uuid,
  listing_type text NOT NULL DEFAULT 'sell',
  title text NOT NULL,
  material_id uuid REFERENCES public.jsc_materials(id),
  material_label text,
  quantity numeric,
  quantity_unit text DEFAULT 'tonne',
  price numeric,
  price_unit text,
  city text,
  region text,
  latitude numeric,
  longitude numeric,
  available_from date,
  available_until date,
  description text,
  contact_phone text,
  contact_email text,
  status text NOT NULL DEFAULT 'active',
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.jsc_listings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jsc_listings TO authenticated;
GRANT ALL ON public.jsc_listings TO service_role;
ALTER TABLE public.jsc_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads active listings" ON public.jsc_listings
  FOR SELECT USING (is_active AND status = 'active' AND archived_at IS NULL);
CREATE POLICY "Users manage own listings" ON public.jsc_listings
  FOR ALL TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins manage listings" ON public.jsc_listings
  FOR ALL TO authenticated USING (public.jsc_can_manage(auth.uid())) WITH CHECK (public.jsc_can_manage(auth.uid()));

-- Horodatage
CREATE TRIGGER t_mp_profiles_updated BEFORE UPDATE ON public.jsc_marketplace_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_mp_reviews_updated BEFORE UPDATE ON public.jsc_marketplace_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_availability_updated BEFORE UPDATE ON public.jsc_availability
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_public_requests_updated BEFORE UPDATE ON public.jsc_public_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_public_offers_updated BEFORE UPDATE ON public.jsc_public_offers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_contracts_updated BEFORE UPDATE ON public.jsc_contracts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_listings_updated BEFORE UPDATE ON public.jsc_listings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Index
CREATE INDEX idx_mp_profiles_type ON public.jsc_marketplace_profiles(partner_type, is_published);
CREATE INDEX idx_availability_material ON public.jsc_availability(material_id, status);
CREATE INDEX idx_public_requests_status ON public.jsc_public_requests(status, created_at DESC);
CREATE INDEX idx_offers_request ON public.jsc_public_offers(public_request_id);
CREATE INDEX idx_listings_type ON public.jsc_listings(listing_type, status);
CREATE INDEX idx_contracts_client ON public.jsc_contracts(client_id, status);