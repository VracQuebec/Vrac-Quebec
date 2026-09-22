-- Divulgation progressive de l'adresse réelle d'une dompe :
-- avant approbation (site_validated_at NULL) l'entrepreneur ne reçoit
-- jamais l'adresse réelle ni les coordonnées réelles du site choisi.

CREATE OR REPLACE FUNCTION public.get_my_submissions()
 RETURNS TABLE(id uuid, submission_number integer, created_at timestamp with time zone, status text, request_type text, materials text[], other_material text, quantity text, tonnage text, city text, formatted_address text, address text, desired_date date, selected_site_id uuid, selected_site_label text, selected_site_address text, site_validated_at timestamp with time zone, place_id text, latitude double precision, longitude double precision, quote_material text, quote_distance_km numeric, quote_duration_minutes integer, selection_updated_at timestamp with time zone, site_availability_status text, site_availability_updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id, s.submission_number, s.created_at, s.status, s.request_type,
    s.materials, s.other_material, s.quantity, s.tonnage,
    s.city, s.formatted_address, s.address, s.desired_date,
    s.selected_site_id, s.selected_site_label,
    CASE WHEN s.site_validated_at IS NOT NULL THEN s.selected_site_address END,
    s.site_validated_at,
    s.place_id, s.latitude, s.longitude,
    s.quote_material, s.quote_distance_km, s.quote_duration_minutes,
    s.selection_updated_at,
    site.availability_status, site.availability_updated_at
  FROM public.submissions s
  LEFT JOIN public.submissions site ON site.id = s.selected_site_id
  WHERE auth.uid() IS NOT NULL
    AND (
      s.created_by = auth.uid()
      OR (
        s.email IS NOT NULL
        AND lower(trim(s.email)) = lower(trim(coalesce(public.current_user_email(), '')))
      )
    )
  ORDER BY s.created_at DESC
$function$;

CREATE OR REPLACE FUNCTION public.get_comparateur_selection(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.submissions%ROWTYPE;
  v_admin boolean;
  v_approved boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_submission_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row FROM public.submissions WHERE id = p_submission_id;
  IF NOT FOUND OR v_row.selected_site_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_admin := public.has_role(auth.uid(), 'admin'::app_role);

  -- Seuls l'administration et le propriétaire réel de la demande y ont accès.
  IF NOT v_admin
     AND v_row.created_by IS DISTINCT FROM auth.uid()
     AND lower(trim(coalesce(v_row.email,''))) IS DISTINCT FROM lower(trim(coalesce(public.current_user_email(),''))) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Divulgation progressive : l'adresse réelle du site n'est retournée
  -- qu'après l'approbation de CETTE demande (ou à l'administration).
  v_approved := v_row.site_validated_at IS NOT NULL;

  RETURN jsonb_build_object(
    'submission_id', v_row.id,
    'submission_number', v_row.submission_number,
    'selected_site_id', v_row.selected_site_id,
    'selected_site_label', v_row.selected_site_label,
    'selected_site_address', CASE WHEN v_admin OR v_approved THEN v_row.selected_site_address END,
    'selected_site_latitude', CASE WHEN v_admin OR v_approved THEN v_row.selected_site_latitude END,
    'selected_site_longitude', CASE WHEN v_admin OR v_approved THEN v_row.selected_site_longitude END,
    'site_approved', v_approved,
    'material', v_row.quote_material,
    'quantity', v_row.quote_quantity,
    'unit', v_row.quote_unit,
    'tonnage', v_row.quote_tonnage,
    'trips', v_row.quote_trips,
    'truck', v_row.quote_truck,
    'distance_km', v_row.quote_distance_km,
    'duration_minutes', v_row.quote_duration_minutes,
    'desired_date', v_row.desired_date,
    'timeframe', v_row.delivery_timeframe,
    'access_details', v_row.access_details,
    'address', COALESCE(v_row.formatted_address, v_row.address),
    'latitude', v_row.latitude,
    'longitude', v_row.longitude,
    'site_validated_at', v_row.site_validated_at,
    'selection_updated_at', v_row.selection_updated_at
  );
END;
$function$;

-- Approbation admin : idempotente + avis immédiat à l'entrepreneur.
CREATE OR REPLACE FUNCTION public.validate_selected_site(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.submissions%ROWTYPE;
  v_new boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'submission_id_required';
  END IF;

  SELECT * INTO v_row FROM public.submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'submission_not_found';
  END IF;
  IF v_row.selected_site_id IS NULL THEN
    RAISE EXCEPTION 'no_site_selected';
  END IF;

  IF v_row.site_validated_at IS NULL THEN
    UPDATE public.submissions
       SET site_validated_at = now(),
           site_validated_by = auth.uid()
     WHERE id = p_submission_id
    RETURNING * INTO v_row;
    v_new := true;
  END IF;

  IF v_new AND v_row.created_by IS NOT NULL THEN
    PERFORM public.mkt_notify(
      'client', 'dompe_approuvee',
      'Dompe approuvée : adresse disponible',
      concat_ws(' · ',
        nullif(v_row.selected_site_label, ''),
        'L''adresse exacte du site est maintenant visible dans le détail de votre demande.'),
      v_row.created_by, NULL, NULL,
      '/entrepreneur/demandes?demande=' || v_row.id::text,
      'succes',
      'entr:sub:site-approuve:' || v_row.id::text,
      jsonb_build_object('source','submission','request_id',v_row.id,'site_id',v_row.selected_site_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'submission_id', v_row.id,
    'submission_number', v_row.submission_number,
    'selected_site_id', v_row.selected_site_id,
    'selected_site_label', v_row.selected_site_label,
    'selected_site_address', v_row.selected_site_address,
    'selected_site_latitude', v_row.selected_site_latitude,
    'selected_site_longitude', v_row.selected_site_longitude,
    'site_validated_at', v_row.site_validated_at,
    'site_validated_by', v_row.site_validated_by
  );
END;
$function$;

-- Retrait explicite de l'approbation : l'accès à l'adresse réelle est perdu.
CREATE OR REPLACE FUNCTION public.revoke_selected_site_validation(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.submissions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'submission_id_required';
  END IF;

  UPDATE public.submissions
     SET site_validated_at = NULL,
         site_validated_by = NULL
   WHERE id = p_submission_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'submission_not_found';
  END IF;

  RETURN jsonb_build_object(
    'submission_id', v_row.id,
    'site_validated_at', NULL::timestamptz
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.revoke_selected_site_validation(uuid) TO authenticated;

-- Si le site choisi change, l'approbation précédente ne vaut plus :
-- l'adresse réelle redevient masquée tant qu'un admin n'approuve pas à nouveau.
CREATE OR REPLACE FUNCTION public.submissions_reset_site_validation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.selected_site_id IS DISTINCT FROM OLD.selected_site_id
     AND NEW.site_validated_at IS NOT DISTINCT FROM OLD.site_validated_at THEN
    NEW.site_validated_at := NULL;
    NEW.site_validated_by := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_submissions_reset_site_validation ON public.submissions;
CREATE TRIGGER trg_submissions_reset_site_validation
BEFORE UPDATE ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.submissions_reset_site_validation();