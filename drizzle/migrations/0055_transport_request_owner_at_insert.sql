CREATE OR REPLACE FUNCTION public.enforce_transport_request_insert_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_digits text;
  v_identity text;
  v_recent integer;
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  NEW.status := 'nouvelle';
  NEW.assigned_dispatcher := NULL;
  NEW.driver_id := NULL;
  NEW.truck_id := NULL;
  NEW.internal_notes := NULL;
  NEW.request_number := NULL;
  NEW.source := left(COALESCE(NULLIF(trim(NEW.source), ''), 'wizard_public'), 60);

  IF auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid();
  ELSIF COALESCE(auth.role(), '') = 'service_role' THEN
    -- Fonction serveur de confiance : le propriétaire a été vérifié côté serveur
    -- (jeton de session), jamais fourni par le formulaire.
    NEW.user_id := NEW.user_id;
  ELSE
    NEW.user_id := NULL;
  END IF;

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

  v_digits := regexp_replace(COALESCE(NEW.client_phone, ''), '[^0-9]', '', 'g');
  IF length(v_digits) < 10 OR length(v_digits) > 15 THEN
    RAISE EXCEPTION 'invalid_phone' USING HINT = 'Numéro de téléphone invalide.';
  END IF;

  IF NEW.client_email IS NOT NULL
     AND NEW.client_email !~* '^[a-z0-9._%%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'invalid_email' USING HINT = 'Adresse courriel invalide.';
  END IF;

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
$function$;