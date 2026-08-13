CREATE OR REPLACE FUNCTION public.get_submission_transport_request(p_submission_id uuid, p_stage text DEFAULT 'transport_request'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.transport_requests%ROWTYPE;
  v_sub public.submissions%ROWTYPE;
BEGIN
  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'submission_id_required';
  END IF;
  IF auth.uid() IS NULL
     OR NOT (public.has_role(auth.uid(), 'admin'::app_role)
             OR public.has_role(auth.uid(), 'entrepreneur'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_sub FROM public.submissions WHERE id = p_submission_id;

  SELECT * INTO v_row
  FROM public.transport_requests
  WHERE origin_submission_id = p_submission_id
    AND origin_stage = COALESCE(p_stage, 'transport_request')
  ORDER BY created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'request_number', v_row.request_number,
    'status', v_row.status,
    'created_at', v_row.created_at,
    'desired_date', v_row.desired_date,
    'origin_submission_id', v_row.origin_submission_id,
    'origin_stage', v_row.origin_stage,
    'dump_name', COALESCE(v_row.dump_name, v_sub.selected_site_label),
    'site_address', v_row.site_address,
    'selected_site_address', v_sub.selected_site_address
  );
END;
$function$;