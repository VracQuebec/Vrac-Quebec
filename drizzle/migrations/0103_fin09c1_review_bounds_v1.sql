CREATE OR REPLACE FUNCTION public.fin_rec_gen(_template uuid, _from date, _to date)
 RETURNS TABLE(version integer, occ_key text, scheduled_on date, planned_on date)
 LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
DECLARE v record; nxt date;
BEGIN
  FOR v IN SELECT * FROM fin_recurring_versions x WHERE x.template_id = _template ORDER BY x.version LOOP
    SELECT min(y.effective_from) INTO nxt FROM fin_recurring_versions y WHERE y.template_id = _template AND y.version > v.version;
    -- Version 1 : aucune borne basse (effective_from NULL); versions suivantes : effet inclus, effet suivant exclu.
    RETURN QUERY SELECT v.version, 'v' || v.version || ':' || g.occ_key, g.due, g.planned
      FROM public.fin_gen_dates(v.rule - 'rule_gen' || jsonb_strip_nulls(jsonb_build_object('rule_from', v.effective_from, 'valid_until', nxt)), _from, _to) g
      WHERE (v.effective_from IS NULL OR g.due >= v.effective_from) AND (nxt IS NULL OR g.due < nxt);
  END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.fin_rec_gen(uuid, date, date) FROM PUBLIC, anon, authenticated;