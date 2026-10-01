-- FIN-09C2 (premier périmètre) : retenues contractuelles sur facture émise dont les taxes sont déjà figées/exigibles.
-- Retenue ≠ avoir ≠ paiement : facture, taxes et PDF inchangés; seule la répartition du solde (exigible / retenu) change.
-- La retenue de construction à taxes différées est refusée (sous-lot restant).

CREATE TABLE public.fin_retentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  invoice_id uuid NOT NULL REFERENCES public.fin_invoices(id),
  kind text NOT NULL CHECK (kind = 'taxes_exigibles'),
  mode text NOT NULL CHECK (mode IN ('amount','percent')),
  pct numeric(7,4) CHECK (pct IS NULL OR (pct > 0 AND pct <= 100)),
  base_amount numeric(14,2) NOT NULL CHECK (base_amount > 0),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  contract_ref text CHECK (contract_ref IS NULL OR length(contract_ref) <= 200),
  planned_release date,
  release_condition text NOT NULL CHECK (length(trim(release_condition)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','annulee')),
  rev integer NOT NULL DEFAULT 1,
  idem_key text NOT NULL, payload_hash text NOT NULL,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz, voided_by uuid, void_reason text, void_key text,
  UNIQUE (company_id, idem_key)
);
CREATE UNIQUE INDEX fin_retentions_void_key_uq ON public.fin_retentions(company_id, void_key) WHERE void_key IS NOT NULL;
CREATE INDEX fin_retentions_inv ON public.fin_retentions(invoice_id);

CREATE TABLE public.fin_retention_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  invoice_id uuid NOT NULL REFERENCES public.fin_invoices(id),
  retention_id uuid NOT NULL REFERENCES public.fin_retentions(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  released_on date NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  idem_key text NOT NULL, payload_hash text NOT NULL,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz, voided_by uuid, void_reason text, void_key text,
  UNIQUE (company_id, idem_key)
);
CREATE UNIQUE INDEX fin_ret_rel_void_key_uq ON public.fin_retention_releases(company_id, void_key) WHERE void_key IS NOT NULL;
CREATE INDEX fin_ret_rel_ret ON public.fin_retention_releases(retention_id);

CREATE TABLE public.fin_retention_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL, invoice_id uuid NOT NULL, retention_id uuid NOT NULL, release_id uuid,
  action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid DEFAULT auth.uid(), at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fin_ret_ev_inv ON public.fin_retention_events(invoice_id, at);

GRANT SELECT ON public.fin_retentions, public.fin_retention_releases, public.fin_retention_events TO authenticated;
GRANT ALL ON public.fin_retentions, public.fin_retention_releases, public.fin_retention_events TO service_role;
ALTER TABLE public.fin_retentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_retention_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_retention_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_ret_read ON public.fin_retentions FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY fin_ret_rel_read ON public.fin_retention_releases FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY fin_ret_ev_read ON public.fin_retention_events FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

-- Échéancier de la part retenue dans l'entrée attendue liée (une seule entrée, jamais une deuxième).
ALTER TABLE public.fin_expected_inflows ADD COLUMN retention_schedule jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.fin_inflow_invoice_guard()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('fin.invoice_issue', true) = 'on' THEN
    IF OLD.invoice_id IS NULL AND NEW.invoice_id IS NOT NULL THEN NEW.legacy_received := OLD.received; END IF;
    RETURN NEW;
  END IF;
  IF current_setting('fin.receipt', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.retention_schedule IS DISTINCT FROM OLD.retention_schedule THEN
    RAISE EXCEPTION 'Échéancier de retenue : modifiable seulement par les retenues de la facture';
  END IF;
  IF OLD.invoice_id IS NOT NULL AND (NEW.invoice_id IS DISTINCT FROM OLD.invoice_id OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.certainty IS DISTINCT FROM OLD.certainty OR NEW.archived_at IS DISTINCT FROM OLD.archived_at) THEN
    RAISE EXCEPTION 'Entrée liée à une facture émise : montant fixé par la facture';
  END IF;
  IF OLD.invoice_id IS NOT NULL AND (NEW.received IS DISTINCT FROM OLD.received OR NEW.legacy_received IS DISTINCT FROM OLD.legacy_received) THEN
    RAISE EXCEPTION 'Entrée liée à une facture : enregistrez l''encaissement depuis la facture';
  END IF;
  IF OLD.invoice_id IS NULL AND NEW.invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Liaison à une facture : par l''émission seulement'; END IF;
  RETURN NEW;
END $function$;

-- Position unique (source serveur) : solde FIN-09A + répartition exigible / retenu.
CREATE OR REPLACE FUNCTION public.fin_invoice_position(_invoice uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE b jsonb; held numeric; rel numeric; ret numeric; sched jsonb;
BEGIN
  b := public.fin_invoice_balance(_invoice);
  SELECT coalesce(sum(r.amount),0) INTO ret FROM fin_retentions r WHERE r.invoice_id = _invoice AND r.status = 'active';
  SELECT coalesce(sum(l.amount),0) INTO rel FROM fin_retention_releases l JOIN fin_retentions r ON r.id = l.retention_id
    WHERE l.invoice_id = _invoice AND l.voided_at IS NULL AND r.status = 'active';
  held := ret - rel;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'date', x.planned_release, 'amount', x.rest) ORDER BY x.planned_release NULLS LAST, x.created_at), '[]'::jsonb) INTO sched
  FROM (SELECT r.id, r.planned_release, r.created_at, r.amount - coalesce((SELECT sum(amount) FROM fin_retention_releases l WHERE l.retention_id = r.id AND l.voided_at IS NULL),0) AS rest
        FROM fin_retentions r WHERE r.invoice_id = _invoice AND r.status = 'active') x WHERE x.rest > 0;
  RETURN b || jsonb_build_object('retained', ret, 'released', rel, 'held', held,
    'current_due', greatest(0, (b->>'rest')::numeric - held), 'retention_schedule', sched,
    'consistent', held <= (b->>'rest')::numeric);
END $function$;

-- Politique : refus AVANT mutation effective (transaction annulée) si un encaissement / avoir rend la retenue supérieure au solde non couvert.
CREATE OR REPLACE FUNCTION public.fin_retention_check(_invoice uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p jsonb;
BEGIN
  p := public.fin_invoice_position(_invoice);
  IF NOT (p->>'consistent')::boolean THEN
    RAISE EXCEPTION 'Opération refusée : la retenue en cours (% $) dépasserait le solde non couvert (% $). Part exigible actuelle : % $. Libérez ou annulez d''abord la retenue (motif requis).',
      p->>'held', p->>'rest', p->>'current_due' USING ERRCODE = 'P0410';
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.fin_retention_guard_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'fin_credit_notes' AND NEW.status <> 'emise' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM fin_retentions WHERE invoice_id = NEW.invoice_id AND status = 'active') THEN
    PERFORM public.fin_retention_check(NEW.invoice_id);
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER trg_fin_receipt_retention AFTER INSERT OR UPDATE ON public.fin_invoice_receipts FOR EACH ROW EXECUTE FUNCTION public.fin_retention_guard_trg();
CREATE TRIGGER trg_fin_credit_retention AFTER INSERT OR UPDATE ON public.fin_credit_notes FOR EACH ROW EXECUTE FUNCTION public.fin_retention_guard_trg();

-- Synchronisation de l'entrée attendue liée : même montant/reçu qu'avant + échéancier de la part retenue.
CREATE OR REPLACE FUNCTION public.fin_invoice_receipts_sync(_invoice uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE i fin_invoices; b jsonb; p jsonb;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice;
  b := public.fin_invoice_balance(_invoice);
  p := public.fin_invoice_position(_invoice);
  PERFORM set_config('fin.receipt','on',true);
  IF (b->>'net')::numeric > 0 THEN
    UPDATE fin_expected_inflows SET amount = (b->>'net')::numeric, received = (b->>'received')::numeric, archived_at = NULL,
      retention_schedule = p->'retention_schedule', updated_at = now() WHERE id = i.expected_inflow_id;
  ELSE
    UPDATE fin_expected_inflows SET archived_at = coalesce(archived_at, now()), retention_schedule = '[]'::jsonb, note = left(coalesce(note,'') || ' — soldée par note de crédit', 500), updated_at = now()
    WHERE id = i.expected_inflow_id AND archived_at IS NULL;
  END IF;
  PERFORM set_config('fin.receipt','',true);
  RETURN b;
END $function$;

-- Validation totale de la saisie (aucune conversion implicite).
CREATE OR REPLACE FUNCTION public.fin_retention_validate(_inv fin_invoices, _p jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE errs text[] := '{}'; pos jsonb; k text; mode text; amt numeric; pct numeric; base numeric; d date; s text;
  allowed text[] := ARRAY['kind','mode','amount','pct','reason','contract_ref','planned_release','release_condition'];
BEGIN
  IF _p IS NULL OR jsonb_typeof(_p) <> 'object' THEN RETURN jsonb_build_object('errors', jsonb_build_array('Saisie absente')); END IF;
  FOR k IN SELECT jsonb_object_keys(_p) LOOP IF NOT k = ANY(allowed) THEN errs := errs || ('Champ inconnu : ' || k); END IF; END LOOP;
  IF _p->>'kind' = 'construction_differee' THEN
    errs := errs || 'Retenue de construction avec taxes différées : non prise en charge. Pour un contrat de construction admissible, la TPS/TVQ sur la somme retenue est perçue à la première date de paiement ou d''exigibilité de cette somme (Revenu Québec) — cette facture a déjà figé ses taxes. Ce cas reste à valider (sous-lot FIN-09C2 restant).';
  ELSIF _p->>'kind' IS DISTINCT FROM 'taxes_exigibles' OR jsonb_typeof(_p->'kind') <> 'string' THEN
    errs := errs || 'Type de retenue requis : « taxes déjà exigibles »';
  END IF;
  IF _inv.status <> 'emise' OR _inv.tax_snapshot IS NULL OR _inv.total IS NULL THEN errs := errs || 'Retenue possible seulement sur une facture émise dont les taxes sont figées'; END IF;
  pos := public.fin_invoice_position(_inv.id);
  base := (pos->>'net')::numeric;
  mode := CASE WHEN jsonb_typeof(_p->'mode') = 'string' THEN _p->>'mode' END;
  IF mode = 'amount' THEN
    s := CASE WHEN jsonb_typeof(_p->'amount') = 'string' THEN _p->>'amount' END;
    IF _p ? 'pct' AND _p->'pct' <> 'null'::jsonb THEN errs := errs || 'Montant : ne pas fournir de pourcentage'; END IF;
    IF s IS NULL OR s !~ '^\d{1,12}(\.\d{1,2})?$' THEN errs := errs || 'Montant CAD invalide (2 décimales au plus)'; ELSE amt := s::numeric; END IF;
  ELSIF mode = 'percent' THEN
    s := CASE WHEN jsonb_typeof(_p->'pct') = 'string' THEN _p->>'pct' END;
    IF _p ? 'amount' AND _p->'amount' <> 'null'::jsonb THEN errs := errs || 'Pourcentage : ne pas fournir de montant'; END IF;
    IF s IS NULL OR s !~ '^\d{1,3}(\.\d{1,4})?$' THEN errs := errs || 'Pourcentage invalide (plus de 0 à 100, 4 décimales au plus)';
    ELSIF s::numeric <= 0 OR s::numeric > 100 THEN errs := errs || 'Pourcentage invalide (plus de 0 à 100, 4 décimales au plus)';
    ELSE pct := s::numeric; amt := round(base * pct / 100, 2); END IF;
  ELSE errs := errs || 'Mode requis : montant ou pourcentage'; END IF;
  IF amt IS NOT NULL AND amt <= 0 THEN errs := errs || 'Retenue nulle : rien à retenir'; END IF;
  IF amt IS NOT NULL AND amt > (pos->>'current_due')::numeric THEN errs := errs || format('Retenue supérieure à la part exigible non couverte (%s $)', pos->>'current_due'); END IF;
  IF coalesce(jsonb_typeof(_p->'reason'),'') <> 'string' OR coalesce(length(trim(_p->>'reason')),0) NOT BETWEEN 1 AND 500 THEN errs := errs || 'Motif requis (500 caractères au plus)'; END IF;
  IF coalesce(jsonb_typeof(_p->'release_condition'),'') <> 'string' OR coalesce(length(trim(_p->>'release_condition')),0) NOT BETWEEN 1 AND 500 THEN errs := errs || 'Condition de libération requise (500 caractères au plus)'; END IF;
  IF _p ? 'contract_ref' AND _p->'contract_ref' <> 'null'::jsonb AND (coalesce(jsonb_typeof(_p->'contract_ref'),'') <> 'string' OR length(_p->>'contract_ref') > 200) THEN errs := errs || 'Référence contractuelle invalide'; END IF;
  IF _p ? 'planned_release' AND _p->'planned_release' <> 'null'::jsonb THEN
    s := CASE WHEN jsonb_typeof(_p->'planned_release') = 'string' THEN _p->>'planned_release' END;
    BEGIN IF s IS NULL OR s !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'x'; END IF; d := s::date; IF to_char(d,'YYYY-MM-DD') <> s THEN RAISE EXCEPTION 'x'; END IF;
    EXCEPTION WHEN OTHERS THEN errs := errs || 'Date de libération prévue invalide'; d := NULL; END;
  END IF;
  RETURN jsonb_build_object('errors', to_jsonb(errs), 'mode', mode, 'pct', pct, 'base', base, 'amount', amt, 'planned_release', d,
    'reason', trim(_p->>'reason'), 'contract_ref', nullif(trim(coalesce(_p->>'contract_ref','')),''), 'release_condition', trim(_p->>'release_condition'),
    'position', pos,
    'payload_hash', md5(jsonb_build_object('invoice', _inv.id, 'mode', mode, 'pct', pct, 'amount', amt, 'reason', trim(_p->>'reason'), 'ref', nullif(trim(coalesce(_p->>'contract_ref','')),''),
       'date', d, 'cond', trim(_p->>'release_condition'))::text),
    'state_hash', md5(concat_ws('|', pos->>'net', pos->>'collected', pos->>'held', base)));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_retention_preview(_invoice uuid, _p jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE i fin_invoices; v jsonb; pos jsonb;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice;
  IF i.id IS NULL OR NOT public.fin_can_read(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  v := public.fin_retention_validate(i, _p);
  pos := v->'position';
  RETURN v || jsonb_build_object('expect_hash', md5((v->>'payload_hash') || (v->>'state_hash')),
    'after', jsonb_build_object('held', (pos->>'held')::numeric + coalesce((v->>'amount')::numeric,0),
      'current_due', (pos->>'current_due')::numeric - coalesce((v->>'amount')::numeric,0)));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_retention_create(_invoice uuid, _key text, _p jsonb, _expect_hash text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE i fin_invoices; v jsonb; e fin_retentions; nid uuid;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice FOR UPDATE;
  IF i.id IS NULL OR NOT public.fin_can_write(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' OR length(_key) > 100 THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  v := public.fin_retention_validate(i, _p);
  SELECT * INTO e FROM fin_retentions WHERE company_id = i.company_id AND idem_key = _key;
  IF e.id IS NOT NULL THEN
    IF e.invoice_id = _invoice AND e.payload_hash = v->>'payload_hash' THEN
      RETURN jsonb_build_object('id', e.id, 'replayed', true, 'position', public.fin_invoice_position(_invoice));
    END IF;
    RAISE EXCEPTION 'Clé de saisie déjà utilisée pour une autre retenue' USING ERRCODE = 'P0409';
  END IF;
  IF jsonb_array_length(v->'errors') > 0 THEN RAISE EXCEPTION 'Retenue refusée : %', array_to_string(ARRAY(SELECT jsonb_array_elements_text(v->'errors')), ' ; '); END IF;
  IF _expect_hash IS DISTINCT FROM md5((v->>'payload_hash') || (v->>'state_hash')) THEN
    RAISE EXCEPTION 'Solde ou saisie modifiés depuis l''aperçu : refaites l''aperçu' USING ERRCODE = 'P0409';
  END IF;
  INSERT INTO fin_retentions(company_id, invoice_id, kind, mode, pct, base_amount, amount, reason, contract_ref, planned_release, release_condition, idem_key, payload_hash)
  VALUES (i.company_id, _invoice, 'taxes_exigibles', v->>'mode', (v->>'pct')::numeric, (v->>'base')::numeric, (v->>'amount')::numeric, v->>'reason', v->>'contract_ref',
    (v->>'planned_release')::date, v->>'release_condition', _key, v->>'payload_hash') RETURNING id INTO nid;
  INSERT INTO fin_retention_events(company_id, invoice_id, retention_id, action, detail)
  VALUES (i.company_id, _invoice, nid, 'create', jsonb_build_object('amount', v->'amount', 'mode', v->'mode', 'pct', v->'pct', 'base', v->'base', 'reason', v->'reason', 'planned_release', v->'planned_release'));
  PERFORM public.fin_retention_check(_invoice);
  PERFORM public.fin_invoice_receipts_sync(_invoice);
  RETURN jsonb_build_object('id', nid, 'replayed', false, 'position', public.fin_invoice_position(_invoice));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_retention_release(_retention uuid, _key text, _amount text, _date text, _reason text, _expect_rev integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE inv uuid; r fin_retentions; e fin_retention_releases; amt numeric; d date; h text; rest numeric; nid uuid;
BEGIN
  SELECT invoice_id INTO inv FROM fin_retentions WHERE id = _retention;
  IF inv IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM 1 FROM fin_invoices WHERE id = inv FOR UPDATE;
  SELECT * INTO r FROM fin_retentions WHERE id = _retention FOR UPDATE;
  IF NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' OR length(_key) > 100 THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  IF _amount IS NULL OR _amount !~ '^\d{1,12}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'Montant de libération invalide (2 décimales au plus)'; END IF;
  amt := _amount::numeric;
  BEGIN IF _date IS NULL OR _date !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'x'; END IF; d := _date::date; IF to_char(d,'YYYY-MM-DD') <> _date THEN RAISE EXCEPTION 'x'; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Date de libération invalide'; END;
  IF coalesce(trim(_reason),'') = '' OR length(trim(_reason)) > 500 THEN RAISE EXCEPTION 'Motif de libération requis'; END IF;
  h := md5(concat_ws('|', _retention, amt, d, trim(_reason)));
  SELECT * INTO e FROM fin_retention_releases WHERE company_id = r.company_id AND idem_key = _key;
  IF e.id IS NOT NULL THEN
    IF e.payload_hash = h THEN RETURN jsonb_build_object('id', e.id, 'replayed', true, 'rev', r.rev, 'position', public.fin_invoice_position(inv)); END IF;
    RAISE EXCEPTION 'Clé de saisie déjà utilisée pour une autre libération' USING ERRCODE = 'P0409';
  END IF;
  IF _expect_rev IS DISTINCT FROM r.rev THEN RAISE EXCEPTION 'Retenue modifiée ailleurs (révision %) : rechargez', r.rev USING ERRCODE = 'P0409'; END IF;
  IF r.status <> 'active' THEN RAISE EXCEPTION 'Retenue annulée : aucune libération possible'; END IF;
  IF amt <= 0 THEN RAISE EXCEPTION 'Montant positif requis'; END IF;
  rest := r.amount - coalesce((SELECT sum(amount) FROM fin_retention_releases WHERE retention_id = r.id AND voided_at IS NULL),0);
  IF amt > rest THEN RAISE EXCEPTION 'Libération supérieure à la retenue restante (% $)', rest; END IF;
  INSERT INTO fin_retention_releases(company_id, invoice_id, retention_id, amount, released_on, reason, idem_key, payload_hash)
  VALUES (r.company_id, inv, r.id, amt, d, trim(_reason), _key, h) RETURNING id INTO nid;
  UPDATE fin_retentions SET rev = rev + 1 WHERE id = r.id;
  INSERT INTO fin_retention_events(company_id, invoice_id, retention_id, release_id, action, detail)
  VALUES (r.company_id, inv, r.id, nid, 'release', jsonb_build_object('amount', amt, 'date', d, 'reason', trim(_reason)));
  PERFORM public.fin_invoice_receipts_sync(inv);
  RETURN jsonb_build_object('id', nid, 'replayed', false, 'rev', r.rev + 1, 'position', public.fin_invoice_position(inv));
END $function$;

-- Annulation tracée d'une retenue (le reste redevient exigible) ou d'une libération (le montant redevient retenu, sous contrôle du solde).
CREATE OR REPLACE FUNCTION public.fin_retention_void(_retention uuid, _key text, _reason text, _expect_rev integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE inv uuid; r fin_retentions;
BEGIN
  SELECT invoice_id INTO inv FROM fin_retentions WHERE id = _retention;
  IF inv IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM 1 FROM fin_invoices WHERE id = inv FOR UPDATE;
  SELECT * INTO r FROM fin_retentions WHERE id = _retention FOR UPDATE;
  IF NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' OR length(_key) > 100 THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  IF coalesce(trim(_reason),'') = '' OR length(trim(_reason)) > 500 THEN RAISE EXCEPTION 'Motif d''annulation requis'; END IF;
  IF r.status = 'annulee' THEN
    IF r.void_key = _key AND r.void_reason = trim(_reason) THEN RETURN jsonb_build_object('replayed', true, 'rev', r.rev, 'position', public.fin_invoice_position(inv)); END IF;
    RAISE EXCEPTION 'Retenue déjà annulée par une autre demande' USING ERRCODE = 'P0409';
  END IF;
  IF EXISTS (SELECT 1 FROM fin_retentions WHERE company_id = r.company_id AND void_key = _key) OR EXISTS (SELECT 1 FROM fin_retention_releases WHERE company_id = r.company_id AND void_key = _key) THEN
    RAISE EXCEPTION 'Clé d''annulation déjà utilisée' USING ERRCODE = 'P0409';
  END IF;
  IF _expect_rev IS DISTINCT FROM r.rev THEN RAISE EXCEPTION 'Retenue modifiée ailleurs (révision %) : rechargez', r.rev USING ERRCODE = 'P0409'; END IF;
  UPDATE fin_retentions SET status = 'annulee', voided_at = now(), voided_by = auth.uid(), void_reason = trim(_reason), void_key = _key, rev = rev + 1 WHERE id = r.id;
  INSERT INTO fin_retention_events(company_id, invoice_id, retention_id, action, detail) VALUES (r.company_id, inv, r.id, 'void', jsonb_build_object('reason', trim(_reason)));
  PERFORM public.fin_invoice_receipts_sync(inv);
  RETURN jsonb_build_object('replayed', false, 'rev', r.rev + 1, 'position', public.fin_invoice_position(inv));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_retention_release_void(_release uuid, _key text, _reason text, _expect_rev integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE inv uuid; rid uuid; r fin_retentions; l fin_retention_releases;
BEGIN
  SELECT invoice_id, retention_id INTO inv, rid FROM fin_retention_releases WHERE id = _release;
  IF inv IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  PERFORM 1 FROM fin_invoices WHERE id = inv FOR UPDATE;
  SELECT * INTO r FROM fin_retentions WHERE id = rid FOR UPDATE;
  SELECT * INTO l FROM fin_retention_releases WHERE id = _release FOR UPDATE;
  IF NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(_key,'') = '' OR length(_key) > 100 THEN RAISE EXCEPTION 'Clé de saisie manquante'; END IF;
  IF coalesce(trim(_reason),'') = '' OR length(trim(_reason)) > 500 THEN RAISE EXCEPTION 'Motif d''annulation requis'; END IF;
  IF l.voided_at IS NOT NULL THEN
    IF l.void_key = _key AND l.void_reason = trim(_reason) THEN RETURN jsonb_build_object('replayed', true, 'rev', r.rev, 'position', public.fin_invoice_position(inv)); END IF;
    RAISE EXCEPTION 'Libération déjà annulée par une autre demande' USING ERRCODE = 'P0409';
  END IF;
  IF EXISTS (SELECT 1 FROM fin_retentions WHERE company_id = r.company_id AND void_key = _key) OR EXISTS (SELECT 1 FROM fin_retention_releases WHERE company_id = r.company_id AND void_key = _key) THEN
    RAISE EXCEPTION 'Clé d''annulation déjà utilisée' USING ERRCODE = 'P0409';
  END IF;
  IF _expect_rev IS DISTINCT FROM r.rev THEN RAISE EXCEPTION 'Retenue modifiée ailleurs (révision %) : rechargez', r.rev USING ERRCODE = 'P0409'; END IF;
  IF r.status <> 'active' THEN RAISE EXCEPTION 'Retenue annulée : historique figé'; END IF;
  UPDATE fin_retention_releases SET voided_at = now(), voided_by = auth.uid(), void_reason = trim(_reason), void_key = _key WHERE id = l.id;
  UPDATE fin_retentions SET rev = rev + 1 WHERE id = r.id;
  INSERT INTO fin_retention_events(company_id, invoice_id, retention_id, release_id, action, detail) VALUES (r.company_id, inv, r.id, l.id, 'release_void', jsonb_build_object('reason', trim(_reason), 'amount', l.amount));
  PERFORM public.fin_retention_check(inv);
  PERFORM public.fin_invoice_receipts_sync(inv);
  RETURN jsonb_build_object('replayed', false, 'rev', r.rev + 1, 'position', public.fin_invoice_position(inv));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_retention_summary(_invoice uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE i fin_invoices;
BEGIN
  SELECT * INTO i FROM fin_invoices WHERE id = _invoice;
  IF i.id IS NULL OR NOT public.fin_can_read(i.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN jsonb_build_object('position', public.fin_invoice_position(_invoice),
    'retentions', coalesce((SELECT jsonb_agg(to_jsonb(r) - 'idem_key' - 'payload_hash' - 'void_key' || jsonb_build_object(
        'rest', r.amount - coalesce((SELECT sum(amount) FROM fin_retention_releases l WHERE l.retention_id = r.id AND l.voided_at IS NULL),0),
        'releases', coalesce((SELECT jsonb_agg(to_jsonb(l) - 'idem_key' - 'payload_hash' - 'void_key' ORDER BY l.created_at) FROM fin_retention_releases l WHERE l.retention_id = r.id), '[]'::jsonb))
      ORDER BY r.created_at) FROM fin_retentions r WHERE r.invoice_id = _invoice), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.at DESC) FROM fin_retention_events e WHERE e.invoice_id = _invoice), '[]'::jsonb));
END $function$;

REVOKE ALL ON FUNCTION public.fin_invoice_position(uuid), public.fin_retention_check(uuid), public.fin_retention_validate(fin_invoices, jsonb), public.fin_retention_guard_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fin_retention_preview(uuid, jsonb), public.fin_retention_create(uuid, text, jsonb, text), public.fin_retention_release(uuid, text, text, text, text, integer),
  public.fin_retention_void(uuid, text, text, integer), public.fin_retention_release_void(uuid, text, text, integer), public.fin_retention_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_retention_preview(uuid, jsonb), public.fin_retention_create(uuid, text, jsonb, text), public.fin_retention_release(uuid, text, text, text, text, integer),
  public.fin_retention_void(uuid, text, text, integer), public.fin_retention_release_void(uuid, text, text, integer), public.fin_retention_summary(uuid) TO authenticated;
