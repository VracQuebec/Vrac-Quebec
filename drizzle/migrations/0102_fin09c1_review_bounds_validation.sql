CREATE OR REPLACE FUNCTION public.fin_rec_rule(_r jsonb)
 RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE o jsonb := '{}'::jsonb; k text; s jsonb; sc jsonb := '[]'::jsonb; i int := 0; f text; w jsonb;
BEGIN
  IF jsonb_typeof(_r) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Calendrier illisible' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(_r->'frequency') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Fréquence requise' USING ERRCODE = '22023'; END IF;
  f := _r->>'frequency';
  IF f NOT IN ('once','monthly','daily','weekly','weekdays','twice_monthly','yearly','schedule') THEN RAISE EXCEPTION 'Fréquence non prise en charge : %', f USING ERRCODE = '22023'; END IF;
  IF _r ? 'interval_n' AND _r->'interval_n' <> 'null'::jsonb AND (coalesce(_r->>'interval_n','') !~ '^\d{1,3}$' OR (_r->>'interval_n')::int < 1) THEN RAISE EXCEPTION 'Intervalle : nombre entier positif requis' USING ERRCODE = '22023'; END IF;
  IF _r ? 'max_count' AND _r->'max_count' <> 'null'::jsonb AND (coalesce(_r->>'max_count','') !~ '^\d{1,3}$' OR (_r->>'max_count')::int NOT BETWEEN 1 AND 600) THEN RAISE EXCEPTION 'Nombre maximal : entier de 1 à 600' USING ERRCODE = '22023'; END IF;
  FOREACH k IN ARRAY ARRAY['month_day','month_day2'] LOOP
    IF _r ? k AND _r->k <> 'null'::jsonb AND coalesce(_r->>k,'') <> '' AND ((_r->>k) !~ '^\d{1,2}$' OR (_r->>k)::int NOT BETWEEN 1 AND 31) THEN RAISE EXCEPTION 'Jour du mois : entier de 1 à 31' USING ERRCODE = '22023'; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['anchor_date','end_date'] LOOP
    IF _r ? k AND _r->k <> 'null'::jsonb AND coalesce(_r->>k,'') <> '' AND (_r->>k) !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Date invalide' USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF _r ? 'weekdays' AND _r->'weekdays' <> 'null'::jsonb THEN
    IF jsonb_typeof(_r->'weekdays') <> 'array' THEN RAISE EXCEPTION 'Jours de semaine : liste requise' USING ERRCODE = '22023'; END IF;
    FOR w IN SELECT * FROM jsonb_array_elements(_r->'weekdays') LOOP
      IF jsonb_typeof(w) <> 'number' OR w::text !~ '^[1-7]$' THEN RAISE EXCEPTION 'Jours de semaine : entiers de 1 (lundi) à 7 (dimanche)' USING ERRCODE = '22023'; END IF;
    END LOOP;
    IF (SELECT count(DISTINCT x) FROM jsonb_array_elements(_r->'weekdays') x) <> jsonb_array_length(_r->'weekdays') THEN RAISE EXCEPTION 'Jours de semaine en double' USING ERRCODE = '22023'; END IF;
  END IF;
  IF _r ? 'short_month_policy' AND _r->'short_month_policy' <> 'null'::jsonb THEN
    IF f <> 'monthly' THEN RAISE EXCEPTION 'Politique « mois courts » sans effet pour cette fréquence' USING ERRCODE = '22023'; END IF;
    IF coalesce(_r->>'short_month_policy','') NOT IN ('last_day','skip') THEN RAISE EXCEPTION 'Politique « mois courts » inconnue' USING ERRCODE = '22023'; END IF;
  END IF;
  IF _r ? 'feb29_policy' AND _r->'feb29_policy' <> 'null'::jsonb AND coalesce(_r->>'feb29_policy','') NOT IN ('feb28','mar1','skip') THEN RAISE EXCEPTION 'Politique du 29 février inconnue' USING ERRCODE = '22023'; END IF;
  IF _r ? 'collision_policy' AND _r->'collision_policy' <> 'null'::jsonb AND coalesce(_r->>'collision_policy','') NOT IN ('keep_both','skip_second') THEN RAISE EXCEPTION 'Politique de collision inconnue' USING ERRCODE = '22023'; END IF;
  IF _r ? 'seasons' AND _r->'seasons' <> 'null'::jsonb THEN
    IF jsonb_typeof(_r->'seasons') <> 'array' THEN RAISE EXCEPTION 'Saisons : liste requise' USING ERRCODE = '22023'; END IF;
    FOR s IN SELECT * FROM jsonb_array_elements(_r->'seasons') LOOP
      IF jsonb_typeof(s) <> 'object' THEN RAISE EXCEPTION 'Saison invalide (format MM-JJ)' USING ERRCODE = '22023'; END IF;
    END LOOP;
  END IF;
  FOREACH k IN ARRAY ARRAY['frequency','interval_n','weekdays','month_day','month_day2','collision_policy','feb29_policy','short_month_policy','seasons','planned_shift','anchor_date','end_date','max_count'] LOOP
    IF _r ? k AND _r->k <> 'null'::jsonb AND coalesce(_r->>k,'x') <> '' THEN o := o || jsonb_build_object(k, _r->k); END IF;
  END LOOP;
  IF coalesce(o->>'planned_shift','none') NOT IN ('none','prev_weekday','next_weekday') THEN RAISE EXCEPTION 'Décalage de date non pris en charge' USING ERRCODE = '22023'; END IF;
  IF f = 'schedule' THEN
    IF jsonb_typeof(_r->'schedule') IS DISTINCT FROM 'array' OR jsonb_array_length(_r->'schedule') = 0 OR jsonb_array_length(_r->'schedule') > 120 THEN RAISE EXCEPTION 'Dates personnalisées : entre 1 et 120 dates' USING ERRCODE = '22023'; END IF;
    FOR s IN SELECT * FROM jsonb_array_elements(_r->'schedule') LOOP
      i := i + 1;
      IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR coalesce(s->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Date personnalisée % invalide', i USING ERRCODE = '22023'; END IF;
      IF (s ? 'amount' AND s->'amount' <> 'null'::jsonb AND coalesce(s->>'amount','') <> '') THEN
        RAISE EXCEPTION 'Dates personnalisées : un montant par date n''est pas repris. Le calendrier reprend les lignes du modèle; ajustez les lignes dans le brouillon de l''occurrence' USING ERRCODE = '22023'; END IF;
      sc := sc || jsonb_build_object('id', 'd' || i, 'date', s->>'date', 'quality', 'unknown');
    END LOOP;
    IF (SELECT count(DISTINCT x->>'date') FROM jsonb_array_elements(sc) x) <> jsonb_array_length(sc) THEN RAISE EXCEPTION 'Dates personnalisées en double' USING ERRCODE = '22023'; END IF;
    o := o || jsonb_build_object('schedule', sc);
  END IF;
  PERFORM public.fin_validate_rule(o);
  RETURN o;
END $function$;

-- Bornes de version imposées autour du moteur commun (toutes fréquences, y compris « once »).
CREATE OR REPLACE FUNCTION public.fin_rec_gen(_template uuid, _from date, _to date)
 RETURNS TABLE(version integer, occ_key text, scheduled_on date, planned_on date)
 LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
DECLARE v record; nxt date;
BEGIN
  FOR v IN SELECT * FROM fin_recurring_versions x WHERE x.template_id = _template ORDER BY x.version LOOP
    SELECT min(y.effective_from) INTO nxt FROM fin_recurring_versions y WHERE y.template_id = _template AND y.version > v.version;
    RETURN QUERY SELECT v.version, 'v' || v.version || ':' || g.occ_key, g.due, g.planned
      FROM public.fin_gen_dates(v.rule - 'rule_gen' || jsonb_strip_nulls(jsonb_build_object('rule_from', v.effective_from, 'valid_until', nxt)), _from, _to) g
      WHERE g.due >= v.effective_from AND (nxt IS NULL OR g.due < nxt);
  END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.fin_rec_gen(uuid, date, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_rec_rule_preview(_company uuid, _rule jsonb, _from date, _to date, _effective date DEFAULT NULL::date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r jsonb; tot int;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from OR _to - _from > 1100 THEN RAISE EXCEPTION 'Fenêtre d''aperçu : 3 ans au plus' USING ERRCODE = '22023'; END IF;
  r := public.fin_rec_rule(_rule);
  IF _effective IS NOT NULL THEN r := r || jsonb_build_object('rule_from', _effective); END IF;
  SELECT count(*) INTO tot FROM public.fin_gen_dates(r, _from, _to) g WHERE _effective IS NULL OR g.due >= _effective;
  RETURN (SELECT jsonb_build_object('rule', r, 'effective', _effective, 'from', _from, 'to', _to, 'total', tot, 'truncated', tot > 300,
      'dates', coalesce(jsonb_agg(jsonb_build_object('key', g.occ_key, 'scheduled', g.due, 'planned', g.planned) ORDER BY g.due, g.slot), '[]'::jsonb))
    FROM (SELECT * FROM public.fin_gen_dates(r, _from, _to) x WHERE _effective IS NULL OR x.due >= _effective ORDER BY x.due, x.slot LIMIT 300) g);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_rec_summary(_template uuid, _from date, _to date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t fin_recurring_templates; tot int;
BEGIN
  SELECT * INTO t FROM fin_recurring_templates WHERE id = _template;
  IF t.id IS NULL OR NOT public.fin_can_read(t.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from OR _to - _from > 1100 THEN RAISE EXCEPTION 'Fenêtre d''aperçu : 3 ans au plus' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO tot FROM public.fin_rec_gen(t.id, _from, _to);
  RETURN to_jsonb(t) - 'create_hash' - 'create_key' || jsonb_build_object(
    'client_name', (SELECT name FROM ent_crm_clients WHERE id = t.client_id),
    'project_name', (SELECT name FROM ent_crm_projects WHERE id = t.project_id),
    'versions', (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.version), '[]'::jsonb) FROM fin_recurring_versions v WHERE v.template_id = t.id),
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('action', e.action, 'reason', e.reason, 'detail', e.detail, 'at', e.created_at, 'actor', (SELECT email FROM auth.users u WHERE u.id = e.actor)) ORDER BY e.created_at DESC), '[]'::jsonb) FROM fin_recurring_events e WHERE e.template_id = t.id),
    'occurrences', (SELECT coalesce(jsonb_agg(to_jsonb(o) - 'batch_key' || jsonb_build_object('invoice_number', i.number) ORDER BY o.scheduled_on, o.occ_key), '[]'::jsonb)
      FROM fin_recurring_occurrences o LEFT JOIN fin_invoices i ON i.id = o.invoice_id WHERE o.template_id = t.id),
    'window', jsonb_build_object('from', _from, 'to', _to, 'total', tot, 'shown', least(tot, 300), 'truncated', tot > 300),
    'calendar', (SELECT coalesce(jsonb_agg(jsonb_build_object('key', g.occ_key, 'version', g.version, 'scheduled', g.scheduled_on, 'planned', g.planned_on,
        'status', (SELECT o.status FROM fin_recurring_occurrences o WHERE o.template_id = t.id AND o.occ_key = g.occ_key)) ORDER BY g.scheduled_on, g.occ_key), '[]'::jsonb)
      FROM (SELECT * FROM public.fin_rec_gen(t.id, _from, _to) x ORDER BY x.scheduled_on, x.occ_key LIMIT 300) g));
END $function$;