-- FIN-12D — Notes de frais, avances et remboursements enregistrés manuellement.
-- Écritures uniquement par RPC fin_exp_* ; lecture : employé concerné ou responsable financier (fin_can_write), jamais par le seul droit documentaire.

CREATE TABLE public.fin_exp_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  owner_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  converted_path text,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png','image/webp','image/heic')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  extraction jsonb, extract_status text NOT NULL DEFAULT 'aucune' CHECK (extract_status IN ('aucune','lecture','ok','echec')),
  extract_error text, extract_count integer NOT NULL DEFAULT 0, extracted_at timestamptz,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fin_exp_files_sha ON public.fin_exp_files(company_id, sha256);

CREATE TABLE public.fin_exp_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  employee_id uuid NOT NULL,
  employee_name text NOT NULL,
  purpose text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 1 AND 200),
  period_start date, period_end date,
  currency text NOT NULL DEFAULT 'CAD' CHECK (currency = 'CAD'),
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','soumise','a_corriger','approuvee','refusee')),
  approval text CHECK (approval IN ('totale','partielle')),
  version integer NOT NULL DEFAULT 0,
  submitted_hash text, submitted_at timestamptz, submitted_by uuid, submitted_snapshot jsonb,
  decided_at timestamptz, decided_by uuid, decision_note text, self_approval_reason text,
  approved_total numeric(12,2), reimbursable_total numeric(12,2),
  due_date date, obligation_id uuid REFERENCES public.fin_obligations(id), occurrence_id uuid REFERENCES public.fin_occurrences(id),
  approve_key text,
  rev integer NOT NULL DEFAULT 1,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);
CREATE INDEX fin_exp_reports_co ON public.fin_exp_reports(company_id, employee_id, created_at DESC);
CREATE UNIQUE INDEX fin_exp_reports_occ ON public.fin_exp_reports(occurrence_id) WHERE occurrence_id IS NOT NULL;

CREATE TABLE public.fin_exp_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.fin_exp_reports(id),
  company_id uuid NOT NULL,
  pos integer NOT NULL,
  spent_on date, merchant text, description text, category text,
  currency text NOT NULL DEFAULT 'CAD' CHECK (currency = 'CAD'),
  doc_amount numeric(12,2) CHECK (doc_amount IS NULL OR doc_amount >= 0),
  gst numeric(12,2), qst numeric(12,2),
  business_amount numeric(12,2) CHECK (business_amount IS NULL OR business_amount >= 0),
  payer text NOT NULL DEFAULT 'employe' CHECK (payer IN ('employe','entreprise','avance')),
  file_id uuid REFERENCES public.fin_exp_files(id),
  crm_file_id uuid REFERENCES public.ent_crm_files(id),
  capture_id uuid REFERENCES public.fin_doc_captures(id),
  receipt_sha text,
  supplier_bill_id uuid REFERENCES public.fin_supplier_bills(id),
  truck_id uuid, project_id uuid,
  missing_receipt_note text, split_reason text,
  accepted_amount numeric(12,2) CHECK (accepted_amount IS NULL OR accepted_amount >= 0),
  decision_reason text, missing_accepted_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fin_exp_lines_rep ON public.fin_exp_lines(report_id, pos);
CREATE INDEX fin_exp_lines_sha ON public.fin_exp_lines(company_id, receipt_sha);

CREATE TABLE public.fin_exp_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  employee_id uuid NOT NULL, employee_name text NOT NULL,
  purpose text NOT NULL CHECK (length(btrim(purpose)) BETWEEN 1 AND 200),
  currency text NOT NULL DEFAULT 'CAD' CHECK (currency = 'CAD'),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  planned_on date,
  status text NOT NULL DEFAULT 'prevue' CHECK (status IN ('prevue','approuvee','versee','refusee','annulee')),
  decided_at timestamptz, decided_by uuid, decision_note text, self_approval_reason text, approve_key text,
  obligation_id uuid REFERENCES public.fin_obligations(id), occurrence_id uuid REFERENCES public.fin_occurrences(id),
  payment_id uuid REFERENCES public.fin_payments(id), paid_on date, paid_amount numeric(12,2), reference text, proof_file_id uuid REFERENCES public.fin_exp_files(id), pay_key text,
  rev integer NOT NULL DEFAULT 1,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fin_exp_adv_co ON public.fin_exp_advances(company_id, employee_id);

CREATE TABLE public.fin_exp_allocs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL, advance_id uuid NOT NULL REFERENCES public.fin_exp_advances(id), report_id uuid NOT NULL REFERENCES public.fin_exp_reports(id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0), idem_key text NOT NULL,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz, voided_by uuid, void_reason text,
  UNIQUE (company_id, idem_key)
);
CREATE TABLE public.fin_exp_restitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL, advance_id uuid NOT NULL REFERENCES public.fin_exp_advances(id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0), received_on date NOT NULL, reference text, proof_file_id uuid REFERENCES public.fin_exp_files(id),
  idem_key text NOT NULL, created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz, voided_by uuid, void_reason text,
  UNIQUE (company_id, idem_key)
);
CREATE TABLE public.fin_exp_events (
  id bigserial PRIMARY KEY, company_id uuid NOT NULL, report_id uuid, advance_id uuid,
  action text NOT NULL, reason text, detail jsonb, actor uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fin_exp_events_rep ON public.fin_exp_events(report_id); CREATE INDEX fin_exp_events_adv ON public.fin_exp_events(advance_id);
CREATE OR REPLACE FUNCTION public.fin_exp_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RAISE EXCEPTION 'Journal en ajout seulement'; END $$;
CREATE TRIGGER fin_exp_events_ro BEFORE UPDATE OR DELETE ON public.fin_exp_events FOR EACH ROW EXECUTE FUNCTION public.fin_exp_append_only();

CREATE OR REPLACE FUNCTION public.fin_exp_member(_company uuid, _user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.jsc_company_members WHERE company_id=_company AND user_id=_user AND is_active AND archived_at IS NULL) $$;
CREATE OR REPLACE FUNCTION public.fin_exp_can_see(_company uuid, _employee uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (_employee = auth.uid() AND public.fin_exp_member(_company, auth.uid())) OR public.fin_can_write(_company) $$;

GRANT SELECT ON public.fin_exp_files, public.fin_exp_reports, public.fin_exp_lines, public.fin_exp_advances, public.fin_exp_allocs, public.fin_exp_restitutions, public.fin_exp_events TO authenticated;
GRANT ALL ON public.fin_exp_files, public.fin_exp_reports, public.fin_exp_lines, public.fin_exp_advances, public.fin_exp_allocs, public.fin_exp_restitutions, public.fin_exp_events TO service_role;
GRANT USAGE ON SEQUENCE public.fin_exp_events_id_seq TO service_role;
ALTER TABLE public.fin_exp_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_exp_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_exp_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_exp_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_exp_allocs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_exp_restitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_exp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.fin_exp_files FOR SELECT TO authenticated USING (public.fin_exp_can_see(company_id, owner_id));
CREATE POLICY r ON public.fin_exp_reports FOR SELECT TO authenticated USING (public.fin_exp_can_see(company_id, employee_id));
CREATE POLICY r ON public.fin_exp_lines FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.fin_exp_reports r WHERE r.id = report_id AND public.fin_exp_can_see(r.company_id, r.employee_id)));
CREATE POLICY r ON public.fin_exp_advances FOR SELECT TO authenticated USING (public.fin_exp_can_see(company_id, employee_id));
CREATE POLICY r ON public.fin_exp_allocs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.fin_exp_advances a WHERE a.id = advance_id AND public.fin_exp_can_see(a.company_id, a.employee_id)));
CREATE POLICY r ON public.fin_exp_restitutions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.fin_exp_advances a WHERE a.id = advance_id AND public.fin_exp_can_see(a.company_id, a.employee_id)));
CREATE POLICY r ON public.fin_exp_events FOR SELECT TO authenticated USING (
  (report_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.fin_exp_reports r WHERE r.id = report_id AND public.fin_exp_can_see(r.company_id, r.employee_id)))
  OR (advance_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.fin_exp_advances a WHERE a.id = advance_id AND public.fin_exp_can_see(a.company_id, a.employee_id))));

CREATE OR REPLACE FUNCTION public.fin_exp_path_ok(_name text, _write boolean) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE f text[] := string_to_array(_name, '/'); c uuid; u uuid;
BEGIN
  IF array_length(f,1) <> 4 OR f[1] <> 'company' THEN RETURN false; END IF;
  BEGIN c := f[2]::uuid; u := f[3]::uuid; EXCEPTION WHEN others THEN RETURN false; END;
  IF _write THEN RETURN u = auth.uid() AND (public.fin_exp_member(c, auth.uid()) OR public.fin_can_write(c)); END IF;
  RETURN EXISTS (SELECT 1 FROM public.fin_exp_files x WHERE x.company_id = c AND (x.storage_path = _name OR x.converted_path = _name) AND public.fin_exp_can_see(c, x.owner_id));
END $$;
CREATE POLICY "fin expense insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'fin-expense-files' AND public.fin_exp_path_ok(name, true)
  AND lower(storage.extension(name)) = ANY (ARRAY['jpg','jpeg','png','webp','heic','pdf']));
CREATE POLICY "fin expense read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'fin-expense-files' AND public.fin_exp_path_ok(name, false));

CREATE OR REPLACE FUNCTION public.fin_exp_log(_c uuid, _r uuid, _a uuid, _act text, _reason text, _d jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.fin_exp_events(company_id, report_id, advance_id, action, reason, detail) VALUES (_c, _r, _a, _act, _reason, _d) $$;
REVOKE ALL ON FUNCTION public.fin_exp_log(uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_exp_my_companies() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'role', m.role, 'can_approve', public.fin_can_write(c.id), 'can_correct', public.fin_can_correct(c.id)) ORDER BY c.name), '[]')
  FROM public.jsc_company_members m JOIN public.jsc_companies c ON c.id = m.company_id WHERE m.user_id = auth.uid() AND m.is_active AND m.archived_at IS NULL $$;

CREATE OR REPLACE FUNCTION public.fin_exp_lookups(_company uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.fin_exp_member(_company, auth.uid()) OR public.fin_can_write(_company)) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'trucks', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name), '[]') FROM public.jsc_trucks WHERE company_id = _company AND archived_at IS NULL),
    'projects', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name), '[]') FROM public.ent_crm_projects WHERE company_id = _company AND archived_at IS NULL),
    'members', CASE WHEN public.fin_can_write(_company) THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id', user_id, 'name', coalesce(nullif(full_name,''), email, 'Membre'), 'role', role) ORDER BY full_name), '[]')
      FROM public.jsc_company_members WHERE company_id = _company AND is_active AND archived_at IS NULL) ELSE '[]'::jsonb END);
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_name(_company uuid, _user uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(full_name,''), email, 'Employé') FROM public.jsc_company_members WHERE company_id=_company AND user_id=_user ORDER BY is_active DESC LIMIT 1 $$;
REVOKE ALL ON FUNCTION public.fin_exp_name(uuid,uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.fin_exp_payee(_company uuid, _user uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT left('Employé · '||coalesce(public.fin_exp_name(_company,_user),'Employé')||' #'||left(_user::text,6), 150) $$;
REVOKE ALL ON FUNCTION public.fin_exp_payee(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_exp_file_add(_company uuid, _path text, _name text, _mime text, _size integer, _sha text, _converted text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid uuid; pre text := 'company/'||_company||'/'||auth.uid()||'/';
BEGIN
  IF NOT (public.fin_exp_member(_company, auth.uid()) OR public.fin_can_write(_company)) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _path NOT LIKE pre||'%' OR (_converted IS NOT NULL AND _converted NOT LIKE pre||'%') THEN RAISE EXCEPTION 'Pièce hors de votre dossier' USING ERRCODE='42501'; END IF;
  IF _converted IS NOT NULL AND _mime <> 'image/heic' THEN RAISE EXCEPTION 'Conversion réservée aux photos HEIC'; END IF;
  INSERT INTO public.fin_exp_files(company_id, owner_id, storage_path, converted_path, name, mime, size_bytes, sha256)
  VALUES (_company, auth.uid(), _path, _converted, left(_name,200), _mime, _size, nullif(_sha,'')) RETURNING fin_exp_files.id INTO nid;
  RETURN jsonb_build_object('id', nid);
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_hash(_report uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT md5(coalesce(jsonb_agg(jsonb_build_array(pos, spent_on, merchant, description, category, doc_amount, gst, qst, business_amount, payer, file_id, crm_file_id, receipt_sha, supplier_bill_id, truck_id, project_id, missing_receipt_note, split_reason) ORDER BY pos)::text, '[]'))
  FROM public.fin_exp_lines WHERE report_id = _report $$;
REVOKE ALL ON FUNCTION public.fin_exp_hash(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_exp_save(_company uuid, _id uuid, _p jsonb, _base_rev integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.fin_exp_reports; emp uuid; l jsonb; i int := 0; fid uuid; cf uuid; cap uuid; sha text; sb uuid;
BEGIN
  IF jsonb_typeof(_p->'lines') <> 'array' OR jsonb_array_length(_p->'lines') > 60 THEN RAISE EXCEPTION 'Lignes invalides (60 au maximum)'; END IF;
  IF _id IS NULL THEN
    emp := coalesce(nullif(_p->>'employee_id','')::uuid, auth.uid());
    IF emp <> auth.uid() AND NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
    IF NOT public.fin_exp_member(_company, emp) THEN RAISE EXCEPTION 'Bénéficiaire hors de cette entreprise' USING ERRCODE='42501'; END IF;
    IF emp = auth.uid() AND NOT public.fin_exp_member(_company, auth.uid()) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
    INSERT INTO public.fin_exp_reports(company_id, employee_id, employee_name, purpose, period_start, period_end)
    VALUES (_company, emp, public.fin_exp_name(_company, emp), coalesce(nullif(btrim(_p->>'purpose'),''),'Note de frais'), nullif(_p->>'period_start','')::date, nullif(_p->>'period_end','')::date)
    RETURNING * INTO r;
    PERFORM public.fin_exp_log(r.company_id, r.id, NULL, 'create', NULL, jsonb_build_object('employee', r.employee_name));
  ELSE
    SELECT * INTO r FROM public.fin_exp_reports WHERE id = _id AND company_id = _company FOR UPDATE;
    IF r.id IS NULL OR NOT ((r.employee_id = auth.uid() AND public.fin_exp_member(r.company_id, auth.uid())) OR public.fin_can_write(r.company_id)) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
    IF r.status NOT IN ('brouillon','a_corriger') THEN RAISE EXCEPTION 'Note soumise ou décidée : demandez un retour à corriger pour la modifier' USING ERRCODE='P0409'; END IF;
    IF _base_rev IS DISTINCT FROM r.rev THEN RAISE EXCEPTION 'Conflit : la note a changé ailleurs. Rechargez.' USING ERRCODE='P0409'; END IF;
    UPDATE public.fin_exp_reports SET purpose = coalesce(nullif(btrim(_p->>'purpose'),''), purpose), period_start = nullif(_p->>'period_start','')::date, period_end = nullif(_p->>'period_end','')::date,
      rev = rev + 1, updated_at = now() WHERE id = r.id RETURNING * INTO r;
    DELETE FROM public.fin_exp_lines WHERE report_id = r.id;
  END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(_p->'lines') LOOP
    i := i + 1; fid := nullif(l->>'file_id','')::uuid; cf := nullif(l->>'crm_file_id','')::uuid; cap := nullif(l->>'capture_id','')::uuid; sb := nullif(l->>'supplier_bill_id','')::uuid; sha := NULL;
    IF fid IS NOT NULL THEN
      SELECT x.sha256 INTO sha FROM public.fin_exp_files x WHERE x.id = fid AND x.company_id = r.company_id AND (x.owner_id = r.employee_id OR x.owner_id = auth.uid());
      IF NOT FOUND THEN RAISE EXCEPTION 'Justificatif hors de ce dossier' USING ERRCODE='42501'; END IF;
    END IF;
    IF cap IS NOT NULL THEN
      SELECT c.file_id, c.file_sha256 INTO cf, sha FROM public.fin_doc_captures c WHERE c.id = cap AND c.company_id = r.company_id;
      IF NOT FOUND OR NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Document hors de cette entreprise' USING ERRCODE='42501'; END IF;
    ELSIF cf IS NOT NULL THEN
      IF NOT public.fin_can_write(r.company_id) OR NOT EXISTS (SELECT 1 FROM public.ent_crm_files WHERE id = cf AND company_id = r.company_id) THEN RAISE EXCEPTION 'Pièce hors de cette entreprise' USING ERRCODE='42501'; END IF;
    END IF;
    IF sb IS NOT NULL AND (NOT public.fin_can_write(r.company_id) OR NOT EXISTS (SELECT 1 FROM public.fin_supplier_bills WHERE id = sb AND company_id = r.company_id)) THEN RAISE EXCEPTION 'Facture fournisseur hors de cette entreprise' USING ERRCODE='42501'; END IF;
    IF sb IS NOT NULL AND coalesce(l->>'payer','employe') <> 'entreprise' THEN RAISE EXCEPTION 'Seule une dépense payée par l''entreprise se lie à un achat existant'; END IF;
    INSERT INTO public.fin_exp_lines(report_id, company_id, pos, spent_on, merchant, description, category, doc_amount, gst, qst, business_amount, payer, file_id, crm_file_id, capture_id, receipt_sha, supplier_bill_id, truck_id, project_id, missing_receipt_note, split_reason)
    VALUES (r.id, r.company_id, i, nullif(l->>'spent_on','')::date, left(nullif(btrim(l->>'merchant'),''),160), left(nullif(btrim(l->>'description'),''),1000), left(nullif(btrim(l->>'category'),''),80),
      round(nullif(l->>'doc_amount','')::numeric,2), round(nullif(l->>'gst','')::numeric,2), round(nullif(l->>'qst','')::numeric,2), round(nullif(l->>'business_amount','')::numeric,2),
      coalesce(l->>'payer','employe'), fid, cf, cap, sha, sb,
      CASE WHEN EXISTS (SELECT 1 FROM public.jsc_trucks WHERE id = nullif(l->>'truck_id','')::uuid AND company_id = r.company_id) THEN nullif(l->>'truck_id','')::uuid END,
      CASE WHEN EXISTS (SELECT 1 FROM public.ent_crm_projects WHERE id = nullif(l->>'project_id','')::uuid AND company_id = r.company_id) THEN nullif(l->>'project_id','')::uuid END,
      left(nullif(btrim(l->>'missing_receipt_note'),''),500), left(nullif(btrim(l->>'split_reason'),''),500));
  END LOOP;
  RETURN jsonb_build_object('id', r.id, 'rev', r.rev);
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_receipt_uses(_line public.fin_exp_lines) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(u), '[]') FROM (
    SELECT jsonb_build_object('kind', 'note', 'report_id', r.id, 'status', r.status, 'employee', r.employee_name, 'amount', coalesce(x.accepted_amount, x.business_amount)) u
      FROM public.fin_exp_lines x JOIN public.fin_exp_reports r ON r.id = x.report_id
     WHERE x.company_id = _line.company_id AND x.id <> _line.id AND r.status IN ('soumise','approuvee')
       AND ((_line.receipt_sha IS NOT NULL AND x.receipt_sha = _line.receipt_sha) OR (_line.file_id IS NOT NULL AND x.file_id = _line.file_id) OR (_line.crm_file_id IS NOT NULL AND x.crm_file_id = _line.crm_file_id))
       AND coalesce(x.accepted_amount, x.business_amount, 0) > 0 AND (r.status = 'soumise' OR coalesce(x.accepted_amount,0) > 0)
    UNION ALL
    SELECT jsonb_build_object('kind', 'achat', 'bill_id', b.id, 'status', b.status, 'reference', b.reference, 'amount', b.total)
      FROM public.fin_supplier_bills b
     WHERE b.company_id = _line.company_id AND b.status IN ('draft','confirmed') AND b.id IS DISTINCT FROM _line.supplier_bill_id
       AND ((_line.receipt_sha IS NOT NULL AND b.file_sha256 = _line.receipt_sha) OR (_line.crm_file_id IS NOT NULL AND b.file_id = _line.crm_file_id))
  ) s $$;
REVOKE ALL ON FUNCTION public.fin_exp_receipt_uses(public.fin_exp_lines) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_exp_submit(_id uuid, _expect_rev integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.fin_exp_reports; l public.fin_exp_lines; n int := 0; h text;
BEGIN
  SELECT * INTO r FROM public.fin_exp_reports WHERE id = _id FOR UPDATE;
  IF r.id IS NULL OR NOT ((r.employee_id = auth.uid() AND public.fin_exp_member(r.company_id, auth.uid())) OR public.fin_can_write(r.company_id)) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF r.status = 'soumise' AND r.rev = _expect_rev + 1 THEN RETURN jsonb_build_object('version', r.version, 'replay', true); END IF;
  IF r.status NOT IN ('brouillon','a_corriger') THEN RAISE EXCEPTION 'Note déjà soumise ou décidée' USING ERRCODE='P0409'; END IF;
  IF _expect_rev IS DISTINCT FROM r.rev THEN RAISE EXCEPTION 'Conflit : la note a changé ailleurs. Rechargez.' USING ERRCODE='P0409'; END IF;
  FOR l IN SELECT * FROM public.fin_exp_lines WHERE report_id = r.id ORDER BY pos LOOP
    n := n + 1;
    IF l.spent_on IS NULL OR l.merchant IS NULL OR l.business_amount IS NULL OR l.business_amount <= 0 THEN RAISE EXCEPTION 'Ligne % : date, commerçant et portion professionnelle (> 0 $) requis', l.pos; END IF;
    IF l.doc_amount IS NOT NULL AND l.business_amount > l.doc_amount THEN RAISE EXCEPTION 'Ligne % : portion professionnelle supérieure au montant du document', l.pos; END IF;
    IF l.file_id IS NULL AND l.crm_file_id IS NULL AND l.missing_receipt_note IS NULL THEN RAISE EXCEPTION 'Ligne % : justificatif manquant — joignez la pièce ou expliquez son absence', l.pos; END IF;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'Ajoutez au moins une dépense'; END IF;
  h := public.fin_exp_hash(r.id);
  UPDATE public.fin_exp_reports SET status = 'soumise', version = version + 1, submitted_hash = h, submitted_at = now(), submitted_by = auth.uid(),
    submitted_snapshot = (SELECT jsonb_agg(to_jsonb(x) ORDER BY pos) FROM public.fin_exp_lines x WHERE report_id = r.id),
    rev = rev + 1, updated_at = now() WHERE id = r.id RETURNING * INTO r;
  PERFORM public.fin_exp_log(r.company_id, r.id, NULL, 'submit', NULL, jsonb_build_object('version', r.version, 'hash', h, 'lines', n));
  RETURN jsonb_build_object('version', r.version, 'hash', h, 'rev', r.rev);
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_alloc_sum(_report uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(amount),0) FROM public.fin_exp_allocs WHERE report_id = _report AND voided_at IS NULL $$;
CREATE OR REPLACE FUNCTION public.fin_exp_adv_avail(_adv uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN a.status = 'versee' THEN coalesce(a.paid_amount,0)
    - coalesce((SELECT sum(amount) FROM public.fin_exp_allocs WHERE advance_id = a.id AND voided_at IS NULL),0)
    - coalesce((SELECT sum(amount) FROM public.fin_exp_restitutions WHERE advance_id = a.id AND voided_at IS NULL),0) ELSE 0 END
  FROM public.fin_exp_advances a WHERE a.id = _adv $$;
REVOKE ALL ON FUNCTION public.fin_exp_alloc_sum(uuid), public.fin_exp_adv_avail(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.fin_exp_decide(_id uuid, _decision text, _lines jsonb, _expect_version integer, _expect_hash text, _note text, _self_reason text, _due date, _key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.fin_exp_reports; l public.fin_exp_lines; d jsonb; acc numeric; tot numeric := 0; remb numeric := 0; partial boolean := false; uses jsonb; used numeric; oid uuid; oc public.fin_occurrences; anc date;
BEGIN
  IF _key IS NULL OR length(_key) < 8 THEN RAISE EXCEPTION 'Clé de décision requise'; END IF;
  SELECT * INTO r FROM public.fin_exp_reports WHERE id = _id FOR UPDATE;
  IF r.id IS NULL OR NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF r.approve_key = _key THEN RETURN jsonb_build_object('status', r.status, 'occurrence_id', r.occurrence_id, 'replay', true); END IF;
  IF r.status <> 'soumise' THEN RAISE EXCEPTION 'Note déjà décidée ou non soumise' USING ERRCODE='P0409'; END IF;
  IF _expect_version IS DISTINCT FROM r.version OR _expect_hash IS DISTINCT FROM r.submitted_hash OR public.fin_exp_hash(r.id) <> r.submitted_hash THEN
    RAISE EXCEPTION 'Version périmée : la note a changé depuis votre lecture. Rechargez la version soumise.' USING ERRCODE='P0409'; END IF;
  IF r.employee_id = auth.uid() THEN
    IF NOT public.fin_can_correct(r.company_id) OR coalesce(btrim(_self_reason),'') = '' THEN RAISE EXCEPTION 'Auto-approbation refusée : une autre personne doit décider (exception réservée aux propriétaires/comptabilité, avec motif tracé)' USING ERRCODE='42501'; END IF;
  END IF;
  IF _decision IN ('return','refuse') THEN
    IF coalesce(btrim(_note),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
    UPDATE public.fin_exp_reports SET status = CASE _decision WHEN 'return' THEN 'a_corriger' ELSE 'refusee' END, decision_note = btrim(_note), decided_at = now(), decided_by = auth.uid(),
      self_approval_reason = nullif(btrim(_self_reason),''), approve_key = CASE WHEN _decision = 'refuse' THEN _key END, rev = rev + 1, updated_at = now() WHERE id = r.id RETURNING * INTO r;
    PERFORM public.fin_exp_log(r.company_id, r.id, NULL, _decision, btrim(_note), jsonb_build_object('version', r.version));
    RETURN jsonb_build_object('status', r.status);
  END IF;
  IF _decision <> 'approve' THEN RAISE EXCEPTION 'Décision invalide'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fin_exp_receipts:'||r.company_id));
  FOR l IN SELECT * FROM public.fin_exp_lines WHERE report_id = r.id ORDER BY pos LOOP
    SELECT e INTO d FROM jsonb_array_elements(coalesce(_lines,'[]')) e WHERE e->>'id' = l.id::text;
    IF d IS NULL THEN RAISE EXCEPTION 'Décision manquante pour la ligne %', l.pos; END IF;
    acc := round(nullif(d->>'accepted_amount','')::numeric, 2);
    IF acc IS NULL OR acc < 0 OR acc > l.business_amount THEN RAISE EXCEPTION 'Ligne % : montant accepté entre 0 et % $', l.pos, l.business_amount; END IF;
    IF acc < l.business_amount THEN partial := true; IF coalesce(btrim(d->>'reason'),'') = '' THEN RAISE EXCEPTION 'Ligne % : motif de la réduction ou du refus requis', l.pos; END IF; END IF;
    IF acc > 0 AND l.file_id IS NULL AND l.crm_file_id IS NULL AND coalesce(btrim(d->>'missing_accepted_reason'),'') = '' THEN RAISE EXCEPTION 'Ligne % : pièce manquante — décision motivée requise pour l''accepter', l.pos; END IF;
    IF acc > 0 AND (l.receipt_sha IS NOT NULL OR l.file_id IS NOT NULL OR l.crm_file_id IS NOT NULL) THEN
      uses := public.fin_exp_receipt_uses(l);
      SELECT coalesce(sum((u->>'amount')::numeric),0) INTO used FROM jsonb_array_elements(uses) u WHERE u->>'kind' = 'achat' OR u->>'status' = 'approuvee';
      IF jsonb_array_length(uses) > 0 THEN
        IF l.split_reason IS NULL THEN RAISE EXCEPTION 'Ligne % : reçu déjà utilisé (% utilisation(s)). Double remboursement refusé; une répartition doit être justifiée.', l.pos, jsonb_array_length(uses) USING ERRCODE='P0410'; END IF;
        IF l.doc_amount IS NULL OR used + acc > l.doc_amount THEN RAISE EXCEPTION 'Ligne % : répartition au-delà du montant du reçu (déjà utilisé % $, document % $)', l.pos, used, coalesce(l.doc_amount,0) USING ERRCODE='P0410'; END IF;
      END IF;
    END IF;
    UPDATE public.fin_exp_lines SET accepted_amount = acc, decision_reason = nullif(btrim(d->>'reason'),''), missing_accepted_reason = nullif(btrim(d->>'missing_accepted_reason'),'') WHERE id = l.id;
    tot := tot + acc; IF l.payer IN ('employe','avance') THEN remb := remb + acc; END IF;
  END LOOP;
  IF remb > 0 THEN
    anc := coalesce(_due, current_date);
    oid := public.fin_save_obligation(r.company_id, NULL, jsonb_build_object('label', left('Note de frais — '||r.employee_name||' — '||r.purpose, 160), 'payee_label', public.fin_exp_payee(r.company_id, r.employee_id),
      'frequency', 'once', 'anchor_date', anc, 'amount', remb, 'amount_quality', 'confirmed', 'nature', 'dette', 'contract_ref', 'NDF v'||r.version));
    UPDATE public.fin_obligations SET source_document_id = r.id WHERE id = oid;
    PERFORM public.fin_ensure_occurrences(r.company_id, anc, anc);
    SELECT * INTO oc FROM public.fin_occurrences WHERE obligation_id = oid AND status = 'active' ORDER BY due_date LIMIT 1;
    IF oc.id IS NULL THEN RAISE EXCEPTION 'Échéance non générée'; END IF;
    UPDATE public.fin_occurrences SET due_unknown = (_due IS NULL) WHERE id = oc.id;
  END IF;
  UPDATE public.fin_exp_reports SET status = 'approuvee', approval = CASE WHEN partial THEN 'partielle' ELSE 'totale' END, approved_total = tot, reimbursable_total = remb,
    due_date = _due, obligation_id = oid, occurrence_id = oc.id, decided_at = now(), decided_by = auth.uid(), decision_note = nullif(btrim(_note),''),
    self_approval_reason = nullif(btrim(_self_reason),''), approve_key = _key, rev = rev + 1, updated_at = now() WHERE id = r.id RETURNING * INTO r;
  PERFORM public.fin_exp_log(r.company_id, r.id, NULL, 'approve', nullif(btrim(_self_reason),''), jsonb_build_object('version', r.version, 'approval', r.approval, 'approved', tot, 'reimbursable', remb, 'occurrence_id', r.occurrence_id, 'self', r.employee_id = auth.uid()));
  RETURN jsonb_build_object('status', r.status, 'approval', r.approval, 'approved', tot, 'reimbursable', remb, 'occurrence_id', r.occurrence_id);
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_adjust(_line uuid, _accepted numeric, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.fin_exp_lines; r public.fin_exp_reports; old numeric; remb numeric; tot numeric;
BEGIN
  SELECT * INTO l FROM public.fin_exp_lines WHERE id = _line;
  SELECT * INTO r FROM public.fin_exp_reports WHERE id = l.report_id FOR UPDATE;
  IF r.id IS NULL OR NOT public.fin_can_correct(r.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF r.status <> 'approuvee' THEN RAISE EXCEPTION 'Seule une note approuvée se corrige ainsi' USING ERRCODE='P0409'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  _accepted := round(_accepted, 2);
  IF _accepted IS NULL OR _accepted < 0 OR _accepted > l.business_amount THEN RAISE EXCEPTION 'Montant accepté entre 0 et % $', l.business_amount; END IF;
  old := l.accepted_amount;
  UPDATE public.fin_exp_lines SET accepted_amount = _accepted, decision_reason = btrim(_reason) WHERE id = l.id;
  SELECT coalesce(sum(accepted_amount),0), coalesce(sum(accepted_amount) FILTER (WHERE payer IN ('employe','avance')),0) INTO tot, remb FROM public.fin_exp_lines WHERE report_id = r.id;
  IF remb - public.fin_exp_alloc_sum(r.id) < 0 THEN RAISE EXCEPTION 'Les avances affectées (% $) dépassent le nouveau montant : retirez d''abord une affectation', public.fin_exp_alloc_sum(r.id) USING ERRCODE='P0409'; END IF;
  IF r.occurrence_id IS NULL AND remb > 0 THEN RAISE EXCEPTION 'Aucune échéance liée : refusez puis soumettez de nouveau' USING ERRCODE='P0409'; END IF;
  IF r.occurrence_id IS NOT NULL THEN
    UPDATE public.fin_occurrences SET amount = remb - public.fin_exp_alloc_sum(r.id), amount_override = true, updated_at = now() WHERE id = r.occurrence_id;
  END IF;
  UPDATE public.fin_exp_reports SET approved_total = tot, reimbursable_total = remb, approval = CASE WHEN EXISTS (SELECT 1 FROM public.fin_exp_lines WHERE report_id = r.id AND accepted_amount < business_amount) THEN 'partielle' ELSE 'totale' END,
    rev = rev + 1, updated_at = now() WHERE id = r.id;
  PERFORM public.fin_exp_log(r.company_id, r.id, NULL, 'adjust', btrim(_reason), jsonb_build_object('line', l.pos, 'before', old, 'after', _accepted, 'reimbursable', remb));
  RETURN jsonb_build_object('reimbursable', remb);
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_reimburse(_report uuid, _p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.fin_exp_reports; amt numeric := round(nullif(_p->>'amount','')::numeric,2); due numeric; oc public.fin_occurrences;
BEGIN
  SELECT * INTO r FROM public.fin_exp_reports WHERE id = _report FOR UPDATE;
  IF r.id IS NULL OR NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_payments WHERE company_id = r.company_id AND idem_key = _p->>'idem_key') THEN
    RETURN public.fin_payment_save(r.company_id, _p || jsonb_build_object('allocations', jsonb_build_array(jsonb_build_object('occurrence_id', r.occurrence_id, 'amount', amt))), false); END IF;
  IF r.status <> 'approuvee' OR r.occurrence_id IS NULL THEN RAISE EXCEPTION 'Aucun montant remboursable sur cette note' USING ERRCODE='P0409'; END IF;
  SELECT * INTO oc FROM public.fin_occurrences WHERE id = r.occurrence_id FOR UPDATE;
  due := oc.amount - public.fin_occ_paid(oc.id);
  IF amt IS NULL OR amt <= 0 THEN RAISE EXCEPTION 'Montant du remboursement : supérieur à 0 $'; END IF;
  IF amt > due THEN RAISE EXCEPTION 'Sur-remboursement refusé : il reste % $ dû à l''employé', due USING ERRCODE='P0409'; END IF;
  RETURN public.fin_payment_save(r.company_id, (_p - 'allocations') || jsonb_build_object('allocations', jsonb_build_array(jsonb_build_object('occurrence_id', r.occurrence_id, 'amount', amt))), false);
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_adv_save(_company uuid, _p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE emp uuid := coalesce(nullif(_p->>'employee_id','')::uuid, auth.uid()); a public.fin_exp_advances; amt numeric := round(nullif(_p->>'amount','')::numeric,2);
BEGIN
  IF emp <> auth.uid() AND NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF NOT public.fin_exp_member(_company, emp) OR (emp = auth.uid() AND NOT public.fin_exp_member(_company, auth.uid())) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF amt IS NULL OR amt <= 0 THEN RAISE EXCEPTION 'Montant de l''avance : supérieur à 0 $'; END IF;
  INSERT INTO public.fin_exp_advances(company_id, employee_id, employee_name, purpose, amount, planned_on)
  VALUES (_company, emp, public.fin_exp_name(_company, emp), coalesce(nullif(btrim(_p->>'purpose'),''),'Avance'), amt, nullif(_p->>'planned_on','')::date) RETURNING * INTO a;
  PERFORM public.fin_exp_log(a.company_id, NULL, a.id, 'adv_create', NULL, jsonb_build_object('amount', amt));
  RETURN jsonb_build_object('id', a.id);
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_adv_decide(_id uuid, _decision text, _note text, _self_reason text, _key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.fin_exp_advances; oid uuid; oc public.fin_occurrences; anc date;
BEGIN
  IF _key IS NULL OR length(_key) < 8 THEN RAISE EXCEPTION 'Clé de décision requise'; END IF;
  SELECT * INTO a FROM public.fin_exp_advances WHERE id = _id FOR UPDATE;
  IF a.id IS NULL OR NOT public.fin_can_write(a.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF a.approve_key = _key THEN RETURN jsonb_build_object('status', a.status, 'replay', true); END IF;
  IF a.status <> 'prevue' THEN RAISE EXCEPTION 'Avance déjà décidée' USING ERRCODE='P0409'; END IF;
  IF a.employee_id = auth.uid() AND (NOT public.fin_can_correct(a.company_id) OR coalesce(btrim(_self_reason),'') = '') THEN RAISE EXCEPTION 'Auto-approbation refusée' USING ERRCODE='42501'; END IF;
  IF _decision = 'refuse' THEN
    IF coalesce(btrim(_note),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
    UPDATE public.fin_exp_advances SET status = 'refusee', decision_note = btrim(_note), decided_at = now(), decided_by = auth.uid(), approve_key = _key, rev = rev + 1 WHERE id = a.id;
    PERFORM public.fin_exp_log(a.company_id, NULL, a.id, 'adv_refuse', btrim(_note), NULL); RETURN jsonb_build_object('status', 'refusee');
  END IF;
  IF _decision <> 'approve' THEN RAISE EXCEPTION 'Décision invalide'; END IF;
  anc := coalesce(a.planned_on, current_date);
  oid := public.fin_save_obligation(a.company_id, NULL, jsonb_build_object('label', left('Avance à verser — '||a.employee_name||' — '||a.purpose, 160), 'payee_label', public.fin_exp_payee(a.company_id, a.employee_id),
    'frequency', 'once', 'anchor_date', anc, 'amount', a.amount, 'amount_quality', 'estimated', 'nature', 'transfert', 'contract_ref', 'AVANCE'));
  UPDATE public.fin_obligations SET source_document_id = a.id WHERE id = oid;
  PERFORM public.fin_ensure_occurrences(a.company_id, anc, anc);
  SELECT * INTO oc FROM public.fin_occurrences WHERE obligation_id = oid AND status = 'active' ORDER BY due_date LIMIT 1;
  UPDATE public.fin_occurrences SET due_unknown = (a.planned_on IS NULL) WHERE id = oc.id;
  UPDATE public.fin_exp_advances SET status = 'approuvee', decided_at = now(), decided_by = auth.uid(), decision_note = nullif(btrim(_note),''), self_approval_reason = nullif(btrim(_self_reason),''),
    approve_key = _key, obligation_id = oid, occurrence_id = oc.id, rev = rev + 1, updated_at = now() WHERE id = a.id;
  PERFORM public.fin_exp_log(a.company_id, NULL, a.id, 'adv_approve', nullif(btrim(_self_reason),''), jsonb_build_object('amount', a.amount, 'occurrence_id', oc.id));
  RETURN jsonb_build_object('status', 'approuvee', 'occurrence_id', oc.id);
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_adv_pay(_id uuid, _p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.fin_exp_advances; amt numeric := round(nullif(_p->>'amount','')::numeric,2); res jsonb; pf uuid := nullif(_p->>'proof_file_id','')::uuid;
BEGIN
  SELECT * INTO a FROM public.fin_exp_advances WHERE id = _id FOR UPDATE;
  IF a.id IS NULL OR NOT public.fin_can_write(a.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF a.status = 'versee' AND a.pay_key = _p->>'idem_key' THEN RETURN jsonb_build_object('payment_id', a.payment_id, 'replayed', true); END IF;
  IF a.status <> 'approuvee' THEN RAISE EXCEPTION 'Seule une avance approuvée non versée peut être versée' USING ERRCODE='P0409'; END IF;
  IF amt IS NULL OR amt <= 0 OR amt > a.amount THEN RAISE EXCEPTION 'Montant versé entre 0 et % $ (montant approuvé)', a.amount; END IF;
  IF coalesce(_p->>'currency','CAD') <> 'CAD' THEN RAISE EXCEPTION 'Seul le CAD est pris en charge'; END IF;
  IF pf IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fin_exp_files WHERE id = pf AND company_id = a.company_id) THEN RAISE EXCEPTION 'Preuve hors de cette entreprise' USING ERRCODE='42501'; END IF;
  UPDATE public.fin_occurrences SET amount = amt, amount_quality = 'confirmed', amount_override = true, updated_at = now() WHERE id = a.occurrence_id;
  res := public.fin_payment_save(a.company_id, (_p - 'allocations' - 'proof_file_id' - 'currency') || jsonb_build_object('allocations', jsonb_build_array(jsonb_build_object('occurrence_id', a.occurrence_id, 'amount', amt)),
    'note', 'Versement d''avance (à justifier, pas une dépense)'), false);
  UPDATE public.fin_exp_advances SET status = 'versee', payment_id = (res->>'payment_id')::uuid, paid_on = (_p->>'paid_on')::date, paid_amount = amt, reference = nullif(btrim(_p->>'reference'),''),
    proof_file_id = pf, pay_key = _p->>'idem_key', rev = rev + 1, updated_at = now() WHERE id = a.id;
  PERFORM public.fin_exp_log(a.company_id, NULL, a.id, 'adv_pay', NULL, jsonb_build_object('amount', amt, 'payment_id', res->>'payment_id'));
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_alloc(_advance uuid, _report uuid, _amount numeric, _key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.fin_exp_advances; r public.fin_exp_reports; oc public.fin_occurrences; ex public.fin_exp_allocs; av numeric; due numeric;
BEGIN
  IF _key IS NULL OR length(_key) < 8 THEN RAISE EXCEPTION 'Clé requise'; END IF;
  SELECT * INTO a FROM public.fin_exp_advances WHERE id = _advance FOR UPDATE;
  IF a.id IS NULL OR NOT public.fin_can_write(a.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT * INTO ex FROM public.fin_exp_allocs WHERE company_id = a.company_id AND idem_key = _key;
  IF ex.id IS NOT NULL THEN RETURN jsonb_build_object('id', ex.id, 'replay', true); END IF;
  SELECT * INTO r FROM public.fin_exp_reports WHERE id = _report FOR UPDATE;
  IF r.id IS NULL OR r.company_id <> a.company_id THEN RAISE EXCEPTION 'Note hors de cette entreprise' USING ERRCODE='42501'; END IF;
  IF r.employee_id <> a.employee_id THEN RAISE EXCEPTION 'Avance et note d''employés différents' USING ERRCODE='P0410'; END IF;
  IF r.currency <> a.currency THEN RAISE EXCEPTION 'Devises différentes' USING ERRCODE='P0410'; END IF;
  IF a.status <> 'versee' THEN RAISE EXCEPTION 'Avance non versée : une avance prévue ne s''affecte pas' USING ERRCODE='P0409'; END IF;
  IF r.status <> 'approuvee' OR r.occurrence_id IS NULL THEN RAISE EXCEPTION 'La note doit être approuvée avec un montant remboursable' USING ERRCODE='P0409'; END IF;
  _amount := round(_amount, 2);
  av := public.fin_exp_adv_avail(a.id);
  SELECT * INTO oc FROM public.fin_occurrences WHERE id = r.occurrence_id FOR UPDATE;
  due := oc.amount - public.fin_occ_paid(oc.id);
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Montant supérieur à 0 $ requis'; END IF;
  IF _amount > av THEN RAISE EXCEPTION 'Disponible sur l''avance : % $; affectation de % $ refusée', av, _amount USING ERRCODE='P0409'; END IF;
  IF _amount > due THEN RAISE EXCEPTION 'Reste dû sur la note : % $; affectation de % $ refusée', due, _amount USING ERRCODE='P0409'; END IF;
  INSERT INTO public.fin_exp_allocs(company_id, advance_id, report_id, amount, idem_key) VALUES (a.company_id, a.id, r.id, _amount, _key) RETURNING * INTO ex;
  UPDATE public.fin_occurrences SET amount = oc.amount - _amount, amount_override = true, updated_at = now() WHERE id = oc.id;
  PERFORM public.fin_log(a.company_id, oc.obligation_id, oc.id, 'amount_this', 'Avance affectée (aucune sortie de trésorerie)', jsonb_build_object('amount', oc.amount), jsonb_build_object('amount', oc.amount - _amount, 'advance_id', a.id));
  PERFORM public.fin_exp_log(a.company_id, r.id, a.id, 'alloc', NULL, jsonb_build_object('amount', _amount));
  RETURN jsonb_build_object('id', ex.id, 'available_after', av - _amount, 'due_after', due - _amount);
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_alloc_void(_id uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE x public.fin_exp_allocs; a public.fin_exp_advances; r public.fin_exp_reports;
BEGIN
  SELECT * INTO x FROM public.fin_exp_allocs WHERE id = _id;
  SELECT * INTO a FROM public.fin_exp_advances WHERE id = x.advance_id FOR UPDATE;
  IF a.id IS NULL OR NOT public.fin_can_correct(a.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  SELECT * INTO r FROM public.fin_exp_reports WHERE id = x.report_id FOR UPDATE;
  SELECT * INTO x FROM public.fin_exp_allocs WHERE id = _id FOR UPDATE;
  IF x.voided_at IS NOT NULL THEN RETURN jsonb_build_object('replay', true); END IF;
  UPDATE public.fin_exp_allocs SET voided_at = now(), voided_by = auth.uid(), void_reason = btrim(_reason) WHERE id = x.id;
  UPDATE public.fin_occurrences SET amount = amount + x.amount, updated_at = now() WHERE id = r.occurrence_id;
  PERFORM public.fin_exp_log(a.company_id, r.id, a.id, 'alloc_void', btrim(_reason), jsonb_build_object('amount', x.amount));
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_restitute(_advance uuid, _p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.fin_exp_advances; ex public.fin_exp_restitutions; amt numeric := round(nullif(_p->>'amount','')::numeric,2); av numeric; pf uuid := nullif(_p->>'proof_file_id','')::uuid; k text := _p->>'idem_key';
BEGIN
  SELECT * INTO a FROM public.fin_exp_advances WHERE id = _advance FOR UPDATE;
  IF a.id IS NULL OR NOT public.fin_can_write(a.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF k IS NULL OR length(k) < 8 THEN RAISE EXCEPTION 'Clé requise'; END IF;
  SELECT * INTO ex FROM public.fin_exp_restitutions WHERE company_id = a.company_id AND idem_key = k;
  IF ex.id IS NOT NULL THEN RETURN jsonb_build_object('id', ex.id, 'replay', true); END IF;
  av := public.fin_exp_adv_avail(a.id);
  IF amt IS NULL OR amt <= 0 OR amt > av THEN RAISE EXCEPTION 'Restitution entre 0 et % $ (reliquat de l''avance)', av USING ERRCODE='P0409'; END IF;
  IF nullif(_p->>'received_on','') IS NULL OR (_p->>'received_on')::date > current_date THEN RAISE EXCEPTION 'Date de réception effective requise (pas dans le futur)'; END IF;
  IF pf IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fin_exp_files WHERE id = pf AND company_id = a.company_id) THEN RAISE EXCEPTION 'Preuve hors de cette entreprise' USING ERRCODE='42501'; END IF;
  INSERT INTO public.fin_exp_restitutions(company_id, advance_id, amount, received_on, reference, proof_file_id, idem_key)
  VALUES (a.company_id, a.id, amt, (_p->>'received_on')::date, nullif(btrim(_p->>'reference'),''), pf, k) RETURNING * INTO ex;
  PERFORM public.fin_exp_log(a.company_id, NULL, a.id, 'restitution', NULL, jsonb_build_object('amount', amt));
  RETURN jsonb_build_object('id', ex.id, 'available_after', av - amt);
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_restitution_void(_id uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE x public.fin_exp_restitutions;
BEGIN
  SELECT * INTO x FROM public.fin_exp_restitutions WHERE id = _id FOR UPDATE;
  IF x.id IS NULL OR NOT public.fin_can_correct(x.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF x.voided_at IS NOT NULL THEN RETURN jsonb_build_object('replay', true); END IF;
  UPDATE public.fin_exp_restitutions SET voided_at = now(), voided_by = auth.uid(), void_reason = btrim(_reason) WHERE id = x.id;
  PERFORM public.fin_exp_log(x.company_id, NULL, x.advance_id, 'restitution_void', btrim(_reason), jsonb_build_object('amount', x.amount));
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_payment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.fin_exp_advances;
BEGIN
  IF OLD.status = 'validated' AND NEW.status IN ('voided','returned') THEN
    SELECT * INTO a FROM public.fin_exp_advances WHERE payment_id = OLD.id AND status = 'versee' FOR UPDATE;
    IF a.id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.fin_exp_allocs WHERE advance_id = a.id AND voided_at IS NULL) OR EXISTS (SELECT 1 FROM public.fin_exp_restitutions WHERE advance_id = a.id AND voided_at IS NULL) THEN
        RAISE EXCEPTION 'Ce versement d''avance est déjà affecté ou restitué : annulez d''abord ces opérations' USING ERRCODE='P0409'; END IF;
      UPDATE public.fin_exp_advances SET status = 'approuvee', payment_id = NULL, paid_on = NULL, paid_amount = NULL, pay_key = NULL, rev = rev + 1 WHERE id = a.id;
      PERFORM public.fin_exp_log(a.company_id, NULL, a.id, 'adv_pay_void', NEW.void_reason, jsonb_build_object('payment_id', OLD.id));
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_exp_payment_guard BEFORE UPDATE ON public.fin_payments FOR EACH ROW EXECUTE FUNCTION public.fin_exp_payment_guard();

CREATE OR REPLACE FUNCTION public.fin_exp_report_detail(_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.fin_exp_reports; paid numeric := 0; occ public.fin_occurrences;
BEGIN
  SELECT * INTO r FROM public.fin_exp_reports WHERE id = _id;
  IF r.id IS NULL OR NOT public.fin_exp_can_see(r.company_id, r.employee_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF r.occurrence_id IS NOT NULL THEN SELECT * INTO occ FROM public.fin_occurrences WHERE id = r.occurrence_id; paid := public.fin_occ_paid(occ.id); END IF;
  RETURN to_jsonb(r) || jsonb_build_object(
    'lines', (SELECT coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('uses', public.fin_exp_receipt_uses(x), 'file_name', f.name, 'file_mime', f.mime) ORDER BY x.pos), '[]')
      FROM public.fin_exp_lines x LEFT JOIN public.fin_exp_files f ON f.id = x.file_id WHERE x.report_id = r.id),
    'current_hash', public.fin_exp_hash(r.id),
    'advances_allocated', public.fin_exp_alloc_sum(r.id),
    'allocs', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'advance_id', a.advance_id, 'amount', a.amount, 'at', a.created_at, 'voided_at', a.voided_at, 'void_reason', a.void_reason) ORDER BY a.created_at), '[]') FROM public.fin_exp_allocs a WHERE a.report_id = r.id),
    'reimbursed', paid,
    'due', CASE WHEN occ.id IS NULL THEN 0 ELSE occ.amount - paid END,
    'due_unknown', coalesce(occ.due_unknown, false),
    'payments', (SELECT coalesce(jsonb_agg(jsonb_build_object('payment_id', p.id, 'amount', al.amount, 'paid_on', p.paid_on, 'method', p.method, 'reference', p.reference, 'status', p.status, 'reversed_at', al.reversed_at, 'reason', coalesce(al.reversed_reason, p.void_reason)) ORDER BY p.paid_on), '[]')
      FROM public.fin_allocations al JOIN public.fin_payments p ON p.id = al.payment_id WHERE al.occurrence_id = r.occurrence_id),
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('action', e.action, 'reason', e.reason, 'detail', e.detail, 'at', e.created_at) ORDER BY e.id), '[]') FROM public.fin_exp_events e WHERE e.report_id = r.id),
    'can_edit', r.status IN ('brouillon','a_corriger') AND ((r.employee_id = auth.uid()) OR public.fin_can_write(r.company_id)),
    'can_decide', public.fin_can_write(r.company_id) AND (r.employee_id <> auth.uid() OR public.fin_can_correct(r.company_id)),
    'is_self', r.employee_id = auth.uid(),
    'can_correct', public.fin_can_correct(r.company_id));
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_overview(_company uuid, _mine boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE mgr boolean := public.fin_can_write(_company) AND NOT coalesce(_mine,false);
BEGIN
  IF NOT (public.fin_exp_member(_company, auth.uid()) OR public.fin_can_write(_company)) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'reports', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'employee_id', r.employee_id, 'employee', r.employee_name, 'purpose', r.purpose, 'status', r.status, 'approval', r.approval, 'version', r.version,
        'requested', (SELECT coalesce(sum(business_amount),0) FROM public.fin_exp_lines WHERE report_id = r.id), 'approved', r.approved_total, 'reimbursable', r.reimbursable_total,
        'due', CASE WHEN r.occurrence_id IS NULL THEN 0 ELSE (SELECT o.amount - public.fin_occ_paid(o.id) FROM public.fin_occurrences o WHERE o.id = r.occurrence_id) END,
        'updated_at', r.updated_at) ORDER BY r.updated_at DESC), '[]')
      FROM public.fin_exp_reports r WHERE r.company_id = _company AND (mgr OR r.employee_id = auth.uid())),
    'advances', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'employee_id', a.employee_id, 'employee', a.employee_name, 'purpose', a.purpose, 'amount', a.amount, 'status', a.status, 'planned_on', a.planned_on,
        'paid_on', a.paid_on, 'paid_amount', a.paid_amount, 'reference', a.reference, 'payment_id', a.payment_id, 'decision_note', a.decision_note,
        'allocated', (SELECT coalesce(sum(amount),0) FROM public.fin_exp_allocs WHERE advance_id = a.id AND voided_at IS NULL),
        'restituted', (SELECT coalesce(sum(amount),0) FROM public.fin_exp_restitutions WHERE advance_id = a.id AND voided_at IS NULL),
        'available', public.fin_exp_adv_avail(a.id),
        'allocs', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'report_id', x.report_id, 'amount', x.amount, 'voided_at', x.voided_at, 'at', x.created_at)), '[]') FROM public.fin_exp_allocs x WHERE x.advance_id = a.id),
        'restitutions', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'amount', x.amount, 'received_on', x.received_on, 'reference', x.reference, 'voided_at', x.voided_at, 'void_reason', x.void_reason)), '[]') FROM public.fin_exp_restitutions x WHERE x.advance_id = a.id)
      ) ORDER BY a.created_at DESC), '[]')
      FROM public.fin_exp_advances a WHERE a.company_id = _company AND (mgr OR a.employee_id = auth.uid())),
    'can_approve', public.fin_can_write(_company), 'can_correct', public.fin_can_correct(_company), 'me', auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.fin_exp_file_begin(_id uuid, _force boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.fin_exp_files;
BEGIN
  SELECT * INTO f FROM public.fin_exp_files WHERE id = _id FOR UPDATE;
  IF f.id IS NULL OR NOT public.fin_exp_can_see(f.company_id, f.owner_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF f.extract_status = 'lecture' AND f.updated_at > now() - interval '3 minutes' THEN RETURN jsonb_build_object('gate', 'busy'); END IF;
  IF f.extraction IS NOT NULL AND NOT coalesce(_force,false) THEN RETURN jsonb_build_object('gate', 'cached'); END IF;
  UPDATE public.fin_exp_files SET extract_status = 'lecture', updated_at = now() WHERE id = f.id;
  RETURN jsonb_build_object('gate', 'go', 'company_id', f.company_id, 'path', f.storage_path, 'converted', f.converted_path, 'mime', f.mime);
END $$;
CREATE OR REPLACE FUNCTION public.fin_exp_file_set(_id uuid, _sha text, _ok boolean, _extraction jsonb, _error text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.fin_exp_files SET sha256 = coalesce(_sha, sha256), extraction = CASE WHEN _ok THEN _extraction ELSE extraction END, extracted_at = CASE WHEN _ok THEN now() ELSE extracted_at END,
    extract_error = CASE WHEN _ok THEN NULL ELSE _error END, extract_status = CASE WHEN _ok THEN 'ok' ELSE 'echec' END, extract_count = extract_count + 1, updated_at = now() WHERE id = _id $$;
REVOKE ALL ON FUNCTION public.fin_exp_file_set(uuid,text,boolean,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_exp_file_set(uuid,text,boolean,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fin_exp_file_sha_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NEW.sha256 IS DISTINCT FROM OLD.sha256 THEN UPDATE public.fin_exp_lines SET receipt_sha = NEW.sha256 WHERE file_id = NEW.id; END IF; RETURN NEW; END $$;
CREATE TRIGGER fin_exp_file_sha_sync AFTER UPDATE OF sha256 ON public.fin_exp_files FOR EACH ROW EXECUTE FUNCTION public.fin_exp_file_sha_sync();

REVOKE ALL ON FUNCTION public.fin_exp_my_companies(), public.fin_exp_lookups(uuid), public.fin_exp_file_add(uuid,text,text,text,integer,text,text), public.fin_exp_save(uuid,uuid,jsonb,integer),
  public.fin_exp_submit(uuid,integer), public.fin_exp_decide(uuid,text,jsonb,integer,text,text,text,date,text), public.fin_exp_adjust(uuid,numeric,text), public.fin_exp_reimburse(uuid,jsonb),
  public.fin_exp_adv_save(uuid,jsonb), public.fin_exp_adv_decide(uuid,text,text,text,text), public.fin_exp_adv_pay(uuid,jsonb), public.fin_exp_alloc(uuid,uuid,numeric,text), public.fin_exp_alloc_void(uuid,text),
  public.fin_exp_restitute(uuid,jsonb), public.fin_exp_restitution_void(uuid,text), public.fin_exp_report_detail(uuid), public.fin_exp_overview(uuid,boolean), public.fin_exp_file_begin(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_exp_my_companies(), public.fin_exp_lookups(uuid), public.fin_exp_file_add(uuid,text,text,text,integer,text,text), public.fin_exp_save(uuid,uuid,jsonb,integer),
  public.fin_exp_submit(uuid,integer), public.fin_exp_decide(uuid,text,jsonb,integer,text,text,text,date,text), public.fin_exp_adjust(uuid,numeric,text), public.fin_exp_reimburse(uuid,jsonb),
  public.fin_exp_adv_save(uuid,jsonb), public.fin_exp_adv_decide(uuid,text,text,text,text), public.fin_exp_adv_pay(uuid,jsonb), public.fin_exp_alloc(uuid,uuid,numeric,text), public.fin_exp_alloc_void(uuid,text),
  public.fin_exp_restitute(uuid,jsonb), public.fin_exp_restitution_void(uuid,text), public.fin_exp_report_detail(uuid), public.fin_exp_overview(uuid,boolean), public.fin_exp_file_begin(uuid,boolean) TO authenticated;