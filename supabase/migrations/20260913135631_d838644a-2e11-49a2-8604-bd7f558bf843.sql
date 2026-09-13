
-- ============ PARTIE A — SÉCURITÉ PLACE DE MARCHÉ ============

CREATE OR REPLACE FUNCTION public.jsc_user_controls_company(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _company_id IS NULL
      OR public.jsc_can_manage(auth.uid())
      OR public.jsc_company_role(auth.uid(), _company_id) IS NOT NULL
      OR EXISTS (
           SELECT 1 FROM public.jsc_company_members m
           WHERE m.company_id = _company_id AND m.user_id = auth.uid()
         );
$$;

REVOKE EXECUTE ON FUNCTION public.jsc_user_controls_company(uuid) FROM anon;

-- Annonces : interdiction d'usurper une entreprise
DROP POLICY IF EXISTS "Users create own listings" ON public.jsc_listings;
CREATE POLICY "Users create own listings" ON public.jsc_listings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND public.jsc_user_controls_company(company_id));

DROP POLICY IF EXISTS "Users update own listings" ON public.jsc_listings;
CREATE POLICY "Users update own listings" ON public.jsc_listings
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by AND public.jsc_user_controls_company(company_id))
  WITH CHECK (auth.uid() = created_by AND public.jsc_user_controls_company(company_id));

-- Offres : interdiction d'usurper une entreprise
DROP POLICY IF EXISTS "Responder creates offer" ON public.jsc_public_offers;
CREATE POLICY "Responder creates offer" ON public.jsc_public_offers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = responder_user_id AND public.jsc_user_controls_company(company_id));

DROP POLICY IF EXISTS "Responder updates own offer" ON public.jsc_public_offers;
CREATE POLICY "Responder updates own offer" ON public.jsc_public_offers
  FOR UPDATE TO authenticated
  USING (auth.uid() = responder_user_id)
  WITH CHECK (auth.uid() = responder_user_id AND public.jsc_user_controls_company(company_id));

-- Demandes réseau : interdiction d'usurper une entreprise
DROP POLICY IF EXISTS "Users create own public request" ON public.jsc_public_requests;
CREATE POLICY "Users create own public request" ON public.jsc_public_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND public.jsc_user_controls_company(company_id));

DROP POLICY IF EXISTS "Users update own public request" ON public.jsc_public_requests;
CREATE POLICY "Users update own public request" ON public.jsc_public_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by AND public.jsc_user_controls_company(company_id));

-- Avis marketplace : l'auteur ne peut pas s'auto-publier
DROP POLICY IF EXISTS "Authors edit own reviews" ON public.mkt_reviews;
CREATE POLICY "Authors edit own reviews" ON public.mkt_reviews
  FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid())
  WITH CHECK (author_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.mkt_reviews_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.mkt_is_admin() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'en_attente';
    NEW.author_user_id := auth.uid();
  ELSE
    NEW.status := OLD.status;
    NEW.author_user_id := OLD.author_user_id;
    NEW.company_id := OLD.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mkt_reviews_guard_trg ON public.mkt_reviews;
CREATE TRIGGER mkt_reviews_guard_trg
  BEFORE INSERT OR UPDATE ON public.mkt_reviews
  FOR EACH ROW EXECUTE FUNCTION public.mkt_reviews_guard();

CREATE OR REPLACE FUNCTION public.jsc_marketplace_reviews_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.jsc_can_manage(auth.uid()) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_approved := false;
    NEW.author_user_id := auth.uid();
  ELSE
    NEW.is_approved := OLD.is_approved;
    NEW.author_user_id := OLD.author_user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jsc_marketplace_reviews_guard_trg ON public.jsc_marketplace_reviews;
CREATE TRIGGER jsc_marketplace_reviews_guard_trg
  BEFORE INSERT OR UPDATE ON public.jsc_marketplace_reviews
  FOR EACH ROW EXECUTE FUNCTION public.jsc_marketplace_reviews_guard();

-- ============ PARTIE B — MATCHING INTERNE V1 (INACTIF PUBLIQUEMENT) ============

CREATE TABLE IF NOT EXISTS public.matching_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.matching_settings TO authenticated;
GRANT ALL ON public.matching_settings TO service_role;
ALTER TABLE public.matching_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage matching settings" ON public.matching_settings;
CREATE POLICY "Admins manage matching settings" ON public.matching_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.matching_settings (key, value, description) VALUES
  ('matching_v2_enabled_public', '{"enabled": false}'::jsonb, 'Matching V2 public — désactivé (usage interne seulement)'),
  ('matching_v2_enabled_internal', '{"enabled": true}'::jsonb, 'Matching Lab interne (administration)'),
  ('matching_v2_weights', '{"material":40,"distance":25,"availability":15,"access":10,"capacity":5,"data_quality":5}'::jsonb, 'Pondérations du score explicable')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.matching_simulation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  algorithm_version text NOT NULL DEFAULT 'v1',
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  result_count integer,
  top_score numeric,
  run_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.matching_simulation_log TO authenticated;
GRANT ALL ON public.matching_simulation_log TO service_role;
ALTER TABLE public.matching_simulation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage matching simulations" ON public.matching_simulation_log;
CREATE POLICY "Admins manage matching simulations" ON public.matching_simulation_log
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Recherche interne LECTURE SEULE des demandes de remblai candidates
CREATE OR REPLACE FUNCTION public.matching_lab_candidates(
  _lat numeric DEFAULT NULL,
  _lng numeric DEFAULT NULL,
  _limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  dompe_number text,
  submission_number text,
  city text,
  address text,
  status text,
  availability_status text,
  availability_confirmed_at timestamptz,
  materials text,
  other_material text,
  remaining_capacity text,
  truck_types_allowed text[],
  latitude numeric,
  longitude numeric,
  distance_km numeric,
  distance_kind text,
  accepted_materials jsonb,
  access jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id,
         s.dompe_number::text,
         s.submission_number::text,
         s.city,
         s.address,
         s.status,
         s.availability_status,
         s.availability_updated_at,
         s.materials::text,
         s.other_material,
         s.remaining_capacity::text,
         s.truck_types_allowed,
         s.latitude,
         s.longitude,
         CASE WHEN _lat IS NOT NULL AND _lng IS NOT NULL AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
              THEN public._haversine_km(_lat::double precision, _lng::double precision, s.latitude::double precision, s.longitude::double precision)::numeric
              ELSE NULL END,
         CASE WHEN _lat IS NOT NULL AND _lng IS NOT NULL AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
              THEN 'GEODESIQUE' ELSE 'INCONNUE' END,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'material_id', sam.material_id,
                    'slug', mc.slug,
                    'name', mc.name_fr,
                    'family_id', mc.family_id,
                    'family', mc.family,
                    'subfamily', mc.subfamily,
                    'stance', sam.stance,
                    'source', sam.source,
                    'confidence', sam.confidence,
                    'confirmation_status', sam.confirmation_status,
                    'original_value', sam.original_value))
           FROM public.submission_accepted_materials sam
           LEFT JOIN public.material_catalog mc ON mc.id = sam.material_id
           WHERE sam.submission_id = s.id
         ), '[]'::jsonb),
         COALESCE((SELECT to_jsonb(ac) FROM public.submission_access_constraints ac WHERE ac.submission_id = s.id LIMIT 1), 'null'::jsonb)
  FROM public.submissions s
  WHERE has_role(auth.uid(), 'admin'::app_role)
    AND public.is_fill_request_type(s.request_type)
  ORDER BY CASE WHEN _lat IS NOT NULL AND _lng IS NOT NULL AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
                THEN public._haversine_km(_lat::double precision, _lng::double precision, s.latitude::double precision, s.longitude::double precision)
                ELSE 1e9 END
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 100), 500));
$$;

REVOKE EXECUTE ON FUNCTION public.matching_lab_candidates(numeric, numeric, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.matching_lab_candidates(numeric, numeric, integer) TO authenticated;
