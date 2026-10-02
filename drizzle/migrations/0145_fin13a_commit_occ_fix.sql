CREATE OR REPLACE FUNCTION public.fin_bank_commit(_company uuid, _account uuid, _rows jsonb, _settings jsonb, _file_name text, _file_sha text, _file_id uuid, _request_key text, _decisions jsonb, _opening numeric, _closing numeric, _complete boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE prev public.fin_bank_imports; ev jsonb; e jsonb; imp uuid; dec text; n_add int := 0; n_dup int := 0; n_rev int := 0; n_ref int := 0; n_skip int := 0;
  rows_out jsonb := '[]'::jsonb; v_occ int; lid uuid; tot numeric := 0; tin numeric := 0; tout numeric := 0; pf date; pt date; bal jsonb := NULL; summ jsonb;
BEGIN
  PERFORM public.fin_bank_guard(_company, true); PERFORM public.fin_bank_account_ok(_company, _account);
  IF coalesce(length(_request_key),0) < 8 THEN RAISE EXCEPTION 'Clé de demande manquante' USING ERRCODE = '22023'; END IF;
  IF _file_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ent_crm_files f WHERE f.id = _file_id AND f.company_id = _company) THEN
    RAISE EXCEPTION 'Fichier privé introuvable dans cette entreprise' USING ERRCODE = '42501'; END IF;
  IF (_opening IS NULL) <> (_closing IS NULL) THEN RAISE EXCEPTION 'Saisissez à la fois le solde d''ouverture et le solde de clôture, ou aucun des deux' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fin_bank:' || _account::text));
  SELECT * INTO prev FROM public.fin_bank_imports WHERE company_id = _company AND request_key = _request_key;
  IF FOUND THEN
    IF prev.file_sha256 <> _file_sha OR prev.account_id <> _account THEN RAISE EXCEPTION 'Cette demande a déjà été utilisée pour un autre fichier' USING ERRCODE = 'P0409'; END IF;
    RETURN prev.summary || jsonb_build_object('replay', true);
  END IF;
  ev := public.fin_bank_eval(_account, _rows, _settings);
  INSERT INTO public.fin_bank_imports(company_id, account_id, file_id, file_name, file_sha256, request_key, settings, opening_balance, closing_balance, complete)
    VALUES (_company, _account, _file_id, left(coalesce(_file_name,'releve.csv'), 200), _file_sha, _request_key, _settings, _opening, _closing, coalesce(_complete,false) AND _opening IS NOT NULL)
    RETURNING id INTO imp;
  FOR e IN SELECT * FROM jsonb_array_elements(ev) LOOP
    lid := NULL;
    IF e->>'outcome' <> 'refuse' THEN
      tot := tot + (e->>'amount')::numeric;
      IF (e->>'amount')::numeric > 0 THEN tin := tin + (e->>'amount')::numeric; ELSE tout := tout - (e->>'amount')::numeric; END IF;
      pf := least(coalesce(pf, (e->>'date')::date), (e->>'date')::date); pt := greatest(coalesce(pt, (e->>'date')::date), (e->>'date')::date);
    END IF;
    dec := _decisions->>(e->>'row_no');
    IF e->>'outcome' = 'nouveau' OR (e->>'outcome' = 'a_examiner' AND dec = 'add') THEN
      v_occ := (e->>'occ')::int;
      IF e->>'bank_id' IS NULL THEN
        SELECT greatest(v_occ, coalesce(max(l.occ),0) + 1) INTO v_occ FROM public.fin_bank_lines l WHERE l.account_id = _account AND l.fp = e->>'fp' AND l.bank_txn_id IS NULL;
      END IF;
      INSERT INTO public.fin_bank_lines(company_id, account_id, import_id, row_no, raw, src, txn_date, amount, description, reference, bank_txn_id, fp, occ, added_as_distinct)
        SELECT _company, _account, imp, (e->>'row_no')::int, coalesce(x.value->'raw','{}'::jsonb), x.value - 'raw', (e->>'date')::date, (e->>'amount')::numeric,
               e->>'description', e->>'reference', e->>'bank_id', e->>'fp', coalesce(v_occ, 1), e->>'outcome' = 'a_examiner'
          FROM jsonb_array_elements(_rows) x WHERE (x.value->>'row_no')::int = (e->>'row_no')::int LIMIT 1
        RETURNING id INTO lid;
      n_add := n_add + 1;
      rows_out := rows_out || (e || jsonb_build_object('result', CASE WHEN e->>'outcome' = 'a_examiner' THEN 'ajoutee_distincte' ELSE 'ajoutee' END, 'line_id', lid));
    ELSIF e->>'outcome' = 'a_examiner' AND dec = 'skip' THEN n_skip := n_skip + 1; rows_out := rows_out || (e || jsonb_build_object('result', 'doublon_confirme'));
    ELSIF e->>'outcome' = 'a_examiner' THEN n_rev := n_rev + 1; rows_out := rows_out || (e || jsonb_build_object('result', 'a_examiner'));
    ELSIF e->>'outcome' = 'deja_present' THEN n_dup := n_dup + 1; rows_out := rows_out || (e || jsonb_build_object('result', 'deja_presente'));
    ELSE n_ref := n_ref + 1; rows_out := rows_out || (e || jsonb_build_object('result', 'refusee')); END IF;
  END LOOP;
  IF _opening IS NOT NULL THEN
    bal := jsonb_build_object('opening', _opening, 'closing', _closing, 'in', tin, 'out', tout, 'expected', _opening + tot, 'diff', _closing - (_opening + tot),
      'ok', n_ref = 0 AND _closing = _opening + tot, 'complete', coalesce(_complete,false));
  END IF;
  summ := jsonb_build_object('import_id', imp, 'ajoutees', n_add, 'deja_presentes', n_dup + n_skip, 'doublons_confirmes', n_skip, 'a_examiner', n_rev, 'refusees', n_ref,
    'total_in', tin, 'total_out', tout, 'period_from', pf, 'period_to', pt, 'balance', bal, 'rows', rows_out);
  UPDATE public.fin_bank_imports SET summary = summ, period_from = pf, period_to = pt WHERE id = imp;
  INSERT INTO public.fin_bank_events(company_id, import_id, kind, detail) VALUES (_company, imp, 'import', summ - 'rows');
  RETURN summ;
END $function$;