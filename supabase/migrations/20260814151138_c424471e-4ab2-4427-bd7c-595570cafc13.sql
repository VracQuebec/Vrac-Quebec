ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS landing_referrer text;

CREATE OR REPLACE FUNCTION public.enforce_submission_insert_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cat text;
  v_mat text;
  v_src text;
  v_med text;
  v_ref text;
BEGIN
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  NEW.status := 'nouveau';
  NEW.priority := 'normal';
  NEW.internal_notes := '';
  NEW.dompe_number := '';
  NEW.visible_to_entrepreneur := false;
  NEW.show_on_admin_map := true;
  NEW.assigned_entrepreneur := NULL;
  NEW.geocoding_status := 'pending';
  NEW.geocoding_provider := 'nominatim';
  NEW.formatted_address := NULL;
  NEW.place_id := NULL;
  NEW.location_type := NULL;
  NEW.latitude := NULL;
  NEW.longitude := NULL;
  NEW.postal_latitude := NULL;
  NEW.postal_longitude := NULL;
  NEW.latitude_old := NULL;
  NEW.longitude_old := NULL;
  NEW.postal_latitude_old := NULL;
  NEW.postal_longitude_old := NULL;
  NEW.creation_origin := 'public_form';
  NEW.created_by := NULL;

  -- Attribution marketing : valeurs brutes bornées, provenance calculée serveur
  NEW.utm_source := nullif(left(lower(trim(coalesce(NEW.utm_source, ''))), 80), '');
  NEW.utm_medium := nullif(left(lower(trim(coalesce(NEW.utm_medium, ''))), 80), '');
  NEW.utm_campaign := nullif(left(trim(coalesce(NEW.utm_campaign, '')), 120), '');
  NEW.landing_referrer := nullif(left(lower(trim(coalesce(NEW.landing_referrer, ''))), 300), '');

  v_src := coalesce(NEW.utm_source, '');
  v_med := coalesce(NEW.utm_medium, '');
  v_ref := coalesce(NEW.landing_referrer, '');

  IF v_src LIKE '%google%' OR v_ref LIKE '%google.%' THEN
    NEW.lead_source := CASE WHEN v_med IN ('organic', 'seo') OR v_src = '' THEN 'referencement_naturel' ELSE 'google' END;
  ELSIF v_src LIKE '%facebook%' OR v_src IN ('fb', 'meta') OR v_src LIKE '%instagram%'
        OR v_ref LIKE '%facebook.%' OR v_ref LIKE '%instagram.%' THEN
    NEW.lead_source := 'facebook';
  ELSIF v_med IN ('organic', 'seo') THEN
    NEW.lead_source := 'referencement_naturel';
  ELSIF v_src = 'page_locale' OR v_med = 'page_locale' THEN
    NEW.lead_source := 'pages_locales';
  ELSIF v_src <> '' OR NEW.utm_campaign IS NOT NULL THEN
    NEW.lead_source := 'campagne';
  ELSE
    NEW.lead_source := 'vracquebec.ca';
  END IF;

  v_mat := lower(coalesce(array_to_string(NEW.materials, ' '), '') || ' ' || coalesce(NEW.other_material, ''));

  IF NEW.service_type = 'remblai_disposition' OR NEW.deliver_or_remove ILIKE '%sortir%' THEN
    v_cat := 'excavation';
  ELSIF NEW.request_type = 'transport' THEN
    v_cat := 'transport';
  ELSIF v_mat LIKE '%terre%' THEN
    v_cat := 'terre';
  ELSIF v_mat LIKE '%sable%' THEN
    v_cat := 'sable';
  ELSIF v_mat LIKE '%gravier%' THEN
    v_cat := 'gravier';
  ELSIF v_mat LIKE '%pierre%' OR v_mat LIKE '%roche%' OR v_mat LIKE '%concass%' THEN
    v_cat := 'pierre';
  ELSIF v_mat LIKE '%remblai%' OR NEW.service_type = 'materiel_remplissage' OR NEW.request_type = 'remblai' THEN
    v_cat := 'remblai';
  ELSE
    v_cat := 'autre';
  END IF;

  NEW.lead_category := v_cat;

  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Anyone can submit a request" ON public.submissions;
CREATE POLICY "Anyone can submit a request" ON public.submissions
FOR INSERT TO anon, authenticated
WITH CHECK (
  ((auth.uid() IS NOT NULL) AND has_role(auth.uid(), 'admin'::app_role))
  OR (
    (creation_origin = 'public_form'::text)
    AND (status = 'nouveau'::text)
    AND (priority = 'normal'::text)
    AND (assigned_entrepreneur IS NULL)
    AND (created_by IS NULL)
    AND (lead_source IN ('vracquebec.ca','google','facebook','referencement_naturel','pages_locales','campagne'))
    AND (lead_category IS NOT NULL)
    AND (latitude IS NULL)
    AND (longitude IS NULL)
  )
);