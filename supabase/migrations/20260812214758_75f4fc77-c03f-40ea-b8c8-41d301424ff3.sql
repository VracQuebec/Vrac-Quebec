ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS site_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS site_validated_by uuid;

CREATE OR REPLACE FUNCTION public.validate_selected_site(p_submission_id uuid)
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

  SELECT * INTO v_row FROM public.submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'submission_not_found';
  END IF;
  IF v_row.selected_site_id IS NULL THEN
    RAISE EXCEPTION 'no_site_selected';
  END IF;

  -- Idempotent : la première validation fait foi, aucune ligne créée.
  IF v_row.site_validated_at IS NULL THEN
    UPDATE public.submissions
       SET site_validated_at = now(),
           site_validated_by = auth.uid()
     WHERE id = p_submission_id
    RETURNING * INTO v_row;
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

CREATE OR REPLACE FUNCTION public.get_comparateur_selection(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.submissions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.has_role(auth.uid(), 'admin'::app_role)
             OR public.has_role(auth.uid(), 'entrepreneur'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_submission_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row FROM public.submissions WHERE id = p_submission_id;
  IF NOT FOUND OR v_row.selected_site_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'submission_id', v_row.id,
    'submission_number', v_row.submission_number,
    'selected_site_id', v_row.selected_site_id,
    'selected_site_label', v_row.selected_site_label,
    'selected_site_address', v_row.selected_site_address,
    'selected_site_latitude', v_row.selected_site_latitude,
    'selected_site_longitude', v_row.selected_site_longitude,
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

REVOKE ALL ON FUNCTION public.validate_selected_site(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.validate_selected_site(uuid) TO authenticated;