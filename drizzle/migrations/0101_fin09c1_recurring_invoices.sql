-- FIN-09C1 — Factures récurrentes : modèles versionnés, occurrences préparées explicitement (brouillons), émission FIN-08.
CREATE TABLE public.fin_recurring_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  client_id uuid NOT NULL REFERENCES public.ent_crm_clients(id),
  project_id uuid REFERENCES public.ent_crm_projects(id),
  label text NOT NULL,
  contract_ref text,
  status text NOT NULL DEFAULT 'actif' CHECK (status IN ('actif','pause','arrete')),
  current_version integer NOT NULL DEFAULT 1,
  rev integer NOT NULL DEFAULT 1,
  create_key text NOT NULL,
  create_hash text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, create_key)
);
CREATE TABLE public.fin_recurring_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.fin_recurring_templates(id),
  company_id uuid NOT NULL,
  version integer NOT NULL,
  effective_from date,
  rule jsonb NOT NULL,
  lines jsonb NOT NULL,
  prices_include_tax boolean NOT NULL,
  terms text,
  due_days integer NOT NULL CHECK (due_days BETWEEN 0 AND 365),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);
CREATE TABLE public.fin_recurring_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.fin_recurring_templates(id),
  company_id uuid NOT NULL,
  version integer NOT NULL,
  occ_key text NOT NULL,
  scheduled_on date NOT NULL,
  planned_on date NOT NULL,
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','emise','abandonnee')),
  issue_date date NOT NULL,
  due_date date NOT NULL,
  service_from date,
  service_to date,
  lines jsonb NOT NULL,
  prices_include_tax boolean NOT NULL,
  terms text,
  note text,
  computed jsonb NOT NULL,
  input_hash text NOT NULL,
  hash text NOT NULL,
  rev integer NOT NULL DEFAULT 1,
  batch_key text NOT NULL,
  issue_key text,
  invoice_id uuid REFERENCES public.fin_invoices(id),
  abandon_key text,
  abandon_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  issued_at timestamptz, issued_by uuid,
  abandoned_at timestamptz, abandoned_by uuid,
  UNIQUE (template_id, occ_key),
  UNIQUE (company_id, issue_key),
  UNIQUE (company_id, abandon_key),
  UNIQUE (invoice_id)
);
CREATE TABLE public.fin_recurring_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.fin_recurring_templates(id),
  company_id uuid NOT NULL,
  action text NOT NULL,
  reason text,
  detail jsonb,
  op_key text,
  input_hash text,
  result jsonb,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, op_key)
);
ALTER TABLE public.fin_invoices ADD COLUMN recurrence_occurrence_id uuid UNIQUE REFERENCES public.fin_recurring_occurrences(id);

REVOKE ALL ON public.fin_recurring_templates, public.fin_recurring_versions, public.fin_recurring_occurrences, public.fin_recurring_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fin_recurring_templates, public.fin_recurring_versions, public.fin_recurring_occurrences, public.fin_recurring_events TO authenticated;
GRANT ALL ON public.fin_recurring_templates, public.fin_recurring_versions, public.fin_recurring_occurrences, public.fin_recurring_events TO service_role;
ALTER TABLE public.fin_recurring_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_recurring_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_recurring_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_recurring_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_rec_t_read ON public.fin_recurring_templates FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY fin_rec_v_read ON public.fin_recurring_versions FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY fin_rec_o_read ON public.fin_recurring_occurrences FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY fin_rec_e_read ON public.fin_recurring_events FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

-- Garde facture : le lien d'occurrence récurrente n'est posé que par fin_rec_issue, jamais modifié.
CREATE OR REPLACE FUNCTION public.fin_invoice_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s ent_crm_settings; r jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'brouillon' THEN RAISE EXCEPTION 'Facture émise : suppression impossible (une note de crédit sera requise)'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.recurrence_occurrence_id IS NOT NULL AND coalesce(current_setting('fin.recurring', true),'') <> 'on' THEN RAISE EXCEPTION 'Facture récurrente : émission par la récurrence seulement'; END IF;
  ELSIF NEW.recurrence_occurrence_id IS DISTINCT FROM OLD.recurrence_occurrence_id THEN RAISE EXCEPTION 'Lien de récurrence non modifiable';
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
END $function$;

-- Lignes : validation totale, normalisation en chaînes canoniques (aucun 0 implicite).
CREATE OR REPLACE FUNCTION public.fin_rec_lines(_lines jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE l jsonb; o jsonb := '[]'::jsonb; tot numeric := 0; i int := 0;
BEGIN
  IF jsonb_typeof(_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(_lines) = 0 OR jsonb_array_length(_lines) > 100 THEN
    RAISE EXCEPTION 'Lignes : entre 1 et 100 lignes requises' USING ERRCODE = '22023'; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    i := i + 1;
    IF jsonb_typeof(l) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Ligne % illisible', i USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(l->'desc') IS DISTINCT FROM 'string' OR btrim(coalesce(l->>'desc','')) = '' OR length(l->>'desc') > 300 THEN RAISE EXCEPTION 'Ligne % : description requise (300 caractères au plus)', i USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(l->'qty') IS DISTINCT FROM 'string' OR coalesce(l->>'qty','') !~ '^\d{1,9}(\.\d{1,4})?$' OR (l->>'qty')::numeric <= 0 THEN RAISE EXCEPTION 'Ligne % : quantité positive requise (4 décimales au plus)', i USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(l->'price') IS DISTINCT FROM 'string' OR coalesce(l->>'price','') !~ '^\d{1,10}(\.\d{1,4})?$' THEN RAISE EXCEPTION 'Ligne % : prix unitaire requis (nombre positif ou nul, 4 décimales au plus)', i USING ERRCODE = '22023'; END IF;
    IF l ? 'disc_pct' AND l->'disc_pct' <> 'null'::jsonb AND (jsonb_typeof(l->'disc_pct') IS DISTINCT FROM 'string' OR coalesce(l->>'disc_pct','') !~ '^\d{1,3}(\.\d{1,2})?$' OR (l->>'disc_pct')::numeric > 100) THEN
      RAISE EXCEPTION 'Ligne % : remise invalide (0 à 100 %%, 2 décimales au plus)', i USING ERRCODE = '22023'; END IF;
    IF coalesce(l->>'tax','') NOT IN ('taxable','detaxe','exonere') THEN RAISE EXCEPTION 'Ligne % : traitement fiscal requis (taxable, détaxé ou exonéré)', i USING ERRCODE = '22023'; END IF;
    IF l ? 'unit' AND l->'unit' <> 'null'::jsonb AND (jsonb_typeof(l->'unit') IS DISTINCT FROM 'string' OR length(l->>'unit') > 30) THEN RAISE EXCEPTION 'Ligne % : unité invalide', i USING ERRCODE = '22023'; END IF;
    tot := tot + public.fin_progress_line_amt((l->>'qty')::numeric, (l->>'price')::numeric, nullif(l->>'disc_pct','')::numeric);
    o := o || jsonb_build_object('desc', btrim(l->>'desc'), 'unit', nullif(btrim(coalesce(l->>'unit','')),''), 'qty', l->>'qty', 'price', l->>'price',
      'disc_pct', nullif(l->>'disc_pct',''), 'tax', l->>'tax');
  END LOOP;
  IF tot IS NULL OR tot <= 0 THEN RAISE EXCEPTION 'Facture vide : le montant des lignes doit être positif' USING ERRCODE = '22023'; END IF;
  RETURN o;
END $$;

-- Règle : sous-ensemble FIN-02 pris en charge, validé par fin_validate_rule (aucun second moteur).
CREATE OR REPLACE FUNCTION public.fin_rec_rule(_r jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE o jsonb := '{}'::jsonb; k text; s jsonb; sc jsonb := '[]'::jsonb; i int := 0;
BEGIN
  IF jsonb_typeof(_r) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Calendrier illisible' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(_r->'frequency') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Fréquence requise' USING ERRCODE = '22023'; END IF;
  IF _r ? 'interval_n' AND _r->'interval_n' <> 'null'::jsonb AND coalesce(_r->>'interval_n','') !~ '^\d{1,3}$' THEN RAISE EXCEPTION 'Intervalle : nombre entier requis' USING ERRCODE = '22023'; END IF;
  IF _r ? 'max_count' AND _r->'max_count' <> 'null'::jsonb AND coalesce(_r->>'max_count','') !~ '^\d{1,3}$' THEN RAISE EXCEPTION 'Nombre maximal : entier de 1 à 600' USING ERRCODE = '22023'; END IF;
  FOREACH k IN ARRAY ARRAY['month_day','month_day2'] LOOP
    IF _r ? k AND _r->k <> 'null'::jsonb AND coalesce(_r->>k,'') <> '' AND (_r->>k) !~ '^\d{1,2}$' THEN RAISE EXCEPTION 'Jour du mois : entier de 1 à 31' USING ERRCODE = '22023'; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['anchor_date','end_date'] LOOP
    IF _r ? k AND _r->k <> 'null'::jsonb AND coalesce(_r->>k,'') <> '' AND (_r->>k) !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Date invalide' USING ERRCODE = '22023'; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['frequency','interval_n','weekdays','month_day','month_day2','collision_policy','feb29_policy','short_month_policy','seasons','planned_shift','anchor_date','end_date','max_count'] LOOP
    IF _r ? k AND _r->k <> 'null'::jsonb AND coalesce(_r->>k,'x') <> '' THEN o := o || jsonb_build_object(k, _r->k); END IF;
  END LOOP;
  IF coalesce(o->>'planned_shift','none') NOT IN ('none','prev_weekday','next_weekday') THEN RAISE EXCEPTION 'Décalage de date non pris en charge' USING ERRCODE = '22023'; END IF;
  IF o->>'frequency' = 'schedule' THEN
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
END $$;

-- Dates d'un modèle (toutes versions, sans chevauchement) via fin_gen_dates.
CREATE OR REPLACE FUNCTION public.fin_rec_gen(_template uuid, _from date, _to date)
RETURNS TABLE(version integer, occ_key text, scheduled_on date, planned_on date) LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v record; nxt date;
BEGIN
  FOR v IN SELECT * FROM fin_recurring_versions x WHERE x.template_id = _template ORDER BY x.version LOOP
    SELECT min(y.effective_from) INTO nxt FROM fin_recurring_versions y WHERE y.template_id = _template AND y.version > v.version;
    RETURN QUERY SELECT v.version, 'v' || v.version || ':' || g.occ_key, g.due, g.planned
      FROM public.fin_gen_dates(v.rule - 'rule_gen' || jsonb_strip_nulls(jsonb_build_object('rule_from', v.effective_from, 'valid_until', nxt)), _from, _to) g;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fin_rec_compute(_company uuid, _client uuid, _lines jsonb, _pit boolean, _on date) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE s ent_crm_settings; c ent_crm_clients; r jsonb;
BEGIN
  SELECT * INTO s FROM ent_crm_settings WHERE company_id = _company;
  SELECT * INTO c FROM ent_crm_clients WHERE id = _client AND company_id = _company;
  r := public.fin_tax_compute(_lines, _pit, coalesce(s.gst_status,'a_completer'), coalesce(s.qst_status,'a_completer'), _on);
  IF coalesce((r->>'resolved')::boolean, false) AND ((r->>'pre_tax') IS NULL OR (r->>'total') IS NULL OR (r->>'gst') IS NULL OR (r->>'qst') IS NULL) THEN
    RAISE EXCEPTION 'Calcul fiscal incohérent' USING ERRCODE = '22023'; END IF;
  RETURN jsonb_build_object('tax', r, 'client', jsonb_build_object('id', c.id, 'name', c.name, 'email', c.email, 'phone', c.phone, 'address', c.address, 'archived', c.archived_at IS NOT NULL));
END $$;

CREATE OR REPLACE FUNCTION public.fin_rec_input_hash(_issue date, _due date, _sf date, _st date, _lines jsonb, _note text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(jsonb_build_object('issue', _issue, 'due', _due, 'sf', _sf, 'st', _st, 'lines', _lines, 'note', _note)::text)
$$;

CREATE OR REPLACE FUNCTION public.fin_rec_check_dates(_issue date, _due date, _sf date, _st date) RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF _issue IS NULL THEN RAISE EXCEPTION 'Date d''émission requise' USING ERRCODE = '22023'; END IF;
  IF _due IS NULL THEN RAISE EXCEPTION 'Échéance de paiement requise' USING ERRCODE = '22023'; END IF;
  IF _due < _issue THEN RAISE EXCEPTION 'L''échéance précède la date d''émission' USING ERRCODE = '22023'; END IF;
  IF (_sf IS NULL) <> (_st IS NULL) THEN RAISE EXCEPTION 'Période de service : début et fin requis ensemble (ou aucun)' USING ERRCODE = '22023'; END IF;
  IF _sf IS NOT NULL AND _st < _sf THEN RAISE EXCEPTION 'Période de service : la fin précède le début' USING ERRCODE = '22023'; END IF;
END $$;

-- Lecture : aperçu d'une règle non enregistrée (formulaire), date d'effet facultative.
CREATE OR REPLACE FUNCTION public.fin_rec_rule_preview(_company uuid, _rule jsonb, _from date, _to date, _effective date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from OR _to - _from > 1100 THEN RAISE EXCEPTION 'Fenêtre d''aperçu : 3 ans au plus' USING ERRCODE = '22023'; END IF;
  r := public.fin_rec_rule(_rule);
  IF _effective IS NOT NULL THEN r := r || jsonb_build_object('rule_from', _effective); END IF;
  RETURN (SELECT jsonb_build_object('rule', r, 'dates', coalesce(jsonb_agg(jsonb_build_object('key', g.occ_key, 'scheduled', g.due, 'planned', g.planned) ORDER BY g.due, g.slot), '[]'::jsonb))
    FROM (SELECT * FROM public.fin_gen_dates(r, _from, _to) LIMIT 300) g);
END $$;

-- Création d'un modèle (clé + contenu complet).
CREATE OR REPLACE FUNCTION public.fin_rec_template_create(_company uuid, _key text, _client uuid, _project uuid, _label text, _contract_ref text, _rule jsonb, _lines jsonb, _pit boolean, _terms text, _due_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t fin_recurring_templates; ih text; r jsonb; l jsonb;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  _label := btrim(coalesce(_label,'')); _contract_ref := nullif(btrim(coalesce(_contract_ref,'')),''); _terms := nullif(btrim(coalesce(_terms,'')),'');
  ih := md5(jsonb_build_object('client', _client, 'project', _project, 'label', _label, 'ref', _contract_ref, 'rule', _rule, 'lines', _lines, 'pit', _pit, 'terms', _terms, 'due_days', _due_days)::text);
  SELECT * INTO t FROM fin_recurring_templates WHERE company_id = _company AND create_key = _key;
  IF t.id IS NOT NULL THEN
    IF t.create_hash = ih THEN RETURN jsonb_build_object('id', t.id, 'already', true); END IF;
    RAISE EXCEPTION 'Clé déjà utilisée avec un autre contenu' USING ERRCODE = 'P0409';
  END IF;
  IF _label = '' OR length(_label) > 200 THEN RAISE EXCEPTION 'Libellé requis (200 caractères au plus)' USING ERRCODE = '22023'; END IF;
  IF length(coalesce(_contract_ref,'')) > 100 OR length(coalesce(_terms,'')) > 500 THEN RAISE EXCEPTION 'Référence (100) ou conditions (500) trop longues' USING ERRCODE = '22023'; END IF;
  IF _pit IS NULL THEN RAISE EXCEPTION 'Prix hors taxes ou taxes incluses : choix requis' USING ERRCODE = '22023'; END IF;
  IF _due_days IS NULL OR _due_days NOT BETWEEN 0 AND 365 THEN RAISE EXCEPTION 'Délai de paiement : 0 à 365 jours' USING ERRCODE = '22023'; END IF;
  IF _client IS NULL OR NOT EXISTS (SELECT 1 FROM ent_crm_clients WHERE id = _client AND company_id = _company AND archived_at IS NULL) THEN RAISE EXCEPTION 'Client requis (actif, même entreprise)' USING ERRCODE = '22023'; END IF;
  IF _project IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ent_crm_projects WHERE id = _project AND company_id = _company) THEN RAISE EXCEPTION 'Chantier d''une autre entreprise' USING ERRCODE = '22023'; END IF;
  r := public.fin_rec_rule(_rule); l := public.fin_rec_lines(_lines);
  INSERT INTO fin_recurring_templates (company_id, client_id, project_id, label, contract_ref, create_key, create_hash, created_by)
  VALUES (_company, _client, _project, _label, _contract_ref, _key, ih, auth.uid()) RETURNING * INTO t;
  INSERT INTO fin_recurring_versions (template_id, company_id, version, effective_from, rule, lines, prices_include_tax, terms, due_days, created_by)
  VALUES (t.id, _company, 1, NULL, r, l, _pit, _terms, _due_days, auth.uid());
  INSERT INTO fin_recurring_events (template_id, company_id, action, detail, actor) VALUES (t.id, _company, 'create', jsonb_build_object('version', 1), auth.uid());
  RETURN jsonb_build_object('id', t.id, 'already', false);
END $$;

-- Nouvelle version pour le futur non préparé.
CREATE OR REPLACE FUNCTION public.fin_rec_version_add(_template uuid, _key text, _effective date, _rule jsonb, _lines jsonb, _pit boolean, _terms text, _due_days integer, _expect_rev integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t fin_recurring_templates; e fin_recurring_events; ih text; r jsonb; l jsonb; last_d date; cur fin_recurring_versions; res jsonb;
BEGIN
  SELECT * INTO t FROM fin_recurring_templates WHERE id = _template FOR UPDATE;
  IF t.id IS NULL OR NOT public.fin_can_write(t.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  _terms := nullif(btrim(coalesce(_terms,'')),'');
  ih := md5(jsonb_build_object('t', _template, 'eff', _effective, 'rule', _rule, 'lines', _lines, 'pit', _pit, 'terms', _terms, 'due_days', _due_days, 'rev', _expect_rev)::text);
  SELECT * INTO e FROM fin_recurring_events WHERE company_id = t.company_id AND op_key = _key;
  IF e.id IS NOT NULL THEN
    IF e.input_hash = ih AND e.template_id = _template THEN RETURN e.result || jsonb_build_object('already', true); END IF;
    RAISE EXCEPTION 'Clé déjà utilisée avec un autre contenu' USING ERRCODE = 'P0409';
  END IF;
  IF t.rev IS DISTINCT FROM _expect_rev THEN RAISE EXCEPTION 'Modèle modifié ailleurs : rechargez-le' USING ERRCODE = 'P0409'; END IF;
  IF t.status = 'arrete' THEN RAISE EXCEPTION 'Récurrence arrêtée : aucune nouvelle version' USING ERRCODE = '22023'; END IF;
  IF _effective IS NULL THEN RAISE EXCEPTION 'Date d''effet requise' USING ERRCODE = '22023'; END IF;
  IF _pit IS NULL THEN RAISE EXCEPTION 'Prix hors taxes ou taxes incluses : choix requis' USING ERRCODE = '22023'; END IF;
  IF _due_days IS NULL OR _due_days NOT BETWEEN 0 AND 365 THEN RAISE EXCEPTION 'Délai de paiement : 0 à 365 jours' USING ERRCODE = '22023'; END IF;
  IF length(coalesce(_terms,'')) > 500 THEN RAISE EXCEPTION 'Conditions trop longues (500)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM fin_recurring_versions WHERE template_id = _template AND version = t.current_version;
  IF cur.effective_from IS NOT NULL AND _effective <= cur.effective_from THEN
    RAISE EXCEPTION 'Date d''effet : postérieure au % (début de la version en vigueur)', to_char(cur.effective_from, 'YYYY-MM-DD') USING ERRCODE = '22023'; END IF;
  SELECT max(greatest(scheduled_on, planned_on)) INTO last_d FROM fin_recurring_occurrences WHERE template_id = _template;
  IF last_d IS NOT NULL AND _effective <= last_d THEN
    RAISE EXCEPTION 'Date d''effet : postérieure au % (dernière occurrence déjà préparée, émise ou abandonnée). Les occurrences réservées restent inchangées.', to_char(last_d, 'YYYY-MM-DD') USING ERRCODE = '22023'; END IF;
  r := public.fin_rec_rule(_rule); l := public.fin_rec_lines(_lines);
  INSERT INTO fin_recurring_versions (template_id, company_id, version, effective_from, rule, lines, prices_include_tax, terms, due_days, created_by)
  VALUES (_template, t.company_id, t.current_version + 1, _effective, r, l, _pit, _terms, _due_days, auth.uid());
  UPDATE fin_recurring_templates SET current_version = current_version + 1, rev = rev + 1 WHERE id = _template RETURNING * INTO t;
  res := jsonb_build_object('version', t.current_version, 'rev', t.rev, 'effective_from', _effective);
  INSERT INTO fin_recurring_events (template_id, company_id, action, detail, op_key, input_hash, result, actor)
  VALUES (_template, t.company_id, 'version', jsonb_build_object('version', t.current_version, 'effective_from', _effective, 'from_version', t.current_version - 1), _key, ih, res, auth.uid());
  RETURN res || jsonb_build_object('already', false);
END $$;

-- Pause / reprise / arrêt (motif obligatoire, historique).
CREATE OR REPLACE FUNCTION public.fin_rec_set_status(_template uuid, _key text, _action text, _reason text, _expect_rev integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t fin_recurring_templates; e fin_recurring_events; ih text; target text; res jsonb;
BEGIN
  SELECT * INTO t FROM fin_recurring_templates WHERE id = _template FOR UPDATE;
  IF t.id IS NULL OR NOT public.fin_can_write(t.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  _reason := btrim(coalesce(_reason,''));
  ih := md5(jsonb_build_object('t', _template, 'a', _action, 'r', _reason, 'rev', _expect_rev)::text);
  SELECT * INTO e FROM fin_recurring_events WHERE company_id = t.company_id AND op_key = _key;
  IF e.id IS NOT NULL THEN
    IF e.input_hash = ih AND e.template_id = _template THEN RETURN e.result || jsonb_build_object('already', true); END IF;
    RAISE EXCEPTION 'Clé déjà utilisée avec un autre contenu' USING ERRCODE = 'P0409';
  END IF;
  IF t.rev IS DISTINCT FROM _expect_rev THEN RAISE EXCEPTION 'Modèle modifié ailleurs : rechargez-le' USING ERRCODE = 'P0409'; END IF;
  IF _reason = '' OR length(_reason) > 500 THEN RAISE EXCEPTION 'Motif requis (500 caractères au plus)' USING ERRCODE = '22023'; END IF;
  target := CASE WHEN _action = 'pause' AND t.status = 'actif' THEN 'pause' WHEN _action = 'resume' AND t.status = 'pause' THEN 'actif'
    WHEN _action = 'stop' AND t.status IN ('actif','pause') THEN 'arrete' END;
  IF target IS NULL THEN RAISE EXCEPTION 'Action « % » impossible depuis l''état « % »', coalesce(_action,'?'), t.status USING ERRCODE = '22023'; END IF;
  UPDATE fin_recurring_templates SET status = target, rev = rev + 1 WHERE id = _template RETURNING * INTO t;
  res := jsonb_build_object('status', t.status, 'rev', t.rev);
  INSERT INTO fin_recurring_events (template_id, company_id, action, reason, detail, op_key, input_hash, result, actor)
  VALUES (_template, t.company_id, _action, _reason, jsonb_build_object('status', target), _key, ih, res, auth.uid());
  RETURN res || jsonb_build_object('already', false);
END $$;

-- Préparation explicite d'occurrences choisies (≤ 24) : brouillons seulement, sans numéro ni entrée attendue.
CREATE OR REPLACE FUNCTION public.fin_rec_prepare(_template uuid, _key text, _occ_keys text[], _expect_rev integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t fin_recurring_templates; e fin_recurring_events; ih text; k text; g record; v fin_recurring_versions; o fin_recurring_occurrences; res jsonb := '[]'::jsonb;
  today date := (now() AT TIME ZONE 'America/Toronto')::date; lo date; comp jsonb; nl jsonb; ihash text; ks text[];
BEGIN
  SELECT * INTO t FROM fin_recurring_templates WHERE id = _template FOR UPDATE;
  IF t.id IS NULL OR NOT public.fin_can_write(t.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO ks FROM unnest(coalesce(_occ_keys, '{}')) x;
  ih := md5(jsonb_build_object('t', _template, 'keys', to_jsonb(ks), 'n', coalesce(array_length(_occ_keys,1),0), 'rev', _expect_rev)::text);
  SELECT * INTO e FROM fin_recurring_events WHERE company_id = t.company_id AND op_key = _key;
  IF e.id IS NOT NULL THEN
    IF e.input_hash = ih AND e.template_id = _template THEN RETURN e.result || jsonb_build_object('already', true); END IF;
    RAISE EXCEPTION 'Clé déjà utilisée avec un autre contenu' USING ERRCODE = 'P0409';
  END IF;
  IF t.rev IS DISTINCT FROM _expect_rev THEN RAISE EXCEPTION 'Modèle modifié ailleurs : rechargez l''aperçu' USING ERRCODE = 'P0409'; END IF;
  IF t.status <> 'actif' THEN RAISE EXCEPTION 'Récurrence % : aucune nouvelle occurrence ne peut être préparée', CASE t.status WHEN 'pause' THEN 'en pause' ELSE 'arrêtée' END USING ERRCODE = '22023'; END IF;
  IF ks IS NULL OR array_length(ks,1) IS NULL OR array_length(ks,1) > 24 OR array_length(ks,1) <> array_length(_occ_keys,1) THEN
    RAISE EXCEPTION 'Choisissez de 1 à 24 occurrences distinctes' USING ERRCODE = '22023'; END IF;
  SELECT least(coalesce((SELECT min((x.rule->>'anchor_date')::date) FROM fin_recurring_versions x WHERE x.template_id = _template),
      (SELECT min((s->>'date')::date) FROM fin_recurring_versions x, jsonb_array_elements(coalesce(x.rule->'schedule','[]'::jsonb)) s WHERE x.template_id = _template)), today) INTO lo;
  FOREACH k IN ARRAY ks LOOP
    SELECT * INTO g FROM public.fin_rec_gen(_template, lo, today + 400) x WHERE x.occ_key = k;
    IF g.occ_key IS NULL THEN RAISE EXCEPTION 'Occurrence % hors calendrier (ou au-delà de 400 jours)', k USING ERRCODE = '22023'; END IF;
    SELECT * INTO o FROM fin_recurring_occurrences WHERE template_id = _template AND occ_key = k;
    IF o.id IS NOT NULL THEN res := res || jsonb_build_object('key', k, 'id', o.id, 'status', o.status, 'created', false); CONTINUE; END IF;
    SELECT * INTO v FROM fin_recurring_versions WHERE template_id = _template AND version = g.version;
    nl := v.lines;
    comp := public.fin_rec_compute(t.company_id, t.client_id, nl, v.prices_include_tax, g.planned_on);
    ihash := public.fin_rec_input_hash(g.planned_on, g.planned_on + v.due_days, NULL, NULL, nl, NULL);
    INSERT INTO fin_recurring_occurrences (template_id, company_id, version, occ_key, scheduled_on, planned_on, issue_date, due_date, lines, prices_include_tax, terms, computed, input_hash, hash, batch_key, created_by)
    VALUES (_template, t.company_id, g.version, k, g.scheduled_on, g.planned_on, g.planned_on, g.planned_on + v.due_days, nl, v.prices_include_tax, v.terms, comp, ihash, md5(ihash || comp::text), _key, auth.uid())
    RETURNING * INTO o;
    res := res || jsonb_build_object('key', k, 'id', o.id, 'status', o.status, 'created', true);
  END LOOP;
  INSERT INTO fin_recurring_events (template_id, company_id, action, detail, op_key, input_hash, result, actor)
  VALUES (_template, t.company_id, 'prepare', jsonb_build_object('keys', to_jsonb(ks)), _key, ih, jsonb_build_object('items', res), auth.uid());
  RETURN jsonb_build_object('items', res, 'already', false);
END $$;

-- Correction du brouillon d'une occurrence (rejeu exact = révision précédente; révision courante = recalcul).
CREATE OR REPLACE FUNCTION public.fin_rec_draft_save(_occ uuid, _issue date, _due date, _sf date, _st date, _lines jsonb, _note text, _base_rev integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE tid uuid; cid uuid; t fin_recurring_templates; o fin_recurring_occurrences; l jsonb; ih text; comp jsonb;
BEGIN
  SELECT template_id, company_id INTO tid, cid FROM fin_recurring_occurrences WHERE id = _occ;
  IF tid IS NULL OR NOT public.fin_can_write(cid) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO t FROM fin_recurring_templates WHERE id = tid FOR UPDATE;
  SELECT * INTO o FROM fin_recurring_occurrences WHERE id = _occ FOR UPDATE;
  _note := nullif(btrim(coalesce(_note,'')),'');
  l := public.fin_rec_lines(_lines);
  ih := public.fin_rec_input_hash(_issue, _due, _sf, _st, l, _note);
  IF o.input_hash = ih AND (o.status <> 'brouillon' OR _base_rev IS NOT DISTINCT FROM o.rev - 1) THEN RETURN to_jsonb(o); END IF;
  IF o.status <> 'brouillon' THEN RAISE EXCEPTION 'Occurrence % : brouillon non modifiable', CASE o.status WHEN 'emise' THEN 'émise' ELSE 'abandonnée' END USING ERRCODE = 'P0409'; END IF;
  IF _base_rev IS DISTINCT FROM o.rev THEN RAISE EXCEPTION 'Brouillon modifié ailleurs : rechargez-le' USING ERRCODE = 'P0409'; END IF;
  PERFORM public.fin_rec_check_dates(_issue, _due, _sf, _st);
  IF length(coalesce(_note,'')) > 500 THEN RAISE EXCEPTION 'Note trop longue (500)' USING ERRCODE = '22023'; END IF;
  comp := public.fin_rec_compute(cid, t.client_id, l, o.prices_include_tax, _issue);
  IF o.input_hash = ih AND o.hash = md5(ih || comp::text) THEN RETURN to_jsonb(o); END IF;
  UPDATE fin_recurring_occurrences SET issue_date = _issue, due_date = _due, service_from = _sf, service_to = _st, lines = l, note = _note,
    computed = comp, input_hash = ih, hash = md5(ih || comp::text), rev = rev + 1 WHERE id = _occ RETURNING * INTO o;
  RETURN to_jsonb(o);
END $$;

-- Émission : une facture figée, un numéro, une seule entrée attendue (moteur FIN-08 / FIN-07).
CREATE OR REPLACE FUNCTION public.fin_rec_issue(_occ uuid, _key text, _expect_rev integer, _expect_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE tid uuid; cid uuid; t fin_recurring_templates; o fin_recurring_occurrences; comp jsonb; r jsonb; c jsonb; cs ent_crm_settings; st fin_invoice_settings; co jsc_companies;
  n integer; num text; inv uuid; inf uuid; tax jsonb;
BEGIN
  SELECT template_id, company_id INTO tid, cid FROM fin_recurring_occurrences WHERE id = _occ;
  IF tid IS NULL OR NOT public.fin_can_write(cid) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM fin_recurring_templates WHERE id = tid FOR UPDATE;
  SELECT * INTO o FROM fin_recurring_occurrences WHERE id = _occ FOR UPDATE;
  IF o.status = 'emise' THEN
    IF o.issue_key = _key AND o.rev IS NOT DISTINCT FROM _expect_rev AND o.hash IS NOT DISTINCT FROM _expect_hash THEN
      RETURN jsonb_build_object('invoice_id', o.invoice_id, 'number', (SELECT number FROM fin_invoices WHERE id = o.invoice_id), 'already', true); END IF;
    RAISE EXCEPTION 'Occurrence déjà émise : clé, révision ou empreinte différente' USING ERRCODE = 'P0409';
  END IF;
  IF o.status <> 'brouillon' THEN RAISE EXCEPTION 'Occurrence abandonnée : émission impossible' USING ERRCODE = 'P0409'; END IF;
  IF EXISTS (SELECT 1 FROM fin_recurring_occurrences WHERE company_id = cid AND issue_key = _key) THEN RAISE EXCEPTION 'Clé déjà utilisée' USING ERRCODE = 'P0409'; END IF;
  IF o.rev IS DISTINCT FROM _expect_rev OR o.hash IS DISTINCT FROM _expect_hash THEN RAISE EXCEPTION 'Brouillon modifié depuis l''aperçu : actualisez l''aperçu' USING ERRCODE = 'P0409'; END IF;
  PERFORM public.fin_rec_check_dates(o.issue_date, o.due_date, o.service_from, o.service_to);
  PERFORM public.fin_rec_lines(o.lines);
  comp := public.fin_rec_compute(cid, t.client_id, o.lines, o.prices_include_tax, o.issue_date);
  IF comp IS DISTINCT FROM o.computed THEN RAISE EXCEPTION 'Profil fiscal, taux ou client changé depuis l''aperçu : actualisez l''aperçu (aucune émission)' USING ERRCODE = 'P0409'; END IF;
  r := comp->'tax'; c := comp->'client';
  IF NOT coalesce((r->>'resolved')::boolean, false) THEN
    RAISE EXCEPTION 'Taxes à déterminer : %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'reasons','[]'::jsonb))), ' ; ') USING ERRCODE = '22023'; END IF;
  IF c->>'id' IS NULL OR coalesce(c->>'name','') = '' THEN RAISE EXCEPTION 'Client introuvable ou sans nom' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cs FROM ent_crm_settings WHERE company_id = cid;
  tax := r || jsonb_build_object('final', true, 'recurring', jsonb_build_object('template_id', t.id, 'label', t.label, 'contract_ref', t.contract_ref, 'version', o.version,
    'occ_key', o.occ_key, 'scheduled_on', o.scheduled_on, 'planned_on', o.planned_on, 'service_from', o.service_from, 'service_to', o.service_to, 'occurrence_id', o.id));
  INSERT INTO fin_invoice_settings(company_id) VALUES (cid) ON CONFLICT DO NOTHING;
  SELECT * INTO st FROM fin_invoice_settings WHERE company_id = cid FOR UPDATE;
  n := st.next_number; num := st.prefix || lpad(n::text, 5, '0');
  WHILE EXISTS (SELECT 1 FROM fin_invoices WHERE company_id = cid AND number = num) LOOP n := n + 1; num := st.prefix || lpad(n::text, 5, '0'); END LOOP;
  UPDATE fin_invoice_settings SET next_number = n + 1 WHERE company_id = cid;
  SELECT * INTO co FROM jsc_companies WHERE id = cid;
  PERFORM set_config('fin.recurring', 'on', true); PERFORM set_config('fin.invoice_issue', 'on', true);
  INSERT INTO fin_invoices (company_id, status, number, seq, client_id, client_name, client_address, client_email, client_phone, project_id, issue_date, due_date, terms, lines, prices_include_tax,
    tax_snapshot, subtotal, total, seller_snapshot, client_snapshot, template_snapshot, issued_at, issued_by, recurrence_occurrence_id, private_note, created_by)
  VALUES (cid, 'emise', num, n, t.client_id, c->>'name', c->>'address', c->>'email', c->>'phone', t.project_id, o.issue_date, o.due_date, o.terms, o.lines, o.prices_include_tax,
    tax, (r->>'pre_tax')::numeric, (r->>'total')::numeric,
    jsonb_build_object('name', co.name, 'legal_name', co.legal_name, 'address', co.address, 'phone', co.phone, 'email', co.email,
      'gst_number', CASE WHEN cs.gst_status='inscrit' THEN cs.gst_number END, 'qst_number', CASE WHEN cs.qst_status='inscrit' THEN cs.qst_number END),
    jsonb_build_object('name', c->>'name', 'address', c->>'address', 'email', c->>'email', 'phone', c->>'phone'),
    jsonb_build_object('key', st.template_key, 'version', st.template_version, 'logo_path', st.logo_path, 'color', st.brand_color, 'footer', st.footer, 'custom_ref', st.custom_template_ref),
    now(), auth.uid(), o.id, o.note, auth.uid())
  RETURNING id INTO inv;
  INSERT INTO fin_expected_inflows (company_id, amount, received, expected_on, counterparty, certainty, kind, note, invoice_id)
  VALUES (cid, (r->>'total')::numeric, 0, o.due_date, c->>'name', 'certain', 'revenue', 'Facture ' || num, inv) RETURNING id INTO inf;
  UPDATE fin_invoices SET expected_inflow_id = inf WHERE id = inv;
  PERFORM set_config('fin.invoice_issue', '', true); PERFORM set_config('fin.recurring', '', true);
  UPDATE fin_recurring_occurrences SET status = 'emise', invoice_id = inv, issue_key = _key, issued_at = now(), issued_by = auth.uid() WHERE id = o.id;
  INSERT INTO fin_recurring_events (template_id, company_id, action, detail, actor) VALUES (t.id, cid, 'issue', jsonb_build_object('occ_key', o.occ_key, 'number', num, 'invoice_id', inv), auth.uid());
  RETURN jsonb_build_object('invoice_id', inv, 'number', num, 'already', false);
END $$;

-- Abandon motivé : occurrence ignorée conservée (jamais recréée).
CREATE OR REPLACE FUNCTION public.fin_rec_abandon(_occ uuid, _key text, _reason text, _expect_rev integer, _expect_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE tid uuid; cid uuid; t fin_recurring_templates; o fin_recurring_occurrences;
BEGIN
  SELECT template_id, company_id INTO tid, cid FROM fin_recurring_occurrences WHERE id = _occ;
  IF tid IS NULL OR NOT public.fin_can_write(cid) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  _reason := btrim(coalesce(_reason,''));
  SELECT * INTO t FROM fin_recurring_templates WHERE id = tid FOR UPDATE;
  SELECT * INTO o FROM fin_recurring_occurrences WHERE id = _occ FOR UPDATE;
  IF o.status = 'abandonnee' THEN
    IF o.abandon_key = _key AND o.abandon_reason = _reason AND o.rev IS NOT DISTINCT FROM _expect_rev AND o.hash IS NOT DISTINCT FROM _expect_hash THEN
      RETURN jsonb_build_object('id', o.id, 'status', o.status, 'already', true); END IF;
    RAISE EXCEPTION 'Occurrence déjà abandonnée : clé ou contenu différent' USING ERRCODE = 'P0409';
  END IF;
  IF o.status <> 'brouillon' THEN RAISE EXCEPTION 'Occurrence émise : abandon impossible (une note de crédit sera requise)' USING ERRCODE = 'P0409'; END IF;
  IF EXISTS (SELECT 1 FROM fin_recurring_occurrences WHERE company_id = cid AND abandon_key = _key) THEN RAISE EXCEPTION 'Clé déjà utilisée' USING ERRCODE = 'P0409'; END IF;
  IF o.rev IS DISTINCT FROM _expect_rev OR o.hash IS DISTINCT FROM _expect_hash THEN RAISE EXCEPTION 'Brouillon modifié ailleurs : rechargez-le' USING ERRCODE = 'P0409'; END IF;
  IF _reason = '' OR length(_reason) > 500 THEN RAISE EXCEPTION 'Motif requis (500 caractères au plus)' USING ERRCODE = '22023'; END IF;
  UPDATE fin_recurring_occurrences SET status = 'abandonnee', abandon_key = _key, abandon_reason = _reason, abandoned_at = now(), abandoned_by = auth.uid() WHERE id = o.id;
  INSERT INTO fin_recurring_events (template_id, company_id, action, reason, detail, actor) VALUES (t.id, cid, 'abandon', _reason, jsonb_build_object('occ_key', o.occ_key), auth.uid());
  RETURN jsonb_build_object('id', o.id, 'status', 'abandonnee', 'already', false);
END $$;

-- Lectures.
CREATE OR REPLACE FUNCTION public.fin_rec_list(_company uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'contract_ref', t.contract_ref, 'status', t.status, 'client_name', c.name, 'version', t.current_version,
      'drafts', (SELECT count(*) FROM fin_recurring_occurrences o WHERE o.template_id = t.id AND o.status = 'brouillon'),
      'issued', (SELECT count(*) FROM fin_recurring_occurrences o WHERE o.template_id = t.id AND o.status = 'emise')) ORDER BY t.created_at DESC), '[]'::jsonb)
    FROM fin_recurring_templates t LEFT JOIN ent_crm_clients c ON c.id = t.client_id WHERE t.company_id = _company);
END $$;

CREATE OR REPLACE FUNCTION public.fin_rec_summary(_template uuid, _from date, _to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t fin_recurring_templates;
BEGIN
  SELECT * INTO t FROM fin_recurring_templates WHERE id = _template;
  IF t.id IS NULL OR NOT public.fin_can_read(t.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from OR _to - _from > 1100 THEN RAISE EXCEPTION 'Fenêtre d''aperçu : 3 ans au plus' USING ERRCODE = '22023'; END IF;
  RETURN to_jsonb(t) - 'create_hash' - 'create_key' || jsonb_build_object(
    'client_name', (SELECT name FROM ent_crm_clients WHERE id = t.client_id),
    'project_name', (SELECT name FROM ent_crm_projects WHERE id = t.project_id),
    'versions', (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.version), '[]'::jsonb) FROM fin_recurring_versions v WHERE v.template_id = t.id),
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('action', e.action, 'reason', e.reason, 'detail', e.detail, 'at', e.created_at, 'actor', (SELECT email FROM auth.users u WHERE u.id = e.actor)) ORDER BY e.created_at DESC), '[]'::jsonb) FROM fin_recurring_events e WHERE e.template_id = t.id),
    'occurrences', (SELECT coalesce(jsonb_agg(to_jsonb(o) - 'batch_key' || jsonb_build_object('invoice_number', i.number) ORDER BY o.scheduled_on, o.occ_key), '[]'::jsonb)
      FROM fin_recurring_occurrences o LEFT JOIN fin_invoices i ON i.id = o.invoice_id WHERE o.template_id = t.id),
    'calendar', (SELECT coalesce(jsonb_agg(jsonb_build_object('key', g.occ_key, 'version', g.version, 'scheduled', g.scheduled_on, 'planned', g.planned_on,
        'status', (SELECT o.status FROM fin_recurring_occurrences o WHERE o.template_id = t.id AND o.occ_key = g.occ_key)) ORDER BY g.scheduled_on, g.occ_key), '[]'::jsonb)
      FROM (SELECT * FROM public.fin_rec_gen(t.id, _from, _to) LIMIT 300) g));
END $$;

REVOKE ALL ON FUNCTION public.fin_rec_lines(jsonb), public.fin_rec_rule(jsonb), public.fin_rec_gen(uuid, date, date), public.fin_rec_compute(uuid, uuid, jsonb, boolean, date),
  public.fin_rec_input_hash(date, date, date, date, jsonb, text), public.fin_rec_check_dates(date, date, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fin_rec_rule_preview(uuid, jsonb, date, date, date), public.fin_rec_template_create(uuid, text, uuid, uuid, text, text, jsonb, jsonb, boolean, text, integer),
  public.fin_rec_version_add(uuid, text, date, jsonb, jsonb, boolean, text, integer, integer), public.fin_rec_set_status(uuid, text, text, text, integer),
  public.fin_rec_prepare(uuid, text, text[], integer), public.fin_rec_draft_save(uuid, date, date, date, date, jsonb, text, integer),
  public.fin_rec_issue(uuid, text, integer, text), public.fin_rec_abandon(uuid, text, text, integer, text), public.fin_rec_list(uuid), public.fin_rec_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_rec_rule_preview(uuid, jsonb, date, date, date), public.fin_rec_template_create(uuid, text, uuid, uuid, text, text, jsonb, jsonb, boolean, text, integer),
  public.fin_rec_version_add(uuid, text, date, jsonb, jsonb, boolean, text, integer, integer), public.fin_rec_set_status(uuid, text, text, text, integer),
  public.fin_rec_prepare(uuid, text, text[], integer), public.fin_rec_draft_save(uuid, date, date, date, date, jsonb, text, integer),
  public.fin_rec_issue(uuid, text, integer, text), public.fin_rec_abandon(uuid, text, text, integer, text), public.fin_rec_list(uuid), public.fin_rec_summary(uuid, date, date) TO authenticated;