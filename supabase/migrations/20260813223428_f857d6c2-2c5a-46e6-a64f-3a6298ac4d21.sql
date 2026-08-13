CREATE OR REPLACE FUNCTION public.enforce_submission_insert_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cat text;
  v_mat text;
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
  -- Manual-creation fields: never trust public input
  NEW.creation_origin := 'public_form';
  NEW.created_by := NULL;

  -- Provenance et catégorie déterminées côté serveur (jamais depuis le navigateur)
  NEW.lead_source := 'vracquebec.ca';

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