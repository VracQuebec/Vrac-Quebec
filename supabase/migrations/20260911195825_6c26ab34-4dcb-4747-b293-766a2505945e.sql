-- ============================================================
-- 1) TABLES DE SAUVEGARDE SEO : RLS + accès administrateur seul
-- ============================================================
ALTER TABLE public.seo_test_before_20260908 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_wave1_before_20260909 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.seo_test_before_20260908 FROM anon, authenticated;
REVOKE ALL ON public.seo_wave1_before_20260909 FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_test_before_20260908 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_wave1_before_20260909 TO authenticated;
GRANT ALL ON public.seo_test_before_20260908 TO service_role;
GRANT ALL ON public.seo_wave1_before_20260909 TO service_role;

DROP POLICY IF EXISTS "Admins manage seo_test_before_20260908" ON public.seo_test_before_20260908;
CREATE POLICY "Admins manage seo_test_before_20260908"
  ON public.seo_test_before_20260908 FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage seo_wave1_before_20260909" ON public.seo_wave1_before_20260909;
CREATE POLICY "Admins manage seo_wave1_before_20260909"
  ON public.seo_wave1_before_20260909 FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 2) ANNONCES PUBLIQUES : lecture publique sans coordonnées directes
--    (les colonnes contact_phone / contact_email restent hors de portée
--     des visiteurs non connectés grâce aux privilèges par colonne)
-- ============================================================
REVOKE ALL ON public.jsc_listings FROM anon;

GRANT SELECT (
  id, title, listing_type, material_label, quantity, quantity_unit,
  price, price_unit, city, description, available_from, status,
  is_active, created_at, updated_at, archived_at
) ON public.jsc_listings TO anon;

-- ============================================================
-- 3) PHOTOS D'ENTREPRISE : appartenance réellement vérifiée
-- ============================================================
CREATE OR REPLACE FUNCTION public.mkt_can_manage_photo_object(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_parts text[] := storage.foldername(_name);
  v_company uuid;
  v_owner uuid;
BEGIN
  IF public.mkt_is_admin() THEN
    RETURN true;
  END IF;

  -- Chemin attendu : <company_id>/<fichier image>
  IF v_parts IS NULL OR array_length(v_parts, 1) <> 1 THEN
    RETURN false;
  END IF;
  IF v_parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  IF storage.filename(_name) !~* '^[a-z0-9._-]{1,120}\.(jpg|jpeg|png|webp|heic|heif|avif)$' THEN
    RETURN false;
  END IF;

  v_company := v_parts[1]::uuid;

  IF NOT public.mkt_is_member(v_company) THEN
    RETURN false;
  END IF;

  -- Si le fichier est déjà rattaché à une photo enregistrée, l'entreprise
  -- du dossier doit correspondre à celle de la fiche (jointure réelle).
  SELECT p.company_id INTO v_owner
  FROM public.mkt_partner_photos p
  WHERE p.storage_path = _name
  LIMIT 1;

  RETURN v_owner IS NULL OR v_owner = v_company;
END;
$$;

REVOKE ALL ON FUNCTION public.mkt_can_manage_photo_object(text) FROM public;
GRANT EXECUTE ON FUNCTION public.mkt_can_manage_photo_object(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members upload partner photos" ON storage.objects;
CREATE POLICY "Members upload partner photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'partner-photos'
    AND public.mkt_can_manage_photo_object(name)
  );

DROP POLICY IF EXISTS "Members update partner photos" ON storage.objects;
CREATE POLICY "Members update partner photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'partner-photos'
    AND public.mkt_can_manage_photo_object(name)
  )
  WITH CHECK (
    bucket_id = 'partner-photos'
    AND public.mkt_can_manage_photo_object(name)
  );

DROP POLICY IF EXISTS "Members delete partner photos" ON storage.objects;
CREATE POLICY "Members delete partner photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'partner-photos'
    AND public.mkt_can_manage_photo_object(name)
  );

-- ============================================================
-- 4) DEMANDES DE TRANSPORT PUBLIQUES : validation + limitation
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_transport_request_insert_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_digits text;
  v_identity text;
  v_recent integer;
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Champs internes / répartition : jamais fournis par le public
  NEW.status := 'nouvelle';
  NEW.assigned_dispatcher := NULL;
  NEW.driver_id := NULL;
  NEW.truck_id := NULL;
  NEW.internal_notes := NULL;
  NEW.request_number := NULL;
  NEW.source := left(COALESCE(NULLIF(trim(NEW.source), ''), 'wizard_public'), 60);

  IF auth.uid() IS NULL THEN
    NEW.user_id := NULL;
  ELSE
    NEW.user_id := auth.uid();
  END IF;

  -- Bornage des champs libres (anti-abus / anti-injection de contenu)
  NEW.client_name     := nullif(left(trim(COALESCE(NEW.client_name, '')), 120), '');
  NEW.client_company  := nullif(left(trim(COALESCE(NEW.client_company, '')), 150), '');
  NEW.client_phone    := nullif(left(trim(COALESCE(NEW.client_phone, '')), 30), '');
  NEW.client_email    := nullif(lower(left(trim(COALESCE(NEW.client_email, '')), 160)), '');
  NEW.site_address    := nullif(left(trim(COALESCE(NEW.site_address, '')), 300), '');
  NEW.site_city       := nullif(left(trim(COALESCE(NEW.site_city, '')), 120), '');
  NEW.material_type   := nullif(left(trim(COALESCE(NEW.material_type, '')), 80), '');
  NEW.material_other  := nullif(left(trim(COALESCE(NEW.material_other, '')), 150), '');
  NEW.quantity_unit   := nullif(left(trim(COALESCE(NEW.quantity_unit, '')), 20), '');
  NEW.dump_name       := nullif(left(trim(COALESCE(NEW.dump_name, '')), 200), '');
  NEW.truck_type      := nullif(left(trim(COALESCE(NEW.truck_type, '')), 40), '');
  NEW.client_notes    := nullif(left(trim(COALESCE(NEW.client_notes, '')), 2000), '');
  NEW.origin_stage    := nullif(left(trim(COALESCE(NEW.origin_stage, '')), 60), '');
  NEW.idempotency_key := nullif(left(trim(COALESCE(NEW.idempotency_key, '')), 120), '');

  -- Un moyen de rappel valide est obligatoire
  v_digits := regexp_replace(COALESCE(NEW.client_phone, ''), '[^0-9]', '', 'g');
  IF length(v_digits) < 10 OR length(v_digits) > 15 THEN
    RAISE EXCEPTION 'invalid_phone' USING HINT = 'Numéro de téléphone invalide.';
  END IF;

  IF NEW.client_email IS NOT NULL
     AND NEW.client_email !~* '^[a-z0-9._%%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'invalid_email' USING HINT = 'Adresse courriel invalide.';
  END IF;

  -- Bornes numériques et géographiques
  IF NEW.quantity IS NOT NULL AND (NEW.quantity < 0 OR NEW.quantity > 1000000) THEN
    RAISE EXCEPTION 'invalid_quantity' USING HINT = 'Quantité hors limites.';
  END IF;
  IF NEW.site_latitude IS NOT NULL AND (NEW.site_latitude < -90 OR NEW.site_latitude > 90) THEN
    NEW.site_latitude := NULL;
  END IF;
  IF NEW.site_longitude IS NOT NULL AND (NEW.site_longitude < -180 OR NEW.site_longitude > 180) THEN
    NEW.site_longitude := NULL;
  END IF;
  IF NEW.distance_km IS NOT NULL AND (NEW.distance_km < 0 OR NEW.distance_km > 5000) THEN
    NEW.distance_km := NULL;
  END IF;
  IF NEW.travel_time_minutes IS NOT NULL AND (NEW.travel_time_minutes < 0 OR NEW.travel_time_minutes > 10080) THEN
    NEW.travel_time_minutes := NULL;
  END IF;
  IF NEW.estimated_trips IS NOT NULL AND (NEW.estimated_trips < 0 OR NEW.estimated_trips > 10000) THEN
    NEW.estimated_trips := NULL;
  END IF;

  -- Limitation de cadence : 5 demandes / heure par identité publique
  v_identity := COALESCE(NEW.client_email, v_digits);
  SELECT count(*) INTO v_recent
  FROM public.public_request_guard g
  WHERE g.scope = 'transport_request'
    AND g.identity = v_identity
    AND g.created_at > now() - interval '1 hour';

  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING HINT = 'Trop de demandes envoyées. Réessayez plus tard.';
  END IF;

  INSERT INTO public.public_request_guard (scope, identity, fingerprint, payload)
  VALUES (
    'transport_request',
    v_identity,
    left(md5(COALESCE(NEW.site_address, '') || '|' || COALESCE(NEW.material_type, '')), 32),
    jsonb_build_object('city', NEW.site_city)
  );

  RETURN NEW;
END;
$$;