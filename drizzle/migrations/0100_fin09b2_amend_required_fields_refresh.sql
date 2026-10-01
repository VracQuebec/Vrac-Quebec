CREATE OR REPLACE FUNCTION public.fin_progress_amend_compute(_plan uuid, _changes jsonb, _on date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p fin_progress_plans; c jsonb; pit boolean; st jsonb; cap jsonb; ch jsonb; l jsonb; nl jsonb; seen text[] := '{}'; lid text; nq numeric; oa numeric; na numeric;
  dt numeric := 0; dz numeric := 0; de numeric := 0; t numeric; z numeric; e numeric; nmax integer; k integer := 0; det jsonb := '[]'::jsonb; syn jsonb := '[]'::jsonb; r jsonb; after jsonb;
BEGIN
  SELECT * INTO p FROM fin_progress_plans WHERE id = _plan;
  c := p.contract; pit := coalesce((c->>'prices_include_tax')::boolean, false);
  IF jsonb_typeof(_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(_changes) = 0 OR jsonb_array_length(_changes) > 200 THEN
    RAISE EXCEPTION 'Avenant : au moins une ligne modifiée ou ajoutée' USING ERRCODE = '22023'; END IF;
  st := public.fin_progress_lines_state(_plan); cap := public.fin_progress_cap(_plan); nl := p.lines;
  SELECT coalesce(max(substring(x->>'id' from '^L(\d+)$')::integer), 0) INTO nmax FROM jsonb_array_elements(p.lines) x WHERE jsonb_typeof(x) = 'object';
  FOR ch IN SELECT * FROM jsonb_array_elements(_changes) LOOP
    IF jsonb_typeof(ch) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Avenant illisible' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(ch->'qty') IS DISTINCT FROM 'string' OR coalesce(ch->>'qty', '') !~ '^\d{1,12}(\.\d{1,4})?$' THEN RAISE EXCEPTION 'Quantité invalide : nombre fini positif ou nul, au plus 4 décimales' USING ERRCODE = '22023'; END IF;
    nq := (ch->>'qty')::numeric;
    IF nq IS NULL THEN RAISE EXCEPTION 'Quantité requise' USING ERRCODE = '22023'; END IF;
    IF ch ? 'id' THEN
      lid := ch->>'id';
      IF lid = ANY(seen) THEN RAISE EXCEPTION 'Ligne % modifiée deux fois', lid USING ERRCODE = '22023'; END IF;
      seen := seen || lid;
      SELECT x INTO l FROM jsonb_array_elements(st) x WHERE x->>'id' = lid;
      IF l IS NULL THEN RAISE EXCEPTION 'Ligne inconnue : %', lid USING ERRCODE = '22023'; END IF;
      IF nq < (l->>'billed_qty')::numeric THEN RAISE EXCEPTION 'Ligne % : quantité inférieure au déjà facturé (%)', lid, l->>'billed_qty' USING ERRCODE = '22023'; END IF;
      oa := (l->>'amount')::numeric; na := public.fin_progress_line_amt(nq, (l->>'price')::numeric, (l->>'disc_pct')::numeric);
      IF nq = (l->>'qty')::numeric THEN RAISE EXCEPTION 'Ligne % : quantité inchangée', lid USING ERRCODE = '22023'; END IF;
      nl := (SELECT jsonb_agg(CASE WHEN jsonb_typeof(x) = 'object' AND x->>'id' = lid THEN x || jsonb_build_object('qty', ch->>'qty') ELSE x END ORDER BY o) FROM jsonb_array_elements(nl) WITH ORDINALITY t(x, o));
      det := det || jsonb_build_object('id', lid, 'desc', l->>'desc', 'unit', l->>'unit', 'tax', l->>'tax', 'price', l->'price', 'disc_pct', l->'disc_pct',
        'qty_before', l->'qty', 'qty_after', nq, 'amount_before', oa, 'amount_after', na);
    ELSE
      IF btrim(coalesce(ch->>'desc', '')) = '' OR length(ch->>'desc') > 300 THEN RAISE EXCEPTION 'Nouvelle ligne : description requise' USING ERRCODE = '22023'; END IF;
      IF jsonb_typeof(ch->'price') IS DISTINCT FROM 'string' OR coalesce(ch->>'price', '') !~ '^\d{1,12}(\.\d{1,4})?$' THEN RAISE EXCEPTION 'Nouvelle ligne : prix invalide' USING ERRCODE = '22023'; END IF;
      IF coalesce(ch->>'disc_pct', '') <> '' AND ((ch->>'disc_pct') !~ '^\d{1,3}(\.\d{1,2})?$' OR (ch->>'disc_pct')::numeric > 100) THEN RAISE EXCEPTION 'Nouvelle ligne : remise invalide' USING ERRCODE = '22023'; END IF;
      IF coalesce(ch->>'tax', '') NOT IN ('taxable','detaxe','exonere') THEN RAISE EXCEPTION 'Nouvelle ligne : traitement fiscal requis' USING ERRCODE = '22023'; END IF;
      IF nq <= 0 THEN RAISE EXCEPTION 'Nouvelle ligne : quantité positive requise' USING ERRCODE = '22023'; END IF;
      k := k + 1; lid := 'L' || (nmax + k); oa := 0;
      na := public.fin_progress_line_amt(nq, (ch->>'price')::numeric, nullif(ch->>'disc_pct', '')::numeric);
      l := jsonb_build_object('id', lid, 'desc', btrim(ch->>'desc'), 'unit', nullif(btrim(coalesce(ch->>'unit', '')), ''), 'qty', ch->>'qty', 'price', ch->>'price',
        'disc_pct', nullif(ch->>'disc_pct', ''), 'tax', ch->>'tax');
      nl := nl || l;
      det := det || jsonb_build_object('id', lid, 'desc', l->>'desc', 'unit', l->>'unit', 'tax', l->>'tax', 'price', l->'price', 'disc_pct', l->'disc_pct', 'qty_before', 0, 'qty_after', nq, 'amount_before', 0, 'amount_after', na, 'new', true);
    END IF;
    CASE l->>'tax' WHEN 'taxable' THEN dt := dt + na - oa; WHEN 'detaxe' THEN dz := dz + na - oa; WHEN 'exonere' THEN de := de + na - oa;
      ELSE RAISE EXCEPTION 'Ligne % au traitement fiscal à déterminer', lid USING ERRCODE = '22023'; END CASE;
  END LOOP;
  IF dt IS NULL OR dz IS NULL OR de IS NULL OR na IS NULL THEN RAISE EXCEPTION 'Avenant incohérent : montant indéterminé' USING ERRCODE = '22023'; END IF;
  IF dt = 0 AND dz = 0 AND de = 0 THEN RAISE EXCEPTION 'Avenant sans effet monétaire' USING ERRCODE = '22023'; END IF;
  t := (cap->>'t')::numeric + dt; z := (cap->>'z')::numeric + dz; e := (cap->>'e')::numeric + de;
  IF t < (cap->>'billed_t')::numeric OR z < (cap->>'billed_z')::numeric OR e < (cap->>'billed_e')::numeric THEN
    RAISE EXCEPTION 'Avenant refusé : le contrat deviendrait inférieur à ce qui est déjà facturé' USING ERRCODE = '22023'; END IF;
  IF p.track = 'milestones' AND (cap->>'allocated')::numeric > t + z + e THEN
    RAISE EXCEPTION 'Avenant refusé : les jalons définis dépasseraient le nouveau plafond; réduisez ou archivez d''abord un jalon non facturé' USING ERRCODE = '22023'; END IF;
  IF t <> 0 THEN syn := syn || jsonb_build_object('qty', 1, 'price', t, 'tax', 'taxable'); END IF;
  IF z <> 0 THEN syn := syn || jsonb_build_object('qty', 1, 'price', z, 'tax', 'detaxe'); END IF;
  IF e <> 0 THEN syn := syn || jsonb_build_object('qty', 1, 'price', e, 'tax', 'exonere'); END IF;
  r := public.fin_tax_compute(syn, pit, c->>'gst_status', c->>'qst_status', coalesce(_on, (now() AT TIME ZONE 'America/Toronto')::date));
  IF NOT coalesce((r->>'resolved')::boolean, false) OR (r->>'gst_rate')::numeric IS DISTINCT FROM (c->>'gst_rate')::numeric OR (r->>'qst_rate')::numeric IS DISTINCT FROM (c->>'qst_rate')::numeric THEN
    RAISE EXCEPTION 'Taux ou profil fiscal différent du contrat figé : avenant refusé'; END IF;
  after := jsonb_build_object('bt', (r->>'taxable_base')::numeric, 'bz', z, 'be', e, 'gst', (r->>'gst')::numeric, 'qst', (r->>'qst')::numeric, 'ht', (r->>'pre_tax')::numeric, 'total', (r->>'total')::numeric,
    'gst_rate', c->'gst_rate', 'qst_rate', c->'qst_rate', 'gst_status', c->>'gst_status', 'qst_status', c->>'qst_status', 'prices_include_tax', pit);
  IF (after->>'ht') IS NULL OR (after->>'total') IS NULL OR (after->>'gst') IS NULL OR (after->>'qst') IS NULL OR t IS NULL OR z IS NULL OR e IS NULL
     OR (cap->>'billed_t') IS NULL OR (cap->>'billed_z') IS NULL OR (cap->>'billed_e') IS NULL THEN
    RAISE EXCEPTION 'Avenant incohérent : impact indéterminé' USING ERRCODE = '22023'; END IF;
  RETURN jsonb_build_object('from_version', p.contract_version, 'before', c, 'after', after, 'changes', det, 'lines_after', nl,
    'delta', jsonb_build_object('cap', dt + dz + de, 'ht', (after->>'ht')::numeric - (c->>'ht')::numeric, 'gst', (after->>'gst')::numeric - (c->>'gst')::numeric,
      'qst', (after->>'qst')::numeric - (c->>'qst')::numeric, 'total', (after->>'total')::numeric - (c->>'total')::numeric),
    'cap_before', (cap->>'t')::numeric + (cap->>'z')::numeric + (cap->>'e')::numeric, 'cap_after', t + z + e,
    'billed_cap', (cap->>'billed_t')::numeric + (cap->>'billed_z')::numeric + (cap->>'billed_e')::numeric);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_progress_amend_save(_plan uuid, _draft_key text, _reason text, _changes jsonb, _ref text, _ref_date date, _approver text, _ref_quote uuid, _base_rev integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p fin_progress_plans; a fin_progress_amendments; ih text; imp jsonb; q ent_crm_quotes;
BEGIN
  SELECT * INTO p FROM fin_progress_plans WHERE id = _plan FOR UPDATE;
  IF p.id IS NULL OR NOT public.fin_can_write(p.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_draft_key, '') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  _reason := btrim(coalesce(_reason, '')); _ref := nullif(btrim(coalesce(_ref, '')), ''); _approver := nullif(btrim(coalesce(_approver, '')), '');
  IF _reason = '' THEN RAISE EXCEPTION 'Motif de l''avenant requis' USING ERRCODE = '22023'; END IF;
  ih := md5(jsonb_build_object('reason', _reason, 'changes', _changes, 'ref', _ref, 'ref_date', _ref_date, 'approver', _approver, 'ref_quote', _ref_quote)::text);
  SELECT * INTO a FROM fin_progress_amendments WHERE company_id = p.company_id AND draft_key = _draft_key FOR UPDATE;
  IF a.id IS NOT NULL THEN
    IF a.plan_id <> _plan THEN RAISE EXCEPTION 'Clé déjà utilisée sur un autre dossier' USING ERRCODE = 'P0409'; END IF;
    -- rejeu réseau exact (révision précédente) ou avenant clos : même réponse; révision COURANTE = actualisation (recalcul ci-dessous)
    IF a.input_hash = ih AND (a.status <> 'brouillon' OR _base_rev IS NOT DISTINCT FROM a.rev - 1 OR (_base_rev IS NULL AND a.rev = 1)) THEN RETURN to_jsonb(a); END IF;
    IF a.status <> 'brouillon' THEN RAISE EXCEPTION 'Avenant clos : clé réutilisée avec un autre contenu' USING ERRCODE = 'P0409'; END IF;
    IF _base_rev IS DISTINCT FROM a.rev THEN RAISE EXCEPTION 'Avenant modifié ailleurs : rechargez-le' USING ERRCODE = 'P0409'; END IF;
  ELSIF _base_rev IS NOT NULL THEN RAISE EXCEPTION 'Avenant introuvable pour cette révision' USING ERRCODE = 'P0409';
  ELSIF EXISTS (SELECT 1 FROM fin_progress_amendments WHERE plan_id = _plan AND status = 'brouillon') THEN
    RAISE EXCEPTION 'Un brouillon d''avenant existe déjà : reprenez-le ou abandonnez-le';
  END IF;
  IF _ref_quote IS NOT NULL THEN
    SELECT * INTO q FROM ent_crm_quotes WHERE id = _ref_quote AND company_id = p.company_id AND client_id = p.client_id;
    IF q.id IS NULL OR public.fin_quote_family_root(q.id) IS DISTINCT FROM public.fin_quote_family_root(p.quote_id) THEN
      RAISE EXCEPTION 'Soumission justificative refusée : même entreprise, même client et même famille de révisions requis' USING ERRCODE = '22023'; END IF;
  END IF;
  imp := public.fin_progress_amend_compute(_plan, _changes, (now() AT TIME ZONE 'America/Toronto')::date);
  IF a.id IS NOT NULL AND a.input_hash = ih AND a.hash = md5(ih || imp::text) AND a.from_version = p.contract_version THEN RETURN to_jsonb(a); END IF;
  IF a.id IS NOT NULL THEN
    UPDATE fin_progress_amendments SET reason = _reason, changes = _changes, impact = imp, approval_ref = _ref, approval_date = _ref_date, approver_name = _approver,
      ref_quote_id = _ref_quote, from_version = p.contract_version, input_hash = ih, hash = md5(ih || imp::text), rev = rev + 1 WHERE id = a.id RETURNING * INTO a;
  ELSE
    INSERT INTO fin_progress_amendments (plan_id, company_id, seq, reason, changes, impact, approval_ref, approval_date, approver_name, ref_quote_id, from_version, input_hash, hash, draft_key, created_by)
    VALUES (_plan, p.company_id, (SELECT count(*) + 1 FROM fin_progress_amendments WHERE plan_id = _plan), _reason, _changes, imp, _ref, _ref_date, _approver, _ref_quote,
      p.contract_version, ih, md5(ih || imp::text), _draft_key, auth.uid()) RETURNING * INTO a;
  END IF;
  RETURN to_jsonb(a);
END $function$;

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
    IF s.input_hash = ih AND (s.status <> 'brouillon' OR _base_rev IS NOT DISTINCT FROM s.rev - 1 OR (_base_rev IS NULL AND s.rev = 1)) THEN RETURN to_jsonb(s); END IF;
    IF s.status <> 'brouillon' THEN RAISE EXCEPTION 'Brouillon déjà émis ou abandonné : clé réutilisée avec un autre contenu' USING ERRCODE = 'P0409'; END IF;
    IF _base_rev IS DISTINCT FROM s.rev THEN RAISE EXCEPTION 'Brouillon modifié ailleurs : rechargez-le' USING ERRCODE = 'P0409'; END IF;
    PERFORM public.fin_progress_check_dates(_plan, _issue_date, _due_date);
    comp := public.fin_progress_compute_any(_plan, _kind, _mode, _value, _issue_date);
    IF s.input_hash = ih AND s.hash = md5(ih || comp::text) THEN RETURN to_jsonb(s); END IF;
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