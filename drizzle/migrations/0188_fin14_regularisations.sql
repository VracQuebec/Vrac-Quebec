CREATE OR REPLACE FUNCTION public.fin_gl_accrual_validate(_id uuid, _rev int, _reverse_on date, _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e fin_gl_entries; v jsonb; r jsonb;
BEGIN
  SELECT * INTO e FROM fin_gl_entries WHERE id = _id;
  IF NOT FOUND OR NOT public.fin_can_write(e.company_id) OR NOT public.fin_can_correct(e.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF _reverse_on IS NULL OR _reverse_on <= e.entry_date THEN RAISE EXCEPTION 'La date de contrepassation doit suivre la date comptable' USING ERRCODE = '22023'; END IF;
  IF e.origin <> 'manual' THEN RAISE EXCEPTION 'Seule une écriture manuelle peut être une régularisation' USING ERRCODE = 'P0001'; END IF;
  v := public.fin_gl_entry_validate(_id, _rev);
  r := public.fin_gl_entry_reverse(_id, 'Régularisation — contrepassation prévue au ' || to_char(_reverse_on, 'YYYY-MM-DD'), _reverse_on, _key);
  INSERT INTO fin_gl_events(company_id, entry_id, action, data) VALUES (e.company_id, _id, 'accrual', jsonb_build_object('reverse_on', _reverse_on, 'reversal_id', r->>'id'));
  RETURN jsonb_build_object('entry_no', v->'entry_no', 'reversal_no', r->'entry_no', 'reversal_id', r->>'id');
END $$;
REVOKE ALL ON FUNCTION public.fin_gl_accrual_validate(uuid, int, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_gl_accrual_validate(uuid, int, date, text) TO authenticated;