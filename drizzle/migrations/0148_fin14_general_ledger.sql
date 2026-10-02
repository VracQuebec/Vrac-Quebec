-- FIN-14 — Grand livre comptable : plan de comptes, journal (brouillon → validée), contrepassation liée,
-- comptabilisation unique des opérations existantes (une écriture par pièce, index unique), grand livre et balance.
-- Les relevés bancaires et rapprochements ne sont jamais des pièces comptables.

CREATE TABLE public.fin_gl_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  number text NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('actif','passif','capitaux','revenus','depenses')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, number)
);
GRANT SELECT ON public.fin_gl_accounts TO authenticated;
GRANT ALL ON public.fin_gl_accounts TO service_role;
ALTER TABLE public.fin_gl_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_gl_accounts_read ON public.fin_gl_accounts FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_gl_mappings (
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  role text NOT NULL,
  gl_account_id uuid NOT NULL REFERENCES public.fin_gl_accounts(id),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, role)
);
GRANT SELECT ON public.fin_gl_mappings TO authenticated;
GRANT ALL ON public.fin_gl_mappings TO service_role;
ALTER TABLE public.fin_gl_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_gl_mappings_read ON public.fin_gl_mappings FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_gl_account_links (
  fin_account_id uuid PRIMARY KEY REFERENCES public.fin_accounts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  gl_account_id uuid NOT NULL REFERENCES public.fin_gl_accounts(id),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fin_gl_account_links TO authenticated;
GRANT ALL ON public.fin_gl_account_links TO service_role;
ALTER TABLE public.fin_gl_account_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_gl_account_links_read ON public.fin_gl_account_links FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_gl_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  entry_no integer,
  entry_date date NOT NULL,
  reference text,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated')),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','auto','reversal')),
  source_kind text,
  source_id uuid,
  source_purpose text CHECK (source_purpose IN ('post','void')),
  source_label text,
  reverses_id uuid REFERENCES public.fin_gl_entries(id),
  reversal_reason text,
  reversed_by_id uuid REFERENCES public.fin_gl_entries(id),
  draft_key text,
  reverse_key text,
  rev integer NOT NULL DEFAULT 1,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  validated_by uuid,
  validated_at timestamptz
);
CREATE UNIQUE INDEX fin_gl_entries_no ON public.fin_gl_entries(company_id, entry_no) WHERE entry_no IS NOT NULL;
CREATE UNIQUE INDEX fin_gl_entries_source ON public.fin_gl_entries(company_id, source_kind, source_id, source_purpose) WHERE source_kind IS NOT NULL;
CREATE UNIQUE INDEX fin_gl_entries_reverses ON public.fin_gl_entries(reverses_id) WHERE reverses_id IS NOT NULL;
CREATE UNIQUE INDEX fin_gl_entries_dkey ON public.fin_gl_entries(company_id, draft_key) WHERE draft_key IS NOT NULL;
CREATE INDEX fin_gl_entries_date ON public.fin_gl_entries(company_id, entry_date);
GRANT SELECT ON public.fin_gl_entries TO authenticated;
GRANT ALL ON public.fin_gl_entries TO service_role;
ALTER TABLE public.fin_gl_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_gl_entries_read ON public.fin_gl_entries FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_gl_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.fin_gl_entries(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  gl_account_id uuid NOT NULL REFERENCES public.fin_gl_accounts(id),
  debit numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  memo text,
  CHECK (NOT (debit > 0 AND credit > 0))
);
CREATE INDEX fin_gl_lines_acct ON public.fin_gl_lines(company_id, gl_account_id);
CREATE INDEX fin_gl_lines_entry ON public.fin_gl_lines(entry_id);
GRANT SELECT ON public.fin_gl_lines TO authenticated;
GRANT ALL ON public.fin_gl_lines TO service_role;
ALTER TABLE public.fin_gl_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_gl_lines_read ON public.fin_gl_lines FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_gl_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  entry_id uuid,
  action text NOT NULL,
  reason text,
  data jsonb,
  actor uuid DEFAULT auth.uid(),
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fin_gl_events TO authenticated;
GRANT ALL ON public.fin_gl_events TO service_role;
ALTER TABLE public.fin_gl_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_gl_events_read ON public.fin_gl_events FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE OR REPLACE FUNCTION public.fin_gl_entry_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE d numeric; c numeric; n int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'validated' THEN RAISE EXCEPTION 'Écriture validée : suppression interdite (passez par une contrepassation)' USING ERRCODE = 'P0001'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'validated' THEN
    IF OLD.reversed_by_id IS NULL AND NEW.reversed_by_id IS NOT NULL AND coalesce(current_setting('fin.gl_ok', true), '') = '1'
       AND (to_jsonb(NEW) - 'reversed_by_id') = (to_jsonb(OLD) - 'reversed_by_id') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Écriture validée : modification interdite (passez par une contrepassation)' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'validated' THEN
    SELECT coalesce(sum(debit),0), coalesce(sum(credit),0), count(*) INTO d, c, n FROM fin_gl_lines WHERE entry_id = NEW.id;
    IF n < 2 OR d <> c OR d = 0 THEN RAISE EXCEPTION 'Écriture déséquilibrée (débits % / crédits %)', d, c USING ERRCODE = 'P0410'; END IF;
    IF NEW.entry_no IS NULL THEN RAISE EXCEPTION 'Numéro manquant' USING ERRCODE = 'P0001'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_gl_entry_guard BEFORE UPDATE OR DELETE ON public.fin_gl_entries FOR EACH ROW EXECUTE FUNCTION public.fin_gl_entry_guard();

CREATE OR REPLACE FUNCTION public.fin_gl_line_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s text;
BEGIN
  SELECT status INTO s FROM fin_gl_entries WHERE id = coalesce(NEW.entry_id, OLD.entry_id);
  IF s = 'validated' THEN RAISE EXCEPTION 'Écriture validée : lignes non modifiables' USING ERRCODE = 'P0001'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_gl_line_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fin_gl_lines FOR EACH ROW EXECUTE FUNCTION public.fin_gl_line_guard();

CREATE OR REPLACE FUNCTION public.fin_gl_role_category(_role text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _role WHEN 'ar' THEN 'actif' WHEN 'ap' THEN 'passif' WHEN 'revenue' THEN 'revenus'
    WHEN 'gst_payable' THEN 'passif' WHEN 'qst_payable' THEN 'passif' WHEN 'gst_recoverable' THEN 'actif' WHEN 'qst_recoverable' THEN 'actif'
    WHEN 'expense' THEN 'depenses' WHEN 'obligation_expense' THEN 'depenses' WHEN 'employee_payable' THEN 'passif'
    WHEN 'employee_advance' THEN 'actif' WHEN 'supplier_advance' THEN 'actif' ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.fin_gl_lock(_company uuid) RETURNS void LANGUAGE sql AS $$ SELECT pg_advisory_xact_lock(hashtext('fin_gl:' || _company::text)) $$;
CREATE OR REPLACE FUNCTION public.fin_gl_next_no(_company uuid) RETURNS int LANGUAGE sql SET search_path = public AS $$
  SELECT coalesce(max(entry_no), 0) + 1 FROM fin_gl_entries WHERE company_id = _company
$$;
REVOKE ALL ON FUNCTION public.fin_gl_lock(uuid), public.fin_gl_next_no(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_gl_account_save(_company uuid, _id uuid, _number text, _name text, _category text, _active boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a fin_gl_accounts; used boolean; nid uuid;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  _number := btrim(coalesce(_number, '')); _name := btrim(coalesce(_name, ''));
  IF _number !~ '^[0-9A-Za-z.\-]{1,20}$' THEN RAISE EXCEPTION 'Numéro de compte invalide (1 à 20 caractères : chiffres, lettres, point, tiret)' USING ERRCODE = '22023'; END IF;
  IF length(_name) < 2 OR length(_name) > 120 THEN RAISE EXCEPTION 'Nom de compte requis' USING ERRCODE = '22023'; END IF;
  IF _category NOT IN ('actif','passif','capitaux','revenus','depenses') THEN RAISE EXCEPTION 'Catégorie invalide' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM fin_gl_accounts WHERE company_id = _company AND number = _number AND id IS DISTINCT FROM _id) THEN
    RAISE EXCEPTION 'Ce numéro de compte existe déjà' USING ERRCODE = '23505'; END IF;
  IF _id IS NULL THEN
    INSERT INTO fin_gl_accounts(company_id, number, name, category, active) VALUES (_company, _number, _name, _category, coalesce(_active, true)) RETURNING id INTO nid;
    INSERT INTO fin_gl_events(company_id, action, data) VALUES (_company, 'account_create', jsonb_build_object('account', nid, 'number', _number, 'name', _name, 'category', _category));
    RETURN nid;
  END IF;
  SELECT * INTO a FROM fin_gl_accounts WHERE id = _id AND company_id = _company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compte introuvable' USING ERRCODE = '42501'; END IF;
  used := EXISTS (SELECT 1 FROM fin_gl_lines l JOIN fin_gl_entries e ON e.id = l.entry_id WHERE l.gl_account_id = _id AND e.status = 'validated');
  IF used AND (a.number <> _number OR a.category <> _category) THEN
    RAISE EXCEPTION 'Compte déjà utilisé dans des écritures validées : numéro et catégorie non modifiables (le nom et l''activation restent modifiables)' USING ERRCODE = 'P0001'; END IF;
  UPDATE fin_gl_accounts SET number = _number, name = _name, category = _category, active = coalesce(_active, a.active), updated_at = now() WHERE id = _id;
  INSERT INTO fin_gl_events(company_id, action, data) VALUES (_company, 'account_update', jsonb_build_object('account', _id, 'before', to_jsonb(a), 'number', _number, 'name', _name, 'category', _category, 'active', coalesce(_active, a.active)));
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_map_set(_company uuid, _role text, _gl uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cat text;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF public.fin_gl_role_category(_role) IS NULL THEN RAISE EXCEPTION 'Association inconnue' USING ERRCODE = '22023'; END IF;
  IF _gl IS NULL THEN DELETE FROM fin_gl_mappings WHERE company_id = _company AND role = _role;
  ELSE
    SELECT category INTO cat FROM fin_gl_accounts WHERE id = _gl AND company_id = _company AND active;
    IF cat IS NULL THEN RAISE EXCEPTION 'Compte comptable introuvable ou désactivé' USING ERRCODE = '42501'; END IF;
    IF cat <> public.fin_gl_role_category(_role) THEN RAISE EXCEPTION 'Catégorie incompatible : un compte de catégorie « % » est attendu', public.fin_gl_role_category(_role) USING ERRCODE = '22023'; END IF;
    INSERT INTO fin_gl_mappings(company_id, role, gl_account_id) VALUES (_company, _role, _gl)
      ON CONFLICT (company_id, role) DO UPDATE SET gl_account_id = EXCLUDED.gl_account_id, updated_by = auth.uid(), updated_at = now();
  END IF;
  INSERT INTO fin_gl_events(company_id, action, data) VALUES (_company, 'mapping_set', jsonb_build_object('role', _role, 'account', _gl));
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_link_set(_company uuid, _fin_account uuid, _gl uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cat text;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM fin_accounts WHERE id = _fin_account AND company_id = _company) THEN RAISE EXCEPTION 'Compte financier introuvable' USING ERRCODE = '42501'; END IF;
  IF _gl IS NULL THEN DELETE FROM fin_gl_account_links WHERE fin_account_id = _fin_account;
  ELSE
    SELECT category INTO cat FROM fin_gl_accounts WHERE id = _gl AND company_id = _company AND active;
    IF cat IS NULL THEN RAISE EXCEPTION 'Compte comptable introuvable ou désactivé' USING ERRCODE = '42501'; END IF;
    IF cat NOT IN ('actif','passif') THEN RAISE EXCEPTION 'Un compte financier s''associe à un compte d''actif (banque, caisse) ou de passif (carte de crédit)' USING ERRCODE = '22023'; END IF;
    INSERT INTO fin_gl_account_links(fin_account_id, company_id, gl_account_id) VALUES (_fin_account, _company, _gl)
      ON CONFLICT (fin_account_id) DO UPDATE SET gl_account_id = EXCLUDED.gl_account_id, updated_by = auth.uid(), updated_at = now();
  END IF;
  INSERT INTO fin_gl_events(company_id, action, data) VALUES (_company, 'link_set', jsonb_build_object('fin_account', _fin_account, 'account', _gl));
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_raw(_company uuid)
RETURNS TABLE(kind text, src uuid, on_date date, ref text, label text, raw jsonb, voided boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'invoice', i.id, i.issue_date, i.number, 'Facture client ' || coalesce(i.number, '') || ' — ' || coalesce(i.client_name, ''),
    CASE WHEN i.tax_snapshot IS NULL THEN jsonb_build_array(jsonb_build_object('missing', 'Taxes figées absentes sur la facture'))
    ELSE jsonb_build_array(
      jsonb_build_object('role', 'ar', 'debit', i.total),
      jsonb_build_object('role', 'revenue', 'credit', i.total - coalesce((i.tax_snapshot->>'gst')::numeric, 0) - coalesce((i.tax_snapshot->>'qst')::numeric, 0)),
      jsonb_build_object('role', 'gst_payable', 'credit', coalesce((i.tax_snapshot->>'gst')::numeric, 0)),
      jsonb_build_object('role', 'qst_payable', 'credit', coalesce((i.tax_snapshot->>'qst')::numeric, 0))) END,
    false
  FROM fin_invoices i WHERE i.company_id = _company AND i.issued_at IS NOT NULL AND i.number IS NOT NULL
  UNION ALL
  SELECT 'receipt', r.id, r.received_on, coalesce(r.reference, i.number), 'Encaissement — facture ' || coalesce(i.number, ''),
    jsonb_build_array(jsonb_build_object('facct', r.account_id, 'debit', r.amount), jsonb_build_object('role', 'ar', 'credit', r.amount)),
    r.voided_at IS NOT NULL
  FROM fin_invoice_receipts r JOIN fin_invoices i ON i.id = r.invoice_id WHERE r.company_id = _company
  UNION ALL
  SELECT 'credit_note', c.id, c.issued_at::date, c.number, 'Note de crédit client ' || coalesce(c.number, ''),
    jsonb_build_array(
      jsonb_build_object('role', 'revenue', 'debit', c.total - coalesce(c.gst, 0) - coalesce(c.qst, 0)),
      jsonb_build_object('role', 'gst_payable', 'debit', coalesce(c.gst, 0)),
      jsonb_build_object('role', 'qst_payable', 'debit', coalesce(c.qst, 0)),
      jsonb_build_object('role', 'ar', 'credit', c.total)),
    false
  FROM fin_credit_notes c WHERE c.company_id = _company AND c.status = 'emise' AND c.issued_at IS NOT NULL
  UNION ALL
  SELECT 'bill', b.id, b.doc_date, b.reference, 'Facture fournisseur ' || coalesce(b.reference, ''),
    CASE WHEN b.tax_status = 'a_completer' THEN jsonb_build_array(jsonb_build_object('missing', 'Taxes de la facture fournisseur à compléter'))
    ELSE jsonb_build_array(
      jsonb_build_object('role', 'expense', 'debit', b.total - coalesce(b.gst, 0) - coalesce(b.qst, 0)),
      jsonb_build_object('role', 'gst_recoverable', 'debit', coalesce(b.gst, 0)),
      jsonb_build_object('role', 'qst_recoverable', 'debit', coalesce(b.qst, 0)),
      jsonb_build_object('role', 'ap', 'credit', b.total)) END,
    b.status = 'voided'
  FROM fin_supplier_bills b WHERE b.company_id = _company AND b.confirmed_at IS NOT NULL AND b.status IN ('confirmed', 'voided')
  UNION ALL
  SELECT 'supplier_credit', s.id, s.doc_date, s.reference, 'Note de crédit fournisseur ' || coalesce(s.reference, ''),
    CASE WHEN s.tax_status = 'a_completer' THEN jsonb_build_array(jsonb_build_object('missing', 'Taxes de la note de crédit fournisseur à compléter'))
    ELSE jsonb_build_array(
      jsonb_build_object('role', 'ap', 'debit', s.total),
      jsonb_build_object('role', 'expense', 'credit', s.total - coalesce(s.gst, 0) - coalesce(s.qst, 0)),
      jsonb_build_object('role', 'gst_recoverable', 'credit', coalesce(s.gst, 0)),
      jsonb_build_object('role', 'qst_recoverable', 'credit', coalesce(s.qst, 0))) END,
    s.status = 'voided'
  FROM fin_supplier_credits s WHERE s.company_id = _company AND s.confirmed_at IS NOT NULL AND s.status IN ('confirmed', 'voided')
  UNION ALL
  SELECT 'payment', p.id, p.paid_on, p.reference, 'Règlement — ' || coalesce(p.payee_name, ''),
    jsonb_build_array(
      jsonb_build_object('facct', p.account_id, 'credit', p.amount),
      jsonb_build_object('role', 'employee_advance', 'debit', CASE WHEN adv.id IS NOT NULL THEN p.amount ELSE 0 END),
      jsonb_build_object('role', 'ap', 'debit', CASE WHEN adv.id IS NULL THEN al.ap ELSE 0 END),
      jsonb_build_object('role', 'employee_payable', 'debit', CASE WHEN adv.id IS NULL THEN al.emp ELSE 0 END),
      jsonb_build_object('role', 'obligation_expense', 'debit', CASE WHEN adv.id IS NULL THEN al.other ELSE 0 END),
      jsonb_build_object('role', 'supplier_advance', 'debit', CASE WHEN adv.id IS NULL THEN p.amount - al.ap - al.emp - al.other ELSE 0 END)),
    p.status = 'voided'
  FROM fin_payments p
  LEFT JOIN LATERAL (SELECT a.id FROM fin_exp_advances a WHERE a.payment_id = p.id LIMIT 1) adv ON true
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(x.amount) FILTER (WHERE EXISTS (SELECT 1 FROM fin_supplier_bills b WHERE b.occurrence_id = x.occurrence_id)), 0) ap,
           coalesce(sum(x.amount) FILTER (WHERE EXISTS (SELECT 1 FROM fin_exp_reports r WHERE r.occurrence_id = x.occurrence_id)), 0) emp,
           coalesce(sum(x.amount) FILTER (WHERE NOT EXISTS (SELECT 1 FROM fin_supplier_bills b WHERE b.occurrence_id = x.occurrence_id)
                                            AND NOT EXISTS (SELECT 1 FROM fin_exp_reports r WHERE r.occurrence_id = x.occurrence_id)), 0) other
    FROM fin_allocations x WHERE x.payment_id = p.id AND x.reversed_at IS NULL) al
  WHERE p.company_id = _company AND p.validated_at IS NOT NULL AND p.status IN ('validated', 'voided')
  UNION ALL
  SELECT 'refund', f.id, f.refunded_on, f.reference, 'Remboursement reçu (trop-payé)',
    jsonb_build_array(jsonb_build_object('facct', f.account_id, 'debit', f.amount), jsonb_build_object('role', 'supplier_advance', 'credit', f.amount)),
    f.voided_at IS NOT NULL
  FROM fin_refunds f WHERE f.company_id = _company
  UNION ALL
  SELECT 'supplier_credit_refund', f.id, f.refunded_on, f.reference, 'Remboursement reçu (note de crédit fournisseur)',
    jsonb_build_array(jsonb_build_object('facct', f.account_id, 'debit', f.amount), jsonb_build_object('role', 'ap', 'credit', f.amount)),
    f.voided_at IS NOT NULL
  FROM fin_supplier_credit_refunds f WHERE f.company_id = _company
  UNION ALL
  SELECT 'exp_report', e.id, e.decided_at::date, NULL, 'Note de frais — ' || coalesce(e.employee_name, ''),
    jsonb_build_array(jsonb_build_object('role', 'expense', 'debit', coalesce(e.reimbursable_total, 0)), jsonb_build_object('role', 'employee_payable', 'credit', coalesce(e.reimbursable_total, 0))),
    false
  FROM fin_exp_reports e WHERE e.company_id = _company AND e.decided_at IS NOT NULL AND e.status NOT IN ('brouillon', 'soumise', 'refusee', 'annulee')
  UNION ALL
  SELECT 'restitution', t.id, t.received_on, t.reference, 'Restitution d''avance',
    jsonb_build_array(jsonb_build_object('missing', 'Compte financier de la restitution non précisé'), jsonb_build_object('role', 'employee_advance', 'credit', t.amount)),
    t.voided_at IS NOT NULL
  FROM fin_exp_restitutions t WHERE t.company_id = _company
$$;
REVOKE ALL ON FUNCTION public.fin_gl_raw(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_gl_resolve(_company uuid, _raw jsonb, OUT lines jsonb, OUT missing text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e jsonb; g uuid; d numeric; c numeric; m text[] := '{}'; o jsonb := '[]'; nm text;
BEGIN
  FOR e IN SELECT * FROM jsonb_array_elements(_raw) LOOP
    IF e ? 'missing' THEN m := m || (e->>'missing'); CONTINUE; END IF;
    d := round(coalesce((e->>'debit')::numeric, 0), 2); c := round(coalesce((e->>'credit')::numeric, 0), 2);
    IF d < 0 THEN c := c - d; d := 0; END IF;
    IF c < 0 THEN d := d - c; c := 0; END IF;
    IF d = 0 AND c = 0 THEN CONTINUE; END IF;
    g := NULL;
    IF e ? 'role' THEN
      SELECT mp.gl_account_id INTO g FROM fin_gl_mappings mp JOIN fin_gl_accounts a ON a.id = mp.gl_account_id AND a.active WHERE mp.company_id = _company AND mp.role = e->>'role';
      IF g IS NULL THEN m := m || ('role:' || (e->>'role')); END IF;
    ELSIF (e->>'facct') IS NULL THEN m := m || 'Compte financier du mouvement non précisé'::text;
    ELSE
      SELECT l.gl_account_id INTO g FROM fin_gl_account_links l JOIN fin_gl_accounts a ON a.id = l.gl_account_id AND a.active WHERE l.company_id = _company AND l.fin_account_id = (e->>'facct')::uuid;
      IF g IS NULL THEN SELECT name INTO nm FROM fin_accounts WHERE id = (e->>'facct')::uuid; m := m || ('facct:' || (e->>'facct') || ':' || coalesce(nm, '')); END IF;
    END IF;
    o := o || jsonb_build_object('gl', g, 'debit', d, 'credit', c, 'role', e->>'role', 'facct', e->>'facct');
  END LOOP;
  lines := o; missing := m;
END $$;
REVOKE ALL ON FUNCTION public.fin_gl_resolve(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_gl_queue(_company uuid)
RETURNS TABLE(kind text, src uuid, purpose text, on_date date, ref text, label text, lines jsonb, missing text[], posted_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; res record; pe fin_gl_entries; d numeric; c numeric;
BEGIN
  FOR r IN SELECT * FROM public.fin_gl_raw(_company) x ORDER BY x.on_date, x.kind LOOP
    pe := NULL;
    SELECT * INTO pe FROM fin_gl_entries e WHERE e.company_id = _company AND e.source_kind = r.kind AND e.source_id = r.src AND e.source_purpose = 'post';
    IF pe.id IS NULL THEN
      IF r.voided THEN CONTINUE; END IF;
      SELECT * INTO res FROM public.fin_gl_resolve(_company, r.raw);
      IF jsonb_array_length(res.lines) = 0 AND coalesce(array_length(res.missing, 1), 0) = 0 THEN CONTINUE; END IF;
      SELECT coalesce(sum((x->>'debit')::numeric), 0), coalesce(sum((x->>'credit')::numeric), 0) INTO d, c FROM jsonb_array_elements(res.lines) x;
      kind := r.kind; src := r.src; purpose := 'post'; on_date := r.on_date; ref := r.ref; label := r.label; lines := res.lines; posted_id := NULL;
      missing := res.missing || CASE WHEN d <> c AND coalesce(array_length(res.missing, 1), 0) = 0 THEN ARRAY['Écriture déséquilibrée (' || d || ' / ' || c || ')'] ELSE '{}'::text[] END;
      IF on_date IS NULL THEN missing := missing || 'Date de la pièce absente'::text; END IF;
      RETURN NEXT;
    ELSIF r.voided AND pe.reversed_by_id IS NULL THEN
      kind := r.kind; src := r.src; purpose := 'void'; on_date := NULL; ref := r.ref; label := 'Annulation — ' || r.label; posted_id := pe.id;
      SELECT coalesce(jsonb_agg(jsonb_build_object('gl', l.gl_account_id, 'debit', l.credit, 'credit', l.debit) ORDER BY l.line_no), '[]') INTO lines FROM fin_gl_lines l WHERE l.entry_id = pe.id;
      missing := '{}';
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.fin_gl_queue(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_gl_pending(_company uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.on_date NULLS LAST, q.kind) FROM public.fin_gl_queue(_company) q), '[]');
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_sync(_company uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q record; eid uuid; x jsonb; n int; posted int := 0; reversed int := 0; todo int := 0; i int;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  PERFORM public.fin_gl_lock(_company);
  FOR q IN SELECT * FROM public.fin_gl_queue(_company) LOOP
    IF coalesce(array_length(q.missing, 1), 0) > 0 THEN todo := todo + 1; CONTINUE; END IF;
    n := public.fin_gl_next_no(_company);
    eid := NULL;
    INSERT INTO fin_gl_entries(company_id, entry_no, entry_date, reference, description, origin, source_kind, source_id, source_purpose, source_label, reverses_id, reversal_reason)
    VALUES (_company, n, coalesce(q.on_date, current_date), q.ref, q.label, CASE WHEN q.purpose = 'void' THEN 'reversal' ELSE 'auto' END,
            q.kind, q.src, q.purpose, q.label, q.posted_id, CASE WHEN q.purpose = 'void' THEN 'Pièce source annulée' END)
    ON CONFLICT DO NOTHING RETURNING id INTO eid;
    IF eid IS NULL THEN CONTINUE; END IF;
    i := 0;
    FOR x IN SELECT * FROM jsonb_array_elements(q.lines) LOOP
      i := i + 1;
      INSERT INTO fin_gl_lines(entry_id, company_id, line_no, gl_account_id, debit, credit) VALUES (eid, _company, i, (x->>'gl')::uuid, (x->>'debit')::numeric, (x->>'credit')::numeric);
    END LOOP;
    UPDATE fin_gl_entries SET status = 'validated', validated_at = now(), validated_by = auth.uid() WHERE id = eid;
    IF q.purpose = 'void' THEN
      PERFORM set_config('fin.gl_ok', '1', true);
      UPDATE fin_gl_entries SET reversed_by_id = eid WHERE id = q.posted_id;
      PERFORM set_config('fin.gl_ok', '', true);
      reversed := reversed + 1;
    ELSE posted := posted + 1; END IF;
    INSERT INTO fin_gl_events(company_id, entry_id, action, data) VALUES (_company, eid, 'auto_' || q.purpose, jsonb_build_object('kind', q.kind, 'source', q.src));
  END LOOP;
  RETURN jsonb_build_object('posted', posted, 'reversed', reversed, 'a_completer', todo);
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_check_lines(_company uuid, _lines jsonb) RETURNS void LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE x jsonb; d numeric; c numeric;
BEGIN
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) > 100 THEN RAISE EXCEPTION 'Lignes invalides' USING ERRCODE = '22023'; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    IF NOT EXISTS (SELECT 1 FROM fin_gl_accounts WHERE id = (x->>'gl')::uuid AND company_id = _company AND active) THEN RAISE EXCEPTION 'Compte comptable absent, désactivé ou d''une autre entreprise' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(coalesce(x->'debit', '0'::jsonb)) <> 'number' OR jsonb_typeof(coalesce(x->'credit', '0'::jsonb)) <> 'number' THEN RAISE EXCEPTION 'Montant illisible' USING ERRCODE = '22023'; END IF;
    d := coalesce((x->>'debit')::numeric, 0); c := coalesce((x->>'credit')::numeric, 0);
    IF d < 0 OR c < 0 OR (d > 0 AND c > 0) OR (d = 0 AND c = 0) OR d <> round(d, 2) OR c <> round(c, 2) OR d > 1e11 OR c > 1e11 THEN
      RAISE EXCEPTION 'Chaque ligne porte soit un débit, soit un crédit positif (2 décimales max.)' USING ERRCODE = '22023'; END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_entry_save(_company uuid, _id uuid, _rev int, _date date, _ref text, _desc text, _lines jsonb, _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e fin_gl_entries; x jsonb; i int := 0;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF _date IS NULL THEN RAISE EXCEPTION 'Date comptable requise' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(_desc, ''))) < 2 THEN RAISE EXCEPTION 'Description requise' USING ERRCODE = '22023'; END IF;
  PERFORM public.fin_gl_check_lines(_company, _lines);
  IF _id IS NULL THEN
    IF _key IS NULL OR length(_key) < 8 THEN RAISE EXCEPTION 'Clé de demande requise' USING ERRCODE = '22023'; END IF;
    SELECT * INTO e FROM fin_gl_entries WHERE company_id = _company AND draft_key = _key;
    IF FOUND THEN RETURN jsonb_build_object('id', e.id, 'rev', e.rev, 'replay', true); END IF;
    INSERT INTO fin_gl_entries(company_id, entry_date, reference, description, draft_key) VALUES (_company, _date, nullif(btrim(_ref), ''), btrim(_desc), _key)
      ON CONFLICT DO NOTHING RETURNING * INTO e;
    IF e.id IS NULL THEN SELECT * INTO e FROM fin_gl_entries WHERE company_id = _company AND draft_key = _key; RETURN jsonb_build_object('id', e.id, 'rev', e.rev, 'replay', true); END IF;
  ELSE
    SELECT * INTO e FROM fin_gl_entries WHERE id = _id AND company_id = _company FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Écriture introuvable' USING ERRCODE = '42501'; END IF;
    IF e.status <> 'draft' THEN RAISE EXCEPTION 'Écriture validée : modification interdite (passez par une contrepassation)' USING ERRCODE = 'P0001'; END IF;
    IF e.rev <> _rev THEN RAISE EXCEPTION 'Le brouillon a été modifié entre-temps; rechargez-le' USING ERRCODE = 'P0409'; END IF;
    UPDATE fin_gl_entries SET entry_date = _date, reference = nullif(btrim(_ref), ''), description = btrim(_desc), rev = rev + 1, updated_at = now() WHERE id = _id RETURNING * INTO e;
    DELETE FROM fin_gl_lines WHERE entry_id = _id;
  END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    i := i + 1;
    INSERT INTO fin_gl_lines(entry_id, company_id, line_no, gl_account_id, debit, credit, memo)
    VALUES (e.id, _company, i, (x->>'gl')::uuid, coalesce((x->>'debit')::numeric, 0), coalesce((x->>'credit')::numeric, 0), nullif(btrim(coalesce(x->>'memo', '')), ''));
  END LOOP;
  INSERT INTO fin_gl_events(company_id, entry_id, action) VALUES (_company, e.id, CASE WHEN _id IS NULL THEN 'draft_create' ELSE 'draft_update' END);
  RETURN jsonb_build_object('id', e.id, 'rev', e.rev);
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_entry_discard(_id uuid, _rev int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e fin_gl_entries;
BEGIN
  SELECT * INTO e FROM fin_gl_entries WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.fin_can_write(e.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF e.status <> 'draft' THEN RAISE EXCEPTION 'Écriture validée : suppression interdite (passez par une contrepassation)' USING ERRCODE = 'P0001'; END IF;
  IF e.rev <> _rev THEN RAISE EXCEPTION 'Le brouillon a été modifié entre-temps; rechargez-le' USING ERRCODE = 'P0409'; END IF;
  INSERT INTO fin_gl_events(company_id, entry_id, action, data) VALUES (e.company_id, NULL, 'draft_discard', to_jsonb(e));
  DELETE FROM fin_gl_entries WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_entry_validate(_id uuid, _rev int) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e fin_gl_entries; d numeric; c numeric; n int; bad int;
BEGIN
  SELECT * INTO e FROM fin_gl_entries WHERE id = _id;
  IF NOT FOUND OR NOT public.fin_can_write(e.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  PERFORM public.fin_gl_lock(e.company_id);
  SELECT * INTO e FROM fin_gl_entries WHERE id = _id FOR UPDATE;
  IF e.status = 'validated' THEN
    IF e.rev = _rev THEN RETURN jsonb_build_object('id', e.id, 'entry_no', e.entry_no, 'replay', true); END IF;
    RAISE EXCEPTION 'Écriture déjà validée' USING ERRCODE = 'P0409'; END IF;
  IF e.rev <> _rev THEN RAISE EXCEPTION 'Le brouillon a été modifié entre-temps; rechargez-le' USING ERRCODE = 'P0409'; END IF;
  SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*) INTO d, c, n FROM fin_gl_lines WHERE entry_id = _id;
  IF n < 2 THEN RAISE EXCEPTION 'Au moins deux lignes sont requises' USING ERRCODE = 'P0410'; END IF;
  IF d <> c THEN RAISE EXCEPTION 'Écriture déséquilibrée : débits % ≠ crédits % (écart %)', d, c, d - c USING ERRCODE = 'P0410'; END IF;
  SELECT count(*) INTO bad FROM fin_gl_lines l JOIN fin_gl_accounts a ON a.id = l.gl_account_id WHERE l.entry_id = _id AND (NOT a.active OR a.company_id <> e.company_id);
  IF bad > 0 THEN RAISE EXCEPTION 'Une ligne utilise un compte désactivé' USING ERRCODE = 'P0410'; END IF;
  UPDATE fin_gl_entries SET entry_no = public.fin_gl_next_no(e.company_id), status = 'validated', validated_at = now(), validated_by = auth.uid(), updated_at = now() WHERE id = _id RETURNING * INTO e;
  INSERT INTO fin_gl_events(company_id, entry_id, action) VALUES (e.company_id, e.id, 'validate');
  RETURN jsonb_build_object('id', e.id, 'entry_no', e.entry_no);
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_entry_reverse(_id uuid, _reason text, _date date, _key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e fin_gl_entries; r fin_gl_entries; nid uuid;
BEGIN
  SELECT * INTO e FROM fin_gl_entries WHERE id = _id;
  IF NOT FOUND OR NOT public.fin_can_correct(e.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  PERFORM public.fin_gl_lock(e.company_id);
  SELECT * INTO e FROM fin_gl_entries WHERE id = _id FOR UPDATE;
  IF e.reversed_by_id IS NOT NULL THEN
    SELECT * INTO r FROM fin_gl_entries WHERE id = e.reversed_by_id;
    IF r.reverse_key = _key THEN RETURN jsonb_build_object('id', r.id, 'entry_no', r.entry_no, 'replay', true); END IF;
    RAISE EXCEPTION 'Cette écriture a déjà été contrepassée (n° %)', r.entry_no USING ERRCODE = 'P0409'; END IF;
  IF e.status <> 'validated' THEN RAISE EXCEPTION 'Seule une écriture validée se contrepasse (un brouillon se modifie ou s''abandonne)' USING ERRCODE = 'P0001'; END IF;
  IF e.reverses_id IS NOT NULL THEN RAISE EXCEPTION 'Une contrepassation ne se contrepasse pas : saisissez une nouvelle écriture' USING ERRCODE = 'P0001'; END IF;
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN RAISE EXCEPTION 'Motif requis (3 caractères minimum)' USING ERRCODE = '22023'; END IF;
  IF _key IS NULL OR length(_key) < 8 THEN RAISE EXCEPTION 'Clé de demande requise' USING ERRCODE = '22023'; END IF;
  INSERT INTO fin_gl_entries(company_id, entry_no, entry_date, reference, description, origin, reverses_id, reversal_reason, reverse_key)
  VALUES (e.company_id, public.fin_gl_next_no(e.company_id), coalesce(_date, current_date), e.reference, 'Contrepassation de l''écriture n° ' || e.entry_no || ' — ' || e.description, 'reversal', e.id, btrim(_reason), _key)
  RETURNING id INTO nid;
  INSERT INTO fin_gl_lines(entry_id, company_id, line_no, gl_account_id, debit, credit, memo)
  SELECT nid, l.company_id, l.line_no, l.gl_account_id, l.credit, l.debit, l.memo FROM fin_gl_lines l WHERE l.entry_id = e.id;
  UPDATE fin_gl_entries SET status = 'validated', validated_at = now(), validated_by = auth.uid() WHERE id = nid;
  PERFORM set_config('fin.gl_ok', '1', true);
  UPDATE fin_gl_entries SET reversed_by_id = nid WHERE id = e.id;
  PERFORM set_config('fin.gl_ok', '', true);
  INSERT INTO fin_gl_events(company_id, entry_id, action, reason, data) VALUES (e.company_id, nid, 'reverse', btrim(_reason), jsonb_build_object('reverses', e.id));
  SELECT * INTO r FROM fin_gl_entries WHERE id = nid;
  RETURN jsonb_build_object('id', r.id, 'entry_no', r.entry_no);
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_ledger(_company uuid, _account uuid, _from date, _to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE op numeric; rws jsonb; a fin_gl_accounts;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM fin_gl_accounts WHERE id = _account AND company_id = _company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compte introuvable' USING ERRCODE = '42501'; END IF;
  IF _from IS NULL OR _to IS NULL OR _from > _to THEN RAISE EXCEPTION 'Période invalide' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(sum(l.debit - l.credit), 0) INTO op FROM fin_gl_lines l JOIN fin_gl_entries e ON e.id = l.entry_id
   WHERE l.gl_account_id = _account AND e.status = 'validated' AND e.entry_date < _from;
  SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.date, z.entry_no, z.line_no), '[]') INTO rws FROM (
    SELECT e.id entry_id, e.entry_no, e.entry_date date, l.line_no, e.reference, e.description, l.memo, l.debit, l.credit,
           op + sum(l.debit - l.credit) OVER (ORDER BY e.entry_date, e.entry_no, l.line_no) balance, e.source_kind, e.source_id, e.origin
      FROM fin_gl_lines l JOIN fin_gl_entries e ON e.id = l.entry_id
     WHERE l.gl_account_id = _account AND e.status = 'validated' AND e.entry_date BETWEEN _from AND _to) z;
  RETURN jsonb_build_object('account', to_jsonb(a), 'opening', op, 'rows', rws,
    'closing', op + coalesce((SELECT sum((x->>'debit')::numeric - (x->>'credit')::numeric) FROM jsonb_array_elements(rws) x), 0));
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_trial(_company uuid, _to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'number', a.number, 'name', a.name, 'category', a.category, 'active', a.active,
      'debit', t.d, 'credit', t.c, 'balance', t.d - t.c) ORDER BY a.number)
    FROM fin_gl_accounts a
    JOIN LATERAL (SELECT coalesce(sum(l.debit), 0) d, coalesce(sum(l.credit), 0) c FROM fin_gl_lines l JOIN fin_gl_entries e ON e.id = l.entry_id
                  WHERE l.gl_account_id = a.id AND e.status = 'validated' AND e.entry_date <= coalesce(_to, current_date)) t ON true
    WHERE a.company_id = _company AND (a.active OR t.d <> 0 OR t.c <> 0)), '[]');
END $$;

REVOKE ALL ON FUNCTION public.fin_gl_check_lines(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fin_gl_account_save(uuid, uuid, text, text, text, boolean), public.fin_gl_map_set(uuid, text, uuid), public.fin_gl_link_set(uuid, uuid, uuid),
  public.fin_gl_pending(uuid), public.fin_gl_sync(uuid), public.fin_gl_entry_save(uuid, uuid, int, date, text, text, jsonb, text), public.fin_gl_entry_discard(uuid, int),
  public.fin_gl_entry_validate(uuid, int), public.fin_gl_entry_reverse(uuid, text, date, text), public.fin_gl_ledger(uuid, uuid, date, date), public.fin_gl_trial(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_gl_account_save(uuid, uuid, text, text, text, boolean), public.fin_gl_map_set(uuid, text, uuid), public.fin_gl_link_set(uuid, uuid, uuid),
  public.fin_gl_pending(uuid), public.fin_gl_sync(uuid), public.fin_gl_entry_save(uuid, uuid, int, date, text, text, jsonb, text), public.fin_gl_entry_discard(uuid, int),
  public.fin_gl_entry_validate(uuid, int), public.fin_gl_entry_reverse(uuid, text, date, text), public.fin_gl_ledger(uuid, uuid, date, date), public.fin_gl_trial(uuid, date) TO authenticated;
