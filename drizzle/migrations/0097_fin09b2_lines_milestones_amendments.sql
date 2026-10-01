-- FIN-09B2 — Quantités par ligne, jalons, avenants approuvés (dans le dossier progressif B1).
ALTER TABLE public.fin_progress_plans
  ADD COLUMN IF NOT EXISTS track text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS contract_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lines jsonb;
ALTER TABLE public.fin_progress_plans ADD CONSTRAINT fin_progress_plans_track_check CHECK (track IN ('global','lines','milestones'));
UPDATE public.fin_progress_plans p SET lines = (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(l) = 'object' THEN l || jsonb_build_object('id', 'L' || o) ELSE l END ORDER BY o), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(p.source->'lines', '[]'::jsonb)) WITH ORDINALITY t(l, o)) WHERE p.lines IS NULL;

CREATE TABLE public.fin_progress_contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.fin_progress_plans(id),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  version integer NOT NULL,
  lines jsonb NOT NULL,
  contract jsonb NOT NULL,
  amendment_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version)
);
CREATE TABLE public.fin_progress_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.fin_progress_plans(id),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  ord integer NOT NULL CHECK (ord BETWEEN 1 AND 999),
  title text NOT NULL,
  due_hint date,
  share numeric(14,2) NOT NULL CHECK (share > 0),
  status text NOT NULL DEFAULT 'prevu' CHECK (status IN ('prevu','realise','facture','archive')),
  create_key text NOT NULL,
  rev integer NOT NULL DEFAULT 1,
  done_at timestamptz, done_by uuid,
  situation_id uuid REFERENCES public.fin_progress_situations(id),
  invoice_id uuid REFERENCES public.fin_invoices(id),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, create_key)
);
CREATE TABLE public.fin_progress_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.fin_progress_plans(id),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  seq integer NOT NULL,
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','approuve','abandonne','rejete')),
  reason text NOT NULL,
  changes jsonb NOT NULL,
  impact jsonb NOT NULL,
  approval_ref text, approval_date date, approver_name text,
  ref_quote_id uuid REFERENCES public.ent_crm_quotes(id),
  from_version integer NOT NULL, to_version integer,
  input_hash text NOT NULL, hash text NOT NULL, rev integer NOT NULL DEFAULT 1,
  draft_key text NOT NULL, approve_key text, close_key text, close_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz, approved_by uuid, closed_at timestamptz, closed_by uuid,
  UNIQUE (company_id, draft_key)
);
ALTER TABLE public.fin_progress_situations ADD COLUMN IF NOT EXISTS milestone_id uuid REFERENCES public.fin_progress_milestones(id);
ALTER TABLE public.fin_progress_situations DROP CONSTRAINT fin_progress_situations_mode_check;
ALTER TABLE public.fin_progress_situations ADD CONSTRAINT fin_progress_situations_mode_check CHECK (mode IN ('pct','amount','amount_ttc','lines','jalon'));

REVOKE ALL ON public.fin_progress_contract_versions, public.fin_progress_milestones, public.fin_progress_amendments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fin_progress_contract_versions, public.fin_progress_milestones, public.fin_progress_amendments TO authenticated;
GRANT ALL ON public.fin_progress_contract_versions, public.fin_progress_milestones, public.fin_progress_amendments TO service_role;
ALTER TABLE public.fin_progress_contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_progress_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_progress_amendments ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.fin_progress_contract_versions FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY r ON public.fin_progress_milestones FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY r ON public.fin_progress_amendments FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

INSERT INTO public.fin_progress_contract_versions (plan_id, company_id, version, lines, contract, created_by, created_at)
  SELECT id, company_id, 1, lines, contract, created_by, created_at FROM public.fin_progress_plans p
  WHERE NOT EXISTS (SELECT 1 FROM public.fin_progress_contract_versions v WHERE v.plan_id = p.id);

-- Immutabilité : versions jamais modifiées; jalon facturé figé; avenant clos figé; aucune suppression.
CREATE OR REPLACE FUNCTION public.fin_progress_b2_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Suppression interdite (historique conservé)'; END IF;
  IF TG_TABLE_NAME = 'fin_progress_contract_versions' THEN RAISE EXCEPTION 'Version de contrat immuable'; END IF;
  IF TG_TABLE_NAME = 'fin_progress_milestones' AND OLD.status = 'facture' THEN RAISE EXCEPTION 'Jalon facturé immuable'; END IF;
  IF TG_TABLE_NAME = 'fin_progress_amendments' AND OLD.status <> 'brouillon' THEN RAISE EXCEPTION 'Avenant clos immuable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_progress_b2_guard_t BEFORE UPDATE OR DELETE ON public.fin_progress_contract_versions FOR EACH ROW EXECUTE FUNCTION public.fin_progress_b2_guard();
CREATE TRIGGER fin_progress_b2_guard_t BEFORE UPDATE OR DELETE ON public.fin_progress_milestones FOR EACH ROW EXECUTE FUNCTION public.fin_progress_b2_guard();
CREATE TRIGGER fin_progress_b2_guard_t BEFORE UPDATE OR DELETE ON public.fin_progress_amendments FOR EACH ROW EXECUTE FUNCTION public.fin_progress_b2_guard();

-- Nouveau dossier : identifiants de ligne stables + version 1 du contrat.
CREATE OR REPLACE FUNCTION public.fin_progress_plan_b2_init() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND TG_WHEN = 'BEFORE' THEN
    NEW.lines := (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(l) = 'object' THEN l || jsonb_build_object('id', 'L' || o) ELSE l END ORDER BY o), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(NEW.source->'lines', '[]'::jsonb)) WITH ORDINALITY t(l, o));
    NEW.contract_version := 1; NEW.track := 'global';
    RETURN NEW;
  END IF;
  INSERT INTO fin_progress_contract_versions (plan_id, company_id, version, lines, contract, created_by) VALUES (NEW.id, NEW.company_id, 1, NEW.lines, NEW.contract, NEW.created_by);
  RETURN NULL;
END $$;
CREATE TRIGGER fin_progress_plan_b2_init_b BEFORE INSERT ON public.fin_progress_plans FOR EACH ROW EXECUTE FUNCTION public.fin_progress_plan_b2_init();
CREATE TRIGGER fin_progress_plan_b2_init_a AFTER INSERT ON public.fin_progress_plans FOR EACH ROW EXECUTE FUNCTION public.fin_progress_plan_b2_init();

-- Montant d'une ligne : formule exacte du moteur commun fin_tax_compute (brut arrondi, remise arrondie).
CREATE OR REPLACE FUNCTION public.fin_progress_line_amt(_q numeric, _price numeric, _disc numeric) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT round(_q * _price, 2) - round(round(_q * _price, 2) * coalesce(_disc, 0) / 100, 2)
$$;
CREATE OR REPLACE FUNCTION public.fin_progress_cap(_plan uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    't', CASE WHEN coalesce((contract->>'prices_include_tax')::boolean, false) THEN (contract->>'bt')::numeric + (contract->>'gst')::numeric + (contract->>'qst')::numeric ELSE (contract->>'bt')::numeric END,
    'z', (contract->>'bz')::numeric, 'e', (contract->>'be')::numeric,
    'billed_t', (SELECT coalesce(sum((computed->'cap_new'->>'t')::numeric), 0) FROM fin_progress_situations WHERE plan_id = _plan AND status = 'emise'),
    'billed_z', (SELECT coalesce(sum((computed->'cap_new'->>'z')::numeric), 0) FROM fin_progress_situations WHERE plan_id = _plan AND status = 'emise'),
    'billed_e', (SELECT coalesce(sum((computed->'cap_new'->>'e')::numeric), 0) FROM fin_progress_situations WHERE plan_id = _plan AND status = 'emise'),
    'allocated', (SELECT coalesce(sum(share), 0) FROM fin_progress_milestones WHERE plan_id = _plan AND status <> 'archive'))
  FROM fin_progress_plans WHERE id = _plan
$$;
-- État des lignes du contrat en vigueur : quantité/montant contractuels, déjà facturés (suivi par lignes).
CREATE OR REPLACE FUNCTION public.fin_progress_lines_state(_plan uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (
    SELECT e.key AS k, max((e.value->>'q')::numeric) AS q, sum((e.value->>'amt')::numeric) AS a
    FROM fin_progress_situations s, jsonb_each(coalesce(s.computed->'line_parts', '{}'::jsonb)) e
    WHERE s.plan_id = _plan AND s.status = 'emise' GROUP BY e.key)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', l->>'id', 'desc', l->>'desc', 'unit', l->>'unit', 'tax', coalesce(l->>'tax', 'a_determiner'),
      'qty', (l->>'qty')::numeric, 'price', (l->>'price')::numeric, 'disc_pct', nullif(l->>'disc_pct', '')::numeric,
      'amount', public.fin_progress_line_amt((l->>'qty')::numeric, (l->>'price')::numeric, nullif(l->>'disc_pct', '')::numeric),
      'billed_qty', coalesce(b.q, 0), 'billed_amt', coalesce(b.a, 0)) ORDER BY o), '[]'::jsonb)
  FROM fin_progress_plans p, jsonb_array_elements(p.lines) WITH ORDINALITY t(l, o) LEFT JOIN b ON b.k = l->>'id'
  WHERE p.id = _plan AND jsonb_typeof(l) = 'object' AND coalesce(l->>'qty', '') <> '' AND coalesce(l->>'price', '') <> ''
$$;
-- Quantités cumulées saisies : objet {id: "texte décimal"}, identifiants dupliqués refusés, forme canonique.
CREATE OR REPLACE FUNCTION public.fin_progress_qty_canon(_value text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE j json; n integer; d integer;
BEGIN
  BEGIN j := _value::json; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Quantités illisibles' USING ERRCODE = '22023'; END;
  IF json_typeof(j) <> 'object' THEN RAISE EXCEPTION 'Quantités illisibles' USING ERRCODE = '22023'; END IF;
  SELECT count(*), count(DISTINCT k) INTO n, d FROM json_object_keys(j) k;
  IF n <> d THEN RAISE EXCEPTION 'Identifiant de ligne dupliqué' USING ERRCODE = '22023'; END IF;
  RETURN (j::jsonb)::text;
END $$;

CREATE OR REPLACE FUNCTION public.fin_progress_compute_lines(_plan uuid, _kind text, _value text, _on date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c jsonb; pit boolean; st jsonb; l jsonb; inp jsonb; k text; id text; cq numeric; bq numeric; ba numeric; qq numeric; amt numeric; part numeric;
  cc numeric := 0; x numeric := 0; prevc numeric := 0; taxl jsonb := '[]'::jsonb; parts jsonb := '{}'::jsonb; det jsonb := '[]'::jsonb;
  tn numeric := 0; zn numeric := 0; en numeric := 0; cap jsonb; r jsonb; pv jsonb; nw jsonb; cum jsonb;
BEGIN
  SELECT contract INTO c FROM fin_progress_plans WHERE id = _plan;
  pit := coalesce((c->>'prices_include_tax')::boolean, false);
  IF _kind IS NULL OR _kind NOT IN ('situation','solde') THEN RAISE EXCEPTION 'Suivi par lignes : type « situation » ou « solde final » seulement' USING ERRCODE = '22023'; END IF;
  st := public.fin_progress_lines_state(_plan);
  IF _kind <> 'solde' THEN
    inp := public.fin_progress_qty_canon(_value)::jsonb;
    FOR k IN SELECT jsonb_object_keys(inp) LOOP
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(st) e WHERE e->>'id' = k) THEN RAISE EXCEPTION 'Ligne inconnue : %', k USING ERRCODE = '22023'; END IF;
    END LOOP;
  END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(st) LOOP
    id := l->>'id'; qq := (l->>'qty')::numeric; bq := (l->>'billed_qty')::numeric; ba := (l->>'billed_amt')::numeric;
    IF _kind = 'solde' THEN cq := qq;
    ELSIF inp ? id THEN
      IF jsonb_typeof(inp->id) <> 'string' OR (inp->>id) !~ '^\d{1,12}(\.\d{1,4})?$' THEN
        RAISE EXCEPTION 'Quantité invalide pour la ligne % : nombre fini positif ou nul, au plus 4 décimales', id USING ERRCODE = '22023'; END IF;
      cq := (inp->>id)::numeric;
    ELSE cq := bq; END IF;
    IF cq < bq THEN RAISE EXCEPTION 'Cumul diminué pour la ligne % (déjà facturé : %)', id, bq USING ERRCODE = '22023'; END IF;
    IF cq > qq THEN RAISE EXCEPTION 'Dépassement de la ligne % : cumul % supérieur à la quantité contractuelle %', id, cq, qq USING ERRCODE = '22023'; END IF;
    amt := CASE WHEN cq = qq THEN (l->>'amount')::numeric ELSE public.fin_progress_line_amt(cq, (l->>'price')::numeric, (l->>'disc_pct')::numeric) END;
    part := amt - ba;
    IF part < 0 THEN RAISE EXCEPTION 'Arrondi : part négative sur la ligne %', id USING ERRCODE = '22023'; END IF;
    cc := cc + (l->>'amount')::numeric; x := x + amt; prevc := prevc + ba;
    IF part <> 0 THEN
      taxl := taxl || jsonb_build_object('qty', 1, 'price', part, 'tax', l->>'tax', 'unit', l->>'unit', 'desc', l->>'desc',
        'prog', jsonb_build_object('line_id', id, 'qty_new', cq - bq, 'qty_cum', cq, 'qty_contract', qq, 'unit_price', l->'price', 'disc_pct', l->'disc_pct'));
      CASE l->>'tax' WHEN 'taxable' THEN tn := tn + part; WHEN 'detaxe' THEN zn := zn + part; WHEN 'exonere' THEN en := en + part;
        ELSE RAISE EXCEPTION 'Ligne % au traitement fiscal à déterminer', id; END CASE;
    END IF;
    IF cq > bq OR part <> 0 THEN parts := parts || jsonb_build_object(id, jsonb_build_object('q', cq, 'amt', part)); END IF;
    det := det || (l || jsonb_build_object('cum_qty', cq, 'new_qty', cq - bq, 'cum_amt', amt, 'new_amt', part, 'rest_qty', qq - cq, 'rest_amt', (l->>'amount')::numeric - amt));
  END LOOP;
  cap := public.fin_progress_cap(_plan);
  IF cc <> (cap->>'t')::numeric + (cap->>'z')::numeric + (cap->>'e')::numeric THEN RAISE EXCEPTION 'Lignes incohérentes avec le contrat en vigueur'; END IF;
  IF jsonb_array_length(taxl) = 0 THEN RAISE EXCEPTION 'Aucun montant à facturer : facture vide refusée' USING ERRCODE = '22023'; END IF;
  r := public.fin_tax_compute(taxl, pit, c->>'gst_status', c->>'qst_status', coalesce(_on, (now() AT TIME ZONE 'America/Toronto')::date));
  IF NOT coalesce((r->>'resolved')::boolean, false) THEN RAISE EXCEPTION 'Taxes non résolues à cette date : %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(r->'reasons')), ' ; '); END IF;
  SELECT jsonb_build_object('bt', coalesce(sum((computed->'new'->>'bt')::numeric),0), 'bz', coalesce(sum((computed->'new'->>'bz')::numeric),0), 'be', coalesce(sum((computed->'new'->>'be')::numeric),0),
      'gst', coalesce(sum((computed->'new'->>'gst')::numeric),0), 'qst', coalesce(sum((computed->'new'->>'qst')::numeric),0),
      'ht', coalesce(sum((computed->'new'->>'ht')::numeric),0), 'total', coalesce(sum((computed->'new'->>'total')::numeric),0))
    INTO pv FROM fin_progress_situations WHERE plan_id = _plan AND status = 'emise';
  nw := jsonb_build_object('bt', (r->>'taxable_base')::numeric, 'bz', (r->>'zero_rated_base')::numeric, 'be', (r->>'exempt_base')::numeric,
    'gst', (r->>'gst')::numeric, 'qst', (r->>'qst')::numeric, 'ht', (r->>'pre_tax')::numeric, 'total', (r->>'total')::numeric);
  cum := jsonb_build_object('bt', (pv->>'bt')::numeric + (nw->>'bt')::numeric, 'bz', (pv->>'bz')::numeric + (nw->>'bz')::numeric, 'be', (pv->>'be')::numeric + (nw->>'be')::numeric,
    'gst', (pv->>'gst')::numeric + (nw->>'gst')::numeric, 'qst', (pv->>'qst')::numeric + (nw->>'qst')::numeric,
    'ht', (pv->>'ht')::numeric + (nw->>'ht')::numeric, 'total', (pv->>'total')::numeric + (nw->>'total')::numeric, 'pct', round(x * 100 / cc, 2), 'cap', x);
  RETURN jsonb_build_object('basis', CASE WHEN pit THEN 'ttc' ELSE 'ht' END,
    'contract', jsonb_build_object('bt', c->'bt', 'bz', c->'bz', 'be', c->'be', 'gst', c->'gst', 'qst', c->'qst', 'ht', c->'ht', 'total', c->'total', 'cap', cc),
    'prev', pv || jsonb_build_object('cap', prevc), 'cum', cum, 'new', nw || jsonb_build_object('cap', x - prevc),
    'cap_new', jsonb_build_object('t', tn, 'z', zn, 'e', en),
    'remaining', jsonb_build_object('cap', cc - x, 'ht', (c->>'ht')::numeric - (cum->>'ht')::numeric, 'total', (c->>'total')::numeric - (cum->>'total')::numeric),
    'gap_vs_quote', CASE WHEN x = cc THEN jsonb_build_object('ht', (cum->>'ht')::numeric - (c->>'ht')::numeric, 'gst', (cum->>'gst')::numeric - (c->>'gst')::numeric,
      'qst', (cum->>'qst')::numeric - (c->>'qst')::numeric, 'total', (cum->>'total')::numeric - (c->>'total')::numeric) END,
    'lines', taxl, 'inv_lines', taxl, 'line_parts', parts, 'lines_detail', det, 'tax', r);
END $$;

CREATE OR REPLACE FUNCTION public.fin_progress_compute_any(_plan uuid, _kind text, _mode text, _value text, _on date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p fin_progress_plans; m fin_progress_milestones; cap jsonb; cc numeric; prev numeric; x numeric; r jsonb; pit boolean;
BEGIN
  SELECT * INTO p FROM fin_progress_plans WHERE id = _plan;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Dossier introuvable'; END IF;
  IF p.track = 'global' THEN
    IF _mode IS NULL OR _mode NOT IN ('pct','amount','amount_ttc') THEN RAISE EXCEPTION 'Mode incompatible avec le suivi global' USING ERRCODE = '22023'; END IF;
    r := public.fin_progress_compute(_plan, _kind, _mode, _value, _on);
  ELSIF p.track = 'lines' THEN
    IF _mode IS DISTINCT FROM 'lines' THEN RAISE EXCEPTION 'Dossier suivi par quantités : saisie par ligne requise' USING ERRCODE = '22023'; END IF;
    r := public.fin_progress_compute_lines(_plan, _kind, _value, _on);
  ELSE
    IF _mode IS DISTINCT FROM 'jalon' OR _kind IS DISTINCT FROM 'situation' THEN RAISE EXCEPTION 'Dossier suivi par jalons : facturez un jalon réalisé' USING ERRCODE = '22023'; END IF;
    IF coalesce(_value, '') !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'Jalon requis' USING ERRCODE = '22023'; END IF;
    SELECT * INTO m FROM fin_progress_milestones WHERE id = _value::uuid AND plan_id = _plan;
    IF m.id IS NULL THEN RAISE EXCEPTION 'Jalon introuvable dans ce dossier' USING ERRCODE = '22023'; END IF;
    IF m.status = 'facture' THEN RAISE EXCEPTION 'Jalon déjà facturé : double facturation refusée' USING ERRCODE = '22023'; END IF;
    IF m.status <> 'realise' THEN RAISE EXCEPTION 'Jalon non réalisé : facturation refusée' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM fin_progress_milestones WHERE plan_id = _plan AND status = 'realise' AND id <> m.id AND (ord, created_at) < (m.ord, m.created_at)) THEN
      RAISE EXCEPTION 'Facturez d''abord le jalon réalisé précédent' USING ERRCODE = '22023'; END IF;
    cap := public.fin_progress_cap(_plan); pit := coalesce((p.contract->>'prices_include_tax')::boolean, false);
    cc := (cap->>'t')::numeric + (cap->>'z')::numeric + (cap->>'e')::numeric;
    prev := (cap->>'billed_t')::numeric + (cap->>'billed_z')::numeric + (cap->>'billed_e')::numeric;
    x := prev + m.share;
    IF x > cc THEN RAISE EXCEPTION 'Jalon supérieur au reste du plafond' USING ERRCODE = '22023'; END IF;
    IF x = cc THEN r := public.fin_progress_compute(_plan, 'solde', NULL, NULL, _on);
    ELSE r := public.fin_progress_compute(_plan, 'situation', CASE WHEN pit THEN 'amount_ttc' ELSE 'amount' END, to_char(x, 'FM999999999990.00'), _on); END IF;
    r := r || jsonb_build_object('milestone', jsonb_build_object('id', m.id, 'title', m.title, 'ord', m.ord, 'share', m.share, 'done_at', m.done_at));
  END IF;
  RETURN r || jsonb_build_object('track', p.track, 'contract_version', p.contract_version);
END $$;

-- Brouillon de situation : même contrat que B1, mode imposé par le suivi du dossier.
CREATE OR REPLACE FUNCTION public.fin_progress_draft_save(_plan uuid, _draft_key text, _kind text, _mode text, _value text, _issue_date date, _due_date date, _base_rev integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE p fin_progress_plans; s fin_progress_situations; ih text; comp jsonb; mid uuid;
BEGIN
  SELECT * INTO p FROM fin_progress_plans WHERE id = _plan FOR UPDATE;
  IF p.id IS NULL OR NOT public.fin_can_write(p.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_draft_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  IF p.track = 'global' AND _kind = 'solde' THEN _mode := 'pct'; _value := '100'; END IF;
  IF p.track = 'lines' THEN _mode := coalesce(_mode, 'lines'); IF _kind = 'solde' THEN _value := NULL; ELSIF _value IS NOT NULL THEN _value := public.fin_progress_qty_canon(_value); END IF; END IF;
  IF p.track = 'milestones' AND _mode = 'jalon' AND coalesce(_value,'') ~ '^[0-9a-f-]{36}$' THEN mid := _value::uuid; END IF;
  ih := public.fin_progress_input_hash(_kind, _mode, _value, _issue_date, _due_date);
  SELECT * INTO s FROM fin_progress_situations WHERE company_id = p.company_id AND draft_key = _draft_key FOR UPDATE;
  IF s.id IS NOT NULL THEN
    IF s.plan_id <> _plan THEN RAISE EXCEPTION 'Clé déjà utilisée sur un autre dossier' USING ERRCODE = 'P0409'; END IF;
    IF s.input_hash = ih AND (_base_rev IS NOT DISTINCT FROM s.rev OR _base_rev IS NOT DISTINCT FROM s.rev - 1 OR (_base_rev IS NULL AND s.rev = 1)) THEN RETURN to_jsonb(s); END IF;
    IF s.status <> 'brouillon' THEN RAISE EXCEPTION 'Brouillon déjà émis ou abandonné : clé réutilisée avec un autre contenu' USING ERRCODE = 'P0409'; END IF;
    IF _base_rev IS DISTINCT FROM s.rev THEN RAISE EXCEPTION 'Brouillon modifié ailleurs : rechargez-le' USING ERRCODE = 'P0409'; END IF;
    PERFORM public.fin_progress_check_dates(_plan, _issue_date, _due_date);
    comp := public.fin_progress_compute_any(_plan, _kind, _mode, _value, _issue_date);
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

-- Émission : verrous dossier → situation → jalon → facture → numérotation (ordre constant).
CREATE OR REPLACE FUNCTION public.fin_progress_issue(_situation uuid, _issue_key text, _expect_rev integer, _expect_hash text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE pid uuid; cid uuid; p fin_progress_plans; s fin_progress_situations; m fin_progress_milestones; comp jsonb; cs ent_crm_settings; rn jsonb; c ent_crm_clients;
  st fin_invoice_settings; co jsc_companies; n integer; num text; inv uuid; inf uuid; k integer; nw jsonb; lines jsonb := '[]'::jsonb; lbl text; prevs jsonb; ct jsonb; tax jsonb; l jsonb; pit boolean; amds jsonb;
BEGIN
  SELECT plan_id, company_id INTO pid, cid FROM fin_progress_situations WHERE id = _situation;
  IF pid IS NULL OR NOT public.fin_can_write(cid) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_issue_key,'') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM fin_progress_plans WHERE id = pid FOR UPDATE;
  SELECT * INTO s FROM fin_progress_situations WHERE id = _situation FOR UPDATE;
  IF s.status = 'emise' THEN
    IF s.issue_key = _issue_key AND s.rev IS NOT DISTINCT FROM _expect_rev AND s.hash IS NOT DISTINCT FROM _expect_hash THEN RETURN jsonb_build_object('invoice_id', s.invoice_id, 'number', (SELECT number FROM fin_invoices WHERE id = s.invoice_id), 'already', true); END IF;
    RAISE EXCEPTION 'Situation déjà émise : clé, révision ou empreinte différente' USING ERRCODE = 'P0409';
  END IF;
  IF s.status <> 'brouillon' THEN RAISE EXCEPTION 'Brouillon abandonné : émission impossible' USING ERRCODE = 'P0409'; END IF;
  IF EXISTS (SELECT 1 FROM fin_progress_situations WHERE company_id = cid AND issue_key = _issue_key) THEN RAISE EXCEPTION 'Clé déjà utilisée' USING ERRCODE = 'P0409'; END IF;
  IF s.rev IS DISTINCT FROM _expect_rev OR s.hash IS DISTINCT FROM _expect_hash THEN RAISE EXCEPTION 'Brouillon modifié depuis l''aperçu : refaites l''aperçu' USING ERRCODE = 'P0409'; END IF;
  IF s.milestone_id IS NOT NULL THEN SELECT * INTO m FROM fin_progress_milestones WHERE id = s.milestone_id FOR UPDATE; END IF;
  PERFORM public.fin_progress_check_dates(pid, s.issue_date, s.due_date);
  ct := p.contract; pit := coalesce((ct->>'prices_include_tax')::boolean, false);
  SELECT * INTO cs FROM ent_crm_settings WHERE company_id = cid;
  rn := public.fin_tax_compute(p.lines, pit, coalesce(cs.gst_status,'a_completer'), coalesce(cs.qst_status,'a_completer'), s.issue_date);
  IF NOT coalesce((rn->>'resolved')::boolean, false) OR rn->>'gst_status' IS DISTINCT FROM ct->>'gst_status' OR rn->>'qst_status' IS DISTINCT FROM ct->>'qst_status'
     OR (rn->>'gst_rate')::numeric IS DISTINCT FROM (ct->>'gst_rate')::numeric OR (rn->>'qst_rate')::numeric IS DISTINCT FROM (ct->>'qst_rate')::numeric
     OR (p.contract_version = 1 AND (rn->>'total')::numeric IS DISTINCT FROM (ct->>'total')::numeric) THEN
    RAISE EXCEPTION 'Profil fiscal ou taux à cette date différent du contrat figé : situation refusée (dossier et factures intacts). Le traitement des changements fiscaux est à venir.';
  END IF;
  comp := public.fin_progress_compute_any(pid, s.kind, s.mode, s.value, s.issue_date);
  IF comp IS DISTINCT FROM s.computed THEN RAISE EXCEPTION 'Montants ou contrat changés depuis l''aperçu : refaites l''aperçu' USING ERRCODE = 'P0409'; END IF;
  SELECT * INTO c FROM ent_crm_clients WHERE id = p.client_id AND company_id = cid;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  k := (SELECT count(*) FROM fin_progress_situations WHERE plan_id = pid AND status = 'emise') + 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('seq', x.seq, 'number', i.number, 'kind', x.kind, 'ht', x.computed->'new'->'ht', 'total', x.computed->'new'->'total') ORDER BY x.seq), '[]'::jsonb)
    INTO prevs FROM fin_progress_situations x JOIN fin_invoices i ON i.id = x.invoice_id WHERE x.plan_id = pid AND x.status = 'emise';
  SELECT coalesce(jsonb_agg(jsonb_build_object('seq', a.seq, 'reason', a.reason, 'version', a.to_version, 'approval_ref', a.approval_ref, 'approval_date', a.approval_date,
      'delta', a.impact->'delta') ORDER BY a.seq), '[]'::jsonb) INTO amds FROM fin_progress_amendments a WHERE a.plan_id = pid AND a.status = 'approuve';
  nw := comp->'new';
  lbl := CASE WHEN m.id IS NOT NULL THEN 'Jalon ' || m.ord || ' « ' || m.title || ' »' WHEN s.kind = 'acompte' THEN 'Acompte' WHEN s.kind = 'situation' THEN 'Situation' ELSE 'Solde final' END
    || ' n° ' || k || ' — soumission ' || coalesce(p.source->>'number','') || ' v' || coalesce(p.source->>'version','1')
    || ' — cumul ' || (comp->'cum'->>'pct') || ' % du contrat' || CASE WHEN p.contract_version > 1 THEN ' révisé (v' || p.contract_version || ')' ELSE '' END;
  IF comp ? 'inv_lines' THEN lines := comp->'inv_lines';
  ELSE
    FOR l IN SELECT * FROM jsonb_array_elements(comp->'lines') LOOP
      lines := lines || (l || jsonb_build_object('unit', 'forfait', 'desc', lbl || CASE l->>'tax' WHEN 'taxable' THEN ' (part taxable)' WHEN 'detaxe' THEN ' (part détaxée)' ELSE ' (part exonérée)' END));
    END LOOP;
  END IF;
  tax := (comp->'tax') || jsonb_build_object('final', true,
    'progress', jsonb_build_object('kind', s.kind, 'seq', k, 'mode', s.mode, 'value', s.value, 'basis', comp->'basis', 'quote_number', p.source->>'number', 'quote_version', p.source->'version',
      'contract', comp->'contract', 'prev', comp->'prev', 'cum', comp->'cum', 'new', nw, 'remaining', comp->'remaining', 'gap_vs_quote', comp->'gap_vs_quote', 'previous', prevs,
      'track', p.track, 'contract_version', p.contract_version, 'label', lbl,
      'initial', (SELECT v.contract FROM fin_progress_contract_versions v WHERE v.plan_id = pid AND v.version = 1), 'amendments', amds,
      'milestone', comp->'milestone'));
  INSERT INTO fin_invoice_settings(company_id) VALUES (cid) ON CONFLICT DO NOTHING;
  SELECT * INTO st FROM fin_invoice_settings WHERE company_id = cid FOR UPDATE;
  n := st.next_number; num := st.prefix || lpad(n::text, 5, '0');
  WHILE EXISTS (SELECT 1 FROM fin_invoices WHERE company_id = cid AND number = num) LOOP n := n + 1; num := st.prefix || lpad(n::text, 5, '0'); END LOOP;
  UPDATE fin_invoice_settings SET next_number = n + 1 WHERE company_id = cid;
  SELECT * INTO co FROM jsc_companies WHERE id = cid;
  PERFORM set_config('fin.progress', 'on', true); PERFORM set_config('fin.invoice_issue', 'on', true);
  INSERT INTO fin_invoices (company_id, status, number, seq, client_id, client_name, client_email, client_phone, issue_date, due_date, terms, lines, prices_include_tax,
    tax_snapshot, subtotal, total, seller_snapshot, client_snapshot, template_snapshot, issued_at, issued_by, progress_situation_id, created_by)
  VALUES (cid, 'emise', num, n, c.id, c.name, c.email, c.phone, s.issue_date, s.due_date, p.source->>'conditions', lines, pit,
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
  IF m.id IS NOT NULL THEN UPDATE fin_progress_milestones SET status = 'facture', situation_id = s.id, invoice_id = inv, rev = rev + 1 WHERE id = m.id; END IF;
  RETURN jsonb_build_object('invoice_id', inv, 'number', num, 'already', false);
END $function$;

-- Choix du suivi : avant toute émission et sans brouillon; jamais de conversion d'anciens cumuls.
CREATE OR REPLACE FUNCTION public.fin_progress_set_track(_plan uuid, _track text, _expect_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p fin_progress_plans; st jsonb; cap jsonb;
BEGIN
  SELECT * INTO p FROM fin_progress_plans WHERE id = _plan FOR UPDATE;
  IF p.id IS NULL OR NOT public.fin_can_write(p.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _track IS NULL OR _track NOT IN ('global','lines','milestones') THEN RAISE EXCEPTION 'Suivi inconnu' USING ERRCODE = '22023'; END IF;
  IF p.track = _track THEN RETURN jsonb_build_object('track', p.track, 'already', true); END IF;
  IF p.contract_version IS DISTINCT FROM _expect_version THEN RAISE EXCEPTION 'Contrat modifié : rechargez le dossier' USING ERRCODE = 'P0409'; END IF;
  IF EXISTS (SELECT 1 FROM fin_progress_situations WHERE plan_id = _plan AND status IN ('emise','brouillon')) THEN
    RAISE EXCEPTION 'Suivi verrouillé : une facture a déjà été émise ou un brouillon est actif. Les cumuls existants ne sont jamais convertis.'; END IF;
  IF _track <> 'milestones' AND EXISTS (SELECT 1 FROM fin_progress_milestones WHERE plan_id = _plan AND status <> 'archive') THEN
    RAISE EXCEPTION 'Archivez d''abord les jalons définis'; END IF;
  IF _track = 'lines' THEN
    st := public.fin_progress_lines_state(_plan); cap := public.fin_progress_cap(_plan);
    IF jsonb_array_length(st) = 0
      OR (SELECT coalesce(sum((e->>'amount')::numeric), 0) FROM jsonb_array_elements(st) e WHERE e->>'tax' = 'taxable') <> (cap->>'t')::numeric
      OR (SELECT coalesce(sum((e->>'amount')::numeric), 0) FROM jsonb_array_elements(st) e WHERE e->>'tax' = 'detaxe') <> (cap->>'z')::numeric
      OR (SELECT coalesce(sum((e->>'amount')::numeric), 0) FROM jsonb_array_elements(st) e WHERE e->>'tax' = 'exonere') <> (cap->>'e')::numeric
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(st) e WHERE (e->>'qty')::numeric <= 0) THEN
      RAISE EXCEPTION 'Suivi par quantités impossible : les lignes de la soumission ne reconstituent pas exactement le contrat figé' USING ERRCODE = '22023'; END IF;
  END IF;
  UPDATE fin_progress_plans SET track = _track WHERE id = _plan;
  RETURN jsonb_build_object('track', _track, 'already', false);
END $$;

-- Jalons : définition, réalisation déclarée (aucune facture), archivage. Jalon facturé immuable.
CREATE OR REPLACE FUNCTION public.fin_progress_milestone_save(_plan uuid, _id uuid, _key text, _title text, _ord integer, _due date, _share text, _base_rev integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p fin_progress_plans; m fin_progress_milestones; v numeric; cap jsonb; cc numeric; other numeric;
BEGIN
  SELECT * INTO p FROM fin_progress_plans WHERE id = _plan FOR UPDATE;
  IF p.id IS NULL OR NOT public.fin_can_write(p.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF p.track <> 'milestones' THEN RAISE EXCEPTION 'Ce dossier n''est pas suivi par jalons' USING ERRCODE = '22023'; END IF;
  _title := btrim(coalesce(_title, ''));
  IF _title = '' OR length(_title) > 200 THEN RAISE EXCEPTION 'Titre requis (200 caractères au plus)' USING ERRCODE = '22023'; END IF;
  IF _ord IS NULL OR _ord NOT BETWEEN 1 AND 999 THEN RAISE EXCEPTION 'Ordre invalide (1 à 999)' USING ERRCODE = '22023'; END IF;
  IF coalesce(_share, '') !~ '^\d{1,12}(\.\d{1,2})?$' OR _share::numeric <= 0 THEN RAISE EXCEPTION 'Part invalide : montant positif, au plus 2 décimales' USING ERRCODE = '22023'; END IF;
  v := _share::numeric;
  cap := public.fin_progress_cap(_plan); cc := (cap->>'t')::numeric + (cap->>'z')::numeric + (cap->>'e')::numeric;
  IF _id IS NULL THEN
    IF coalesce(_key, '') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
    SELECT * INTO m FROM fin_progress_milestones WHERE company_id = p.company_id AND create_key = _key;
    IF m.id IS NOT NULL THEN
      IF m.plan_id = _plan AND m.title = _title AND m.ord = _ord AND m.due_hint IS NOT DISTINCT FROM _due AND m.share = v THEN RETURN to_jsonb(m); END IF;
      RAISE EXCEPTION 'Clé déjà utilisée avec un autre contenu' USING ERRCODE = 'P0409';
    END IF;
    other := (cap->>'allocated')::numeric;
    IF other + v > cc THEN RAISE EXCEPTION 'Total des jalons supérieur au plafond (non alloué : %)', cc - other USING ERRCODE = '22023'; END IF;
    INSERT INTO fin_progress_milestones (plan_id, company_id, ord, title, due_hint, share, create_key, created_by)
    VALUES (_plan, p.company_id, _ord, _title, _due, v, _key, auth.uid()) RETURNING * INTO m;
    RETURN to_jsonb(m);
  END IF;
  SELECT * INTO m FROM fin_progress_milestones WHERE id = _id AND plan_id = _plan FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Jalon introuvable'; END IF;
  IF m.status = 'facture' THEN RAISE EXCEPTION 'Jalon déjà facturé : modification refusée' USING ERRCODE = '22023'; END IF;
  IF m.status = 'archive' THEN RAISE EXCEPTION 'Jalon archivé' USING ERRCODE = '22023'; END IF;
  IF m.title = _title AND m.ord = _ord AND m.due_hint IS NOT DISTINCT FROM _due AND m.share = v AND m.rev = coalesce(_base_rev, -1) + 1 THEN RETURN to_jsonb(m); END IF;
  IF m.rev IS DISTINCT FROM _base_rev THEN RAISE EXCEPTION 'Jalon modifié ailleurs : rechargez' USING ERRCODE = 'P0409'; END IF;
  other := (cap->>'allocated')::numeric - m.share;
  IF other + v > cc THEN RAISE EXCEPTION 'Total des jalons supérieur au plafond (non alloué : %)', cc - other USING ERRCODE = '22023'; END IF;
  UPDATE fin_progress_milestones SET title = _title, ord = _ord, due_hint = _due, share = v, rev = rev + 1 WHERE id = _id RETURNING * INTO m;
  RETURN to_jsonb(m);
END $$;

CREATE OR REPLACE FUNCTION public.fin_progress_milestone_set(_id uuid, _action text, _base_rev integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; cid uuid; m fin_progress_milestones; target text;
BEGIN
  SELECT plan_id, company_id INTO pid, cid FROM fin_progress_milestones WHERE id = _id;
  IF pid IS NULL OR NOT public.fin_can_write(cid) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _action NOT IN ('realise','archive') THEN RAISE EXCEPTION 'Action inconnue' USING ERRCODE = '22023'; END IF;
  target := _action;
  PERFORM 1 FROM fin_progress_plans WHERE id = pid FOR UPDATE;
  SELECT * INTO m FROM fin_progress_milestones WHERE id = _id FOR UPDATE;
  IF m.status = target AND m.rev = coalesce(_base_rev, -1) + 1 THEN RETURN to_jsonb(m); END IF;
  IF m.status = 'facture' THEN RAISE EXCEPTION 'Jalon déjà facturé : modification refusée' USING ERRCODE = '22023'; END IF;
  IF m.rev IS DISTINCT FROM _base_rev THEN RAISE EXCEPTION 'Jalon modifié ailleurs : rechargez' USING ERRCODE = 'P0409'; END IF;
  IF target = 'realise' AND m.status <> 'prevu' THEN RAISE EXCEPTION 'Seul un jalon prévu peut être déclaré réalisé' USING ERRCODE = '22023'; END IF;
  IF target = 'archive' AND EXISTS (SELECT 1 FROM fin_progress_situations WHERE milestone_id = _id AND status = 'brouillon') THEN
    RAISE EXCEPTION 'Un brouillon de situation vise ce jalon : abandonnez-le d''abord'; END IF;
  IF target = 'archive' AND m.status = 'archive' THEN RAISE EXCEPTION 'Jalon déjà archivé' USING ERRCODE = 'P0409'; END IF;
  UPDATE fin_progress_milestones SET status = target, rev = rev + 1,
    done_at = CASE WHEN target = 'realise' THEN now() ELSE done_at END, done_by = CASE WHEN target = 'realise' THEN auth.uid() ELSE done_by END
  WHERE id = _id RETURNING * INTO m;
  RETURN to_jsonb(m);
END $$;

-- Avenants : impact calculé au serveur; seul un avenant approuvé change le contrat (nouvelle version immuable).
CREATE OR REPLACE FUNCTION public.fin_progress_amend_compute(_plan uuid, _changes jsonb, _on date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p fin_progress_plans; c jsonb; pit boolean; st jsonb; cap jsonb; ch jsonb; l jsonb; nl jsonb; seen text[] := '{}'; id text; nq numeric; oa numeric; na numeric;
  dt numeric := 0; dz numeric := 0; de numeric := 0; t numeric; z numeric; e numeric; nmax integer; k integer := 0; det jsonb := '[]'::jsonb; syn jsonb := '[]'::jsonb; r jsonb; after jsonb;
BEGIN
  SELECT * INTO p FROM fin_progress_plans WHERE id = _plan;
  c := p.contract; pit := coalesce((c->>'prices_include_tax')::boolean, false);
  IF jsonb_typeof(_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(_changes) = 0 OR jsonb_array_length(_changes) > 200 THEN
    RAISE EXCEPTION 'Avenant : au moins une ligne modifiée ou ajoutée' USING ERRCODE = '22023'; END IF;
  st := public.fin_progress_lines_state(_plan); cap := public.fin_progress_cap(_plan); nl := p.lines;
  SELECT coalesce(max(substring(x->>'id' from '^L(\d+)$')::integer), 0) INTO nmax FROM jsonb_array_elements(p.lines) x WHERE jsonb_typeof(x) = 'object';
  FOR ch IN SELECT * FROM jsonb_array_elements(_changes) LOOP
    IF jsonb_typeof(ch) <> 'object' THEN RAISE EXCEPTION 'Avenant illisible' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(ch->'qty') <> 'string' OR (ch->>'qty') !~ '^\d{1,12}(\.\d{1,4})?$' THEN RAISE EXCEPTION 'Quantité invalide : nombre fini positif ou nul, au plus 4 décimales' USING ERRCODE = '22023'; END IF;
    nq := (ch->>'qty')::numeric;
    IF ch ? 'id' THEN
      id := ch->>'id';
      IF id = ANY(seen) THEN RAISE EXCEPTION 'Ligne % modifiée deux fois', id USING ERRCODE = '22023'; END IF;
      seen := seen || id;
      SELECT x INTO l FROM jsonb_array_elements(st) x WHERE x->>'id' = id;
      IF l IS NULL THEN RAISE EXCEPTION 'Ligne inconnue : %', id USING ERRCODE = '22023'; END IF;
      IF nq < (l->>'billed_qty')::numeric THEN RAISE EXCEPTION 'Ligne % : quantité inférieure au déjà facturé (%)', id, l->>'billed_qty' USING ERRCODE = '22023'; END IF;
      oa := (l->>'amount')::numeric; na := public.fin_progress_line_amt(nq, (l->>'price')::numeric, (l->>'disc_pct')::numeric);
      IF nq = (l->>'qty')::numeric THEN RAISE EXCEPTION 'Ligne % : quantité inchangée', id USING ERRCODE = '22023'; END IF;
      nl := (SELECT jsonb_agg(CASE WHEN jsonb_typeof(x) = 'object' AND x->>'id' = id THEN x || jsonb_build_object('qty', ch->>'qty') ELSE x END ORDER BY o) FROM jsonb_array_elements(nl) WITH ORDINALITY t(x, o));
      det := det || jsonb_build_object('id', id, 'desc', l->>'desc', 'unit', l->>'unit', 'tax', l->>'tax', 'price', l->'price', 'disc_pct', l->'disc_pct',
        'qty_before', l->'qty', 'qty_after', nq, 'amount_before', oa, 'amount_after', na);
    ELSE
      IF btrim(coalesce(ch->>'desc', '')) = '' OR length(ch->>'desc') > 300 THEN RAISE EXCEPTION 'Nouvelle ligne : description requise' USING ERRCODE = '22023'; END IF;
      IF jsonb_typeof(ch->'price') <> 'string' OR (ch->>'price') !~ '^\d{1,12}(\.\d{1,4})?$' THEN RAISE EXCEPTION 'Nouvelle ligne : prix invalide' USING ERRCODE = '22023'; END IF;
      IF coalesce(ch->>'disc_pct', '') <> '' AND ((ch->>'disc_pct') !~ '^\d{1,3}(\.\d{1,2})?$' OR (ch->>'disc_pct')::numeric > 100) THEN RAISE EXCEPTION 'Nouvelle ligne : remise invalide' USING ERRCODE = '22023'; END IF;
      IF coalesce(ch->>'tax', '') NOT IN ('taxable','detaxe','exonere') THEN RAISE EXCEPTION 'Nouvelle ligne : traitement fiscal requis' USING ERRCODE = '22023'; END IF;
      IF nq <= 0 THEN RAISE EXCEPTION 'Nouvelle ligne : quantité positive requise' USING ERRCODE = '22023'; END IF;
      k := k + 1; id := 'L' || (nmax + k); oa := 0;
      na := public.fin_progress_line_amt(nq, (ch->>'price')::numeric, nullif(ch->>'disc_pct', '')::numeric);
      l := jsonb_build_object('id', id, 'desc', btrim(ch->>'desc'), 'unit', nullif(btrim(coalesce(ch->>'unit', '')), ''), 'qty', ch->>'qty', 'price', ch->>'price',
        'disc_pct', nullif(ch->>'disc_pct', ''), 'tax', ch->>'tax');
      nl := nl || l;
      det := det || jsonb_build_object('id', id, 'desc', l->>'desc', 'unit', l->>'unit', 'tax', l->>'tax', 'price', l->'price', 'disc_pct', l->'disc_pct', 'qty_before', 0, 'qty_after', nq, 'amount_before', 0, 'amount_after', na, 'new', true);
    END IF;
    CASE l->>'tax' WHEN 'taxable' THEN dt := dt + na - oa; WHEN 'detaxe' THEN dz := dz + na - oa; WHEN 'exonere' THEN de := de + na - oa;
      ELSE RAISE EXCEPTION 'Ligne % au traitement fiscal à déterminer', id USING ERRCODE = '22023'; END CASE;
  END LOOP;
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
  RETURN jsonb_build_object('from_version', p.contract_version, 'before', c, 'after', after, 'changes', det, 'lines_after', nl,
    'delta', jsonb_build_object('cap', dt + dz + de, 'ht', (after->>'ht')::numeric - (c->>'ht')::numeric, 'gst', (after->>'gst')::numeric - (c->>'gst')::numeric,
      'qst', (after->>'qst')::numeric - (c->>'qst')::numeric, 'total', (after->>'total')::numeric - (c->>'total')::numeric),
    'cap_before', (cap->>'t')::numeric + (cap->>'z')::numeric + (cap->>'e')::numeric, 'cap_after', t + z + e,
    'billed_cap', (cap->>'billed_t')::numeric + (cap->>'billed_z')::numeric + (cap->>'billed_e')::numeric);
END $$;

CREATE OR REPLACE FUNCTION public.fin_progress_amend_save(_plan uuid, _draft_key text, _reason text, _changes jsonb, _ref text, _ref_date date, _approver text, _ref_quote uuid, _base_rev integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    IF a.input_hash = ih AND (_base_rev IS NOT DISTINCT FROM a.rev OR _base_rev IS NOT DISTINCT FROM a.rev - 1 OR (_base_rev IS NULL AND a.rev = 1)) THEN RETURN to_jsonb(a); END IF;
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
  IF a.id IS NOT NULL THEN
    UPDATE fin_progress_amendments SET reason = _reason, changes = _changes, impact = imp, approval_ref = _ref, approval_date = _ref_date, approver_name = _approver,
      ref_quote_id = _ref_quote, from_version = p.contract_version, input_hash = ih, hash = md5(ih || imp::text), rev = rev + 1 WHERE id = a.id RETURNING * INTO a;
  ELSE
    INSERT INTO fin_progress_amendments (plan_id, company_id, seq, reason, changes, impact, approval_ref, approval_date, approver_name, ref_quote_id, from_version, input_hash, hash, draft_key, created_by)
    VALUES (_plan, p.company_id, (SELECT count(*) + 1 FROM fin_progress_amendments WHERE plan_id = _plan), _reason, _changes, imp, _ref, _ref_date, _approver, _ref_quote,
      p.contract_version, ih, md5(ih || imp::text), _draft_key, auth.uid()) RETURNING * INTO a;
  END IF;
  RETURN to_jsonb(a);
END $$;

CREATE OR REPLACE FUNCTION public.fin_progress_amend_approve(_amend uuid, _key text, _expect_rev integer, _expect_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; cid uuid; p fin_progress_plans; a fin_progress_amendments; imp jsonb; nv integer;
BEGIN
  SELECT plan_id, company_id INTO pid, cid FROM fin_progress_amendments WHERE id = _amend;
  IF pid IS NULL OR NOT public.fin_can_write(cid) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key, '') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM fin_progress_plans WHERE id = pid FOR UPDATE;
  SELECT * INTO a FROM fin_progress_amendments WHERE id = _amend FOR UPDATE;
  IF a.status = 'approuve' THEN
    IF a.approve_key = _key AND a.rev = _expect_rev AND a.hash = _expect_hash THEN RETURN jsonb_build_object('version', a.to_version, 'already', true); END IF;
    RAISE EXCEPTION 'Avenant déjà approuvé : clé, révision ou empreinte différente' USING ERRCODE = 'P0409';
  END IF;
  IF a.status <> 'brouillon' THEN RAISE EXCEPTION 'Avenant abandonné ou rejeté : approbation impossible' USING ERRCODE = 'P0409'; END IF;
  IF a.rev IS DISTINCT FROM _expect_rev OR a.hash IS DISTINCT FROM _expect_hash THEN RAISE EXCEPTION 'Avenant modifié depuis l''aperçu : rechargez-le' USING ERRCODE = 'P0409'; END IF;
  IF EXISTS (SELECT 1 FROM fin_progress_amendments WHERE company_id = cid AND approve_key = _key) THEN RAISE EXCEPTION 'Clé déjà utilisée' USING ERRCODE = 'P0409'; END IF;
  IF a.approval_ref IS NULL OR a.approval_date IS NULL OR a.approver_name IS NULL THEN
    RAISE EXCEPTION 'Preuve ou référence d''approbation, date et personne ayant donné l''accord requises' USING ERRCODE = '22023'; END IF;
  IF a.approval_date > (now() AT TIME ZONE 'America/Toronto')::date THEN RAISE EXCEPTION 'Date d''accord future refusée' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM fin_progress_situations WHERE plan_id = pid AND status = 'brouillon') THEN
    RAISE EXCEPTION 'Un brouillon de situation est actif : reprenez-le pour l''émettre ou abandonnez-le avant d''approuver l''avenant'; END IF;
  IF p.contract_version IS DISTINCT FROM a.from_version THEN RAISE EXCEPTION 'Contrat modifié depuis l''aperçu de l''avenant : enregistrez-le de nouveau' USING ERRCODE = 'P0409'; END IF;
  imp := public.fin_progress_amend_compute(pid, a.changes, (now() AT TIME ZONE 'America/Toronto')::date);
  IF imp IS DISTINCT FROM a.impact THEN RAISE EXCEPTION 'Impact changé depuis l''aperçu : enregistrez l''avenant de nouveau' USING ERRCODE = 'P0409'; END IF;
  nv := p.contract_version + 1;
  UPDATE fin_progress_plans SET lines = imp->'lines_after', contract = imp->'after', contract_version = nv WHERE id = pid;
  INSERT INTO fin_progress_contract_versions (plan_id, company_id, version, lines, contract, amendment_id, created_by) VALUES (pid, cid, nv, imp->'lines_after', imp->'after', a.id, auth.uid());
  UPDATE fin_progress_amendments SET status = 'approuve', to_version = nv, approve_key = _key, approved_at = now(), approved_by = auth.uid() WHERE id = a.id;
  RETURN jsonb_build_object('version', nv, 'already', false);
END $$;

CREATE OR REPLACE FUNCTION public.fin_progress_amend_close(_amend uuid, _key text, _status text, _reason text, _expect_rev integer, _expect_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; cid uuid; a fin_progress_amendments;
BEGIN
  SELECT plan_id, company_id INTO pid, cid FROM fin_progress_amendments WHERE id = _amend;
  IF pid IS NULL OR NOT public.fin_can_write(cid) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key, '') = '' THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE = '22023'; END IF;
  IF _status NOT IN ('abandonne','rejete') THEN RAISE EXCEPTION 'Statut inconnu' USING ERRCODE = '22023'; END IF;
  _reason := btrim(coalesce(_reason, ''));
  IF _reason = '' THEN RAISE EXCEPTION 'Motif requis' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM fin_progress_plans WHERE id = pid FOR UPDATE;
  SELECT * INTO a FROM fin_progress_amendments WHERE id = _amend FOR UPDATE;
  IF a.status <> 'brouillon' THEN
    IF a.status = _status AND a.close_key = _key AND a.close_reason = _reason AND a.rev = _expect_rev AND a.hash = _expect_hash THEN RETURN to_jsonb(a); END IF;
    RAISE EXCEPTION 'Avenant déjà clos : clé ou contenu différent' USING ERRCODE = 'P0409';
  END IF;
  IF a.rev IS DISTINCT FROM _expect_rev OR a.hash IS DISTINCT FROM _expect_hash THEN RAISE EXCEPTION 'Avenant modifié ailleurs : rechargez-le' USING ERRCODE = 'P0409'; END IF;
  UPDATE fin_progress_amendments SET status = _status, close_key = _key, close_reason = _reason, closed_at = now(), closed_by = auth.uid() WHERE id = a.id RETURNING * INTO a;
  RETURN to_jsonb(a);
END $$;

-- Résumé enrichi (suivi, lignes, jalons, avenants, versions).
CREATE OR REPLACE FUNCTION public.fin_progress_summary(_plan uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE p fin_progress_plans; sits jsonb; billed jsonb;
BEGIN
  SELECT * INTO p FROM fin_progress_plans WHERE id = _plan;
  IF p.id IS NULL OR NOT public.fin_can_read(p.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'seq', x.seq, 'kind', x.kind, 'mode', x.mode, 'value', x.value, 'status', x.status, 'issue_date', x.issue_date, 'due_date', x.due_date,
      'computed', x.computed, 'rev', x.rev, 'hash', x.hash, 'draft_key', x.draft_key, 'abandon_reason', x.abandon_reason, 'abandoned_at', x.abandoned_at, 'created_at', x.created_at,
      'milestone_id', x.milestone_id, 'invoice_id', x.invoice_id, 'number', i.number, 'balance', CASE WHEN x.invoice_id IS NOT NULL THEN public.fin_invoice_balance(x.invoice_id) END) ORDER BY x.created_at), '[]'::jsonb)
    INTO sits FROM fin_progress_situations x LEFT JOIN fin_invoices i ON i.id = x.invoice_id WHERE x.plan_id = _plan;
  SELECT jsonb_build_object('ht', coalesce(sum((computed->'new'->>'ht')::numeric),0), 'gst', coalesce(sum((computed->'new'->>'gst')::numeric),0),
      'qst', coalesce(sum((computed->'new'->>'qst')::numeric),0), 'total', coalesce(sum((computed->'new'->>'total')::numeric),0))
    INTO billed FROM fin_progress_situations WHERE plan_id = _plan AND status = 'emise';
  RETURN jsonb_build_object('id', p.id, 'company_id', p.company_id, 'quote_id', p.quote_id, 'client_name', (SELECT name FROM ent_crm_clients WHERE id = p.client_id),
    'quote_number', p.source->>'number', 'quote_version', p.source->'version', 'contract', p.contract, 'billed', billed, 'situations', sits, 'created_at', p.created_at,
    'track', p.track, 'contract_version', p.contract_version, 'cap', public.fin_progress_cap(_plan), 'lines', public.fin_progress_lines_state(_plan),
    'initial', (SELECT contract FROM fin_progress_contract_versions WHERE plan_id = _plan AND version = 1),
    'milestones', (SELECT coalesce(jsonb_agg(to_jsonb(m) - 'create_key' ORDER BY m.ord, m.created_at), '[]'::jsonb) FROM fin_progress_milestones m WHERE m.plan_id = _plan),
    'amendments', (SELECT coalesce(jsonb_agg(to_jsonb(a) - 'input_hash' - 'approve_key' - 'close_key' - 'draft_key' || jsonb_build_object('draft_key', a.draft_key) ORDER BY a.seq), '[]'::jsonb) FROM fin_progress_amendments a WHERE a.plan_id = _plan),
    'versions', (SELECT coalesce(jsonb_agg(jsonb_build_object('version', v.version, 'contract', v.contract, 'amendment_id', v.amendment_id, 'created_by', v.created_by, 'created_at', v.created_at) ORDER BY v.version), '[]'::jsonb) FROM fin_progress_contract_versions v WHERE v.plan_id = _plan));
END $function$;

-- Droits : RPC publiques pour authenticated; helpers internes sans EXECUTE client.
REVOKE EXECUTE ON FUNCTION public.fin_progress_b2_guard(), public.fin_progress_plan_b2_init(), public.fin_progress_line_amt(numeric, numeric, numeric),
  public.fin_progress_cap(uuid), public.fin_progress_lines_state(uuid), public.fin_progress_qty_canon(text),
  public.fin_progress_compute_lines(uuid, text, text, date), public.fin_progress_compute_any(uuid, text, text, text, date),
  public.fin_progress_amend_compute(uuid, jsonb, date), public.fin_progress_compute(uuid, text, text, text), public.fin_progress_compute(uuid, text, text, text, date)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_progress_set_track(uuid, text, integer), public.fin_progress_milestone_save(uuid, uuid, text, text, integer, date, text, integer),
  public.fin_progress_milestone_set(uuid, text, integer), public.fin_progress_amend_save(uuid, text, text, jsonb, text, date, text, uuid, integer),
  public.fin_progress_amend_approve(uuid, text, integer, text), public.fin_progress_amend_close(uuid, text, text, text, integer, text),
  public.fin_progress_draft_save(uuid, text, text, text, text, date, date, integer), public.fin_progress_issue(uuid, text, integer, text), public.fin_progress_summary(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_progress_set_track(uuid, text, integer), public.fin_progress_milestone_save(uuid, uuid, text, text, integer, date, text, integer),
  public.fin_progress_milestone_set(uuid, text, integer), public.fin_progress_amend_save(uuid, text, text, jsonb, text, date, text, uuid, integer),
  public.fin_progress_amend_approve(uuid, text, integer, text), public.fin_progress_amend_close(uuid, text, text, text, integer, text),
  public.fin_progress_draft_save(uuid, text, text, text, text, date, date, integer), public.fin_progress_issue(uuid, text, integer, text), public.fin_progress_summary(uuid)
  TO authenticated;
