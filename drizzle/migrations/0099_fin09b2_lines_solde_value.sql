CREATE OR REPLACE FUNCTION public.fin_progress_draft_save(_plan uuid, _draft_key text, _kind text, _mode text, _value text, _issue_date date, _due_date date, _base_rev integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p fin_progress_plans; s fin_progress_situations; ih text; comp jsonb; mid uuid;
BEGIN
  SELECT * INTO p FROM fin_progress_plans WHERE id = _plan FOR UPDATE;
  IF p.id IS NULL OR NOT public.fin_can_write(p.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_draft_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  IF p.track = 'global' AND _kind = 'solde' THEN _mode := 'pct'; _value := '100'; END IF;
  IF p.track = 'lines' THEN _mode := coalesce(_mode, 'lines'); IF _kind = 'solde' THEN _value := '{}'; ELSIF _value IS NOT NULL THEN _value := public.fin_progress_qty_canon(_value); END IF; END IF;
  IF p.track = 'milestones' AND _mode = 'jalon' AND coalesce(_value,'') ~ '^[0-9a-f-]{36}$' THEN mid := _value::uuid; END IF;
  ih := public.fin_progress_input_hash(_kind, _mode, _value, _issue_date, _due_date);
  SELECT * INTO s FROM fin_progress_situations WHERE company_id = p.company_id AND draft_key = _draft_key FOR UPDATE;
  IF s.id IS NOT NULL THEN
    IF s.plan_id <> _plan THEN RAISE EXCEPTION 'Clé déjà utilisée sur un autre dossier' USING ERRCODE = 'P0409'; END IF;
    IF s.input_hash = ih AND (_base_rev IS NOT DISTINCT FROM s.rev OR _base_rev IS NOT DISTINCT FROM s.rev - 1 OR (_base_rev IS NULL AND s.rev = 1)) THEN RETURN to_jsonb(s); END IF;
    IF s.status <> 'brouillon' THEN RAISE EXCEPTION 'Brouillon déjà émis ou abandonné : clé réutilisée avec un autre contenu' USING ERRCODE = 'P0409'; END IF;
    IF _base_rev IS DISTINCT FROM s.rev THEN RAISE EXCEPTION 'Brouillon modifié ailleurs : rechargez-le' USING ERRCODE = 'P0409'; END IF;
    PERFORM public.fin_progress_check_dates(_plan, _issue_date, _due_date);
    comp := public.fin_progress_compute_any(_plan, _kind, _mode, _value, _issue_date);
    UPDATE fin_progress_situations SET kind = _kind, mode = _mode, value = _value, issue_date = _issue_date, due_date = _due_date, milestone_id = mid,
      computed = comp, input_hash = ih, hash = md5(ih || comp::text), rev = rev + 1 WHERE id = s.id RETURNING * INTO s;
    RETURN to_jsonb(s);
  END IF;
  IF _base_rev IS NOT NULL THEN RAISE EXCEPTION 'Brouillon introuvable pour cette révision' USING ERRCODE = 'P0409'; END IF;
  IF EXISTS (SELECT 1 FROM fin_progress_situations WHERE plan_id = _plan AND status = 'brouillon') THEN
    RAISE EXCEPTION 'Un brouillon de situation existe déjà : reprenez-le ou abandonnez-le';
  END IF;
  PERFORM public.fin_progress_check_dates(_plan, _issue_date, _due_date);
  comp := public.fin_progress_compute_any(_plan, _kind, _mode, _value, _issue_date);
  INSERT INTO fin_progress_situations (plan_id, company_id, kind, mode, value, issue_date, due_date, computed, input_hash, hash, draft_key, milestone_id)
  VALUES (_plan, p.company_id, _kind, _mode, _value, _issue_date, _due_date, comp, ih, md5(ih || comp::text), _draft_key, mid) RETURNING * INTO s;
  RETURN to_jsonb(s);
END $function$;
REVOKE EXECUTE ON FUNCTION public.fin_progress_draft_save(uuid, text, text, text, text, date, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_progress_draft_save(uuid, text, text, text, text, date, date, integer) TO authenticated;