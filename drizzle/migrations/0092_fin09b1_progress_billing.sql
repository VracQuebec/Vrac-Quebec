-- FIN-09B1 — Acomptes et facturation progressive cumulative (% ou montant HT) depuis une soumission acceptée.
-- Ordre des verrous : dossier/source (verrou consultatif soumission puis ligne du dossier) → situation → facture → paramètres de numérotation.

CREATE TABLE public.fin_progress_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.ent_crm_quotes(id),
  client_id uuid NOT NULL REFERENCES public.ent_crm_clients(id),
  source jsonb NOT NULL,
  contract jsonb NOT NULL,
  create_key text NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fin_progress_plans_quote_uq ON public.fin_progress_plans(quote_id);
CREATE UNIQUE INDEX fin_progress_plans_key_uq ON public.fin_progress_plans(company_id, create_key);
GRANT SELECT ON public.fin_progress_plans TO authenticated;
GRANT ALL ON public.fin_progress_plans TO service_role;
ALTER TABLE public.fin_progress_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "r" ON public.fin_progress_plans FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_progress_situations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.fin_progress_plans(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  seq integer,
  kind text NOT NULL CHECK (kind IN ('acompte','situation','solde')),
  mode text NOT NULL CHECK (mode IN ('pct','amount')),
  value text NOT NULL,
  issue_date date, due_date date,
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','emise','abandonnee')),
  computed jsonb NOT NULL,
  input_hash text NOT NULL, hash text NOT NULL, rev integer NOT NULL DEFAULT 1,
  draft_key text NOT NULL, issue_key text, abandon_key text, abandon_reason text,
  invoice_id uuid REFERENCES public.fin_invoices(id),
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  issued_at timestamptz, issued_by uuid, abandoned_at timestamptz, abandoned_by uuid
);
CREATE UNIQUE INDEX fin_progress_sit_draft_uq ON public.fin_progress_situations(plan_id) WHERE status = 'brouillon';
CREATE UNIQUE INDEX fin_progress_sit_dkey_uq ON public.fin_progress_situations(company_id, draft_key);
CREATE UNIQUE INDEX fin_progress_sit_ikey_uq ON public.fin_progress_situations(company_id, issue_key) WHERE issue_key IS NOT NULL;
CREATE UNIQUE INDEX fin_progress_sit_akey_uq ON public.fin_progress_situations(company_id, abandon_key) WHERE abandon_key IS NOT NULL;
CREATE UNIQUE INDEX fin_progress_sit_inv_uq ON public.fin_progress_situations(invoice_id) WHERE invoice_id IS NOT NULL;
GRANT SELECT ON public.fin_progress_situations TO authenticated;
GRANT ALL ON public.fin_progress_situations TO service_role;
ALTER TABLE public.fin_progress_situations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "r" ON public.fin_progress_situations FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

ALTER TABLE public.fin_invoices ADD COLUMN IF NOT EXISTS progress_situation_id uuid REFERENCES public.fin_progress_situations(id);
CREATE UNIQUE INDEX IF NOT EXISTS fin_invoices_progress_uq ON public.fin_invoices(progress_situation_id) WHERE progress_situation_id IS NOT NULL;

-- Garde factures : quote_id / progress_situation_id posés seulement par les RPC autorisées (rejet avant tout verrou).
CREATE OR REPLACE FUNCTION public.fin_invoice_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s ent_crm_settings; r jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'brouillon' THEN RAISE EXCEPTION 'Facture émise : suppression impossible (une note de crédit sera requise)'; END IF;
    RETURN OLD;
  END IF;
  IF coalesce(current_setting('fin.progress', true),'') <> 'on' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.progress_situation_id IS NOT NULL THEN RAISE EXCEPTION 'Facture progressive : émission par le dossier de facturation seulement'; END IF;
      IF NEW.quote_id IS NOT NULL AND coalesce(current_setting('fin.from_quote', true),'') <> 'on' THEN RAISE EXCEPTION 'Lien soumission : par « Créer la facture » seulement'; END IF;
    ELSE
      IF NEW.progress_situation_id IS DISTINCT FROM OLD.progress_situation_id THEN RAISE EXCEPTION 'Lien de situation progressive non modifiable'; END IF;
      IF NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN RAISE EXCEPTION 'Lien soumission non modifiable'; END IF;
    END IF;
  END IF;
  IF current_setting('fin.invoice_issue', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.company_id IS DISTINCT FROM (CASE WHEN TG_OP='UPDATE' THEN OLD.company_id ELSE NEW.company_id END) THEN RAISE EXCEPTION 'Entreprise non modifiable'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'emise' THEN
    IF (to_jsonb(NEW) - 'sent_at' - 'sent_note' - 'pdf_path' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'sent_at' - 'sent_note' - 'pdf_path' - 'updated_at') THEN
      RAISE EXCEPTION 'Facture émise : non modifiable (une note de crédit sera requise)';
    END IF;
    IF OLD.pdf_path IS NOT NULL AND NEW.pdf_path IS DISTINCT FROM OLD.pdf_path THEN RAISE EXCEPTION 'PDF figé'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.status <> 'brouillon' THEN RAISE EXCEPTION 'Émission : utilisez l''action « Émettre »'; END IF;
  NEW.number := NULL; NEW.seq := NULL; NEW.seller_snapshot := NULL; NEW.client_snapshot := NULL; NEW.template_snapshot := NULL;
  NEW.issued_at := NULL; NEW.issued_by := NULL; NEW.sent_at := NULL; NEW.pdf_path := NULL; NEW.expected_inflow_id := NULL;
  IF NEW.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ent_crm_clients WHERE id = NEW.client_id AND company_id = NEW.company_id) THEN RAISE EXCEPTION 'Client d''une autre entreprise'; END IF;
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ent_crm_projects WHERE id = NEW.project_id AND company_id = NEW.company_id) THEN RAISE EXCEPTION 'Chantier d''une autre entreprise'; END IF;
  IF NEW.quote_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ent_crm_quotes WHERE id = NEW.quote_id AND company_id = NEW.company_id) THEN RAISE EXCEPTION 'Soumission d''une autre entreprise'; END IF;
  SELECT * INTO s FROM ent_crm_settings WHERE company_id = NEW.company_id;
  r := public.fin_tax_compute(NEW.lines, NEW.prices_include_tax, coalesce(s.gst_status,'a_completer'), coalesce(s.qst_status,'a_completer'), coalesce(NEW.issue_date, (now() AT TIME ZONE 'America/Toronto')::date));
  NEW.tax_snapshot := r || jsonb_build_object('final', false);
  NEW.subtotal := coalesce((r->>'pre_tax')::numeric, (r->>'subtotal')::numeric - (r->>'discount')::numeric);
  NEW.total := (r->>'total')::numeric;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Conversion entière : même verrou que la création d'un dossier progressif; refusée si un dossier existe.
CREATE OR REPLACE FUNCTION public.fin_invoice_from_quote(_quote_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q ent_crm_quotes; c ent_crm_clients; v uuid;
BEGIN
  SELECT * INTO q FROM ent_crm_quotes WHERE id = _quote_id;
  IF q.id IS NULL OR NOT public.fin_can_write(q.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF q.status <> 'acceptee' THEN RAISE EXCEPTION 'Seule une soumission acceptée peut être facturée'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fin_inv_quote:' || _quote_id::text));
  IF EXISTS (SELECT 1 FROM fin_progress_plans WHERE quote_id = _quote_id) THEN
    RAISE EXCEPTION 'Facturation progressive en cours pour cette soumission : ouvrez son dossier dans Finances → Factures';
  END IF;
  SELECT id INTO v FROM fin_invoices WHERE quote_id = _quote_id;
  IF v IS NOT NULL THEN RETURN v; END IF;
  SELECT * INTO c FROM ent_crm_clients WHERE id = q.client_id;
  PERFORM set_config('fin.from_quote', 'on', true);
  INSERT INTO fin_invoices (company_id, quote_id, client_id, client_name, client_email, client_phone, client_address, lines, prices_include_tax, terms, created_by)
  VALUES (q.company_id, q.id, q.client_id, c.name, c.email, c.phone, NULL, q.lines, q.prices_include_tax, q.conditions, auth.uid())
  RETURNING id INTO v;
  PERFORM set_config('fin.from_quote', '', true);
  RETURN v;
END $$;

-- Calcul interne : parts cumulatives par traitement et par taxe (différence après − avant), résidus exacts au solde.
CREATE OR REPLACE FUNCTION public.fin_progress_compute(_plan uuid, _kind text, _mode text, _value text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c jsonb; v numeric; cc numeric; x numeric;
  bt numeric; bz numeric; be numeric; g numeric; q numeric;
  cbt numeric; cbz numeric; cbe numeric; cg numeric; cq numeric; diff numeric;
  pbt numeric; pbz numeric; pbe numeric; pg numeric; pq numeric; prev numeric;
BEGIN
  SELECT contract INTO c FROM fin_progress_plans WHERE id = _plan;
  IF c IS NULL THEN RAISE EXCEPTION 'Dossier introuvable'; END IF;
  bt := (c->>'bt')::numeric; bz := (c->>'bz')::numeric; be := (c->>'be')::numeric; g := (c->>'gst')::numeric; q := (c->>'qst')::numeric;
  cc := bt + bz + be;
  IF _kind IS NULL OR _kind NOT IN ('acompte','situation','solde') THEN RAISE EXCEPTION 'Type inconnu' USING ERRCODE = '22023'; END IF;
  IF _kind = 'solde' THEN x := cc;
  ELSE
    IF _mode IS NULL OR _mode NOT IN ('pct','amount') THEN RAISE EXCEPTION 'Mode inconnu' USING ERRCODE = '22023'; END IF;
    IF coalesce(_value,'') !~ '^\d{1,12}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'Cumul invalide : nombre positif, au plus 2 décimales' USING ERRCODE = '22023'; END IF;
    v := _value::numeric;
    IF v <= 0 THEN RAISE EXCEPTION 'Cumul invalide : doit être supérieur à zéro' USING ERRCODE = '22023'; END IF;
    IF _mode = 'pct' AND v > 100 THEN RAISE EXCEPTION 'Cumul supérieur à 100 %% du contrat' USING ERRCODE = '22023'; END IF;
    x := CASE WHEN _mode = 'pct' THEN round(cc * v / 100, 2) ELSE v END;
    IF x > cc THEN RAISE EXCEPTION 'Cumul supérieur au contrat approuvé (% HT)', cc USING ERRCODE = '22023'; END IF;
    IF x = cc THEN RAISE EXCEPTION 'Ce cumul atteint le contrat : choisissez « solde final »' USING ERRCODE = '22023'; END IF;
  END IF;
  SELECT coalesce(sum((computed->'new'->>'bt')::numeric),0), coalesce(sum((computed->'new'->>'bz')::numeric),0), coalesce(sum((computed->'new'->>'be')::numeric),0),
         coalesce(sum((computed->'new'->>'gst')::numeric),0), coalesce(sum((computed->'new'->>'qst')::numeric),0)
    INTO pbt, pbz, pbe, pg, pq FROM fin_progress_situations WHERE plan_id = _plan AND status = 'emise';
  prev := pbt + pbz + pbe;
  IF x <= prev THEN RAISE EXCEPTION 'Le cumul (% HT) doit dépasser le cumul déjà facturé (% HT)', x, prev USING ERRCODE = '22023'; END IF;
  IF x = cc THEN cbt := bt; cbz := bz; cbe := be;
  ELSE
    cbt := round(bt * x / cc, 2); cbz := round(bz * x / cc, 2); cbe := round(be * x / cc, 2);
    diff := x - cbt - cbz - cbe; -- écart d'arrondi (au plus quelques cents) attribué au plus grand traitement
    IF diff <> 0 THEN
      IF bt >= bz AND bt >= be THEN cbt := cbt + diff; ELSIF bz >= be THEN cbz := cbz + diff; ELSE cbe := cbe + diff; END IF;
    END IF;
  END IF;
  cg := CASE WHEN bt = 0 THEN 0 WHEN cbt = bt THEN g ELSE round(g * cbt / bt, 2) END;
  cq := CASE WHEN bt = 0 THEN 0 WHEN cbt = bt THEN q ELSE round(q * cbt / bt, 2) END;
  IF cbt < pbt OR cbz < pbz OR cbe < pbe OR cg < pg OR cq < pq OR cbt > bt OR cbz > bz OR cbe > be THEN
    RAISE EXCEPTION 'Arrondi : ce cumul produirait une part négative; augmentez légèrement le cumul' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'contract', jsonb_build_object('bt', bt, 'bz', bz, 'be', be, 'gst', g, 'qst', q, 'ht', cc, 'total', cc + g + q),
    'prev', jsonb_build_object('bt', pbt, 'bz', pbz, 'be', pbe, 'gst', pg, 'qst', pq, 'ht', prev, 'total', prev + pg + pq),
    'cum', jsonb_build_object('bt', cbt, 'bz', cbz, 'be', cbe, 'gst', cg, 'qst', cq, 'ht', x, 'total', x + cg + cq, 'pct', round(x * 100 / cc, 2)),
    'new', jsonb_build_object('bt', cbt - pbt, 'bz', cbz - pbz, 'be', cbe - pbe, 'gst', cg - pg, 'qst', cq - pq, 'ht', x - prev, 'total', (x - prev) + (cg - pg) + (cq - pq)),
    'remaining', jsonb_build_object('ht', cc - x, 'total', (cc + g + q) - (x + cg + cq)));
END $$;
REVOKE ALL ON FUNCTION public.fin_progress_compute(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_progress_check_dates(_plan uuid, _d date, _due date) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE last date; today date := (now() AT TIME ZONE 'America/Toronto')::date;
BEGIN
  IF _d IS NULL THEN RAISE EXCEPTION 'Date de facture requise' USING ERRCODE = '22023'; END IF;
  IF _d > today THEN RAISE EXCEPTION 'Date de facture future refusée' USING ERRCODE = '22023'; END IF;
  SELECT max(issue_date) INTO last FROM fin_progress_situations WHERE plan_id = _plan AND status = 'emise';
  IF last IS NOT NULL AND _d < last THEN RAISE EXCEPTION 'Date antérieure à la situation précédente (%)', last USING ERRCODE = '22023'; END IF;
  IF _due IS NOT NULL AND _due < _d THEN RAISE EXCEPTION 'Échéance antérieure à la date de facture' USING ERRCODE = '22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.fin_progress_check_dates(uuid, date, date) FROM PUBLIC, anon, authenticated;

-- Création du dossier (un seul par soumission acceptée; refus si une facture ordinaire existe).
CREATE OR REPLACE FUNCTION public.fin_progress_plan_create(_quote uuid, _key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q ent_crm_quotes; p fin_progress_plans; inv uuid; sn jsonb;
BEGIN
  IF coalesce(_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  SELECT * INTO q FROM ent_crm_quotes WHERE id = _quote;
  IF q.id IS NULL OR NOT public.fin_can_write(q.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fin_inv_quote:' || _quote::text));
  SELECT * INTO p FROM fin_progress_plans WHERE company_id = q.company_id AND create_key = _key;
  IF p.id IS NOT NULL THEN
    IF p.quote_id <> _quote THEN RAISE EXCEPTION 'Clé déjà utilisée pour une autre soumission' USING ERRCODE = 'P0409'; END IF;
    RETURN jsonb_build_object('plan_id', p.id, 'already', true);
  END IF;
  SELECT * INTO p FROM fin_progress_plans WHERE quote_id = _quote;
  IF p.id IS NOT NULL THEN RETURN jsonb_build_object('plan_id', p.id, 'already', true); END IF;
  IF q.status <> 'acceptee' THEN RAISE EXCEPTION 'Seule une soumission acceptée peut être facturée'; END IF;
  SELECT id INTO inv FROM fin_invoices WHERE quote_id = _quote;
  IF inv IS NOT NULL THEN RETURN jsonb_build_object('conflict', 'invoice', 'invoice_id', inv); END IF;
  sn := q.tax_snapshot;
  IF NOT coalesce((sn->>'final')::boolean, false) OR NOT coalesce((sn->>'resolved')::boolean, false) THEN RAISE EXCEPTION 'Soumission sans taxes figées : facturation progressive impossible'; END IF;
  IF coalesce((sn->>'pre_tax')::numeric, 0) <= 0 THEN RAISE EXCEPTION 'Montant du contrat nul'; END IF;
  IF q.client_id IS NULL OR NOT EXISTS (SELECT 1 FROM ent_crm_clients WHERE id = q.client_id AND company_id = q.company_id) THEN RAISE EXCEPTION 'Client de la soumission requis (même entreprise)'; END IF;
  INSERT INTO fin_progress_plans (company_id, quote_id, client_id, source, contract, create_key)
  VALUES (q.company_id, q.id, q.client_id,
    jsonb_build_object('number', q.number, 'version', q.version, 'lines', q.lines, 'prices_include_tax', q.prices_include_tax, 'tax_snapshot', sn, 'conditions', q.conditions),
    jsonb_build_object('bt', (sn->>'taxable_base')::numeric, 'bz', (sn->>'zero_rated_base')::numeric, 'be', (sn->>'exempt_base')::numeric,
      'gst', (sn->>'gst')::numeric, 'qst', (sn->>'qst')::numeric, 'ht', (sn->>'pre_tax')::numeric, 'total', (sn->>'total')::numeric,
      'gst_rate', sn->'gst_rate', 'qst_rate', sn->'qst_rate', 'gst_status', sn->>'gst_status', 'qst_status', sn->>'qst_status', 'prices_include_tax', q.prices_include_tax),
    _key)
  RETURNING * INTO p;
  RETURN jsonb_build_object('plan_id', p.id, 'already', false);
END $$;
REVOKE ALL ON FUNCTION public.fin_progress_plan_create(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_progress_plan_create(uuid, text) TO authenticated;

-- Brouillon de situation (un seul actif par dossier). Aperçu serveur, aucune facture ni numéro.
CREATE OR REPLACE FUNCTION public.fin_progress_draft_save(_plan uuid, _draft_key text, _kind text, _mode text, _value text, _issue_date date, _due_date date, _base_rev integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p fin_progress_plans; s fin_progress_situations; ih text; comp jsonb;
BEGIN
  SELECT * INTO p FROM fin_progress_plans WHERE id = _plan FOR UPDATE;
  IF p.id IS NULL OR NOT public.fin_can_write(p.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_draft_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  IF _kind = 'solde' THEN _mode := 'pct'; _value := '100'; END IF;
  ih := md5(concat_ws('|', _kind, _mode, _value, _issue_date, _due_date));
  SELECT * INTO s FROM fin_progress_situations WHERE company_id = p.company_id AND draft_key = _draft_key FOR UPDATE;
  IF s.id IS NOT NULL THEN
    IF s.plan_id <> _plan THEN RAISE EXCEPTION 'Clé déjà utilisée sur un autre dossier' USING ERRCODE = 'P0409'; END IF;
    IF s.input_hash = ih THEN RETURN to_jsonb(s); END IF;
    IF s.status <> 'brouillon' THEN RAISE EXCEPTION 'Brouillon déjà émis ou abandonné : clé réutilisée avec un autre contenu' USING ERRCODE = 'P0409'; END IF;
    IF _base_rev IS DISTINCT FROM s.rev THEN RAISE EXCEPTION 'Brouillon modifié ailleurs : rechargez-le' USING ERRCODE = 'P0409'; END IF;
    PERFORM public.fin_progress_check_dates(_plan, _issue_date, _due_date);
    comp := public.fin_progress_compute(_plan, _kind, _mode, _value);
    UPDATE fin_progress_situations SET kind = _kind, mode = _mode, value = _value, issue_date = _issue_date, due_date = _due_date,
      computed = comp, input_hash = ih, hash = md5(ih || comp::text), rev = rev + 1 WHERE id = s.id RETURNING * INTO s;
    RETURN to_jsonb(s);
  END IF;
  IF _base_rev IS NOT NULL THEN RAISE EXCEPTION 'Brouillon introuvable pour cette révision' USING ERRCODE = 'P0409'; END IF;
  IF EXISTS (SELECT 1 FROM fin_progress_situations WHERE plan_id = _plan AND status = 'brouillon') THEN
    RAISE EXCEPTION 'Un brouillon de situation existe déjà : reprenez-le ou abandonnez-le';
  END IF;
  PERFORM public.fin_progress_check_dates(_plan, _issue_date, _due_date);
  comp := public.fin_progress_compute(_plan, _kind, _mode, _value);
  INSERT INTO fin_progress_situations (plan_id, company_id, kind, mode, value, issue_date, due_date, computed, input_hash, hash, draft_key)
  VALUES (_plan, p.company_id, _kind, _mode, _value, _issue_date, _due_date, comp, ih, md5(ih || comp::text), _draft_key) RETURNING * INTO s;
  RETURN to_jsonb(s);
END $$;
REVOKE ALL ON FUNCTION public.fin_progress_draft_save(uuid, text, text, text, text, date, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_progress_draft_save(uuid, text, text, text, text, date, date, integer) TO authenticated;

-- Abandon traçable (libère la réservation; aucune suppression).
CREATE OR REPLACE FUNCTION public.fin_progress_abandon(_situation uuid, _key text, _reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; cid uuid; s fin_progress_situations;
BEGIN
  SELECT plan_id, company_id INTO pid, cid FROM fin_progress_situations WHERE id = _situation;
  IF pid IS NULL OR NOT public.fin_can_write(cid) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' OR coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif d''abandon requis' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM fin_progress_plans WHERE id = pid FOR UPDATE;
  SELECT * INTO s FROM fin_progress_situations WHERE id = _situation FOR UPDATE;
  IF s.status = 'abandonnee' AND s.abandon_key = _key THEN
    IF s.abandon_reason <> btrim(_reason) THEN RAISE EXCEPTION 'Même clé, motif différent' USING ERRCODE = 'P0409'; END IF;
    RETURN to_jsonb(s);
  END IF;
  IF EXISTS (SELECT 1 FROM fin_progress_situations WHERE company_id = cid AND abandon_key = _key AND id <> _situation) THEN RAISE EXCEPTION 'Clé déjà utilisée' USING ERRCODE = 'P0409'; END IF;
  IF s.status <> 'brouillon' THEN RAISE EXCEPTION 'Seul un brouillon peut être abandonné' USING ERRCODE = 'P0409'; END IF;
  UPDATE fin_progress_situations SET status = 'abandonnee', abandon_key = _key, abandon_reason = btrim(_reason), abandoned_at = now(), abandoned_by = auth.uid()
  WHERE id = s.id RETURNING * INTO s;
  RETURN to_jsonb(s);
END $$;
REVOKE ALL ON FUNCTION public.fin_progress_abandon(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_progress_abandon(uuid, text, text) TO authenticated;

-- Émission : revalide tout au serveur, crée et fige une vraie facture avec sa seule entrée attendue.
CREATE OR REPLACE FUNCTION public.fin_progress_issue(_situation uuid, _issue_key text, _expect_rev integer, _expect_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; cid uuid; p fin_progress_plans; s fin_progress_situations; comp jsonb; cs ent_crm_settings; rn jsonb; c ent_crm_clients;
  st fin_invoice_settings; co jsc_companies; n integer; num text; inv uuid; inf uuid; k integer; nw jsonb; lines jsonb := '[]'::jsonb; lbl text; prevs jsonb; ct jsonb; tax jsonb;
BEGIN
  SELECT plan_id, company_id INTO pid, cid FROM fin_progress_situations WHERE id = _situation;
  IF pid IS NULL OR NOT public.fin_can_write(cid) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_issue_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM fin_progress_plans WHERE id = pid FOR UPDATE;
  SELECT * INTO s FROM fin_progress_situations WHERE id = _situation FOR UPDATE;
  IF s.status = 'emise' THEN
    IF s.issue_key = _issue_key THEN RETURN jsonb_build_object('invoice_id', s.invoice_id, 'number', (SELECT number FROM fin_invoices WHERE id = s.invoice_id), 'already', true); END IF;
    RAISE EXCEPTION 'Situation déjà émise avec une autre clé' USING ERRCODE = 'P0409';
  END IF;
  IF s.status <> 'brouillon' THEN RAISE EXCEPTION 'Brouillon abandonné : émission impossible' USING ERRCODE = 'P0409'; END IF;
  IF EXISTS (SELECT 1 FROM fin_progress_situations WHERE company_id = cid AND issue_key = _issue_key) THEN RAISE EXCEPTION 'Clé déjà utilisée' USING ERRCODE = 'P0409'; END IF;
  IF s.rev IS DISTINCT FROM _expect_rev OR s.hash IS DISTINCT FROM _expect_hash THEN RAISE EXCEPTION 'Brouillon modifié depuis l''aperçu : refaites l''aperçu' USING ERRCODE = 'P0409'; END IF;
  PERFORM public.fin_progress_check_dates(pid, s.issue_date, s.due_date);
  comp := public.fin_progress_compute(pid, s.kind, s.mode, s.value);
  IF comp IS DISTINCT FROM s.computed THEN RAISE EXCEPTION 'Montants changés depuis l''aperçu : refaites l''aperçu' USING ERRCODE = 'P0409'; END IF;
  -- Aucun ancien taux appliqué silencieusement : profil et taux à la date de facture = contrat figé, sinon refus.
  ct := p.contract;
  SELECT * INTO cs FROM ent_crm_settings WHERE company_id = cid;
  rn := public.fin_tax_compute(p.source->'lines', (p.source->>'prices_include_tax')::boolean, coalesce(cs.gst_status,'a_completer'), coalesce(cs.qst_status,'a_completer'), s.issue_date);
  IF NOT coalesce((rn->>'resolved')::boolean, false) OR rn->>'gst_status' IS DISTINCT FROM ct->>'gst_status' OR rn->>'qst_status' IS DISTINCT FROM ct->>'qst_status'
     OR (rn->>'gst_rate')::numeric IS DISTINCT FROM (ct->>'gst_rate')::numeric OR (rn->>'qst_rate')::numeric IS DISTINCT FROM (ct->>'qst_rate')::numeric
     OR (rn->>'total')::numeric IS DISTINCT FROM (ct->>'total')::numeric THEN
    RAISE EXCEPTION 'Profil fiscal ou taux à cette date différent du contrat figé : situation refusée (dossier et factures intacts). Le traitement des changements fiscaux est à venir.';
  END IF;
  SELECT * INTO c FROM ent_crm_clients WHERE id = p.client_id AND company_id = cid;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  k := (SELECT count(*) FROM fin_progress_situations WHERE plan_id = pid AND status = 'emise') + 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('seq', x.seq, 'number', i.number, 'kind', x.kind, 'ht', x.computed->'new'->'ht', 'total', x.computed->'new'->'total') ORDER BY x.seq), '[]'::jsonb)
    INTO prevs FROM fin_progress_situations x JOIN fin_invoices i ON i.id = x.invoice_id WHERE x.plan_id = pid AND x.status = 'emise';
  nw := comp->'new';
  lbl := CASE s.kind WHEN 'acompte' THEN 'Acompte' WHEN 'situation' THEN 'Situation' ELSE 'Solde final' END
    || ' n° ' || k || ' — soumission ' || coalesce(p.source->>'number','') || ' v' || coalesce(p.source->>'version','1')
    || ' — cumul ' || (comp->'cum'->>'pct') || ' % du contrat';
  IF (nw->>'bt')::numeric <> 0 THEN lines := lines || jsonb_build_object('desc', lbl || ' (part taxable)', 'qty', 1, 'unit', 'forfait', 'price', (nw->>'bt')::numeric, 'tax', 'taxable'); END IF;
  IF (nw->>'bz')::numeric <> 0 THEN lines := lines || jsonb_build_object('desc', lbl || ' (part détaxée)', 'qty', 1, 'unit', 'forfait', 'price', (nw->>'bz')::numeric, 'tax', 'detaxe'); END IF;
  IF (nw->>'be')::numeric <> 0 THEN lines := lines || jsonb_build_object('desc', lbl || ' (part exonérée)', 'qty', 1, 'unit', 'forfait', 'price', (nw->>'be')::numeric, 'tax', 'exonere'); END IF;
  tax := jsonb_build_object('version', 2, 'currency', 'CAD', 'jurisdiction', 'QC', 'computed_on', s.issue_date, 'prices_include_tax', false,
    'gst_status', ct->>'gst_status', 'qst_status', ct->>'qst_status', 'gst_rate', ct->'gst_rate', 'qst_rate', ct->'qst_rate',
    'subtotal', (nw->>'ht')::numeric, 'discount', 0, 'taxable_base', (nw->>'bt')::numeric, 'zero_rated_base', (nw->>'bz')::numeric, 'exempt_base', (nw->>'be')::numeric, 'undetermined', 0,
    'gst', (nw->>'gst')::numeric, 'qst', (nw->>'qst')::numeric, 'pre_tax', (nw->>'ht')::numeric, 'total', (nw->>'total')::numeric, 'rounding_gap', 0,
    'resolved', true, 'reasons', '[]'::jsonb, 'final', true,
    'rounding', 'Facturation progressive : parts cumulatives par traitement et par taxe (cumul arrondi au cent après − avant); la dernière facture solde les résidus exacts',
    'progress', jsonb_build_object('kind', s.kind, 'seq', k, 'mode', s.mode, 'value', s.value, 'quote_number', p.source->>'number', 'quote_version', p.source->'version',
      'contract', comp->'contract', 'prev', comp->'prev', 'cum', comp->'cum', 'new', nw, 'remaining', comp->'remaining', 'previous', prevs));
  -- Numérotation (verrou des paramètres en dernier)
  INSERT INTO fin_invoice_settings(company_id) VALUES (cid) ON CONFLICT DO NOTHING;
  SELECT * INTO st FROM fin_invoice_settings WHERE company_id = cid FOR UPDATE;
  n := st.next_number; num := st.prefix || lpad(n::text, 5, '0');
  WHILE EXISTS (SELECT 1 FROM fin_invoices WHERE company_id = cid AND number = num) LOOP n := n + 1; num := st.prefix || lpad(n::text, 5, '0'); END LOOP;
  UPDATE fin_invoice_settings SET next_number = n + 1 WHERE company_id = cid;
  SELECT * INTO co FROM jsc_companies WHERE id = cid;
  PERFORM set_config('fin.progress', 'on', true); PERFORM set_config('fin.invoice_issue', 'on', true);
  INSERT INTO fin_invoices (company_id, status, number, seq, client_id, client_name, client_email, client_phone, issue_date, due_date, terms, lines, prices_include_tax,
    tax_snapshot, subtotal, total, seller_snapshot, client_snapshot, template_snapshot, issued_at, issued_by, progress_situation_id, created_by)
  VALUES (cid, 'emise', num, n, c.id, c.name, c.email, c.phone, s.issue_date, s.due_date, p.source->>'conditions', lines, false,
    tax, (nw->>'ht')::numeric, (nw->>'total')::numeric,
    jsonb_build_object('name', co.name, 'legal_name', co.legal_name, 'address', co.address, 'phone', co.phone, 'email', co.email,
      'gst_number', CASE WHEN cs.gst_status='inscrit' THEN cs.gst_number END, 'qst_number', CASE WHEN cs.qst_status='inscrit' THEN cs.qst_number END),
    jsonb_build_object('name', c.name, 'address', NULL, 'email', c.email, 'phone', c.phone),
    jsonb_build_object('key', st.template_key, 'version', st.template_version, 'logo_path', st.logo_path, 'color', st.brand_color, 'footer', st.footer, 'custom_ref', st.custom_template_ref),
    now(), auth.uid(), s.id, auth.uid())
  RETURNING id INTO inv;
  INSERT INTO fin_expected_inflows (company_id, amount, received, expected_on, counterparty, certainty, kind, note, invoice_id)
  VALUES (cid, (nw->>'total')::numeric, 0, coalesce(s.due_date, s.issue_date), c.name, 'certain', 'revenue', 'Facture ' || num, inv) RETURNING id INTO inf;
  UPDATE fin_invoices SET expected_inflow_id = inf WHERE id = inv;
  PERFORM set_config('fin.invoice_issue', '', true); PERFORM set_config('fin.progress', '', true);
  UPDATE fin_progress_situations SET status = 'emise', seq = k, invoice_id = inv, issue_key = _issue_key, issued_at = now(), issued_by = auth.uid() WHERE id = s.id;
  RETURN jsonb_build_object('invoice_id', inv, 'number', num, 'already', false);
END $$;
REVOKE ALL ON FUNCTION public.fin_progress_issue(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_progress_issue(uuid, text, integer, text) TO authenticated;

-- Lecture : dossier, situations, factures liées (brut, avoirs, encaissé séparés).
CREATE OR REPLACE FUNCTION public.fin_progress_summary(_plan uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p fin_progress_plans; sits jsonb; billed jsonb;
BEGIN
  SELECT * INTO p FROM fin_progress_plans WHERE id = _plan;
  IF p.id IS NULL OR NOT public.fin_can_read(p.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'seq', x.seq, 'kind', x.kind, 'mode', x.mode, 'value', x.value, 'status', x.status, 'issue_date', x.issue_date, 'due_date', x.due_date,
      'computed', x.computed, 'rev', x.rev, 'hash', x.hash, 'draft_key', x.draft_key, 'abandon_reason', x.abandon_reason, 'abandoned_at', x.abandoned_at, 'created_at', x.created_at,
      'invoice_id', x.invoice_id, 'number', i.number, 'balance', CASE WHEN x.invoice_id IS NOT NULL THEN public.fin_invoice_balance(x.invoice_id) END) ORDER BY x.created_at), '[]'::jsonb)
    INTO sits FROM fin_progress_situations x LEFT JOIN fin_invoices i ON i.id = x.invoice_id WHERE x.plan_id = _plan;
  SELECT jsonb_build_object('ht', coalesce(sum((computed->'new'->>'ht')::numeric),0), 'gst', coalesce(sum((computed->'new'->>'gst')::numeric),0),
      'qst', coalesce(sum((computed->'new'->>'qst')::numeric),0), 'total', coalesce(sum((computed->'new'->>'total')::numeric),0))
    INTO billed FROM fin_progress_situations WHERE plan_id = _plan AND status = 'emise';
  RETURN jsonb_build_object('id', p.id, 'company_id', p.company_id, 'quote_id', p.quote_id, 'client_name', (SELECT name FROM ent_crm_clients WHERE id = p.client_id),
    'quote_number', p.source->>'number', 'quote_version', p.source->'version', 'contract', p.contract, 'billed', billed, 'situations', sits, 'created_at', p.created_at);
END $$;
REVOKE ALL ON FUNCTION public.fin_progress_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_progress_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_progress_list(_company uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'quote_id', p.quote_id, 'quote_number', p.source->>'number', 'quote_version', p.source->'version',
    'client_name', c.name, 'contract_total', p.contract->'total',
    'billed_total', (SELECT coalesce(sum((computed->'new'->>'total')::numeric),0) FROM fin_progress_situations WHERE plan_id = p.id AND status = 'emise'),
    'has_draft', EXISTS (SELECT 1 FROM fin_progress_situations WHERE plan_id = p.id AND status = 'brouillon')) ORDER BY p.created_at DESC), '[]'::jsonb)
    FROM fin_progress_plans p LEFT JOIN ent_crm_clients c ON c.id = p.client_id WHERE p.company_id = _company);
END $$;
REVOKE ALL ON FUNCTION public.fin_progress_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_progress_list(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_progress_for_quote(_quote uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q ent_crm_quotes;
BEGIN
  SELECT * INTO q FROM ent_crm_quotes WHERE id = _quote;
  IF q.id IS NULL OR NOT public.fin_can_read(q.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN jsonb_build_object('plan_id', (SELECT id FROM fin_progress_plans WHERE quote_id = _quote), 'invoice_id', (SELECT id FROM fin_invoices WHERE quote_id = _quote));
END $$;
REVOKE ALL ON FUNCTION public.fin_progress_for_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_progress_for_quote(uuid) TO authenticated;
