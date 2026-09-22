-- La fiche transport liée ne révèle l'adresse réelle du site qu'à
-- l'administration ou au propriétaire de la demande APPROUVÉE.
CREATE OR REPLACE FUNCTION public.get_submission_transport_request(p_submission_id uuid, p_stage text DEFAULT 'transport_request'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.transport_requests%ROWTYPE;
  v_sub public.submissions%ROWTYPE;
  v_admin boolean;
  v_owner boolean;
  v_approved boolean;
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

  v_admin := public.has_role(auth.uid(), 'admin'::app_role);
  v_owner := v_sub.id IS NOT NULL
             AND (v_sub.created_by = auth.uid()
                  OR (v_sub.email IS NOT NULL
                      AND lower(trim(v_sub.email)) = lower(trim(coalesce(public.current_user_email(), '')))));

  IF NOT v_admin AND NOT v_owner THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_approved := v_sub.site_validated_at IS NOT NULL;

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
    'site_address', CASE WHEN v_admin OR v_approved THEN v_row.site_address END,
    'selected_site_address', CASE WHEN v_admin OR v_approved THEN v_sub.selected_site_address END,
    'site_approved', v_approved
  );
END;
$function$;