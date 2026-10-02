-- FIN-12B — Commandes fournisseurs, réceptions et rapprochement des factures.
-- Commande confirmée = engagement prévu (UNE occurrence fin_occurrences, réutilisée si une estimation est liée).
-- Facture rapprochée = dette existante FIN-12A (fin_bill_confirm) ; l'engagement restant = base − portions rapprochées.
-- Réception = constat de quantités, jamais une dette, un règlement ni un mouvement d'inventaire.

CREATE TABLE public.fin_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.ent_crm_clients(id),
  number text NOT NULL,
  supplier_ref text,
  order_date date,
  expected_date date,
  site text,
  project_id uuid,
  notes text,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmed_lines jsonb,
  file_id uuid REFERENCES public.ent_crm_files(id),
  estimate_occ_id uuid REFERENCES public.fin_occurrences(id),
  estimate_amount numeric(14,2),
  estimate_quality text,
  occurrence_id uuid REFERENCES public.fin_occurrences(id),
  obligation_id uuid REFERENCES public.fin_obligations(id),
  engagement_created boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','closed','void')),
  close_reason text, void_reason text,
  create_key text, confirm_key text,
  rev integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz, confirmed_by uuid,
  closed_at timestamptz, closed_by uuid,
  voided_at timestamptz, voided_by uuid,
  CHECK (status = 'draft' OR occurrence_id IS NOT NULL OR status = 'void')
);
CREATE UNIQUE INDEX fin_po_number ON public.fin_purchase_orders(company_id, lower(number));
CREATE UNIQUE INDEX fin_po_create_key ON public.fin_purchase_orders(company_id, create_key) WHERE create_key IS NOT NULL;
CREATE UNIQUE INDEX fin_po_occ ON public.fin_purchase_orders(occurrence_id) WHERE status IN ('confirmed','closed');
CREATE INDEX fin_po_company ON public.fin_purchase_orders(company_id, supplier_id, status);
GRANT SELECT ON public.fin_purchase_orders TO authenticated;
GRANT ALL ON public.fin_purchase_orders TO service_role;
ALTER TABLE public.fin_purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_po_read ON public.fin_purchase_orders FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE TRIGGER fin_po_stamp BEFORE INSERT OR UPDATE ON public.fin_purchase_orders FOR EACH ROW EXECUTE FUNCTION public.fin_sb_stamp();

CREATE TABLE public.fin_po_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.fin_purchase_orders(id),
  received_on date NOT NULL,
  delivery_ref text,
  file_id uuid REFERENCES public.ent_crm_files(id),
  notes text,
  lines jsonb NOT NULL,
  over_reason text,
  idem_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','void')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz, voided_by uuid, void_reason text
);
CREATE UNIQUE INDEX fin_por_idem ON public.fin_po_receipts(company_id, idem_key);
CREATE INDEX fin_por_order ON public.fin_po_receipts(order_id) WHERE status = 'active';
GRANT SELECT ON public.fin_po_receipts TO authenticated;
GRANT ALL ON public.fin_po_receipts TO service_role;
ALTER TABLE public.fin_po_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_por_read ON public.fin_po_receipts FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_po_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.fin_purchase_orders(id),
  bill_id uuid NOT NULL REFERENCES public.fin_supplier_bills(id),
  line_no integer NOT NULL,
  qty numeric(14,3) NOT NULL CHECK (qty > 0),
  bill_amount numeric(14,2) CHECK (bill_amount IS NULL OR bill_amount >= 0),
  portion numeric(14,2) CHECK (portion IS NULL OR portion >= 0),
  portion_basis text NOT NULL CHECK (portion_basis IN ('ligne','manuelle')),
  exception_reason text,
  before_receipt boolean NOT NULL DEFAULT false,
  idem_key text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz, reversed_by uuid, reverse_reason text
);
CREATE UNIQUE INDEX fin_pom_idem ON public.fin_po_matches(company_id, idem_key, line_no);
CREATE UNIQUE INDEX fin_pom_once ON public.fin_po_matches(bill_id, order_id, line_no) WHERE reversed_at IS NULL;
CREATE INDEX fin_pom_order ON public.fin_po_matches(order_id) WHERE reversed_at IS NULL;
GRANT SELECT ON public.fin_po_matches TO authenticated;
GRANT ALL ON public.fin_po_matches TO service_role;
ALTER TABLE public.fin_po_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_pom_read ON public.fin_po_matches FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_po_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.fin_purchase_orders(id),
  action text NOT NULL,
  reason text,
  detail jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fin_po_events TO authenticated;
GRANT ALL ON public.fin_po_events TO service_role;
ALTER TABLE public.fin_po_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_poe_read ON public.fin_po_events FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE TRIGGER fin_poe_no_change BEFORE UPDATE OR DELETE ON public.fin_po_events FOR EACH ROW EXECUTE FUNCTION public.fin_sbe_append_only();

CREATE OR REPLACE FUNCTION public.fin_po_row_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Suppression interdite (annulation motivée seulement)' USING ERRCODE='42501'; END IF;
  IF TG_OP = 'INSERT' THEN NEW.created_at := now(); RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'fin_po_receipts' THEN
    IF OLD.status <> 'active' OR NEW.status <> 'void' OR NEW.lines <> OLD.lines OR NEW.order_id <> OLD.order_id OR NEW.received_on <> OLD.received_on
       OR NEW.company_id <> OLD.company_id OR NEW.created_at <> OLD.created_at OR NEW.idem_key <> OLD.idem_key THEN
      RAISE EXCEPTION 'Réception immuable (seule une annulation motivée est permise)' USING ERRCODE='42501'; END IF;
    NEW.voided_at := now();
  ELSE
    IF OLD.reversed_at IS NOT NULL OR NEW.reversed_at IS NULL OR NEW.qty <> OLD.qty OR NEW.bill_id <> OLD.bill_id OR NEW.order_id <> OLD.order_id
       OR NEW.line_no <> OLD.line_no OR NEW.portion IS DISTINCT FROM OLD.portion OR NEW.company_id <> OLD.company_id OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'Rapprochement immuable (seule une annulation motivée est permise)' USING ERRCODE='42501'; END IF;
    NEW.reversed_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_por_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fin_po_receipts FOR EACH ROW EXECUTE FUNCTION public.fin_po_row_guard();
CREATE TRIGGER fin_pom_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fin_po_matches FOR EACH ROW EXECUTE FUNCTION public.fin_po_row_guard();

CREATE OR REPLACE FUNCTION public.fin_po_log(_o public.fin_purchase_orders, _action text, _reason text, _detail jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.fin_po_events(company_id, order_id, action, reason, detail, actor_id) VALUES (_o.company_id, _o.id, _action, _reason, _detail, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.fin_po_norm(_lines jsonb, _old jsonb, _strict boolean)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE e jsonb; res jsonb := '[]'; nxt int; lno int; q numeric; up numeric; am numeric; g numeric; s numeric; v numeric; seen int[] := '{}';
BEGIN
  IF jsonb_typeof(coalesce(_lines,'[]')) <> 'array' THEN RAISE EXCEPTION 'Lignes invalides'; END IF;
  SELECT coalesce(max((x->>'no')::int),0) INTO nxt FROM jsonb_array_elements(coalesce(_old,'[]')) x;
  SELECT greatest(nxt, coalesce(max(nullif(x->>'no','')::int),0)) INTO nxt FROM jsonb_array_elements(coalesce(_lines,'[]')) x;
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(_lines,'[]')) LOOP
    lno := nullif(e->>'no','')::int;
    IF lno IS NULL THEN nxt := nxt + 1; lno := nxt; END IF;
    IF lno = ANY(seen) THEN RAISE EXCEPTION 'Numéro de ligne en double (%)', lno; END IF;
    seen := seen || lno;
    IF coalesce(e->>'unit','') NOT IN ('t','m3','vg3','voyage','h','u') THEN RAISE EXCEPTION 'Ligne % : unité invalide (tonne, m³, verge³, voyage, heure ou unité)', lno; END IF;
    q := nullif(e->>'qty','')::numeric; up := nullif(e->>'unit_price','')::numeric; am := nullif(e->>'amount','')::numeric;
    g := nullif(e->>'gst','')::numeric; s := nullif(e->>'qst','')::numeric;
    IF (q IS NOT NULL AND q < 0) OR coalesce(up,0) < 0 OR coalesce(am,0) < 0 OR coalesce(g,0) < 0 OR coalesce(s,0) < 0 THEN RAISE EXCEPTION 'Ligne % : valeur négative refusée', lno; END IF;
    IF _strict AND (q IS NULL OR q <= 0) THEN RAISE EXCEPTION 'Ligne % : quantité supérieure à 0 requise', lno; END IF;
    IF _strict AND coalesce(btrim(e->>'description'),'') = '' THEN RAISE EXCEPTION 'Ligne % : description requise', lno; END IF;
    v := coalesce(am, CASE WHEN up IS NOT NULL AND q IS NOT NULL THEN round(q * up, 2) END);
    res := res || jsonb_build_array(jsonb_build_object('no', lno, 'description', nullif(btrim(e->>'description'),''), 'qty', q, 'unit', e->>'unit',
      'unit_price', up, 'amount', am, 'value', v, 'gst', g, 'qst', s,
      'line_total', CASE WHEN v IS NOT NULL AND g IS NOT NULL AND s IS NOT NULL THEN v + g + s END));
  END LOOP;
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.fin_po_total(_lines jsonb) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN count(*) = 0 OR bool_or(nullif(x->>'line_total','') IS NULL) THEN NULL ELSE sum((x->>'line_total')::numeric) END FROM jsonb_array_elements(_lines) x $$;

CREATE OR REPLACE FUNCTION public.fin_po_stats(_o uuid)
RETURNS TABLE(line_no int, qty numeric, line_total numeric, accepted numeric, refused numeric, billed numeric, portion numeric, bill_amount numeric, amount_unknown int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (l->>'no')::int, nullif(l->>'qty','')::numeric, nullif(l->>'line_total','')::numeric,
    coalesce((SELECT sum((x->>'accepted')::numeric) FROM public.fin_po_receipts r, jsonb_array_elements(r.lines) x WHERE r.order_id = o.id AND r.status = 'active' AND (x->>'no')::int = (l->>'no')::int),0),
    coalesce((SELECT sum((x->>'refused')::numeric) FROM public.fin_po_receipts r, jsonb_array_elements(r.lines) x WHERE r.order_id = o.id AND r.status = 'active' AND (x->>'no')::int = (l->>'no')::int),0),
    coalesce(m.billed,0), coalesce(m.portion,0), m.bill_amount, coalesce(m.unknown,0)
  FROM public.fin_purchase_orders o CROSS JOIN LATERAL jsonb_array_elements(o.lines) l
  LEFT JOIN LATERAL (SELECT sum(mm.qty) billed, sum(mm.portion) portion, sum(mm.bill_amount) bill_amount, count(*) FILTER (WHERE mm.bill_amount IS NULL)::int unknown
    FROM public.fin_po_matches mm JOIN public.fin_supplier_bills b ON b.id = mm.bill_id AND b.status = 'confirmed'
    WHERE mm.order_id = o.id AND mm.reversed_at IS NULL AND mm.line_no = (l->>'no')::int) m ON true
  WHERE o.id = _o $$;

CREATE OR REPLACE FUNCTION public.fin_po_sync(_o uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_purchase_orders; oc public.fin_occurrences; base numeric; used numeric; amt numeric; q text;
BEGIN
  SELECT * INTO o FROM public.fin_purchase_orders WHERE id = _o;
  IF o.occurrence_id IS NULL OR o.status NOT IN ('confirmed','closed') THEN RETURN NULL; END IF;
  SELECT * INTO oc FROM public.fin_occurrences WHERE id = o.occurrence_id FOR UPDATE;
  base := coalesce(public.fin_po_total(o.lines), o.estimate_amount);
  SELECT coalesce(sum(s.portion),0) INTO used FROM public.fin_po_stats(_o) s;
  IF o.status = 'closed' THEN amt := 0; q := 'estimated';
  ELSIF base IS NULL THEN amt := NULL; q := 'unknown';
  ELSE amt := greatest(base - used, 0); q := 'estimated'; END IF;
  IF oc.amount IS DISTINCT FROM amt OR oc.amount_quality IS DISTINCT FROM q THEN
    UPDATE public.fin_occurrences SET amount = amt, amount_quality = q, amount_override = true, updated_at = now() WHERE id = oc.id;
    PERFORM public.fin_log(o.company_id, oc.obligation_id, oc.id, 'po_engagement', 'Commande '||o.number,
      jsonb_build_object('amount', oc.amount, 'quality', oc.amount_quality), jsonb_build_object('amount', amt, 'quality', q, 'base', base, 'billed_portion', used));
  END IF;
  RETURN jsonb_build_object('base', base, 'used', used, 'remaining', amt);
END $$;

CREATE OR REPLACE FUNCTION public.fin_po_save(_company uuid, _id uuid, _p jsonb, _base_rev integer, _create_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_purchase_orders; ln jsonb; num text := nullif(btrim(_p->>'number'),''); n int; est uuid := nullif(_p->>'estimate_occ_id','')::uuid;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _p->>'supplier_id' IS NULL OR NOT EXISTS (SELECT 1 FROM public.fin_supplier_profiles WHERE client_id = (_p->>'supplier_id')::uuid AND company_id = _company) THEN
    RAISE EXCEPTION 'Fournisseur hors de cette entreprise' USING ERRCODE='42501'; END IF;
  PERFORM public.fin_check_links(_company, jsonb_strip_nulls(jsonb_build_object('project_id', _p->>'project_id', 'document_id', _p->>'file_id')));
  IF est IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fin_occurrences WHERE id = est AND company_id = _company) THEN RAISE EXCEPTION 'Estimation hors de cette entreprise' USING ERRCODE='42501'; END IF;
  IF _id IS NULL THEN
    IF _create_key IS NOT NULL THEN
      SELECT * INTO o FROM public.fin_purchase_orders WHERE company_id = _company AND create_key = _create_key;
      IF o.id IS NOT NULL THEN RETURN jsonb_build_object('id', o.id, 'rev', o.rev, 'number', o.number, 'replay', true); END IF;
    END IF;
    ln := public.fin_po_norm(_p->'lines', NULL, false);
    PERFORM pg_advisory_xact_lock(hashtext('fin_po_num:'||_company));
    IF num IS NULL THEN
      SELECT coalesce(max(substring(number from '^BC-(\d+)$')::int),0) + 1 INTO n FROM public.fin_purchase_orders WHERE company_id = _company;
      num := 'BC-'||lpad(n::text, 5, '0');
    ELSIF EXISTS (SELECT 1 FROM public.fin_purchase_orders WHERE company_id = _company AND lower(number) = lower(num)) THEN
      RAISE EXCEPTION 'Numéro de commande % déjà utilisé dans cette entreprise', num USING ERRCODE='P0410'; END IF;
    INSERT INTO public.fin_purchase_orders(company_id, supplier_id, number, supplier_ref, order_date, expected_date, site, project_id, notes, lines, file_id, estimate_occ_id, create_key, created_by)
    VALUES (_company, (_p->>'supplier_id')::uuid, num, nullif(btrim(_p->>'supplier_ref'),''), nullif(_p->>'order_date','')::date, nullif(_p->>'expected_date','')::date,
      nullif(btrim(_p->>'site'),''), nullif(_p->>'project_id','')::uuid, nullif(btrim(_p->>'notes'),''), ln, nullif(_p->>'file_id','')::uuid, est, _create_key, auth.uid())
    ON CONFLICT (company_id, create_key) WHERE create_key IS NOT NULL DO NOTHING RETURNING * INTO o;
    IF o.id IS NULL THEN
      SELECT * INTO o FROM public.fin_purchase_orders WHERE company_id = _company AND create_key = _create_key;
      RETURN jsonb_build_object('id', o.id, 'rev', o.rev, 'number', o.number, 'replay', true);
    END IF;
    PERFORM public.fin_po_log(o, 'draft_create', NULL, NULL);
    RETURN jsonb_build_object('id', o.id, 'rev', o.rev, 'number', o.number);
  END IF;
  SELECT * INTO o FROM public.fin_purchase_orders WHERE id = _id AND company_id = _company FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable' USING ERRCODE='42501'; END IF;
  IF o.status <> 'draft' THEN RAISE EXCEPTION 'Commande confirmée : utilisez la modification motivée des lignes' USING ERRCODE='P0409'; END IF;
  IF _base_rev IS DISTINCT FROM o.rev THEN RAISE EXCEPTION 'Conflit : ce brouillon a été modifié ailleurs. Rechargez.' USING ERRCODE='P0409'; END IF;
  ln := public.fin_po_norm(_p->'lines', NULL, false);
  IF num IS NOT NULL AND lower(num) <> lower(o.number) THEN
    PERFORM pg_advisory_xact_lock(hashtext('fin_po_num:'||_company));
    IF EXISTS (SELECT 1 FROM public.fin_purchase_orders WHERE company_id = _company AND lower(number) = lower(num) AND id <> _id) THEN
      RAISE EXCEPTION 'Numéro de commande % déjà utilisé dans cette entreprise', num USING ERRCODE='P0410'; END IF;
  END IF;
  UPDATE public.fin_purchase_orders SET supplier_id = (_p->>'supplier_id')::uuid, number = coalesce(num, number), supplier_ref = nullif(btrim(_p->>'supplier_ref'),''),
    order_date = nullif(_p->>'order_date','')::date, expected_date = nullif(_p->>'expected_date','')::date, site = nullif(btrim(_p->>'site'),''),
    project_id = nullif(_p->>'project_id','')::uuid, notes = nullif(btrim(_p->>'notes'),''), lines = ln, file_id = nullif(_p->>'file_id','')::uuid, estimate_occ_id = est, rev = rev + 1
  WHERE id = _id RETURNING * INTO o;
  RETURN jsonb_build_object('id', o.id, 'rev', o.rev, 'number', o.number);
END $$;

CREATE OR REPLACE FUNCTION public.fin_po_confirm(_id uuid, _expect_rev integer, _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_purchase_orders; oc public.fin_occurrences; ob public.fin_obligations; ln jsonb; tot numeric; oid uuid; anc date; sup text; r jsonb;
BEGIN
  IF _key IS NULL OR length(_key) < 8 THEN RAISE EXCEPTION 'Clé de confirmation requise'; END IF;
  SELECT * INTO o FROM public.fin_purchase_orders WHERE id = _id FOR UPDATE;
  IF o.id IS NULL OR NOT public.fin_can_write(o.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF o.status <> 'draft' THEN
    IF o.confirm_key = _key THEN RETURN jsonb_build_object('id', o.id, 'occurrence_id', o.occurrence_id, 'replay', true); END IF;
    RAISE EXCEPTION 'Commande déjà confirmée ou annulée' USING ERRCODE='P0409';
  END IF;
  IF _expect_rev IS DISTINCT FROM o.rev THEN RAISE EXCEPTION 'Conflit : le brouillon a changé. Rechargez avant de confirmer.' USING ERRCODE='P0409'; END IF;
  IF o.order_date IS NULL THEN RAISE EXCEPTION 'Date de commande requise pour confirmer'; END IF;
  ln := public.fin_po_norm(o.lines, NULL, true);
  IF jsonb_array_length(ln) = 0 THEN RAISE EXCEPTION 'Au moins une ligne requise'; END IF;
  tot := public.fin_po_total(ln);
  IF o.estimate_occ_id IS NOT NULL THEN
    SELECT * INTO oc FROM public.fin_occurrences WHERE id = o.estimate_occ_id AND company_id = o.company_id FOR UPDATE;
    IF oc.id IS NULL OR oc.status <> 'active' THEN RAISE EXCEPTION 'Estimation liée introuvable ou annulée' USING ERRCODE='P0409'; END IF;
    IF EXISTS (SELECT 1 FROM public.fin_supplier_bills WHERE occurrence_id = oc.id AND status = 'confirmed')
       OR EXISTS (SELECT 1 FROM public.fin_purchase_orders WHERE occurrence_id = oc.id AND status IN ('confirmed','closed')) THEN
      RAISE EXCEPTION 'Cette estimation est déjà utilisée par une facture ou une autre commande' USING ERRCODE='P0409'; END IF;
    SELECT * INTO ob FROM public.fin_obligations WHERE id = oc.obligation_id;
    IF ob.payee_client_id IS NOT NULL AND ob.payee_client_id <> o.supplier_id THEN RAISE EXCEPTION 'Estimation d''un autre fournisseur' USING ERRCODE='P0409'; END IF;
    UPDATE public.fin_purchase_orders SET status = 'confirmed', lines = ln, confirmed_lines = ln, occurrence_id = oc.id, obligation_id = oc.obligation_id,
      engagement_created = false, estimate_amount = oc.amount, estimate_quality = oc.amount_quality, confirm_key = _key,
      confirmed_at = now(), confirmed_by = auth.uid(), rev = rev + 1 WHERE id = _id RETURNING * INTO o;
  ELSE
    anc := coalesce(o.expected_date, o.order_date);
    SELECT name INTO sup FROM public.ent_crm_clients WHERE id = o.supplier_id;
    oid := public.fin_save_obligation(o.company_id, NULL, jsonb_strip_nulls(jsonb_build_object('label', 'Commande '||o.number||' — '||sup, 'payee_client_id', o.supplier_id,
      'project_id', o.project_id, 'frequency', 'once', 'anchor_date', anc, 'amount', tot,
      'amount_quality', CASE WHEN tot IS NULL THEN 'unknown' ELSE 'estimated' END, 'nature', 'charge', 'contract_ref', o.number)));
    PERFORM public.fin_ensure_occurrences(o.company_id, anc, anc);
    SELECT * INTO oc FROM public.fin_occurrences WHERE obligation_id = oid AND status = 'active' ORDER BY due_date LIMIT 1;
    IF oc.id IS NULL THEN RAISE EXCEPTION 'Engagement non généré'; END IF;
    UPDATE public.fin_occurrences SET due_unknown = (o.expected_date IS NULL), amount_override = true WHERE id = oc.id;
    UPDATE public.fin_purchase_orders SET status = 'confirmed', lines = ln, confirmed_lines = ln, occurrence_id = oc.id, obligation_id = oid, engagement_created = true,
      confirm_key = _key, confirmed_at = now(), confirmed_by = auth.uid(), rev = rev + 1 WHERE id = _id RETURNING * INTO o;
  END IF;
  r := public.fin_po_sync(o.id);
  PERFORM public.fin_po_log(o, 'confirm', NULL, jsonb_build_object('total', tot, 'occurrence_id', o.occurrence_id, 'reused_estimate', NOT o.engagement_created, 'estimate', o.estimate_amount, 'engagement', r));
  RETURN jsonb_build_object('id', o.id, 'occurrence_id', o.occurrence_id, 'engagement', r);
END $$;

CREATE OR REPLACE FUNCTION public.fin_po_amend(_id uuid, _expect_rev integer, _lines jsonb, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_purchase_orders; ln jsonb; st record; nq numeric; r jsonb; oldl jsonb;
BEGIN
  SELECT * INTO o FROM public.fin_purchase_orders WHERE id = _id FOR UPDATE;
  IF o.id IS NULL OR NOT public.fin_can_write(o.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF o.status <> 'confirmed' THEN RAISE EXCEPTION 'Seule une commande confirmée ouverte se modifie ainsi' USING ERRCODE='P0409'; END IF;
  IF _expect_rev IS DISTINCT FROM o.rev THEN RAISE EXCEPTION 'Conflit : rechargez la commande' USING ERRCODE='P0409'; END IF;
  ln := public.fin_po_norm(_lines, o.lines, true);
  IF jsonb_array_length(ln) = 0 THEN RAISE EXCEPTION 'Au moins une ligne requise'; END IF;
  FOR st IN SELECT * FROM public.fin_po_stats(_id) LOOP
    nq := NULL;
    SELECT (x->>'qty')::numeric INTO nq FROM jsonb_array_elements(ln) x WHERE (x->>'no')::int = st.line_no;
    IF (st.accepted > 0 OR st.billed > 0) AND nq IS NULL THEN RAISE EXCEPTION 'Ligne % : reçue ou facturée, elle ne peut pas être retirée', st.line_no USING ERRCODE='P0409'; END IF;
    IF nq IS NOT NULL AND nq < st.accepted THEN RAISE EXCEPTION 'Ligne % : quantité % inférieure à la quantité déjà reçue (%)', st.line_no, nq, st.accepted USING ERRCODE='P0409'; END IF;
    IF nq IS NOT NULL AND nq < st.billed THEN RAISE EXCEPTION 'Ligne % : quantité % inférieure à la quantité déjà rapprochée (%)', st.line_no, nq, st.billed USING ERRCODE='P0409'; END IF;
    IF nq IS NOT NULL AND st.billed > 0 AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.lines) a, jsonb_array_elements(ln) b
        WHERE (a->>'no')::int = st.line_no AND (b->>'no')::int = st.line_no AND (a->>'unit' <> b->>'unit')) THEN
      RAISE EXCEPTION 'Ligne % : unité non modifiable après rapprochement', st.line_no USING ERRCODE='P0409'; END IF;
  END LOOP;
  oldl := o.lines;
  UPDATE public.fin_purchase_orders SET lines = ln, rev = rev + 1 WHERE id = _id RETURNING * INTO o;
  r := public.fin_po_sync(o.id);
  PERFORM public.fin_po_log(o, 'amend', btrim(_reason), jsonb_build_object('before', oldl, 'after', ln, 'engagement', r));
  RETURN jsonb_build_object('id', o.id, 'rev', o.rev, 'engagement', r);
END $$;

CREATE OR REPLACE FUNCTION public.fin_po_receive(_order uuid, _p jsonb, _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_purchase_orders; rc public.fin_po_receipts; e jsonb; ln jsonb := '[]'; st record; acc numeric; rf numeric; ovr jsonb := '[]'; any_qty boolean := false;
BEGIN
  IF _key IS NULL OR length(_key) < 8 THEN RAISE EXCEPTION 'Clé de réception requise'; END IF;
  SELECT * INTO o FROM public.fin_purchase_orders WHERE id = _order FOR UPDATE;
  IF o.id IS NULL OR NOT public.fin_can_write(o.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO rc FROM public.fin_po_receipts WHERE company_id = o.company_id AND idem_key = _key;
  IF rc.id IS NOT NULL THEN
    IF rc.order_id = _order THEN RETURN jsonb_build_object('id', rc.id, 'replay', true); END IF;
    RAISE EXCEPTION 'Clé de réception déjà utilisée' USING ERRCODE='P0409'; END IF;
  IF o.status <> 'confirmed' THEN RAISE EXCEPTION 'Réception possible seulement sur une commande confirmée ouverte' USING ERRCODE='P0409'; END IF;
  IF nullif(_p->>'received_on','') IS NULL THEN RAISE EXCEPTION 'Date effective de livraison requise'; END IF;
  PERFORM public.fin_check_links(o.company_id, jsonb_strip_nulls(jsonb_build_object('document_id', _p->>'file_id')));
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(_p->'lines','[]')) LOOP
    acc := coalesce(nullif(e->>'accepted','')::numeric,0); rf := coalesce(nullif(e->>'refused','')::numeric,0);
    IF acc < 0 OR rf < 0 THEN RAISE EXCEPTION 'Quantité négative refusée'; END IF;
    IF acc = 0 AND rf = 0 THEN CONTINUE; END IF;
    SELECT * INTO st FROM public.fin_po_stats(_order) s WHERE s.line_no = (e->>'no')::int;
    IF st.line_no IS NULL THEN RAISE EXCEPTION 'Ligne % absente de la commande', e->>'no'; END IF;
    IF ln @> jsonb_build_array(jsonb_build_object('no', st.line_no)) THEN RAISE EXCEPTION 'Ligne % en double', st.line_no; END IF;
    IF st.accepted + acc > st.qty THEN ovr := ovr || jsonb_build_array(jsonb_build_object('no', st.line_no, 'ordered', st.qty, 'accepted_after', st.accepted + acc)); END IF;
    ln := ln || jsonb_build_array(jsonb_build_object('no', st.line_no, 'accepted', acc, 'refused', rf));
    any_qty := true;
  END LOOP;
  IF NOT any_qty THEN RAISE EXCEPTION 'Indiquez au moins une quantité acceptée ou refusée'; END IF;
  IF jsonb_array_length(ovr) > 0 THEN
    IF coalesce((_p->>'confirm_over')::boolean, false) IS NOT TRUE OR coalesce(btrim(_p->>'over_reason'),'') = '' THEN
      RAISE EXCEPTION 'Réception supérieure au restant (%) : confirmation explicite et motif requis', ovr USING ERRCODE='P0410'; END IF;
    IF NOT public.fin_can_correct(o.company_id) THEN RAISE EXCEPTION 'Réception excédentaire : permission de correction requise' USING ERRCODE='42501'; END IF;
  END IF;
  INSERT INTO public.fin_po_receipts(company_id, order_id, received_on, delivery_ref, file_id, notes, lines, over_reason, idem_key, created_by)
  VALUES (o.company_id, o.id, (_p->>'received_on')::date, nullif(btrim(_p->>'delivery_ref'),''), nullif(_p->>'file_id','')::uuid, nullif(btrim(_p->>'notes'),''), ln,
    CASE WHEN jsonb_array_length(ovr) > 0 THEN btrim(_p->>'over_reason') END, _key, auth.uid())
  RETURNING * INTO rc;
  PERFORM public.fin_po_log(o, 'receive', rc.over_reason, jsonb_build_object('receipt_id', rc.id, 'received_on', rc.received_on, 'lines', ln, 'over', ovr));
  RETURN jsonb_build_object('id', rc.id, 'over', ovr);
END $$;

CREATE OR REPLACE FUNCTION public.fin_po_receipt_void(_receipt uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rc public.fin_po_receipts; o public.fin_purchase_orders;
BEGIN
  SELECT * INTO rc FROM public.fin_po_receipts WHERE id = _receipt;
  IF rc.id IS NULL OR NOT public.fin_can_correct(rc.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  SELECT * INTO o FROM public.fin_purchase_orders WHERE id = rc.order_id FOR UPDATE;
  SELECT * INTO rc FROM public.fin_po_receipts WHERE id = _receipt FOR UPDATE;
  IF rc.status <> 'active' THEN RAISE EXCEPTION 'Réception déjà annulée' USING ERRCODE='P0409'; END IF;
  IF o.status = 'void' THEN RAISE EXCEPTION 'Commande annulée' USING ERRCODE='P0409'; END IF;
  UPDATE public.fin_po_receipts SET status = 'void', void_reason = btrim(_reason), voided_by = auth.uid() WHERE id = _receipt RETURNING * INTO rc;
  PERFORM public.fin_po_log(o, 'receive_void', btrim(_reason), jsonb_build_object('receipt_id', rc.id, 'lines', rc.lines));
  RETURN jsonb_build_object('id', rc.id, 'status', rc.status);
END $$;

CREATE OR REPLACE FUNCTION public.fin_po_match(_order uuid, _bill uuid, _lines jsonb, _key text, _bill_rev integer, _bill_key text, _exception text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_purchase_orders; b public.fin_supplier_bills; e jsonb; st record; q numeric; pt numeric; basis text; ba numeric; ba_sum numeric := 0; prior numeric;
  ovr jsonb := '[]'; bfr boolean; n int := 0; r jsonb; seen int[] := '{}';
BEGIN
  IF _key IS NULL OR length(_key) < 8 THEN RAISE EXCEPTION 'Clé de rapprochement requise'; END IF;
  SELECT * INTO o FROM public.fin_purchase_orders WHERE id = _order FOR UPDATE;
  IF o.id IS NULL OR NOT public.fin_can_write(o.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_po_matches WHERE company_id = o.company_id AND idem_key = _key) THEN
    IF EXISTS (SELECT 1 FROM public.fin_po_matches WHERE company_id = o.company_id AND idem_key = _key AND (order_id <> _order OR bill_id <> _bill)) THEN
      RAISE EXCEPTION 'Clé de rapprochement déjà utilisée pour une autre demande' USING ERRCODE='P0409'; END IF;
    RETURN jsonb_build_object('replay', true, 'bill_id', _bill, 'engagement', (SELECT jsonb_build_object('remaining', amount) FROM public.fin_occurrences WHERE id = o.occurrence_id));
  END IF;
  IF o.status <> 'confirmed' THEN RAISE EXCEPTION 'Rapprochement possible seulement sur une commande confirmée ouverte' USING ERRCODE='P0409'; END IF;
  SELECT * INTO b FROM public.fin_supplier_bills WHERE id = _bill FOR UPDATE;
  IF b.id IS NULL OR b.company_id <> o.company_id THEN RAISE EXCEPTION 'Facture hors de cette entreprise' USING ERRCODE='42501'; END IF;
  IF b.supplier_id <> o.supplier_id THEN RAISE EXCEPTION 'Facture d''un autre fournisseur' USING ERRCODE='P0409'; END IF;
  IF b.status = 'void' THEN RAISE EXCEPTION 'Facture annulée' USING ERRCODE='P0409'; END IF;
  IF b.status = 'confirmed' AND b.occurrence_id = o.occurrence_id THEN RAISE EXCEPTION 'Cette facture a remplacé tout l''engagement de la commande' USING ERRCODE='P0409'; END IF;
  IF b.status = 'draft' THEN
    PERFORM public.fin_bill_confirm(_bill, NULL, _bill_rev, _bill_key, NULL);
    SELECT * INTO b FROM public.fin_supplier_bills WHERE id = _bill;
  END IF;
  SELECT coalesce(sum(m.bill_amount),0) INTO prior FROM public.fin_po_matches m WHERE m.bill_id = _bill AND m.reversed_at IS NULL;
  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(_lines,'[]')) LOOP
    q := nullif(e->>'qty','')::numeric;
    IF q IS NULL OR q <= 0 THEN CONTINUE; END IF;
    SELECT * INTO st FROM public.fin_po_stats(_order) s WHERE s.line_no = (e->>'no')::int;
    IF st.line_no IS NULL THEN RAISE EXCEPTION 'Ligne % absente de la commande', e->>'no'; END IF;
    IF st.line_no = ANY(seen) THEN RAISE EXCEPTION 'Ligne % en double', st.line_no; END IF;
    seen := seen || st.line_no;
    IF EXISTS (SELECT 1 FROM public.fin_po_matches m WHERE m.bill_id = _bill AND m.order_id = _order AND m.line_no = st.line_no AND m.reversed_at IS NULL) THEN
      RAISE EXCEPTION 'Ligne % : cette facture y est déjà rapprochée (annulez d''abord le rapprochement existant)', st.line_no USING ERRCODE='P0409'; END IF;
    IF st.billed + q > st.qty THEN ovr := ovr || jsonb_build_array(jsonb_build_object('no', st.line_no, 'ordered', st.qty, 'billed_after', st.billed + q)); END IF;
    bfr := st.billed + q > st.accepted;
    IF st.line_total IS NOT NULL AND st.qty > 0 THEN
      basis := 'ligne';
      pt := CASE WHEN st.billed + q >= st.qty THEN greatest(st.line_total - st.portion, 0) ELSE round(st.line_total * q / st.qty, 2) END;
    ELSE
      basis := 'manuelle'; pt := nullif(e->>'portion','')::numeric;
      IF pt IS NULL OR pt < 0 THEN
        RAISE EXCEPTION 'Ligne % : montant de la ligne inconnu — indiquez la portion de l''engagement à remplacer (rapprochement incomplet)', st.line_no USING ERRCODE='P0410'; END IF;
    END IF;
    ba := nullif(e->>'bill_amount','')::numeric;
    IF ba IS NOT NULL AND ba < 0 THEN RAISE EXCEPTION 'Montant facturé négatif refusé'; END IF;
    ba_sum := ba_sum + coalesce(ba,0);
    INSERT INTO public.fin_po_matches(company_id, order_id, bill_id, line_no, qty, bill_amount, portion, portion_basis, exception_reason, before_receipt, idem_key, created_by)
    VALUES (o.company_id, o.id, b.id, st.line_no, q, ba, pt, basis, nullif(btrim(_exception),''), bfr, _key, auth.uid());
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'Indiquez au moins une quantité à rapprocher'; END IF;
  IF prior + ba_sum > b.total THEN RAISE EXCEPTION 'Montants rapprochés (% $) supérieurs au total de la facture (% $)', prior + ba_sum, b.total USING ERRCODE='P0409'; END IF;
  IF jsonb_array_length(ovr) > 0 THEN
    IF coalesce(btrim(_exception),'') = '' THEN
      RAISE EXCEPTION 'Quantité facturée supérieure à la quantité commandée (%) : motif d''exception requis', ovr USING ERRCODE='P0410'; END IF;
    IF NOT public.fin_can_correct(o.company_id) THEN RAISE EXCEPTION 'Exception de rapprochement : permission de correction requise' USING ERRCODE='42501'; END IF;
  END IF;
  r := public.fin_po_sync(o.id);
  PERFORM public.fin_po_log(o, 'match', nullif(btrim(_exception),''), jsonb_build_object('bill_id', b.id, 'reference', b.reference, 'key', _key, 'lines', _lines, 'over', ovr, 'engagement', r));
  PERFORM public.fin_sb_log(b, 'po_match', nullif(btrim(_exception),''), jsonb_build_object('order_id', o.id, 'number', o.number, 'key', _key));
  RETURN jsonb_build_object('bill_id', b.id, 'matched', n, 'over', ovr, 'engagement', r);
END $$;

CREATE OR REPLACE FUNCTION public.fin_po_match_void(_order uuid, _bill uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_purchase_orders; b public.fin_supplier_bills; n int; r jsonb;
BEGIN
  SELECT * INTO o FROM public.fin_purchase_orders WHERE id = _order FOR UPDATE;
  IF o.id IS NULL OR NOT public.fin_can_correct(o.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF o.status = 'closed' THEN RAISE EXCEPTION 'Commande clôturée : rouvrez-la d''abord' USING ERRCODE='P0409'; END IF;
  SELECT * INTO b FROM public.fin_supplier_bills WHERE id = _bill AND company_id = o.company_id FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Facture hors de cette entreprise' USING ERRCODE='42501'; END IF;
  UPDATE public.fin_po_matches SET reversed_at = now(), reversed_by = auth.uid(), reverse_reason = btrim(_reason)
   WHERE order_id = _order AND bill_id = _bill AND reversed_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Aucun rapprochement actif entre cette facture et cette commande' USING ERRCODE='P0409'; END IF;
  r := public.fin_po_sync(o.id);
  PERFORM public.fin_po_log(o, 'match_void', btrim(_reason), jsonb_build_object('bill_id', b.id, 'lines', n, 'engagement', r));
  PERFORM public.fin_sb_log(b, 'po_match_void', btrim(_reason), jsonb_build_object('order_id', o.id));
  RETURN jsonb_build_object('voided', n, 'engagement', r);
END $$;

CREATE OR REPLACE FUNCTION public.fin_po_close(_id uuid, _expect_rev integer, _reason text, _reopen boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_purchase_orders; r jsonb;
BEGIN
  SELECT * INTO o FROM public.fin_purchase_orders WHERE id = _id FOR UPDATE;
  IF o.id IS NULL OR NOT public.fin_can_write(o.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _expect_rev IS DISTINCT FROM o.rev THEN RAISE EXCEPTION 'Conflit : rechargez la commande' USING ERRCODE='P0409'; END IF;
  IF coalesce(_reopen,false) THEN
    IF o.status <> 'closed' THEN RAISE EXCEPTION 'Commande non clôturée' USING ERRCODE='P0409'; END IF;
    IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
    UPDATE public.fin_purchase_orders SET status = 'confirmed', close_reason = NULL, closed_at = NULL, closed_by = NULL, rev = rev + 1 WHERE id = _id RETURNING * INTO o;
    r := public.fin_po_sync(o.id);
    PERFORM public.fin_po_log(o, 'reopen', btrim(_reason), jsonb_build_object('engagement', r));
  ELSE
    IF o.status <> 'confirmed' THEN RAISE EXCEPTION 'Seule une commande confirmée peut être clôturée' USING ERRCODE='P0409'; END IF;
    UPDATE public.fin_purchase_orders SET status = 'closed', close_reason = nullif(btrim(_reason),''), closed_at = now(), closed_by = auth.uid(), rev = rev + 1 WHERE id = _id RETURNING * INTO o;
    r := public.fin_po_sync(o.id);
    PERFORM public.fin_po_log(o, 'close', o.close_reason, jsonb_build_object('engagement', r));
  END IF;
  RETURN jsonb_build_object('id', o.id, 'status', o.status, 'rev', o.rev, 'engagement', r);
END $$;

CREATE OR REPLACE FUNCTION public.fin_po_void(_id uuid, _expect_rev integer, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_purchase_orders;
BEGIN
  SELECT * INTO o FROM public.fin_purchase_orders WHERE id = _id FOR UPDATE;
  IF o.id IS NULL OR NOT public.fin_can_correct(o.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF _expect_rev IS DISTINCT FROM o.rev THEN RAISE EXCEPTION 'Conflit : rechargez la commande' USING ERRCODE='P0409'; END IF;
  IF o.status = 'void' THEN RAISE EXCEPTION 'Déjà annulée' USING ERRCODE='P0409'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_po_matches WHERE order_id = _id AND reversed_at IS NULL) THEN
    RAISE EXCEPTION 'Factures rapprochées : annulez d''abord les rapprochements (les factures et règlements restent intacts)' USING ERRCODE='P0409'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_po_receipts WHERE order_id = _id AND status = 'active') THEN
    RAISE EXCEPTION 'Réceptions actives : annulez-les d''abord avec motif' USING ERRCODE='P0409'; END IF;
  IF o.status IN ('confirmed','closed') THEN
    IF o.engagement_created THEN
      PERFORM public.fin_cancel_occurrence(o.occurrence_id, 'Commande '||o.number||' annulée : '||btrim(_reason));
    ELSE
      UPDATE public.fin_occurrences SET amount = o.estimate_amount, amount_quality = o.estimate_quality, updated_at = now() WHERE id = o.occurrence_id;
      PERFORM public.fin_log(o.company_id, o.obligation_id, o.occurrence_id, 'po_void', btrim(_reason), NULL, jsonb_build_object('amount', o.estimate_amount, 'quality', o.estimate_quality));
    END IF;
  END IF;
  UPDATE public.fin_purchase_orders SET status = 'void', void_reason = btrim(_reason), voided_at = now(), voided_by = auth.uid(), rev = rev + 1 WHERE id = _id RETURNING * INTO o;
  PERFORM public.fin_po_log(o, 'void', btrim(_reason), NULL);
  RETURN jsonb_build_object('id', o.id, 'status', o.status);
END $$;

CREATE OR REPLACE FUNCTION public.fin_po_detail(_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_purchase_orders; oc public.fin_occurrences; stats jsonb; rcp jsonb; mat jsonb; ev jsonb; sup text;
BEGIN
  SELECT * INTO o FROM public.fin_purchase_orders WHERE id = _id;
  IF o.id IS NULL OR NOT public.fin_can_read(o.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT name INTO sup FROM public.ent_crm_clients WHERE id = o.supplier_id;
  SELECT * INTO oc FROM public.fin_occurrences WHERE id = o.occurrence_id;
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.line_no), '[]') INTO stats FROM public.fin_po_stats(_id) s;
  SELECT coalesce(jsonb_agg(to_jsonb(r) - 'idem_key' ORDER BY r.created_at), '[]') INTO rcp FROM public.fin_po_receipts r WHERE r.order_id = _id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'bill_id', m.bill_id, 'reference', b.reference, 'bill_status', b.status, 'bill_total', b.total, 'line_no', m.line_no, 'qty', m.qty,
     'bill_amount', m.bill_amount, 'portion', m.portion, 'portion_basis', m.portion_basis, 'before_receipt', m.before_receipt, 'exception_reason', m.exception_reason, 'created_at', m.created_at,
     'reversed_at', m.reversed_at, 'reverse_reason', m.reverse_reason) ORDER BY m.created_at), '[]') INTO mat
  FROM public.fin_po_matches m JOIN public.fin_supplier_bills b ON b.id = m.bill_id WHERE m.order_id = _id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('action', e.action, 'reason', e.reason, 'detail', e.detail, 'actor_id', e.actor_id, 'created_at', e.created_at) ORDER BY e.created_at), '[]') INTO ev
  FROM public.fin_po_events e WHERE e.order_id = _id;
  RETURN (to_jsonb(o) - 'create_key' - 'confirm_key') || jsonb_build_object('supplier', sup, 'total', public.fin_po_total(o.lines), 'stats', stats, 'receipts', rcp, 'matches', mat, 'events', ev,
    'engagement', CASE WHEN oc.id IS NULL THEN NULL ELSE jsonb_build_object('remaining', CASE WHEN oc.status = 'active' THEN oc.amount END, 'quality', oc.amount_quality,
      'due_date', CASE WHEN oc.due_unknown THEN NULL ELSE oc.due_date END, 'due_unknown', oc.due_unknown, 'status', oc.status,
      'base', coalesce(public.fin_po_total(o.lines), o.estimate_amount), 'paid', public.fin_occ_paid(oc.id)) END);
END $$;

CREATE OR REPLACE FUNCTION public.fin_po_overview(_company uuid, _f jsonb, _limit integer, _offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb; tot jsonb; n int;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  WITH base AS (
    SELECT o.id, o.number, o.supplier_id, c.name AS supplier, o.supplier_ref, o.order_date, o.expected_date, o.status, o.created_at, o.updated_at,
      public.fin_po_total(o.lines) AS total,
      CASE WHEN o.status = 'confirmed' AND oc.status = 'active' THEN oc.amount END AS engagement,
      coalesce(o.status = 'confirmed' AND oc.status = 'active' AND oc.amount_quality = 'unknown', false) AS engagement_unknown,
      coalesce(oc.due_unknown, false) AS due_unknown,
      st.received_all, st.received_any, st.billed_all, st.billed_any, st.over_any
    FROM public.fin_purchase_orders o JOIN public.ent_crm_clients c ON c.id = o.supplier_id
    LEFT JOIN public.fin_occurrences oc ON oc.id = o.occurrence_id
    CROSS JOIN LATERAL (SELECT coalesce(bool_and(s.accepted >= s.qty), false) received_all, coalesce(bool_or(s.accepted > 0), false) received_any,
        coalesce(bool_and(s.billed >= s.qty), false) billed_all, coalesce(bool_or(s.billed > 0), false) billed_any, coalesce(bool_or(s.accepted > s.qty OR s.billed > s.qty), false) over_any
      FROM public.fin_po_stats(o.id) s) st
    WHERE o.company_id = _company
      AND (nullif(_f->>'supplier_id','') IS NULL OR o.supplier_id = (_f->>'supplier_id')::uuid)
      AND (CASE coalesce(_f->>'status','active') WHEN 'all' THEN true WHEN 'active' THEN o.status <> 'void' ELSE o.status = _f->>'status' END)
      AND (nullif(_f->>'q','') IS NULL OR c.name ILIKE '%'||(_f->>'q')||'%' OR o.number ILIKE '%'||(_f->>'q')||'%' OR o.supplier_ref ILIKE '%'||(_f->>'q')||'%')
  ), agg AS (
    SELECT count(*)::int AS n, jsonb_build_object('count', count(*),
      'engagement_open', coalesce(sum(engagement) FILTER (WHERE engagement IS NOT NULL),0),
      'engagement_unknown_count', count(*) FILTER (WHERE engagement_unknown),
      'engagement_due_unknown', coalesce(sum(engagement) FILTER (WHERE engagement IS NOT NULL AND due_unknown),0),
      'drafts', count(*) FILTER (WHERE status = 'draft'), 'confirmed', count(*) FILTER (WHERE status = 'confirmed')) AS t FROM base
  ), pg AS (SELECT * FROM base ORDER BY created_at DESC, id LIMIT greatest(least(coalesce(_limit,25),200),1) OFFSET greatest(coalesce(_offset,0),0))
  SELECT agg.n, agg.t, (SELECT coalesce(jsonb_agg(to_jsonb(pg) ORDER BY pg.created_at DESC, pg.id), '[]') FROM pg) INTO n, tot, res FROM agg;
  RETURN jsonb_build_object('rows', res, 'totals', tot, 'total', n);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.fin12b_patch(_fn text, _pairs text[]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s text; i int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO s FROM pg_proc p WHERE p.proname = _fn AND p.pronamespace = 'public'::regnamespace;
  IF s IS NULL THEN RAISE EXCEPTION 'FIN-12B : fonction % absente', _fn; END IF;
  FOR i IN 1 .. array_length(_pairs,1) BY 2 LOOP
    IF position(_pairs[i] IN s) = 0 THEN RAISE EXCEPTION 'FIN-12B : ancre introuvable dans % : %', _fn, _pairs[i]; END IF;
    s := replace(s, _pairs[i], _pairs[i+1]);
  END LOOP;
  EXECUTE s;
END $$;
SELECT pg_temp.fin12b_patch('fin_bill_confirm', ARRAY[
  'IF oc.status <> ''active'' THEN RAISE EXCEPTION ''Échéance annulée : choisissez une autre estimation'' USING ERRCODE=''P0409''; END IF;',
  'IF oc.status <> ''active'' THEN RAISE EXCEPTION ''Échéance annulée : choisissez une autre estimation'' USING ERRCODE=''P0409''; END IF;
    IF EXISTS (SELECT 1 FROM public.fin_purchase_orders WHERE occurrence_id = _occ AND status IN (''confirmed'',''closed'')) THEN
      RAISE EXCEPTION ''Cette échéance est l''''engagement d''''une commande : rapprochez la facture depuis la commande'' USING ERRCODE=''P0409''; END IF;']);
SELECT pg_temp.fin12b_patch('fin_bill_void', ARRAY[
  'IF b.status = ''void'' THEN RAISE EXCEPTION ''Déjà annulée'' USING ERRCODE=''P0409''; END IF;',
  'IF b.status = ''void'' THEN RAISE EXCEPTION ''Déjà annulée'' USING ERRCODE=''P0409''; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_po_matches WHERE bill_id = _id AND reversed_at IS NULL) THEN
    RAISE EXCEPTION ''Facture rapprochée à une commande : annulez d''''abord le rapprochement (motif), puis la facture.'' USING ERRCODE=''P0409''; END IF;']);

REVOKE ALL ON FUNCTION public.fin_po_log(public.fin_purchase_orders,text,text,jsonb), public.fin_po_stats(uuid), public.fin_po_sync(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fin_po_save(uuid,uuid,jsonb,integer,text), public.fin_po_confirm(uuid,integer,text), public.fin_po_amend(uuid,integer,jsonb,text),
  public.fin_po_receive(uuid,jsonb,text), public.fin_po_receipt_void(uuid,text), public.fin_po_match(uuid,uuid,jsonb,text,integer,text,text),
  public.fin_po_match_void(uuid,uuid,text), public.fin_po_close(uuid,integer,text,boolean), public.fin_po_void(uuid,integer,text),
  public.fin_po_detail(uuid), public.fin_po_overview(uuid,jsonb,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_po_save(uuid,uuid,jsonb,integer,text), public.fin_po_confirm(uuid,integer,text), public.fin_po_amend(uuid,integer,jsonb,text),
  public.fin_po_receive(uuid,jsonb,text), public.fin_po_receipt_void(uuid,text), public.fin_po_match(uuid,uuid,jsonb,text,integer,text,text),
  public.fin_po_match_void(uuid,uuid,text), public.fin_po_close(uuid,integer,text,boolean), public.fin_po_void(uuid,integer,text),
  public.fin_po_detail(uuid), public.fin_po_overview(uuid,jsonb,integer,integer) TO authenticated;
