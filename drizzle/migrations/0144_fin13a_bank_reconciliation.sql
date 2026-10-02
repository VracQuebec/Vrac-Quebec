-- FIN-13A : relevés bancaires CSV (observations) et rapprochement confirmé. Aucune écriture sur les mouvements financiers.
CREATE TABLE public.fin_bank_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  account_id uuid NOT NULL REFERENCES public.fin_accounts(id),
  file_id uuid REFERENCES public.ent_crm_files(id),
  file_name text NOT NULL,
  file_sha256 text NOT NULL CHECK (length(file_sha256) = 64),
  request_key text NOT NULL,
  settings jsonb NOT NULL,
  opening_balance numeric(14,2),
  closing_balance numeric(14,2),
  complete boolean NOT NULL DEFAULT false,
  period_from date,
  period_to date,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, request_key)
);
CREATE TABLE public.fin_bank_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  account_id uuid NOT NULL REFERENCES public.fin_accounts(id),
  import_id uuid NOT NULL REFERENCES public.fin_bank_imports(id),
  row_no integer NOT NULL,
  raw jsonb NOT NULL,
  src jsonb NOT NULL,
  txn_date date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount <> 0),
  description text,
  reference text,
  bank_txn_id text,
  fp text NOT NULL,
  occ integer NOT NULL,
  status text NOT NULL DEFAULT 'a_rapprocher' CHECK (status IN ('a_rapprocher','a_examiner','rapproche','exclu')),
  status_reason text,
  added_as_distinct boolean NOT NULL DEFAULT false,
  rev integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fin_bank_lines_bankid_uq ON public.fin_bank_lines(account_id, bank_txn_id) WHERE bank_txn_id IS NOT NULL;
CREATE UNIQUE INDEX fin_bank_lines_fp_uq ON public.fin_bank_lines(account_id, fp, occ) WHERE bank_txn_id IS NULL;
CREATE INDEX fin_bank_lines_acc_idx ON public.fin_bank_lines(account_id, txn_date);
CREATE TABLE public.fin_bank_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  line_id uuid NOT NULL REFERENCES public.fin_bank_lines(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  idem_key text NOT NULL,
  total numeric(14,2) NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz, cancelled_by uuid, cancel_reason text,
  UNIQUE (company_id, idem_key)
);
CREATE UNIQUE INDEX fin_bank_matches_line_active ON public.fin_bank_matches(line_id) WHERE status = 'active';
CREATE TABLE public.fin_bank_match_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  match_id uuid NOT NULL REFERENCES public.fin_bank_matches(id),
  line_id uuid NOT NULL REFERENCES public.fin_bank_lines(id),
  source_kind text NOT NULL CHECK (source_kind IN ('payment','receipt','refund','credit_refund','restitution')),
  source_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX fin_bank_items_src_active ON public.fin_bank_match_items(source_kind, source_id) WHERE active;
CREATE TABLE public.fin_bank_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  import_id uuid, line_id uuid, match_id uuid,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid DEFAULT auth.uid(),
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fin_bank_imports, public.fin_bank_lines, public.fin_bank_matches, public.fin_bank_match_items, public.fin_bank_events TO authenticated;
GRANT ALL ON public.fin_bank_imports, public.fin_bank_lines, public.fin_bank_matches, public.fin_bank_match_items, public.fin_bank_events TO service_role;
ALTER TABLE public.fin_bank_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_bank_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_bank_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_bank_match_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_bank_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_bank_imports_read ON public.fin_bank_imports FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY fin_bank_lines_read ON public.fin_bank_lines FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY fin_bank_matches_read ON public.fin_bank_matches FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY fin_bank_items_read ON public.fin_bank_match_items FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY fin_bank_events_read ON public.fin_bank_events FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE OR REPLACE FUNCTION public.fin_bank_guard(_company uuid, _write boolean)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (_write AND NOT public.fin_can_write(_company)) OR (NOT _write AND NOT public.fin_can_read(_company)) THEN
    RAISE EXCEPTION 'Accès refusé : droits financiers insuffisants pour cette entreprise' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_psp_sim_companies s WHERE s.company_id = _company) THEN
    RAISE EXCEPTION 'Rapprochement bancaire réservé aux entreprises TEST dans ce lot' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fin_bank_num(_s text, _fmt text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE t text; neg boolean := false;
BEGIN
  t := regexp_replace(coalesce(_s,''), '[\s\u00a0\u202f$]', '', 'g');
  t := regexp_replace(t, 'CAD$', '', 'i');
  IF t = '' THEN RETURN NULL; END IF;
  IF t ~ '^\(.*\)$' THEN neg := true; t := substr(t, 2, length(t) - 2); END IF;
  IF _fmt = 'fr' THEN t := replace(replace(t, '.', ''), ',', '.');
  ELSIF _fmt = 'en' THEN t := replace(t, ',', '');
  ELSE RETURN 'NaN'::numeric; END IF;
  IF t !~ '^[-+]?\d+(\.\d{1,2})?$' THEN RETURN 'NaN'::numeric; END IF;
  RETURN CASE WHEN neg THEN -t::numeric ELSE t::numeric END;
END $$;

CREATE OR REPLACE FUNCTION public.fin_bank_date(_s text, _fmt text)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE t text := trim(coalesce(_s,'')); m text[]; y int; mo int; d int;
BEGIN
  IF t = '' THEN RETURN NULL; END IF;
  m := regexp_match(t, '^(\d{4})-(\d{1,2})-(\d{1,2})$');
  IF m IS NOT NULL THEN y := m[1]::int; mo := m[2]::int; d := m[3]::int;
  ELSE
    m := regexp_match(t, '^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$');
    IF m IS NULL OR _fmt NOT IN ('dmy','mdy') THEN RETURN NULL; END IF;
    y := m[3]::int;
    IF _fmt = 'dmy' THEN d := m[1]::int; mo := m[2]::int; ELSE mo := m[1]::int; d := m[2]::int; END IF;
  END IF;
  RETURN make_date(y, mo, d);
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.fin_bank_eval(_account uuid, _rows jsonb, _settings jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  df text := _settings->>'date_fmt'; nf text := _settings->>'num_fmt'; md text := _settings->>'mode'; sg text := _settings->>'sign';
  r jsonb; out jsonb := '[]'::jsonb; dt date; a numeric; dv numeric; cv numeric; cur text; bid text; fpv text; occ int; m_noid int; m_all int;
  seen_fp jsonb := '{}'::jsonb; seen_id jsonb := '{}'::jsonb; outcome text; reason text; ex jsonb; desc_ text; ref_ text; near jsonb;
BEGIN
  IF df IS NULL OR df NOT IN ('iso','dmy','mdy') THEN RAISE EXCEPTION 'Choisissez explicitement le format des dates' USING ERRCODE = '22023'; END IF;
  IF nf IS NULL OR nf NOT IN ('fr','en') THEN RAISE EXCEPTION 'Choisissez explicitement le format des nombres' USING ERRCODE = '22023'; END IF;
  IF md IS NULL OR md NOT IN ('signed','split') THEN RAISE EXCEPTION 'Choisissez une colonne de montant signé ou deux colonnes débit/crédit' USING ERRCODE = '22023'; END IF;
  IF md = 'signed' AND (sg IS NULL OR sg NOT IN ('positive_in','positive_out')) THEN RAISE EXCEPTION 'Choisissez explicitement le sens du montant signé' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 THEN RAISE EXCEPTION 'Aucune ligne à importer' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(_rows) > 2000 THEN RAISE EXCEPTION 'Relevé trop long : 2 000 lignes au maximum' USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) ORDER BY (value->>'row_no')::int LOOP
    outcome := 'nouveau'; reason := NULL; a := NULL; ex := '[]'::jsonb; occ := NULL; fpv := NULL;
    desc_ := nullif(trim(coalesce(r->>'description','')), ''); ref_ := nullif(trim(coalesce(r->>'reference','')), '');
    bid := nullif(trim(coalesce(r->>'bank_id','')), ''); cur := upper(trim(coalesce(r->>'currency','')));
    dt := public.fin_bank_date(r->>'date', df);
    IF cur <> '' AND cur <> 'CAD' THEN outcome := 'refuse'; reason := format('Devise « %s » refusée : CAD seulement', cur);
    ELSIF dt IS NULL THEN outcome := 'refuse'; reason := format('Date illisible ou ambiguë « %s » pour le format choisi', coalesce(r->>'date',''));
    ELSIF md = 'signed' THEN
      a := public.fin_bank_num(r->>'amount', nf);
      IF a IS NULL THEN outcome := 'refuse'; reason := 'Montant absent';
      ELSIF a = 'NaN'::numeric THEN outcome := 'refuse'; reason := format('Montant illisible « %s » pour le format choisi', r->>'amount'); a := NULL;
      ELSIF a = 0 THEN outcome := 'refuse'; reason := 'Montant nul'; a := NULL;
      ELSIF sg = 'positive_out' THEN a := -a; END IF;
    ELSE
      dv := public.fin_bank_num(r->>'debit', nf); cv := public.fin_bank_num(r->>'credit', nf);
      IF dv = 'NaN'::numeric OR cv = 'NaN'::numeric THEN outcome := 'refuse'; reason := 'Débit ou crédit illisible pour le format choisi';
      ELSIF coalesce(dv,0) < 0 OR coalesce(cv,0) < 0 THEN outcome := 'refuse'; reason := 'Valeur négative dans une colonne débit/crédit : sens ambigu';
      ELSIF coalesce(dv,0) <> 0 AND coalesce(cv,0) <> 0 THEN outcome := 'refuse'; reason := 'Débit et crédit remplis sur la même ligne : sens ambigu';
      ELSIF coalesce(dv,0) = 0 AND coalesce(cv,0) = 0 THEN outcome := 'refuse'; reason := 'Ni débit ni crédit';
      ELSE a := coalesce(cv,0) - coalesce(dv,0); END IF;
    END IF;
    IF outcome <> 'refuse' THEN
      fpv := md5(dt::text || '|' || a::text || '|' || lower(coalesce(desc_,'')) || '|' || lower(coalesce(ref_,'')));
      IF bid IS NOT NULL THEN
        IF seen_id ? bid THEN outcome := 'refuse'; reason := format('Identifiant bancaire « %s » répété dans le fichier', bid);
        ELSE
          seen_id := seen_id || jsonb_build_object(bid, true);
          SELECT jsonb_agg(jsonb_build_object('id', l.id, 'date', l.txn_date, 'amount', l.amount, 'description', l.description)) INTO ex
            FROM public.fin_bank_lines l WHERE l.account_id = _account AND l.bank_txn_id = bid;
          IF ex IS NOT NULL THEN
            IF (ex->0->>'date')::date = dt AND (ex->0->>'amount')::numeric = a THEN outcome := 'deja_present'; reason := 'Même identifiant bancaire déjà importé pour ce compte';
            ELSE outcome := 'refuse'; reason := 'Identifiant bancaire déjà importé avec une date ou un montant différent'; END IF;
          ELSE ex := '[]'::jsonb; END IF;
        END IF;
      ELSE
        occ := coalesce((seen_fp->>fpv)::int, 0) + 1; seen_fp := seen_fp || jsonb_build_object(fpv, occ);
        SELECT count(*) FILTER (WHERE l.bank_txn_id IS NULL), count(*) INTO m_noid, m_all FROM public.fin_bank_lines l WHERE l.account_id = _account AND l.fp = fpv;
        IF occ <= m_noid THEN outcome := 'deja_present'; reason := format('Transaction identique déjà importée (%s sur %s dans le compte)', occ, m_noid);
        ELSE
          SELECT jsonb_agg(jsonb_build_object('id', l.id, 'date', l.txn_date, 'amount', l.amount, 'description', l.description, 'reference', l.reference)) INTO near
            FROM public.fin_bank_lines l WHERE l.account_id = _account AND l.txn_date = dt AND l.amount = a;
          IF near IS NOT NULL THEN
            outcome := 'a_examiner'; ex := near;
            reason := CASE WHEN m_all > 0 THEN format('Le fichier contient %s transaction(s) identique(s) et le compte en a déjà %s : confirmez s''il s''agit d''une transaction distincte', occ, m_all)
                           ELSE 'Même date et même montant qu''une transaction déjà importée, libellé différent : doublon possible' END;
          END IF;
        END IF;
      END IF;
    END IF;
    out := out || jsonb_build_object('row_no', (r->>'row_no')::int, 'outcome', outcome, 'reason', reason, 'date', dt, 'amount', a,
      'description', desc_, 'reference', ref_, 'bank_id', bid, 'fp', fpv, 'occ', occ, 'existing', coalesce(ex,'[]'::jsonb));
  END LOOP;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.fin_bank_account_ok(_company uuid, _account uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fin_accounts a WHERE a.id = _account AND a.company_id = _company AND a.archived_at IS NULL) THEN
    RAISE EXCEPTION 'Compte financier introuvable dans cette entreprise' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_accounts a WHERE a.id = _account AND coalesce(a.currency,'CAD') <> 'CAD') THEN
    RAISE EXCEPTION 'Compte en devise autre que CAD : non pris en charge dans ce lot' USING ERRCODE = '22023'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fin_bank_preview(_company uuid, _account uuid, _rows jsonb, _settings jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fin_bank_guard(_company, true); PERFORM public.fin_bank_account_ok(_company, _account);
  RETURN public.fin_bank_eval(_account, _rows, _settings);
END $$;

CREATE OR REPLACE FUNCTION public.fin_bank_commit(_company uuid, _account uuid, _rows jsonb, _settings jsonb, _file_name text, _file_sha text, _file_id uuid,
  _request_key text, _decisions jsonb, _opening numeric, _closing numeric, _complete boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE prev public.fin_bank_imports; ev jsonb; e jsonb; imp uuid; dec text; n_add int := 0; n_dup int := 0; n_rev int := 0; n_ref int := 0; n_skip int := 0;
  rows_out jsonb := '[]'::jsonb; occ int; lid uuid; tot numeric := 0; tin numeric := 0; tout numeric := 0; pf date; pt date; bal jsonb := NULL; summ jsonb;
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
      occ := (e->>'occ')::int;
      IF e->>'bank_id' IS NULL THEN
        SELECT greatest(occ, coalesce(max(l.occ),0) + 1) INTO occ FROM public.fin_bank_lines l WHERE l.account_id = _account AND l.fp = e->>'fp' AND l.bank_txn_id IS NULL;
      END IF;
      INSERT INTO public.fin_bank_lines(company_id, account_id, import_id, row_no, raw, src, txn_date, amount, description, reference, bank_txn_id, fp, occ, added_as_distinct)
        SELECT _company, _account, imp, (e->>'row_no')::int, coalesce(x.value->'raw','{}'::jsonb), x.value - 'raw', (e->>'date')::date, (e->>'amount')::numeric,
               e->>'description', e->>'reference', e->>'bank_id', e->>'fp', coalesce(occ, 1), e->>'outcome' = 'a_examiner'
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
END $$;

CREATE OR REPLACE FUNCTION public.fin_bank_movements(_company uuid)
RETURNS TABLE(kind text, id uuid, dir text, amount numeric, on_date date, account_id uuid, reference text, label text, party text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'payment', p.id, 'out', p.amount, p.paid_on, NULL::uuid, p.reference,
    CASE WHEN EXISTS (SELECT 1 FROM public.fin_exp_advances a WHERE a.payment_id = p.id) THEN 'Avance versée à un employé'
         WHEN p.payee_name ILIKE 'Employé%' THEN 'Remboursement d''employé' ELSE 'Paiement fournisseur (montant total)' END, p.payee_name
    FROM public.fin_payments p WHERE p.company_id = _company AND p.status = 'validated'
  UNION ALL
  SELECT 'receipt', r.id, 'in', r.amount, r.received_on, r.account_id, r.reference, 'Encaissement client' || coalesce(' — facture ' || i.number, ''), i.client_name
    FROM public.fin_invoice_receipts r JOIN public.fin_invoices i ON i.id = r.invoice_id WHERE r.company_id = _company AND r.voided_at IS NULL
  UNION ALL
  SELECT 'refund', f.id, 'in', f.amount, f.refunded_on, f.account_id, f.reference, 'Remboursement reçu d''un fournisseur (trop-payé)', p.payee_name
    FROM public.fin_refunds f JOIN public.fin_payments p ON p.id = f.payment_id WHERE f.company_id = _company AND f.voided_at IS NULL
  UNION ALL
  SELECT 'credit_refund', c.id, 'in', c.amount, c.refunded_on, c.account_id, c.reference, 'Remboursement reçu d''un fournisseur (note de crédit)', NULL
    FROM public.fin_supplier_credit_refunds c WHERE c.company_id = _company AND c.voided_at IS NULL
  UNION ALL
  SELECT 'restitution', x.id, 'in', x.amount, x.received_on, NULL::uuid, x.reference, 'Restitution d''avance par un employé', a.employee_name
    FROM public.fin_exp_restitutions x JOIN public.fin_exp_advances a ON a.id = x.advance_id WHERE x.company_id = _company AND x.voided_at IS NULL
$$;
REVOKE EXECUTE ON FUNCTION public.fin_bank_movements(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_bank_eval(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_bank_candidates(_line uuid, _q text DEFAULT NULL, _days integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.fin_bank_lines; res jsonb;
BEGIN
  SELECT * INTO l FROM public.fin_bank_lines WHERE id = _line;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction introuvable' USING ERRCODE = '42501'; END IF;
  PERFORM public.fin_bank_guard(l.company_id, false);
  SELECT coalesce(jsonb_agg(c ORDER BY (c->>'exact')::boolean DESC, (c->>'days')::int, c->>'date'), '[]'::jsonb) INTO res FROM (
    SELECT jsonb_build_object('kind', m.kind, 'id', m.id, 'dir', m.dir, 'amount', m.amount, 'date', m.on_date, 'label', m.label, 'party', m.party, 'reference', m.reference,
      'account_id', m.account_id, 'exact', m.amount = abs(l.amount), 'days', abs(m.on_date - l.txn_date),
      'reasons', to_jsonb(array_remove(ARRAY[
         CASE WHEN m.amount = abs(l.amount) THEN 'Montant identique' ELSE format('Montant différent (écart %s $)', to_char(abs(l.amount) - m.amount, 'FM999999990.00')) END,
         CASE WHEN m.on_date = l.txn_date THEN 'Même date' ELSE format('Date à %s jour(s)', abs(m.on_date - l.txn_date)) END,
         CASE WHEN m.account_id = l.account_id THEN 'Même compte financier' WHEN m.account_id IS NULL THEN 'Compte non précisé sur le mouvement' END,
         CASE WHEN l.amount > 0 THEN 'Entrée d''argent dans les deux' ELSE 'Sortie d''argent dans les deux' END,
         'Devise CAD',
         CASE WHEN m.reference IS NOT NULL AND length(m.reference) >= 3 AND (coalesce(l.description,'') || ' ' || coalesce(l.reference,'')) ILIKE '%' || m.reference || '%' THEN 'Référence retrouvée dans le libellé' END,
         CASE WHEN m.party IS NOT NULL AND length(m.party) >= 4 AND coalesce(l.description,'') ILIKE '%' || split_part(m.party, ' ', 1) || '%' THEN 'Nom du tiers retrouvé dans le libellé' END
       ], NULL))) c
    FROM public.fin_bank_movements(l.company_id) m
    WHERE m.dir = (CASE WHEN l.amount > 0 THEN 'in' ELSE 'out' END)
      AND (m.account_id IS NULL OR m.account_id = l.account_id)
      AND NOT EXISTS (SELECT 1 FROM public.fin_bank_match_items i WHERE i.active AND i.source_kind = m.kind AND i.source_id = m.id)
      AND abs(m.on_date - l.txn_date) <= greatest(least(coalesce(_days,10), 120), 0)
      AND m.amount <= abs(l.amount)
      AND (_q IS NULL OR _q = '' OR (m.label || ' ' || coalesce(m.party,'') || ' ' || coalesce(m.reference,'') || ' ' || m.amount::text) ILIKE '%' || _q || '%')
    LIMIT 200) s(c);
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.fin_bank_match(_line uuid, _items jsonb, _idem text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.fin_bank_lines; prev public.fin_bank_matches; it jsonb; m record; s numeric := 0; mid uuid; n int := 0; kinds text[] := '{}'; wdir text;
BEGIN
  SELECT * INTO l FROM public.fin_bank_lines WHERE id = _line;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction introuvable' USING ERRCODE = '42501'; END IF;
  PERFORM public.fin_bank_guard(l.company_id, true);
  IF coalesce(length(_idem),0) < 8 THEN RAISE EXCEPTION 'Clé de demande manquante' USING ERRCODE = '22023'; END IF;
  SELECT * INTO prev FROM public.fin_bank_matches WHERE company_id = l.company_id AND idem_key = _idem;
  IF FOUND THEN
    IF prev.line_id <> _line THEN RAISE EXCEPTION 'Clé de demande déjà utilisée pour une autre transaction' USING ERRCODE = 'P0409'; END IF;
    RETURN jsonb_build_object('match_id', prev.id, 'replay', true, 'status', prev.status);
  END IF;
  SELECT * INTO l FROM public.fin_bank_lines WHERE id = _line FOR UPDATE;
  SELECT * INTO prev FROM public.fin_bank_matches WHERE company_id = l.company_id AND idem_key = _idem;
  IF FOUND THEN RETURN jsonb_build_object('match_id', prev.id, 'replay', true, 'status', prev.status); END IF;
  IF l.status = 'rapproche' OR EXISTS (SELECT 1 FROM public.fin_bank_matches x WHERE x.line_id = _line AND x.status = 'active') THEN
    RAISE EXCEPTION 'Cette transaction est déjà rapprochée' USING ERRCODE = 'P0409'; END IF;
  IF l.status = 'exclu' THEN RAISE EXCEPTION 'Transaction exclue : remettez-la « À rapprocher » avant de la rapprocher' USING ERRCODE = 'P0409'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 50 THEN RAISE EXCEPTION 'Choisissez de 1 à 50 mouvements' USING ERRCODE = '22023'; END IF;
  wdir := CASE WHEN l.amount > 0 THEN 'in' ELSE 'out' END;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) ORDER BY value->>'kind', value->>'id' LOOP
    IF (it->>'kind') || ':' || (it->>'id') = ANY(kinds) THEN RAISE EXCEPTION 'Mouvement choisi deux fois' USING ERRCODE = '22023'; END IF;
    kinds := kinds || ((it->>'kind') || ':' || (it->>'id'));
    PERFORM pg_advisory_xact_lock(hashtext('fin_bank_src:' || (it->>'kind') || ':' || (it->>'id')));
    SELECT * INTO m FROM public.fin_bank_movements(l.company_id) mv WHERE mv.kind = it->>'kind' AND mv.id = (it->>'id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mouvement introuvable, annulé ou hors de cette entreprise' USING ERRCODE = '42501'; END IF;
    IF m.dir <> wdir THEN RAISE EXCEPTION 'Sens incompatible entre le relevé et le mouvement' USING ERRCODE = '22023'; END IF;
    IF m.account_id IS NOT NULL AND m.account_id <> l.account_id THEN RAISE EXCEPTION 'Le mouvement est enregistré sur un autre compte financier' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.fin_bank_match_items i WHERE i.active AND i.source_kind = m.kind AND i.source_id = m.id) THEN
      RAISE EXCEPTION 'Ce mouvement est déjà rapproché à une autre transaction du relevé' USING ERRCODE = 'P0409'; END IF;
    s := s + m.amount; n := n + 1;
  END LOOP;
  IF s <> abs(l.amount) THEN
    RAISE EXCEPTION 'Écart de % $ : la somme des mouvements (% $) ne correspond pas exactement à la transaction (% $). Aucun écart n''est absorbé : laissez-la « À examiner ».',
      to_char(abs(l.amount) - s, 'FM999999990.00'), to_char(s, 'FM999999990.00'), to_char(abs(l.amount), 'FM999999990.00') USING ERRCODE = 'P0410';
  END IF;
  INSERT INTO public.fin_bank_matches(company_id, line_id, idem_key, total) VALUES (l.company_id, _line, _idem, s) RETURNING id INTO mid;
  INSERT INTO public.fin_bank_match_items(company_id, match_id, line_id, source_kind, source_id, amount)
    SELECT l.company_id, mid, _line, mv.kind, mv.id, mv.amount FROM public.fin_bank_movements(l.company_id) mv
     WHERE (mv.kind || ':' || mv.id::text) = ANY(kinds);
  UPDATE public.fin_bank_lines SET status = 'rapproche', status_reason = NULL, rev = rev + 1, updated_at = now() WHERE id = _line;
  INSERT INTO public.fin_bank_events(company_id, line_id, match_id, kind, detail) VALUES (l.company_id, _line, mid, 'match', jsonb_build_object('items', _items, 'total', s));
  RETURN jsonb_build_object('match_id', mid, 'replay', false, 'count', n, 'total', s);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Rapprochement concurrent détecté : la transaction ou un mouvement vient d''être rapproché ailleurs' USING ERRCODE = 'P0409';
END $$;

CREATE OR REPLACE FUNCTION public.fin_bank_unmatch(_match uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE mt public.fin_bank_matches;
BEGIN
  SELECT * INTO mt FROM public.fin_bank_matches WHERE id = _match;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rapprochement introuvable' USING ERRCODE = '42501'; END IF;
  PERFORM public.fin_bank_guard(mt.company_id, true);
  IF length(trim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'Motif obligatoire pour annuler un rapprochement' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.fin_bank_lines WHERE id = mt.line_id FOR UPDATE;
  SELECT * INTO mt FROM public.fin_bank_matches WHERE id = _match FOR UPDATE;
  IF mt.status <> 'active' THEN RETURN jsonb_build_object('match_id', _match, 'replay', true); END IF;
  UPDATE public.fin_bank_matches SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(_reason) WHERE id = _match;
  UPDATE public.fin_bank_match_items SET active = false WHERE match_id = _match;
  UPDATE public.fin_bank_lines SET status = 'a_rapprocher', rev = rev + 1, updated_at = now() WHERE id = mt.line_id;
  INSERT INTO public.fin_bank_events(company_id, line_id, match_id, kind, detail) VALUES (mt.company_id, mt.line_id, _match, 'unmatch', jsonb_build_object('reason', trim(_reason)));
  RETURN jsonb_build_object('match_id', _match, 'replay', false);
END $$;

CREATE OR REPLACE FUNCTION public.fin_bank_set_status(_line uuid, _status text, _reason text, _rev integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.fin_bank_lines;
BEGIN
  SELECT * INTO l FROM public.fin_bank_lines WHERE id = _line;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction introuvable' USING ERRCODE = '42501'; END IF;
  PERFORM public.fin_bank_guard(l.company_id, true);
  SELECT * INTO l FROM public.fin_bank_lines WHERE id = _line FOR UPDATE;
  IF _status NOT IN ('a_rapprocher','a_examiner','exclu') THEN RAISE EXCEPTION 'Statut non permis' USING ERRCODE = '22023'; END IF;
  IF l.status = 'rapproche' THEN RAISE EXCEPTION 'Transaction rapprochée : annulez d''abord le rapprochement (avec motif)' USING ERRCODE = 'P0409'; END IF;
  IF l.status = _status THEN RETURN jsonb_build_object('rev', l.rev, 'replay', true); END IF;
  IF _rev IS DISTINCT FROM l.rev THEN RAISE EXCEPTION 'La transaction a changé entre-temps : rechargez' USING ERRCODE = 'P0409'; END IF;
  IF _status IN ('exclu','a_examiner') AND length(trim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'Motif obligatoire' USING ERRCODE = '22023'; END IF;
  UPDATE public.fin_bank_lines SET status = _status, status_reason = nullif(trim(coalesce(_reason,'')),''), rev = rev + 1, updated_at = now() WHERE id = _line;
  INSERT INTO public.fin_bank_events(company_id, line_id, kind, detail) VALUES (l.company_id, _line, 'status', jsonb_build_object('from', l.status, 'to', _status, 'reason', _reason));
  RETURN jsonb_build_object('rev', l.rev + 1, 'replay', false);
END $$;

CREATE OR REPLACE FUNCTION public.fin_bank_overview(_company uuid, _account uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lines jsonb; tot jsonb; imps jsonb; internal jsonb; pf date; pt date; full_ok boolean;
BEGIN
  PERFORM public.fin_bank_guard(_company, false); PERFORM public.fin_bank_account_ok(_company, _account);
  SELECT min(txn_date), max(txn_date) INTO pf, pt FROM public.fin_bank_lines WHERE account_id = _account;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'date', l.txn_date, 'amount', l.amount, 'description', l.description, 'reference', l.reference,
      'bank_id', l.bank_txn_id, 'status', l.status, 'reason', l.status_reason, 'rev', l.rev, 'distinct', l.added_as_distinct, 'import_id', l.import_id, 'row_no', l.row_no, 'raw', l.raw,
      'suggest', l.status = 'a_rapprocher' AND EXISTS (SELECT 1 FROM public.fin_bank_movements(_company) m WHERE m.dir = (CASE WHEN l.amount > 0 THEN 'in' ELSE 'out' END)
          AND (m.account_id IS NULL OR m.account_id = l.account_id) AND m.amount = abs(l.amount) AND abs(m.on_date - l.txn_date) <= 10
          AND NOT EXISTS (SELECT 1 FROM public.fin_bank_match_items i WHERE i.active AND i.source_kind = m.kind AND i.source_id = m.id)),
      'twins', (SELECT count(*) FROM public.fin_bank_lines t WHERE t.account_id = l.account_id AND t.fp = l.fp),
      'match', (SELECT jsonb_build_object('id', mt.id, 'at', mt.created_at, 'items', (SELECT jsonb_agg(jsonb_build_object('kind', i.source_kind, 'id', i.source_id, 'amount', i.amount,
                 'label', (SELECT m.label || coalesce(' — ' || m.party, '') FROM public.fin_bank_movements(_company) m WHERE m.kind = i.source_kind AND m.id = i.source_id),
                 'date', (SELECT m.on_date FROM public.fin_bank_movements(_company) m WHERE m.kind = i.source_kind AND m.id = i.source_id)))
                 FROM public.fin_bank_match_items i WHERE i.match_id = mt.id))
                FROM public.fin_bank_matches mt WHERE mt.line_id = l.id AND mt.status = 'active'),
      'history', (SELECT jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.at, 'detail', e.detail) ORDER BY e.at) FROM public.fin_bank_events e WHERE e.line_id = l.id)
    ) ORDER BY l.txn_date DESC, l.row_no), '[]'::jsonb) INTO lines
  FROM public.fin_bank_lines l WHERE l.account_id = _account;
  SELECT jsonb_build_object(
    'count', count(*), 'in', coalesce(sum(amount) FILTER (WHERE amount > 0),0), 'out', coalesce(-sum(amount) FILTER (WHERE amount < 0),0),
    'matched_in', coalesce(sum(amount) FILTER (WHERE amount > 0 AND status = 'rapproche'),0), 'matched_out', coalesce(-sum(amount) FILTER (WHERE amount < 0 AND status = 'rapproche'),0),
    'matched_count', count(*) FILTER (WHERE status = 'rapproche'),
    'open_in', coalesce(sum(amount) FILTER (WHERE amount > 0 AND status IN ('a_rapprocher','a_examiner')),0), 'open_out', coalesce(-sum(amount) FILTER (WHERE amount < 0 AND status IN ('a_rapprocher','a_examiner')),0),
    'open_count', count(*) FILTER (WHERE status IN ('a_rapprocher','a_examiner')), 'review_count', count(*) FILTER (WHERE status = 'a_examiner'),
    'excluded_count', count(*) FILTER (WHERE status = 'exclu'), 'excluded_net', coalesce(sum(amount) FILTER (WHERE status = 'exclu'),0)) INTO tot
  FROM public.fin_bank_lines WHERE account_id = _account;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'file_name', i.file_name, 'file_id', i.file_id, 'at', i.created_at, 'by', i.created_by, 'period_from', i.period_from, 'period_to', i.period_to,
     'complete', i.complete, 'balance', i.summary->'balance', 'summary', i.summary - 'rows') ORDER BY i.created_at DESC), '[]'::jsonb) INTO imps
  FROM public.fin_bank_imports i WHERE i.account_id = _account;
  SELECT jsonb_build_object('count', count(*), 'in', coalesce(sum(m.amount) FILTER (WHERE m.dir = 'in'),0), 'out', coalesce(sum(m.amount) FILTER (WHERE m.dir = 'out'),0),
      'rows', coalesce(jsonb_agg(jsonb_build_object('kind', m.kind, 'id', m.id, 'dir', m.dir, 'amount', m.amount, 'date', m.on_date, 'label', m.label, 'party', m.party, 'reference', m.reference, 'account_id', m.account_id) ORDER BY m.on_date), '[]'::jsonb)) INTO internal
  FROM public.fin_bank_movements(_company) m
  WHERE pf IS NOT NULL AND m.on_date BETWEEN pf AND pt AND (m.account_id IS NULL OR m.account_id = _account)
    AND NOT EXISTS (SELECT 1 FROM public.fin_bank_match_items i WHERE i.active AND i.source_kind = m.kind AND i.source_id = m.id);
  full_ok := (tot->>'count')::int > 0 AND (tot->>'open_count')::int = 0
    AND NOT EXISTS (SELECT 1 FROM public.fin_bank_imports i WHERE i.account_id = _account AND NOT (i.complete AND coalesce((i.summary->'balance'->>'ok')::boolean, false)));
  RETURN jsonb_build_object('lines', lines, 'totals', tot, 'imports', imps, 'internal', internal, 'fully_reconciled', full_ok, 'period_from', pf, 'period_to', pt);
END $$;

CREATE OR REPLACE FUNCTION public.fin_bank_src_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text := TG_ARGV[0]; gone boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fin_bank_match_items i WHERE i.active AND i.source_kind = k AND i.source_id = OLD.id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP = 'DELETE' THEN gone := true;
  ELSIF k = 'payment' THEN gone := (to_jsonb(NEW)->>'status') IS DISTINCT FROM 'validated' OR NEW.amount IS DISTINCT FROM OLD.amount;
  ELSE gone := ((to_jsonb(NEW)->>'voided_at') IS NOT NULL AND (to_jsonb(OLD)->>'voided_at') IS NULL) OR NEW.amount IS DISTINCT FROM OLD.amount; END IF;
  IF gone THEN
    RAISE EXCEPTION 'Ce mouvement est rapproché à une transaction du relevé bancaire : annulez d''abord le rapprochement (Rapprochement bancaire, avec motif)' USING ERRCODE = 'P0409';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER fin_bank_guard_payments BEFORE UPDATE OR DELETE ON public.fin_payments FOR EACH ROW EXECUTE FUNCTION public.fin_bank_src_guard('payment');
CREATE TRIGGER fin_bank_guard_receipts BEFORE UPDATE OR DELETE ON public.fin_invoice_receipts FOR EACH ROW EXECUTE FUNCTION public.fin_bank_src_guard('receipt');
CREATE TRIGGER fin_bank_guard_refunds BEFORE UPDATE OR DELETE ON public.fin_refunds FOR EACH ROW EXECUTE FUNCTION public.fin_bank_src_guard('refund');
CREATE TRIGGER fin_bank_guard_crefunds BEFORE UPDATE OR DELETE ON public.fin_supplier_credit_refunds FOR EACH ROW EXECUTE FUNCTION public.fin_bank_src_guard('credit_refund');
CREATE TRIGGER fin_bank_guard_restit BEFORE UPDATE OR DELETE ON public.fin_exp_restitutions FOR EACH ROW EXECUTE FUNCTION public.fin_bank_src_guard('restitution');

REVOKE EXECUTE ON FUNCTION public.fin_bank_guard(uuid, boolean), public.fin_bank_account_ok(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_bank_preview(uuid, uuid, jsonb, jsonb), public.fin_bank_commit(uuid, uuid, jsonb, jsonb, text, text, uuid, text, jsonb, numeric, numeric, boolean),
  public.fin_bank_candidates(uuid, text, integer), public.fin_bank_match(uuid, jsonb, text), public.fin_bank_unmatch(uuid, text),
  public.fin_bank_set_status(uuid, text, text, integer), public.fin_bank_overview(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_bank_preview(uuid, uuid, jsonb, jsonb), public.fin_bank_commit(uuid, uuid, jsonb, jsonb, text, text, uuid, text, jsonb, numeric, numeric, boolean),
  public.fin_bank_candidates(uuid, text, integer), public.fin_bank_match(uuid, jsonb, text), public.fin_bank_unmatch(uuid, text),
  public.fin_bank_set_status(uuid, text, text, integer), public.fin_bank_overview(uuid, uuid) FROM PUBLIC, anon;