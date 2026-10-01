-- FIN-09C2B1 : retenue de construction à taxes différées — chemin PRÉPARATOIRE, factures manuelles TEST seulement.
-- Montant des taxes figé par FIN-07 à l'émission (inchangé); seule l'EXIGIBILITÉ de la TPS/TVQ sur la somme retenue
-- est suivie à part (première date de paiement/libération ou d'échéance contractuelle). Aucune certification fiscale.

ALTER TABLE public.fin_retentions DROP CONSTRAINT IF EXISTS fin_retentions_kind_check;
ALTER TABLE public.fin_retentions ADD CONSTRAINT fin_retentions_kind_check CHECK (kind IN ('taxes_exigibles','construction_differee'));
ALTER TABLE public.fin_retentions ADD COLUMN IF NOT EXISTS ctax_snapshot jsonb;
COMMENT ON COLUMN public.fin_retentions.ctax_snapshot IS 'FIN-09C2B1 : instantané immuable (règle, clause, base HT, TPS/TVQ différées) — construction_differee seulement';

CREATE TABLE public.fin_retention_tax_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  invoice_id uuid NOT NULL REFERENCES public.fin_invoices(id),
  retention_id uuid NOT NULL REFERENCES public.fin_retentions(id),
  release_id uuid REFERENCES public.fin_retention_releases(id),
  source text NOT NULL CHECK (source IN ('liberation','echeance')),
  exigible_on date NOT NULL,
  ttc numeric(14,2) NOT NULL CHECK (ttc > 0), base numeric(14,2) NOT NULL, gst numeric(14,2) NOT NULL, qst numeric(14,2) NOT NULL,
  cum_ttc numeric(14,2) NOT NULL,
  idem_key text, request_hash text,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (base + gst + qst = ttc)
);
CREATE UNIQUE INDEX fin_rte_release_uq ON public.fin_retention_tax_events(release_id) WHERE release_id IS NOT NULL;
CREATE UNIQUE INDEX fin_rte_due_uq ON public.fin_retention_tax_events(retention_id) WHERE source = 'echeance';
CREATE UNIQUE INDEX fin_rte_key_uq ON public.fin_retention_tax_events(company_id, idem_key) WHERE idem_key IS NOT NULL;
CREATE UNIQUE INDEX fin_rte_cum_uq ON public.fin_retention_tax_events(retention_id, cum_ttc);
GRANT SELECT ON public.fin_retention_tax_events TO authenticated;
GRANT ALL ON public.fin_retention_tax_events TO service_role;
ALTER TABLE public.fin_retention_tax_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_rte_read ON public.fin_retention_tax_events FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE OR REPLACE FUNCTION public.fin_ctax_alloc(_s jsonb, _cum numeric)
 RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE a numeric := (_s->>'ttc')::numeric; b numeric; g numeric;
BEGIN
  IF _cum >= a THEN RETURN jsonb_build_object('base', (_s->>'base')::numeric, 'gst', (_s->>'gst')::numeric, 'qst', (_s->>'qst')::numeric); END IF;
  b := round((_s->>'base')::numeric * _cum / a, 2); g := round((_s->>'gst')::numeric * _cum / a, 2);
  RETURN jsonb_build_object('base', b, 'gst', g, 'qst', _cum - b - g);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_ctax_date(_t text)
 RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE d date;
BEGIN
  IF _t IS NULL OR _t !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
  BEGIN d := _t::date; EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
  IF to_char(d,'YYYY-MM-DD') <> _t THEN RETURN NULL; END IF;
  RETURN d;
END $function$;

CREATE OR REPLACE FUNCTION public.fin_ctax_validate(_i fin_invoices, _p jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE errs text[] := '{}'; s ent_crm_settings; r jsonb; d date; today date := (now() AT TIME ZONE 'America/Toronto')::date;
  allowed text[] := ARRAY['mode','amount','pct','reason','basis','works','contract_ref','contract_date','clause_ref','release_condition','contractual_due','test_confirm'];
  k text; base numeric; pct numeric; dr jsonb; cdate date; due date; snap jsonb; ph text; sh text;
BEGIN
  IF jsonb_typeof(_p) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('errors', jsonb_build_array('Saisie invalide')); END IF;
  FOR k IN SELECT jsonb_object_keys(_p) LOOP
    IF NOT k = ANY(allowed) THEN errs := errs || ('Champ inconnu : ' || k); ELSIF jsonb_typeof(_p->k) <> 'string' THEN errs := errs || ('Champ texte attendu : ' || k); END IF;
  END LOOP;
  IF NOT coalesce(_i.is_test, false) THEN errs := errs || 'Mode construction préparatoire : réservé aux factures TEST (aucune facture réelle)'; END IF;
  IF _i.status <> 'brouillon' THEN errs := errs || 'Mode construction : à choisir AVANT l''émission (facture déjà émise : non convertible)'; END IF;
  IF _i.progress_situation_id IS NOT NULL OR _i.quote_id IS NOT NULL THEN errs := errs || 'Facture progressive ou issue d''une soumission : hors périmètre B1 (sous-lot B2)'; END IF;
  IF _i.recurrence_occurrence_id IS NOT NULL THEN errs := errs || 'Facture récurrente : hors périmètre B1 (sous-lot B2)'; END IF;
  IF _i.credit_of IS NOT NULL THEN errs := errs || 'Document de crédit : hors périmètre'; END IF;
  IF coalesce(_i.prices_include_tax, false) THEN errs := errs || 'Prix taxes incluses : hors périmètre B1 (base HT requise, sous-lot B2)'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_i.lines,'[]'::jsonb)) l WHERE coalesce(l->>'tax','') <> 'taxable') THEN
    errs := errs || 'Traitements fiscaux mixtes (détaxé/exonéré/à déterminer) : hors périmètre B1 — toutes les lignes doivent être taxables au taux standard'; END IF;
  SELECT * INTO s FROM ent_crm_settings WHERE company_id = _i.company_id;
  IF coalesce(s.gst_status,'') <> 'inscrit' OR coalesce(s.qst_status,'') <> 'inscrit' THEN errs := errs || 'Profil fiscal : inscrit TPS et TVQ requis (non-inscrit ou à compléter : hors périmètre B1)'; END IF;
  d := coalesce(_i.issue_date, today);
  r := public.fin_tax_compute(_i.lines, false, coalesce(s.gst_status,'a_completer'), coalesce(s.qst_status,'a_completer'), d);
  IF NOT coalesce((r->>'resolved')::boolean, false) THEN errs := errs || ('Taxes à déterminer : ' || array_to_string(ARRAY(SELECT jsonb_array_elements_text(r->'reasons')), ' ; ')); END IF;
  IF coalesce(_p->>'basis','') NOT IN ('law','written_agreement') THEN errs := errs || 'Fondement requis : loi ou convention écrite'; END IF;
  IF coalesce(_p->>'works','') NOT IN ('construction','renovation','transformation','reparation','navire') THEN errs := errs || 'Nature des travaux requise : construction, rénovation, transformation, réparation d''un immeuble, ou navire'; END IF;
  IF length(trim(coalesce(_p->>'contract_ref',''))) NOT BETWEEN 1 AND 200 THEN errs := errs || 'Référence du contrat requise (200 caractères au plus)'; END IF;
  cdate := public.fin_ctax_date(_p->>'contract_date'); IF cdate IS NULL THEN errs := errs || 'Date du contrat requise (AAAA-MM-JJ valide)'; END IF;
  IF length(trim(coalesce(_p->>'clause_ref',''))) NOT BETWEEN 1 AND 500 THEN errs := errs || 'Clause de retenue ou référence documentaire requise'; END IF;
  IF length(trim(coalesce(_p->>'release_condition',''))) NOT BETWEEN 1 AND 500 THEN errs := errs || 'Condition de libération requise'; END IF;
  IF length(trim(coalesce(_p->>'reason',''))) NOT BETWEEN 1 AND 500 THEN errs := errs || 'Motif requis'; END IF;
  due := public.fin_ctax_date(_p->>'contractual_due');
  IF due IS NULL THEN errs := errs || 'Échéance contractuelle de la retenue requise en B1 (AAAA-MM-JJ valide)';
  ELSIF due < d THEN errs := errs || 'Échéance contractuelle antérieure à la date de facture'; END IF;
  IF coalesce(_p->>'test_confirm','') <> 'oui' THEN errs := errs || 'Confirmez le mode TEST préparatoire (aucune déclaration ni remise)'; END IF;
  IF _p->>'mode' = 'amount' THEN
    IF coalesce(_p->>'amount','') !~ '^\d{1,12}(\.\d{1,2})?$' THEN errs := errs || 'Montant HT retenu invalide (2 décimales au plus)'; ELSE base := (_p->>'amount')::numeric; END IF;
  ELSIF _p->>'mode' = 'percent' THEN
    IF coalesce(_p->>'pct','') !~ '^\d{1,3}(\.\d{1,4})?$' THEN errs := errs || 'Pourcentage invalide (4 décimales au plus)';
    ELSE pct := (_p->>'pct')::numeric; IF pct <= 0 OR pct > 100 THEN errs := errs || 'Pourcentage de plus de 0 à 100 requis'; ELSIF (r->>'pre_tax') IS NOT NULL THEN base := round((r->>'pre_tax')::numeric * pct / 100, 2); END IF; END IF;
  ELSE errs := errs || 'Mode requis : montant HT ou pourcentage HT'; END IF;
  IF base IS NOT NULL AND (base <= 0 OR (r->>'pre_tax') IS NULL OR base > (r->>'pre_tax')::numeric) THEN errs := errs || 'Base HT retenue : de plus de 0 jusqu''au total HT'; END IF;
  IF cardinality(errs) > 0 THEN RETURN jsonb_build_object('errors', to_jsonb(errs)); END IF;
  dr := public.fin_tax_compute(jsonb_build_array(jsonb_build_object('qty', 1, 'price', base, 'tax', 'taxable')), false, 'inscrit', 'inscrit', d,
    jsonb_build_object('gst', r->'gst_rate', 'qst', r->'qst_rate'));
  snap := jsonb_build_object('version', 1, 'preparatory', true, 'mode', _p->>'mode', 'pct', pct, 'invoice_pre_tax', (r->>'pre_tax')::numeric,
    'invoice_gst', (r->>'gst')::numeric, 'invoice_qst', (r->>'qst')::numeric, 'invoice_total', (r->>'total')::numeric,
    'gst_rate', r->'gst_rate', 'qst_rate', r->'qst_rate', 'computed_on', d,
    'base', base, 'gst', (dr->>'gst')::numeric, 'qst', (dr->>'qst')::numeric, 'ttc', (dr->>'total')::numeric,
    'immediate_gst', (r->>'gst')::numeric - (dr->>'gst')::numeric, 'immediate_qst', (r->>'qst')::numeric - (dr->>'qst')::numeric,
    'current_part', (r->>'total')::numeric - (dr->>'total')::numeric,
    'basis', _p->>'basis', 'works', _p->>'works', 'contract_ref', trim(_p->>'contract_ref'), 'contract_date', cdate,
    'clause_ref', trim(_p->>'clause_ref'), 'release_condition', trim(_p->>'release_condition'), 'contractual_due', due, 'reason', trim(_p->>'reason'),
    'rule', 'TPS/TVQ sur la somme retenue exigibles à la première des dates : paiement/libération de la retenue ou date où elle devient exigible selon le contrat (Revenu Québec; ARC RC4052, Holdbacks). Montant figé à l''émission; seule l''exigibilité est différée. État préparatoire, aucune déclaration ni remise.',
    'sources', jsonb_build_array('https://www.revenuquebec.ca/fr/entreprises/taxes/tpstvh-et-tvq/perception-de-la-tps-et-de-la-tvq/moment-ou-la-tpstvh-et-la-tvq-doivent-etre-percues/',
      'https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4052/rc4052-gst-hst-information-home-construction-industry.html'),
    'tax_engine', 'fin_tax_compute v' || (r->>'version'));
  ph := md5(_p::text);
  sh := md5(jsonb_build_object('inv', _i.id, 'lines', _i.lines, 'issue', _i.issue_date, 'due', _i.due_date, 'upd', _i.updated_at, 'gst', s.gst_status, 'qst', s.qst_status, 'snap', snap, 'tax', r)::text);
  RETURN jsonb_build_object('errors', '[]'::jsonb, 'snapshot', snap, 'tax', r, 'expect_hash', md5(ph || sh));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_construction_preview(_invoice uuid, _p jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE i fin_invoices; v jsonb;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice;
  IF i.id IS NULL OR NOT public.fin_can_write(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  v := public.fin_ctax_validate(i, _p);
  RETURN v - 'tax';
END $function$;

CREATE OR REPLACE FUNCTION public.fin_construction_issue(_invoice uuid, _key text, _p jsonb, _expect_hash text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE i fin_invoices; v jsonb; e fin_retentions; rq text; res jsonb; nid uuid; iss fin_invoices;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice FOR UPDATE;
  IF i.id IS NULL OR NOT public.fin_can_write(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' OR length(_key) > 100 THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  rq := md5(jsonb_build_object('op', 'ctax_issue', 'invoice', _invoice, 'p', _p, 'expect', _expect_hash)::text);
  SELECT * INTO e FROM fin_retentions WHERE company_id = i.company_id AND idem_key = _key;
  IF e.id IS NOT NULL THEN
    IF e.invoice_id = _invoice AND e.request_hash = rq THEN
      RETURN jsonb_build_object('id', e.id, 'invoice', _invoice, 'number', i.number, 'replayed', true, 'position', public.fin_invoice_position(_invoice));
    END IF;
    RAISE EXCEPTION 'Clé de saisie déjà utilisée pour une autre demande' USING ERRCODE = 'P0409';
  END IF;
  v := public.fin_ctax_validate(i, _p);
  IF jsonb_array_length(v->'errors') > 0 THEN RAISE EXCEPTION 'Mode construction refusé : %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(v->'errors')), ' ; '); END IF;
  IF _expect_hash IS DISTINCT FROM v->>'expect_hash' THEN RAISE EXCEPTION 'Facture, profil ou saisie modifiés depuis l''aperçu : refaites l''aperçu' USING ERRCODE = 'P0409'; END IF;
  res := public.fin_invoice_issue(_invoice, NULL);
  SELECT * INTO iss FROM fin_invoices WHERE id = _invoice;
  IF (iss.tax_snapshot->>'total')::numeric IS DISTINCT FROM (v->'snapshot'->>'invoice_total')::numeric
     OR (iss.tax_snapshot->>'gst')::numeric IS DISTINCT FROM (v->'snapshot'->>'invoice_gst')::numeric
     OR (iss.tax_snapshot->>'qst')::numeric IS DISTINCT FROM (v->'snapshot'->>'invoice_qst')::numeric THEN
    RAISE EXCEPTION 'Écart entre l''aperçu et l''émission : refaites l''aperçu' USING ERRCODE = 'P0409';
  END IF;
  PERFORM set_config('fin.invoice_issue', 'on', true);
  UPDATE fin_invoices SET tax_snapshot = tax_snapshot || jsonb_build_object('construction', v->'snapshot') WHERE id = _invoice;
  PERFORM set_config('fin.invoice_issue', '', true);
  PERFORM set_config('fin.ctax', 'on', true);
  INSERT INTO fin_retentions(company_id, invoice_id, kind, mode, pct, base_amount, amount, reason, contract_ref, planned_release, release_condition, idem_key, payload_hash, request_hash, ctax_snapshot)
  VALUES (i.company_id, _invoice, 'construction_differee', _p->>'mode', (v->'snapshot'->>'pct')::numeric, (v->'snapshot'->>'invoice_pre_tax')::numeric, (v->'snapshot'->>'ttc')::numeric,
    v->'snapshot'->>'reason', v->'snapshot'->>'contract_ref', (v->'snapshot'->>'contractual_due')::date, v->'snapshot'->>'release_condition', _key, md5(_p::text), rq, v->'snapshot')
  RETURNING id INTO nid;
  PERFORM set_config('fin.ctax', '', true);
  INSERT INTO fin_retention_events(company_id, invoice_id, retention_id, action, detail)
  VALUES (i.company_id, _invoice, nid, 'create_construction', jsonb_build_object('base', v->'snapshot'->'base', 'gst', v->'snapshot'->'gst', 'qst', v->'snapshot'->'qst', 'ttc', v->'snapshot'->'ttc', 'contractual_due', v->'snapshot'->'contractual_due', 'test', true));
  PERFORM public.fin_retention_check(_invoice);
  PERFORM public.fin_invoice_receipts_sync(_invoice);
  RETURN jsonb_build_object('id', nid, 'invoice', _invoice, 'number', res->>'number', 'replayed', false, 'position', public.fin_invoice_position(_invoice));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_ctax_ret_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.kind = 'construction_differee' AND coalesce(current_setting('fin.ctax', true),'') <> 'on' THEN RAISE EXCEPTION 'Retenue construction : par l''émission TEST dédiée seulement'; END IF;
    IF EXISTS (SELECT 1 FROM fin_retentions WHERE invoice_id = NEW.invoice_id AND status = 'active' AND kind <> NEW.kind) THEN
      RAISE EXCEPTION 'Facture avec retenue construction : autre genre de retenue non pris en charge (sous-lot B2)'; END IF;
  ELSIF OLD.kind = 'construction_differee' THEN
    IF NEW.status = 'annulee' AND OLD.status = 'active' THEN RAISE EXCEPTION 'Annulation d''une retenue construction : non prise en charge en B1 (sous-lot B2), aucune modification'; END IF;
    IF NEW.ctax_snapshot IS DISTINCT FROM OLD.ctax_snapshot THEN RAISE EXCEPTION 'Instantané fiscal figé'; END IF;
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER trg_fin_ctax_ret_guard BEFORE INSERT OR UPDATE ON public.fin_retentions FOR EACH ROW EXECUTE FUNCTION public.fin_ctax_ret_guard();

CREATE OR REPLACE FUNCTION public.fin_ctax_rel_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL AND EXISTS (SELECT 1 FROM fin_retentions WHERE id = NEW.retention_id AND kind = 'construction_differee') THEN
    RAISE EXCEPTION 'Annulation d''une libération construction : non prise en charge en B1 (exigibilité déjà constatée; sous-lot B2)';
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER trg_fin_ctax_rel_guard BEFORE UPDATE ON public.fin_retention_releases FOR EACH ROW EXECUTE FUNCTION public.fin_ctax_rel_guard();

CREATE OR REPLACE FUNCTION public.fin_ctax_credit_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM fin_retentions WHERE invoice_id = NEW.invoice_id AND kind = 'construction_differee') THEN
    RAISE EXCEPTION 'Note de crédit sur facture avec retenue construction différée : non prise en charge en B1 (sous-lot B2)';
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER trg_fin_ctax_credit_guard BEFORE INSERT OR UPDATE ON public.fin_credit_notes FOR EACH ROW EXECUTE FUNCTION public.fin_ctax_credit_guard();

CREATE OR REPLACE FUNCTION public.fin_ctax_on_release()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r fin_retentions; prev numeric; cum numeric; a0 jsonb; a1 jsonb;
BEGIN
  SELECT * INTO r FROM fin_retentions WHERE id = NEW.retention_id;
  IF r.kind <> 'construction_differee' THEN RETURN NEW; END IF;
  SELECT coalesce(max(cum_ttc),0) INTO prev FROM fin_retention_tax_events WHERE retention_id = r.id;
  SELECT least(r.amount, coalesce(sum(amount),0)) INTO cum FROM fin_retention_releases WHERE retention_id = r.id AND voided_at IS NULL;
  IF cum <= prev THEN RETURN NEW; END IF;
  a0 := public.fin_ctax_alloc(r.ctax_snapshot, prev); a1 := public.fin_ctax_alloc(r.ctax_snapshot, cum);
  INSERT INTO fin_retention_tax_events(company_id, invoice_id, retention_id, release_id, source, exigible_on, ttc, base, gst, qst, cum_ttc)
  VALUES (r.company_id, r.invoice_id, r.id, NEW.id, 'liberation', least(NEW.released_on, (r.ctax_snapshot->>'contractual_due')::date), cum - prev,
    (a1->>'base')::numeric - (a0->>'base')::numeric, (a1->>'gst')::numeric - (a0->>'gst')::numeric, (a1->>'qst')::numeric - (a0->>'qst')::numeric, cum);
  RETURN NEW;
END $function$;
CREATE TRIGGER trg_fin_ctax_on_release AFTER INSERT ON public.fin_retention_releases FOR EACH ROW EXECUTE FUNCTION public.fin_ctax_on_release();

CREATE OR REPLACE FUNCTION public.fin_ctax_state(_retention uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r fin_retentions; cum numeric; a jsonb;
BEGIN
  SELECT * INTO r FROM fin_retentions WHERE id = _retention;
  IF r.kind <> 'construction_differee' THEN RETURN NULL; END IF;
  SELECT coalesce(max(cum_ttc),0) INTO cum FROM fin_retention_tax_events WHERE retention_id = r.id;
  a := public.fin_ctax_alloc(r.ctax_snapshot, cum);
  RETURN jsonb_build_object('snapshot', r.ctax_snapshot, 'exigible', a || jsonb_build_object('ttc', cum),
    'deferred', jsonb_build_object('ttc', (r.ctax_snapshot->>'ttc')::numeric - cum, 'base', (r.ctax_snapshot->>'base')::numeric - (a->>'base')::numeric,
      'gst', (r.ctax_snapshot->>'gst')::numeric - (a->>'gst')::numeric, 'qst', (r.ctax_snapshot->>'qst')::numeric - (a->>'qst')::numeric),
    'events', coalesce((SELECT jsonb_agg(to_jsonb(t) - 'idem_key' - 'request_hash' ORDER BY t.cum_ttc) FROM fin_retention_tax_events t WHERE t.retention_id = r.id), '[]'::jsonb),
    'status', 'preparatoire');
END $function$;

CREATE OR REPLACE FUNCTION public.fin_construction_evaluate(_retention uuid, _key text, _on text, _expect_rev integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE inv uuid; r fin_retentions; d date; due date; prev numeric; a0 jsonb; a1 jsonb; rq text; t fin_retention_tax_events;
BEGIN
  SELECT invoice_id INTO inv FROM fin_retentions WHERE id = _retention;
  IF inv IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM 1 FROM fin_invoices WHERE id = inv FOR UPDATE;
  SELECT * INTO r FROM fin_retentions WHERE id = _retention FOR UPDATE;
  IF NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF r.kind <> 'construction_differee' THEN RAISE EXCEPTION 'Revue d''exigibilité : retenue construction seulement'; END IF;
  IF coalesce(_key,'') = '' OR length(_key) > 100 THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  d := public.fin_ctax_date(_on); IF d IS NULL THEN RAISE EXCEPTION 'Date de revue invalide (AAAA-MM-JJ)'; END IF;
  rq := md5(concat_ws('|', 'ce1', r.id, d, coalesce(_expect_rev::text,'null')));
  SELECT * INTO t FROM fin_retention_tax_events WHERE company_id = r.company_id AND idem_key = _key;
  IF t.id IS NOT NULL THEN
    IF t.request_hash = rq THEN RETURN jsonb_build_object('replayed', true, 'reached', true, 'rev', r.rev, 'state', public.fin_ctax_state(r.id)); END IF;
    RAISE EXCEPTION 'Clé de saisie déjà utilisée pour une autre demande' USING ERRCODE = 'P0409';
  END IF;
  IF _expect_rev IS DISTINCT FROM r.rev THEN RAISE EXCEPTION 'Retenue modifiée ailleurs (révision %) : rechargez', r.rev USING ERRCODE = 'P0409'; END IF;
  due := (r.ctax_snapshot->>'contractual_due')::date;
  IF d < due THEN RETURN jsonb_build_object('replayed', false, 'reached', false, 'rev', r.rev, 'state', public.fin_ctax_state(r.id)); END IF;
  SELECT coalesce(max(cum_ttc),0) INTO prev FROM fin_retention_tax_events WHERE retention_id = r.id;
  IF prev >= r.amount OR r.status <> 'active' THEN RETURN jsonb_build_object('replayed', false, 'reached', true, 'nothing', true, 'rev', r.rev, 'state', public.fin_ctax_state(r.id)); END IF;
  a0 := public.fin_ctax_alloc(r.ctax_snapshot, prev); a1 := public.fin_ctax_alloc(r.ctax_snapshot, r.amount);
  INSERT INTO fin_retention_tax_events(company_id, invoice_id, retention_id, source, exigible_on, ttc, base, gst, qst, cum_ttc, idem_key, request_hash)
  VALUES (r.company_id, inv, r.id, 'echeance', due, r.amount - prev, (a1->>'base')::numeric - (a0->>'base')::numeric,
    (a1->>'gst')::numeric - (a0->>'gst')::numeric, (a1->>'qst')::numeric - (a0->>'qst')::numeric, r.amount, _key, rq);
  UPDATE fin_retentions SET rev = rev + 1 WHERE id = r.id;
  INSERT INTO fin_retention_events(company_id, invoice_id, retention_id, action, detail)
  VALUES (r.company_id, inv, r.id, 'tax_due_review', jsonb_build_object('on', d, 'exigible_on', due, 'ttc', r.amount - prev, 'preparatory', true));
  RETURN jsonb_build_object('replayed', false, 'reached', true, 'rev', r.rev + 1, 'state', public.fin_ctax_state(r.id));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_retention_summary(_invoice uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE i fin_invoices;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice;
  IF i.id IS NULL OR NOT public.fin_can_read(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN jsonb_build_object('position', public.fin_invoice_position(_invoice),
    'retentions', coalesce((SELECT jsonb_agg(to_jsonb(r) - 'idem_key' - 'payload_hash' - 'void_key' - 'request_hash' - 'void_request_hash' || jsonb_build_object(
        'rest', r.amount - coalesce((SELECT sum(amount) FROM fin_retention_releases l WHERE l.retention_id = r.id AND l.voided_at IS NULL),0),
        'ctax', public.fin_ctax_state(r.id),
        'releases', coalesce((SELECT jsonb_agg(to_jsonb(l) - 'idem_key' - 'payload_hash' - 'void_key' - 'void_request_hash' ORDER BY l.created_at) FROM fin_retention_releases l WHERE l.retention_id = r.id), '[]'::jsonb))
      ORDER BY r.created_at) FROM fin_retentions r WHERE r.invoice_id = _invoice), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.at DESC) FROM fin_retention_events e WHERE e.invoice_id = _invoice), '[]'::jsonb));
END $function$;

REVOKE ALL ON FUNCTION public.fin_ctax_validate(fin_invoices, jsonb), public.fin_ctax_state(uuid), public.fin_ctax_alloc(jsonb, numeric), public.fin_ctax_date(text),
  public.fin_ctax_ret_guard(), public.fin_ctax_rel_guard(), public.fin_ctax_credit_guard(), public.fin_ctax_on_release() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fin_construction_preview(uuid, jsonb), public.fin_construction_issue(uuid, text, jsonb, text), public.fin_construction_evaluate(uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_construction_preview(uuid, jsonb), public.fin_construction_issue(uuid, text, jsonb, text), public.fin_construction_evaluate(uuid, text, text, integer) TO authenticated;
