ALTER TABLE public.fin_transfers ADD COLUMN IF NOT EXISTS done_on date, ADD COLUMN IF NOT EXISTS gl_entry_id uuid REFERENCES public.fin_gl_entries(id), ADD COLUMN IF NOT EXISTS done_by uuid, ADD COLUMN IF NOT EXISTS done_ref text;

CREATE OR REPLACE FUNCTION public.fin_transfer_execute(_transfer uuid, _date date, _ref text, _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t fin_transfers; gf uuid; gt uuid; nid uuid; nf text; nt text; n int;
BEGIN
  SELECT * INTO t FROM fin_transfers WHERE id = _transfer;
  IF NOT FOUND OR NOT public.fin_can_write(t.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  PERFORM public.fin_gl_lock(t.company_id);
  SELECT * INTO t FROM fin_transfers WHERE id = _transfer FOR UPDATE;
  IF t.gl_entry_id IS NOT NULL THEN
    SELECT entry_no INTO n FROM fin_gl_entries WHERE id = t.gl_entry_id;
    RETURN jsonb_build_object('entry_no', n, 'replay', true); END IF;
  IF t.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Virement retiré' USING ERRCODE = 'P0001'; END IF;
  IF _date IS NULL OR _date > current_date THEN RAISE EXCEPTION 'Date réelle requise (pas dans le futur)' USING ERRCODE = '22023'; END IF;
  IF _key IS NULL OR length(_key) < 8 THEN RAISE EXCEPTION 'Clé de demande requise' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(DISTINCT currency) FROM fin_accounts WHERE id IN (t.from_account, t.to_account)) > 1 THEN RAISE EXCEPTION 'Comptes de devises différentes : non pris en charge' USING ERRCODE = 'P0410'; END IF;
  SELECT gl_account_id INTO gf FROM fin_gl_account_links WHERE fin_account_id = t.from_account;
  SELECT gl_account_id INTO gt FROM fin_gl_account_links WHERE fin_account_id = t.to_account;
  IF gf IS NULL OR gt IS NULL THEN RAISE EXCEPTION 'À compléter : associez les deux comptes financiers à un compte comptable' USING ERRCODE = 'P0410'; END IF;
  SELECT name INTO nf FROM fin_accounts WHERE id = t.from_account; SELECT name INTO nt FROM fin_accounts WHERE id = t.to_account;
  INSERT INTO fin_gl_entries(company_id, entry_no, entry_date, reference, description, origin, source_kind, source_id, source_purpose, source_label)
  VALUES (t.company_id, public.fin_gl_next_no(t.company_id), _date, nullif(btrim(coalesce(_ref,'')),''), 'Virement ' || nf || ' → ' || nt, 'auto', 'transfer', t.id, 'post', 'Virement entre comptes')
  RETURNING id INTO nid;
  INSERT INTO fin_gl_lines(entry_id, company_id, line_no, gl_account_id, debit, credit) VALUES (nid, t.company_id, 1, gt, t.amount, 0), (nid, t.company_id, 2, gf, 0, t.amount);
  UPDATE fin_gl_entries SET status = 'validated', validated_at = now(), validated_by = auth.uid() WHERE id = nid;
  UPDATE fin_transfers SET done_on = _date, gl_entry_id = nid, done_by = auth.uid(), done_ref = nullif(btrim(coalesce(_ref,'')),'') WHERE id = t.id;
  INSERT INTO fin_gl_events(company_id, entry_id, action, data) VALUES (t.company_id, nid, 'transfer_post', jsonb_build_object('transfer', t.id, 'key', _key));
  SELECT entry_no INTO n FROM fin_gl_entries WHERE id = nid;
  RETURN jsonb_build_object('entry_no', n);
END $$;
REVOKE ALL ON FUNCTION public.fin_transfer_execute(uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_transfer_execute(uuid, date, text, text) TO authenticated;