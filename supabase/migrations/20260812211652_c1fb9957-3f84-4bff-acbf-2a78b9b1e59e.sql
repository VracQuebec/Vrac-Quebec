ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS selected_site_id uuid REFERENCES public.submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_site_label text,
  ADD COLUMN IF NOT EXISTS selected_site_address text,
  ADD COLUMN IF NOT EXISTS selected_site_latitude double precision,
  ADD COLUMN IF NOT EXISTS selected_site_longitude double precision,
  ADD COLUMN IF NOT EXISTS selection_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_submissions_selected_site_id ON public.submissions(selected_site_id);

CREATE OR REPLACE FUNCTION public.save_comparateur_selection(
  p_submission_id uuid,
  p_site_id uuid,
  p_site_label text DEFAULT NULL,
  p_material text DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
  p_unit text DEFAULT NULL,
  p_tonnage numeric DEFAULT NULL,
  p_trips integer DEFAULT NULL,
  p_truck text DEFAULT NULL,
  p_distance_km numeric DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL,
  p_desired_date date DEFAULT NULL,
  p_timeframe text DEFAULT NULL,
  p_access_details jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site public.submissions%ROWTYPE;
  v_row public.submissions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.has_role(auth.uid(), 'admin'::app_role)
             OR public.has_role(auth.uid(), 'entrepreneur'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'submission_id_required';
  END IF;
  IF p_site_id IS NULL THEN
    RAISE EXCEPTION 'site_id_required';
  END IF;

  SELECT * INTO v_site FROM public.submissions WHERE id = p_site_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site_not_found';
  END IF;

  UPDATE public.submissions SET
    selected_site_id = v_site.id,
    selected_site_label = COALESCE(NULLIF(btrim(p_site_label), ''), v_site.dompe_number, 'Dompe #' || v_site.submission_number),
    selected_site_address = COALESCE(v_site.formatted_address, v_site.address),
    selected_site_latitude = v_site.latitude,
    selected_site_longitude = v_site.longitude,
    quote_material = COALESCE(NULLIF(btrim(p_material), ''), quote_material),
    quote_quantity = COALESCE(p_quantity, quote_quantity),
    quote_unit = COALESCE(NULLIF(btrim(p_unit), ''), quote_unit),
    quote_tonnage = COALESCE(p_tonnage, quote_tonnage),
    quote_trips = COALESCE(p_trips, quote_trips),
    quote_truck = COALESCE(NULLIF(btrim(p_truck), ''), quote_truck),
    quote_distance_km = p_distance_km,
    quote_duration_minutes = p_duration_minutes,
    desired_date = COALESCE(p_desired_date, desired_date),
    delivery_timeframe = COALESCE(NULLIF(btrim(p_timeframe), ''), delivery_timeframe),
    access_details = COALESCE(p_access_details, access_details),
    selection_updated_at = now()
  WHERE id = p_submission_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'submission_not_found';
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
    'selection_updated_at', v_row.selection_updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_comparateur_selection(uuid,uuid,text,text,numeric,text,numeric,integer,text,numeric,integer,date,text,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_comparateur_selection(uuid,uuid,text,text,numeric,text,numeric,integer,text,numeric,integer,date,text,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_comparateur_selection(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    'selection_updated_at', v_row.selection_updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_comparateur_selection(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_comparateur_selection(uuid) TO authenticated, service_role;