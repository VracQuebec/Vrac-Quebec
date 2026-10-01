-- FIN-09B1 relecture : exclusivité par famille de révisions, rejeu strict, hash structuré, abandon contrôlé, source validée.

-- Racine de la famille (ancêtres même entreprise, cycles refusés). Interne.
CREATE OR REPLACE FUNCTION public.fin_quote_family_root(_q uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cur uuid := _q; par uuid; co uuid; pco uuid; seen uuid[] := ARRAY[_q]; n int := 0;
BEGIN
  SELECT company_id INTO co FROM ent_crm_quotes WHERE id = _q;
  IF co IS NULL THEN RAISE EXCEPTION 'Soumission introuvable'; END IF;
  LOOP
    SELECT parent_quote_id INTO par FROM ent_crm_quotes WHERE id = cur;
    EXIT WHEN par IS NULL;
    SELECT company_id INTO pco FROM ent_crm_quotes WHERE id = par;
    IF pco IS NULL OR pco <> co THEN RAISE EXCEPTION 'Révision liée à une soumission d''une autre entreprise ou introuvable : facturation refusée'; END IF;
    IF par = ANY(seen) THEN RAISE EXCEPTION 'Cycle dans les révisions de soumission : facturation refusée'; END IF;
    n := n + 1; IF n > 200 THEN RAISE EXCEPTION 'Chaîne de révisions trop longue'; END IF;
    seen := seen || par; cur := par;
  END LOOP;
  RETURN cur;
END $$;
REVOKE ALL ON FUNCTION public.fin_quote_family_root(uuid) FROM PUBLIC, anon, authenticated;

-- Membres de la famille (racine + tous les descendants, même entreprise; sœurs incluses). Interne.
CREATE OR REPLACE FUNCTION public.fin_quote_family(_root uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE f(id, co, path) AS (
    SELECT id, company_id, ARRAY[id] FROM ent_crm_quotes WHERE id = _root
    UNION ALL
    SELECT q.id, q.company_id, f.path || q.id FROM ent_crm_quotes q JOIN f ON q.parent_quote_id = f.id
    WHERE q.company_id = f.co AND NOT q.id = ANY(f.path) AND cardinality(f.path) < 200)
  SELECT DISTINCT id FROM f
$$;
REVOKE ALL ON FUNCTION public.fin_quote_family(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_quote_family_lock(_root uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT pg_advisory_xact_lock(hashtext('fin_inv_qfam:' || _root::text))
$$;
REVOKE ALL ON FUNCTION public.fin_quote_family_lock(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_quote_family_engaged(_root uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM fin_progress_plans WHERE quote_id IN (SELECT public.fin_quote_family(_root)))
      OR EXISTS (SELECT 1 FROM fin_invoices WHERE quote_id IN (SELECT public.fin_quote_family(_root)))
$$;
REVOKE ALL ON FUNCTION public.fin_quote_family_engaged(uuid) FROM PUBLIC, anon, authenticated;

-- Garde : changer le parent (ou l'entreprise) d'une soumission dont la famille (ancienne ou nouvelle) est engagée est refusé; cycles et autre entreprise refusés.
CREATE OR REPLACE FUNCTION public.fin_quote_parent_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r_old uuid; r_new uuid; pco uuid;
BEGIN
  IF NEW.parent_quote_id IS NOT NULL THEN
    IF NEW.parent_quote_id = NEW.id THEN RAISE EXCEPTION 'Une soumission ne peut pas être sa propre révision'; END IF;
    SELECT company_id INTO pco FROM ent_crm_quotes WHERE id = NEW.parent_quote_id;
    IF pco IS NULL OR pco <> NEW.company_id THEN RAISE EXCEPTION 'Soumission d''origine d''une autre entreprise ou introuvable'; END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.parent_quote_id IS DISTINCT FROM OLD.parent_quote_id OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
    IF NEW.parent_quote_id IS NOT NULL AND NEW.id IN (SELECT public.fin_quote_family(NEW.id)) AND NEW.parent_quote_id IN (SELECT public.fin_quote_family(NEW.id)) THEN
      RAISE EXCEPTION 'Cycle dans les révisions de soumission refusé';
    END IF;
    r_old := public.fin_quote_family_root(OLD.id);
    r_new := CASE WHEN NEW.parent_quote_id IS NULL THEN NEW.id ELSE public.fin_quote_family_root(NEW.parent_quote_id) END;
    IF r_old::text <= r_new::text THEN PERFORM public.fin_quote_family_lock(r_old); PERFORM public.fin_quote_family_lock(r_new);
    ELSE PERFORM public.fin_quote_family_lock(r_new); PERFORM public.fin_quote_family_lock(r_old); END IF;
    IF public.fin_quote_family_engaged(r_old) OR public.fin_quote_family_engaged(r_new)
       OR EXISTS (SELECT 1 FROM fin_progress_plans WHERE quote_id IN (SELECT public.fin_quote_family(OLD.id)))
       OR EXISTS (SELECT 1 FROM fin_invoices WHERE quote_id IN (SELECT public.fin_quote_family(OLD.id))) THEN
      RAISE EXCEPTION 'Famille de révisions déjà facturée : lien de révision non modifiable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fin_quote_parent_guard_t ON public.ent_crm_quotes;
CREATE TRIGGER fin_quote_parent_guard_t BEFORE INSERT OR UPDATE OF parent_quote_id, company_id ON public.ent_crm_quotes FOR EACH ROW EXECUTE FUNCTION public.fin_quote_parent_guard();

-- Conversion entière : verrou et exclusivité par famille.
CREATE OR REPLACE FUNCTION public.fin_invoice_from_quote(_quote_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q ent_crm_quotes; c ent_crm_clients; v uuid; rt uuid; onum text;
BEGIN
  SELECT * INTO q FROM ent_crm_quotes WHERE id = _quote_id;
  IF q.id IS NULL OR NOT public.fin_can_write(q.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF q.status <> 'acceptee' THEN RAISE EXCEPTION 'Seule une soumission acceptée peut être facturée'; END IF;
  rt := public.fin_quote_family_root(_quote_id);
  PERFORM public.fin_quote_family_lock(rt);
  IF EXISTS (SELECT 1 FROM fin_progress_plans WHERE quote_id IN (SELECT public.fin_quote_family(rt))) THEN
    RAISE EXCEPTION 'Facturation progressive en cours pour cette soumission ou une de ses versions : ouvrez son dossier dans Finances → Factures';
  END IF;
  SELECT id INTO v FROM fin_invoices WHERE quote_id = _quote_id;
  IF v IS NOT NULL THEN RETURN v; END IF;
  SELECT i.number INTO onum FROM fin_invoices i WHERE i.quote_id IN (SELECT public.fin_quote_family(rt)) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'Une autre version de cette soumission est déjà facturée (%) : avenant contrôlé à venir (FIN-09B2)', coalesce(onum, 'brouillon'); END IF;
  SELECT * INTO c FROM ent_crm_clients WHERE id = q.client_id;
  PERFORM set_config('fin.from_quote', 'on', true);
  INSERT INTO fin_invoices (company_id, quote_id, client_id, client_name, client_email, client_phone, client_address, lines, prices_include_tax, terms, created_by)
  VALUES (q.company_id, q.id, q.client_id, c.name, c.email, c.phone, NULL, q.lines, q.prices_include_tax, q.conditions, auth.uid())
  RETURNING id INTO v;
  PERFORM set_config('fin.from_quote', '', true);
  RETURN v;
END $$;

-- Validation d'un nombre JSON fini (refuse NaN/Infinity et chaînes).
CREATE OR REPLACE FUNCTION public.fin_json_num_ok(_v jsonb, _allow_null boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE t text;
BEGIN
  IF _v IS NULL OR jsonb_typeof(_v) = 'null' THEN RETURN _allow_null; END IF;
  IF jsonb_typeof(_v) = 'number' THEN RETURN true; END IF;
  IF jsonb_typeof(_v) = 'string' THEN t := _v #>> '{}'; RETURN t = '' AND _allow_null OR t ~ '^-?\d{1,12}(\.\d{1,6})?$'; END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.fin_progress_plan_create(_quote uuid, _key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q ent_crm_quotes; p fin_progress_plans; inv uuid; sn jsonb; rt uuid; l jsonb; f text; bt numeric; bz numeric; be numeric; g numeric; qq numeric; ht numeric; tt numeric;
BEGIN
  IF coalesce(_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  SELECT * INTO q FROM ent_crm_quotes WHERE id = _quote;
  IF q.id IS NULL OR NOT public.fin_can_write(q.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  rt := public.fin_quote_family_root(_quote);
  PERFORM public.fin_quote_family_lock(rt);
  SELECT * INTO p FROM fin_progress_plans WHERE company_id = q.company_id AND create_key = _key;
  IF p.id IS NOT NULL THEN
    IF p.quote_id <> _quote THEN RAISE EXCEPTION 'Clé déjà utilisée pour une autre soumission' USING ERRCODE = 'P0409'; END IF;
    RETURN jsonb_build_object('plan_id', p.id, 'already', true);
  END IF;
  SELECT * INTO p FROM fin_progress_plans WHERE quote_id = _quote;
  IF p.id IS NOT NULL THEN RETURN jsonb_build_object('plan_id', p.id, 'already', true); END IF;
  SELECT * INTO p FROM fin_progress_plans WHERE quote_id IN (SELECT public.fin_quote_family(rt)) LIMIT 1;
  IF p.id IS NOT NULL THEN RETURN jsonb_build_object('conflict', 'family_plan', 'plan_id', p.id,
    'message', 'Une autre version de cette soumission a déjà un dossier de facturation progressive : ouvrez-le. Avenant contrôlé à venir (FIN-09B2).'); END IF;
  IF q.status <> 'acceptee' THEN RAISE EXCEPTION 'Seule une soumission acceptée peut être facturée'; END IF;
  SELECT id INTO inv FROM fin_invoices WHERE quote_id = _quote;
  IF inv IS NOT NULL THEN RETURN jsonb_build_object('conflict', 'invoice', 'invoice_id', inv); END IF;
  SELECT id INTO inv FROM fin_invoices WHERE quote_id IN (SELECT public.fin_quote_family(rt)) LIMIT 1;
  IF inv IS NOT NULL THEN RETURN jsonb_build_object('conflict', 'invoice', 'invoice_id', inv, 'family', true,
    'message', 'Une autre version de cette soumission est déjà facturée : ouvrez cette facture. Avenant contrôlé à venir (FIN-09B2).'); END IF;
  sn := q.tax_snapshot;
  IF NOT coalesce((sn->>'final')::boolean, false) OR NOT coalesce((sn->>'resolved')::boolean, false) THEN RAISE EXCEPTION 'Soumission sans taxes figées : facturation progressive impossible'; END IF;
  -- Source admissible : montants figés numériques finis, non négatifs et cohérents; lignes finies.
  FOREACH f IN ARRAY ARRAY['taxable_base','zero_rated_base','exempt_base','gst','qst','pre_tax','total','gst_rate','qst_rate'] LOOP
    IF NOT public.fin_json_num_ok(sn->f, f IN ('gst_rate','qst_rate')) THEN RAISE EXCEPTION 'Soumission inadmissible : montant figé « % » non numérique ou infini', f USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF coalesce((sn->>'undetermined')::numeric, 0) <> 0 THEN RAISE EXCEPTION 'Soumission inadmissible : ligne au traitement fiscal à déterminer' USING ERRCODE = '22023'; END IF;
  bt := (sn->>'taxable_base')::numeric; bz := (sn->>'zero_rated_base')::numeric; be := (sn->>'exempt_base')::numeric;
  g := (sn->>'gst')::numeric; qq := (sn->>'qst')::numeric; ht := (sn->>'pre_tax')::numeric; tt := (sn->>'total')::numeric;
  IF least(bt, bz, be, g, qq) < 0 OR ht <= 0 THEN RAISE EXCEPTION 'Soumission inadmissible : montant négatif ou contrat nul' USING ERRCODE = '22023'; END IF;
  IF bt + bz + be <> ht OR ht + g + qq <> tt THEN RAISE EXCEPTION 'Soumission inadmissible : montants figés incohérents' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(q.lines) IS DISTINCT FROM 'array' OR jsonb_array_length(q.lines) = 0 THEN RAISE EXCEPTION 'Soumission inadmissible : aucune ligne' USING ERRCODE = '22023'; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(q.lines) LOOP
    IF jsonb_typeof(l) <> 'object' THEN RAISE EXCEPTION 'Soumission inadmissible : ligne illisible' USING ERRCODE = '22023'; END IF;
    IF coalesce(l->>'qty','') = '' AND coalesce(l->>'price','') = '' THEN CONTINUE; END IF;
    IF NOT public.fin_json_num_ok(l->'qty') OR NOT public.fin_json_num_ok(l->'price') OR NOT public.fin_json_num_ok(l->'disc_pct', true) THEN
      RAISE EXCEPTION 'Soumission inadmissible : quantité, prix ou remise non numérique ou infini' USING ERRCODE = '22023'; END IF;
    IF (l->>'qty')::numeric < 0 OR (l->>'price')::numeric < 0 OR coalesce(nullif(l->>'disc_pct','')::numeric, 0) NOT BETWEEN 0 AND 100 THEN
      RAISE EXCEPTION 'Soumission inadmissible : quantité, prix ou remise hors limites' USING ERRCODE = '22023'; END IF;
  END LOOP;
  IF q.client_id IS NULL OR NOT EXISTS (SELECT 1 FROM ent_crm_clients WHERE id = q.client_id AND company_id = q.company_id) THEN RAISE EXCEPTION 'Client de la soumission requis (même entreprise)'; END IF;
  INSERT INTO fin_progress_plans (company_id, quote_id, client_id, source, contract, create_key)
  VALUES (q.company_id, q.id, q.client_id,
    jsonb_build_object('number', q.number, 'version', q.version, 'lines', q.lines, 'prices_include_tax', q.prices_include_tax, 'tax_snapshot', sn, 'conditions', q.conditions),
    jsonb_build_object('bt', bt, 'bz', bz, 'be', be, 'gst', g, 'qst', qq, 'ht', ht, 'total', tt,
      'gst_rate', sn->'gst_rate', 'qst_rate', sn->'qst_rate', 'gst_status', sn->>'gst_status', 'qst_status', sn->>'qst_status', 'prices_include_tax', q.prices_include_tax),
    _key)
  RETURNING * INTO p;
  RETURN jsonb_build_object('plan_id', p.id, 'already', false);
END $$;

CREATE OR REPLACE FUNCTION public.fin_progress_for_quote(_quote uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q ent_crm_quotes; rt uuid;
BEGIN
  SELECT * INTO q FROM ent_crm_quotes WHERE id = _quote;
  IF q.id IS NULL OR NOT public.fin_can_read(q.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  rt := public.fin_quote_family_root(_quote);
  RETURN jsonb_build_object(
    'plan_id', coalesce((SELECT id FROM fin_progress_plans WHERE quote_id = _quote), (SELECT id FROM fin_progress_plans WHERE quote_id IN (SELECT public.fin_quote_family(rt)) LIMIT 1)),
    'invoice_id', coalesce((SELECT id FROM fin_invoices WHERE quote_id = _quote), (SELECT id FROM fin_invoices WHERE quote_id IN (SELECT public.fin_quote_family(rt)) ORDER BY created_at LIMIT 1)),
    'family', NOT EXISTS (SELECT 1 FROM fin_progress_plans WHERE quote_id = _quote) AND NOT EXISTS (SELECT 1 FROM fin_invoices WHERE quote_id = _quote));
END $$;

-- Empreinte structurée de la saisie (NULL distingués).
CREATE OR REPLACE FUNCTION public.fin_progress_input_hash(_kind text, _mode text, _value text, _issue date, _due date) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT md5(jsonb_build_object('kind', _kind, 'mode', _mode, 'value', _value, 'issue_date', _issue, 'due_date', _due)::text)
$$;

CREATE OR REPLACE FUNCTION public.fin_progress_draft_save(_plan uuid, _draft_key text, _kind text, _mode text, _value text, _issue_date date, _due_date date, _base_rev integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p fin_progress_plans; s fin_progress_situations; ih text; comp jsonb;
BEGIN
  SELECT * INTO p FROM fin_progress_plans WHERE id = _plan FOR UPDATE;
  IF p.id IS NULL OR NOT public.fin_can_write(p.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_draft_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  IF _kind = 'solde' THEN _mode := 'pct'; _value := '100'; END IF;
  ih := public.fin_progress_input_hash(_kind, _mode, _value, _issue_date, _due_date);
  SELECT * INTO s FROM fin_progress_situations WHERE company_id = p.company_id AND draft_key = _draft_key FOR UPDATE;
  IF s.id IS NOT NULL THEN
    IF s.plan_id <> _plan THEN RAISE EXCEPTION 'Clé déjà utilisée sur un autre dossier' USING ERRCODE = 'P0409'; END IF;
    -- Rejeu exact : même contenu ET réponse à la même révision de base (ou révision résultante).
    IF s.input_hash = ih AND (_base_rev IS NOT DISTINCT FROM s.rev OR _base_rev IS NOT DISTINCT FROM s.rev - 1 OR (_base_rev IS NULL AND s.rev = 1)) THEN RETURN to_jsonb(s); END IF;
    IF s.status <> 'brouillon' THEN RAISE EXCEPTION 'Brouillon déjà émis ou abandonné : clé réutilisée avec un autre contenu' USING ERRCODE = 'P0409'; END IF;
    IF _base_rev IS DISTINCT FROM s.rev THEN RAISE EXCEPTION 'Brouillon modifié ailleurs : rechargez-le' USING ERRCODE = 'P0409'; END IF;
    PERFORM public.fin_progress_check_dates(_plan, _issue_date, _due_date);
    comp := public.fin_progress_compute(_plan, _kind, _mode, _value, _issue_date);
    UPDATE fin_progress_situations SET kind = _kind, mode = _mode, value = _value, issue_date = _issue_date, due_date = _due_date,
      computed = comp, input_hash = ih, hash = md5(ih || comp::text), rev = rev + 1 WHERE id = s.id RETURNING * INTO s;
    RETURN to_jsonb(s);
  END IF;
  IF _base_rev IS NOT NULL THEN RAISE EXCEPTION 'Brouillon introuvable pour cette révision' USING ERRCODE = 'P0409'; END IF;
  IF EXISTS (SELECT 1 FROM fin_progress_situations WHERE plan_id = _plan AND status = 'brouillon') THEN
    RAISE EXCEPTION 'Un brouillon de situation existe déjà : reprenez-le ou abandonnez-le';
  END IF;
  PERFORM public.fin_progress_check_dates(_plan, _issue_date, _due_date);
  comp := public.fin_progress_compute(_plan, _kind, _mode, _value, _issue_date);
  INSERT INTO fin_progress_situations (plan_id, company_id, kind, mode, value, issue_date, due_date, computed, input_hash, hash, draft_key)
  VALUES (_plan, p.company_id, _kind, _mode, _value, _issue_date, _due_date, comp, ih, md5(ih || comp::text), _draft_key) RETURNING * INTO s;
  RETURN to_jsonb(s);
END $$;

-- Abandon : révision + empreinte attendues; rejeu exact (clé, motif, révision, empreinte) accepté; ancienne signature retirée.
DROP FUNCTION IF EXISTS public.fin_progress_abandon(uuid, text, text);
CREATE OR REPLACE FUNCTION public.fin_progress_abandon(_situation uuid, _key text, _reason text, _expect_rev integer, _expect_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; cid uuid; s fin_progress_situations;
BEGIN
  SELECT plan_id, company_id INTO pid, cid FROM fin_progress_situations WHERE id = _situation;
  IF pid IS NULL OR NOT public.fin_can_write(cid) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' OR coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif d''abandon requis' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM fin_progress_plans WHERE id = pid FOR UPDATE;
  SELECT * INTO s FROM fin_progress_situations WHERE id = _situation FOR UPDATE;
  IF s.status = 'abandonnee' AND s.abandon_key = _key THEN
    IF s.abandon_reason <> btrim(_reason) OR s.rev IS DISTINCT FROM _expect_rev OR s.hash IS DISTINCT FROM _expect_hash THEN
      RAISE EXCEPTION 'Même clé, contenu différent' USING ERRCODE = 'P0409'; END IF;
    RETURN to_jsonb(s);
  END IF;
  IF EXISTS (SELECT 1 FROM fin_progress_situations WHERE company_id = cid AND abandon_key = _key) THEN RAISE EXCEPTION 'Clé déjà utilisée' USING ERRCODE = 'P0409'; END IF;
  IF s.status <> 'brouillon' THEN RAISE EXCEPTION 'Seul un brouillon peut être abandonné' USING ERRCODE = 'P0409'; END IF;
  IF s.rev IS DISTINCT FROM _expect_rev OR s.hash IS DISTINCT FROM _expect_hash THEN
    RAISE EXCEPTION 'Brouillon modifié ailleurs depuis son affichage : rechargez-le avant de l''abandonner' USING ERRCODE = 'P0409'; END IF;
  UPDATE fin_progress_situations SET status = 'abandonnee', abandon_key = _key, abandon_reason = btrim(_reason), abandoned_at = now(), abandoned_by = auth.uid()
  WHERE id = s.id RETURNING * INTO s;
  RETURN to_jsonb(s);
END $$;
REVOKE ALL ON FUNCTION public.fin_progress_abandon(uuid, text, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_progress_abandon(uuid, text, text, integer, text) TO authenticated;