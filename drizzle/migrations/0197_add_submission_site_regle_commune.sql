CREATE OR REPLACE FUNCTION public.add_submission_site(p_submission_id uuid, p_site_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_site public.submissions%ROWTYPE;
  v_row public.submission_site_decisions%ROWTYPE;
  v_is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_submission_id IS NULL OR p_site_id IS NULL THEN
    RAISE EXCEPTION 'ids_required';
  END IF;
  v_is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  IF NOT (v_is_admin OR public.submission_belongs_to_current_user(p_submission_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_site FROM public.submissions WHERE id = p_site_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'site_not_found';
  END IF;
  -- Entrepreneur : même règle commune que la recherche, la carte et le comparateur.
  -- Super admin : comportement antérieur inchangé.
  IF v_is_admin THEN
    IF lower(trim(coalesce(v_site.status,''))) IS DISTINCT FROM 'en attente de livraison' THEN
      RAISE EXCEPTION 'site_not_eligible';
    END IF;
  ELSIF NOT public.is_entrepreneur_visible_dompe(v_site) THEN
    RAISE EXCEPTION 'site_not_eligible';
  END IF;

  INSERT INTO public.submission_site_decisions (submission_id, site_id, site_label, source)
  VALUES (
    p_submission_id, p_site_id,
    COALESCE(v_site.dompe_number, 'Dompe #' || v_site.submission_number),
    'manuelle'
  )
  ON CONFLICT (submission_id, site_id) DO UPDATE
    SET site_label = COALESCE(EXCLUDED.site_label, public.submission_site_decisions.site_label),
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'submission_id', v_row.submission_id,
    'site_id', v_row.site_id,
    'site_label', v_row.site_label,
    'status', v_row.status
  );
END;
$function$;