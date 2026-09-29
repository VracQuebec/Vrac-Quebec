-- FIN-01 : obligations financières et calendrier (additif, aucune table existante modifiée)
CREATE OR REPLACE FUNCTION public.fin_can_read(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.entcrm_role(_company_id) IN ('support','proprietaire','gestionnaire','comptabilite','lecture'), false) $$;
CREATE OR REPLACE FUNCTION public.fin_can_write(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.entcrm_role(_company_id) IN ('support','proprietaire','gestionnaire','comptabilite'), false) $$;

CREATE TABLE public.fin_settings (
  company_id uuid PRIMARY KEY REFERENCES public.jsc_companies(id),
  currency text NOT NULL DEFAULT 'CAD' CHECK (currency IN ('CAD')),
  timezone text NOT NULL DEFAULT 'America/Toronto',
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.fin_settings TO authenticated;
GRANT ALL ON public.fin_settings TO service_role;
ALTER TABLE public.fin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_settings_r" ON public.fin_settings FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY "fin_settings_i" ON public.fin_settings FOR INSERT TO authenticated WITH CHECK (public.fin_can_write(company_id));
CREATE POLICY "fin_settings_u" ON public.fin_settings FOR UPDATE TO authenticated USING (public.fin_can_write(company_id)) WITH CHECK (public.fin_can_write(company_id));

CREATE TABLE public.fin_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  is_suggested boolean NOT NULL DEFAULT false,
  archived_at timestamptz, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX fin_categories_uniq ON public.fin_categories (company_id, lower(btrim(name)));
GRANT SELECT, INSERT, UPDATE ON public.fin_categories TO authenticated;
GRANT ALL ON public.fin_categories TO service_role;
ALTER TABLE public.fin_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_cat_r" ON public.fin_categories FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY "fin_cat_i" ON public.fin_categories FOR INSERT TO authenticated WITH CHECK (public.fin_can_write(company_id));
CREATE POLICY "fin_cat_u" ON public.fin_categories FOR UPDATE TO authenticated USING (public.fin_can_write(company_id)) WITH CHECK (public.fin_can_write(company_id));

CREATE TABLE public.fin_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 160),
  payee_client_id uuid REFERENCES public.ent_crm_clients(id),
  payee_label text,
  category_id uuid REFERENCES public.fin_categories(id),
  nature text NOT NULL DEFAULT 'charge' CHECK (nature IN ('charge','dette','taxe','actif','depot','transfert')),
  frequency text NOT NULL CHECK (frequency IN ('once','monthly')),
  anchor_date date NOT NULL,
  first_planned_date date,
  month_day int CHECK (month_day BETWEEN 1 AND 31),
  short_month_policy text NOT NULL DEFAULT 'last_day' CHECK (short_month_policy IN ('last_day')),
  end_date date, max_count int CHECK (max_count BETWEEN 1 AND 600),
  contract_ref text, notes text,
  service_start date, service_end date, renewal_date date, notice_date date,
  owner_user_id uuid, payment_method text, autopay_declared boolean NOT NULL DEFAULT false,
  truck_id uuid REFERENCES public.jsc_trucks(id),
  project_id uuid REFERENCES public.ent_crm_projects(id),
  document_id uuid REFERENCES public.ent_crm_files(id),
  source_document_id uuid,
  business_event_ref uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  archived_effective date,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= anchor_date));
COMMENT ON COLUMN public.fin_obligations.source_document_id IS 'Réservé FIN-03+ : facture fournisseur remplaçant cette estimation (pas de seconde dette).';
COMMENT ON COLUMN public.fin_obligations.business_event_ref IS 'Référence stable pour le futur grand livre (aucune écriture générée dans FIN-01).';
CREATE INDEX fin_obligations_company ON public.fin_obligations (company_id, status);
GRANT SELECT ON public.fin_obligations TO authenticated;
GRANT ALL ON public.fin_obligations TO service_role;
ALTER TABLE public.fin_obligations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_obl_r" ON public.fin_obligations FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_obligation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  obligation_id uuid NOT NULL REFERENCES public.fin_obligations(id),
  effective_from date NOT NULL,
  amount numeric(14,2),
  amount_quality text NOT NULL CHECK (amount_quality IN ('confirmed','estimated','unknown')),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obligation_id, effective_from, created_at),
  CHECK ((amount_quality = 'unknown' AND amount IS NULL) OR (amount_quality <> 'unknown' AND amount IS NOT NULL AND amount >= 0)));
GRANT SELECT ON public.fin_obligation_versions TO authenticated;
GRANT ALL ON public.fin_obligation_versions TO service_role;
ALTER TABLE public.fin_obligation_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_ver_r" ON public.fin_obligation_versions FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  obligation_id uuid NOT NULL REFERENCES public.fin_obligations(id),
  occ_key text NOT NULL,
  due_date date NOT NULL,
  planned_date date NOT NULL,
  amount numeric(14,2),
  amount_quality text NOT NULL CHECK (amount_quality IN ('confirmed','estimated','unknown')),
  version_id uuid REFERENCES public.fin_obligation_versions(id),
  amount_override boolean NOT NULL DEFAULT false,
  planned_override boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  cancel_reason text,
  business_event_ref uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, obligation_id, occ_key),
  CHECK ((amount_quality = 'unknown' AND amount IS NULL) OR (amount_quality <> 'unknown' AND amount IS NOT NULL AND amount >= 0)));
COMMENT ON TABLE public.fin_occurrences IS 'Échéance prévue (pas un paiement). FIN-03 : règlements multiples reliés à fin_occurrences.id.';
CREATE INDEX fin_occ_due ON public.fin_occurrences (company_id, due_date);
CREATE INDEX fin_occ_planned ON public.fin_occurrences (company_id, planned_date);
GRANT SELECT ON public.fin_occurrences TO authenticated;
GRANT ALL ON public.fin_occurrences TO service_role;
ALTER TABLE public.fin_occurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_occ_r" ON public.fin_occurrences FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  obligation_id uuid REFERENCES public.fin_obligations(id),
  occurrence_id uuid REFERENCES public.fin_occurrences(id),
  action text NOT NULL, reason text, before jsonb, after jsonb,
  actor_id uuid, is_support boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX fin_events_obl ON public.fin_events (obligation_id, created_at);
GRANT SELECT ON public.fin_events TO authenticated;
GRANT ALL ON public.fin_events TO service_role;
ALTER TABLE public.fin_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_ev_r" ON public.fin_events FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE OR REPLACE FUNCTION public.fin_events_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historique financier non modifiable'; END $$;
CREATE TRIGGER fin_events_no_change BEFORE UPDATE OR DELETE ON public.fin_events FOR EACH ROW EXECUTE FUNCTION public.fin_events_frozen();

CREATE OR REPLACE FUNCTION public.fin_log(_company uuid, _obl uuid, _occ uuid, _action text, _reason text, _before jsonb, _after jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.fin_events(company_id, obligation_id, occurrence_id, action, reason, before, after, actor_id, is_support)
  VALUES (_company, _obl, _occ, _action, _reason, _before, _after, auth.uid(), public.has_role(auth.uid(),'admin')) $$;
REVOKE EXECUTE ON FUNCTION public.fin_log(uuid,uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;

-- Catégories suggérées : action explicite et idempotente
CREATE OR REPLACE FUNCTION public.fin_seed_categories(_company uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  INSERT INTO public.fin_categories(company_id, name, is_suggested, created_by)
  SELECT _company, x, true, auth.uid() FROM unnest(ARRAY['Assurances','Immatriculation / véhicules','Financement','Frais bancaires','Logiciels','Télécommunications','Locaux','Énergie / services','Carburant / fluides','Entretien / réparation','Paie','Cotisations employeur','Matériaux / fournisseurs','Sous-traitance','Location / outillage','Disposition / environnement','TPS / TVQ','Impôts / autres taxes','Permis / cotisations','Honoraires','Marketing','Administration','Déplacements','Formation / sécurité','Saisonnier / exceptionnel','Propriétaires / transferts']) x
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;

-- Date mensuelle : jour d'ancrage, dernier jour si le mois est trop court
CREATE OR REPLACE FUNCTION public.fin_month_date(_anchor date, _day int, _k int) RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT (m + (least(_day, extract(day FROM (m + interval '1 month' - interval '1 day'))::int) - 1))::date
  FROM (SELECT (date_trunc('month', _anchor) + make_interval(months => _k))::date AS m) s $$;

-- Génération déterministe et bornée, sans doublon (ON CONFLICT)
CREATE OR REPLACE FUNCTION public.fin_ensure_occurrences(_company uuid, _from date, _to date) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; k int; kmax int; d date; v record; n int := 0; c int;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _to < _from THEN RAISE EXCEPTION 'Période invalide'; END IF;
  IF _to - _from > 366*6 THEN RAISE EXCEPTION 'Période limitée à 6 ans'; END IF;
  FOR o IN SELECT * FROM public.fin_obligations WHERE company_id=_company AND status IN ('active','archived') LOOP
    IF o.frequency = 'once' THEN
      IF o.anchor_date BETWEEN _from AND _to AND (o.archived_effective IS NULL OR o.anchor_date < o.archived_effective) THEN
        SELECT * INTO v FROM public.fin_obligation_versions WHERE obligation_id=o.id AND effective_from<=o.anchor_date ORDER BY effective_from DESC, created_at DESC LIMIT 1;
        IF v.id IS NULL THEN SELECT * INTO v FROM public.fin_obligation_versions WHERE obligation_id=o.id ORDER BY effective_from, created_at DESC LIMIT 1; END IF;
        INSERT INTO public.fin_occurrences(company_id, obligation_id, occ_key, due_date, planned_date, amount, amount_quality, version_id)
        VALUES (_company, o.id, 'once', o.anchor_date, coalesce(o.first_planned_date, o.anchor_date), v.amount, v.amount_quality, v.id)
        ON CONFLICT (company_id, obligation_id, occ_key) DO NOTHING;
        GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
      END IF;
    ELSE
      k := greatest(0, ((extract(year FROM _from)-extract(year FROM o.anchor_date))*12 + extract(month FROM _from)-extract(month FROM o.anchor_date))::int - 1);
      kmax := ((extract(year FROM _to)-extract(year FROM o.anchor_date))*12 + extract(month FROM _to)-extract(month FROM o.anchor_date))::int + 1;
      IF o.max_count IS NOT NULL THEN kmax := least(kmax, o.max_count - 1); END IF;
      WHILE k <= kmax LOOP
        d := public.fin_month_date(o.anchor_date, coalesce(o.month_day, extract(day FROM o.anchor_date)::int), k);
        EXIT WHEN o.end_date IS NOT NULL AND d > o.end_date;
        EXIT WHEN o.archived_effective IS NOT NULL AND d >= o.archived_effective;
        IF d BETWEEN _from AND _to AND d >= o.anchor_date - 31 THEN
          SELECT * INTO v FROM public.fin_obligation_versions WHERE obligation_id=o.id AND effective_from<=d ORDER BY effective_from DESC, created_at DESC LIMIT 1;
          INSERT INTO public.fin_occurrences(company_id, obligation_id, occ_key, due_date, planned_date, amount, amount_quality, version_id)
          VALUES (_company, o.id, to_char(d,'YYYY-MM'), d, d, v.amount, v.amount_quality, v.id)
          ON CONFLICT (company_id, obligation_id, occ_key) DO NOTHING;
          GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
        END IF;
        k := k + 1;
      END LOOP;
    END IF;
  END LOOP;
  RETURN n;
END $$;

-- Sélection filtrée commune (totaux, liste, calendrier)
CREATE OR REPLACE FUNCTION public.fin_select(_company uuid, _from date, _to date, _base text, _f jsonb)
RETURNS TABLE(id uuid, obligation_id uuid, due_date date, planned_date date, ref_date date, amount numeric, amount_quality text, status text, cancel_reason text, amount_override boolean, planned_override boolean, label text, payee text, category_id uuid, category text, frequency text, truck_id uuid, project_id uuid, nature text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT oc.id, oc.obligation_id, oc.due_date, oc.planned_date,
    CASE WHEN _base='planned' THEN oc.planned_date ELSE oc.due_date END,
    oc.amount, oc.amount_quality, oc.status, oc.cancel_reason, oc.amount_override, oc.planned_override,
    ob.label, coalesce(cl.name, ob.payee_label), ob.category_id, cat.name, ob.frequency, ob.truck_id, ob.project_id, ob.nature
  FROM public.fin_occurrences oc
  JOIN public.fin_obligations ob ON ob.id=oc.obligation_id AND ob.company_id=oc.company_id
  LEFT JOIN public.ent_crm_clients cl ON cl.id=ob.payee_client_id AND cl.company_id=ob.company_id
  LEFT JOIN public.fin_categories cat ON cat.id=ob.category_id AND cat.company_id=ob.company_id
  WHERE oc.company_id=_company AND public.fin_can_read(_company)
    AND (CASE WHEN _base='planned' THEN oc.planned_date ELSE oc.due_date END) BETWEEN _from AND _to
    AND (coalesce(_f->>'status','active')='all' OR oc.status=coalesce(_f->>'status','active'))
    AND (_f->>'quality' IS NULL OR oc.amount_quality=_f->>'quality')
    AND (_f->>'frequency' IS NULL OR ob.frequency=_f->>'frequency')
    AND (_f->>'category_id' IS NULL OR ob.category_id=(_f->>'category_id')::uuid)
    AND (_f->>'truck_id' IS NULL OR ob.truck_id=(_f->>'truck_id')::uuid)
    AND (_f->>'project_id' IS NULL OR ob.project_id=(_f->>'project_id')::uuid)
    AND (_f->>'payee' IS NULL OR coalesce(cl.name, ob.payee_label) ILIKE '%'||(_f->>'payee')||'%')
    AND (_f->>'q' IS NULL OR ob.label ILIKE '%'||(_f->>'q')||'%' OR coalesce(cl.name, ob.payee_label,'') ILIKE '%'||(_f->>'q')||'%' OR coalesce(ob.contract_ref,'') ILIKE '%'||(_f->>'q')||'%')
$$;
REVOKE EXECUTE ON FUNCTION public.fin_select(uuid,date,date,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_period_totals(_company uuid, _from date, _to date, _base text DEFAULT 'due', _f jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  PERFORM public.fin_ensure_occurrences(_company, _from - 400, _to + 400);
  SELECT jsonb_build_object(
    'confirmed', coalesce(sum(amount) FILTER (WHERE status='active' AND amount_quality='confirmed'),0),
    'estimated', coalesce(sum(amount) FILTER (WHERE status='active' AND amount_quality='estimated'),0),
    'known', coalesce(sum(amount) FILTER (WHERE status='active' AND amount_quality<>'unknown'),0),
    'unknown_count', count(*) FILTER (WHERE status='active' AND amount_quality='unknown'),
    'count', count(*), 'from', _from, 'to', _to, 'base', _base)
  INTO r FROM public.fin_select(_company, _from, _to, _base, coalesce(_f,'{}'::jsonb));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fin_list(_company uuid, _from date, _to date, _base text DEFAULT 'due', _f jsonb DEFAULT '{}', _sort text DEFAULT 'date_asc', _limit int DEFAULT 50, _offset int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rows jsonb; total int;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  PERFORM public.fin_ensure_occurrences(_company, _from - 400, _to + 400);
  SELECT count(*) INTO total FROM public.fin_select(_company, _from, _to, _base, coalesce(_f,'{}'::jsonb));
  SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]') INTO rows FROM (
    SELECT * FROM public.fin_select(_company, _from, _to, _base, coalesce(_f,'{}'::jsonb)) x
    ORDER BY CASE WHEN _sort='date_asc' THEN x.ref_date END ASC, CASE WHEN _sort='date_desc' THEN x.ref_date END DESC,
             CASE WHEN _sort='amount_desc' THEN x.amount END DESC NULLS LAST, CASE WHEN _sort='amount_asc' THEN x.amount END ASC NULLS LAST,
             x.ref_date, x.label, x.id
    LIMIT least(greatest(_limit,1),500) OFFSET greatest(_offset,0)) s;
  RETURN jsonb_build_object('rows', rows, 'total', total);
END $$;

CREATE OR REPLACE FUNCTION public.fin_check_links(_company uuid, _p jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _p->>'payee_client_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ent_crm_clients WHERE id=(_p->>'payee_client_id')::uuid AND company_id=_company) THEN RAISE EXCEPTION 'Fournisseur hors de cette entreprise'; END IF;
  IF _p->>'category_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fin_categories WHERE id=(_p->>'category_id')::uuid AND company_id=_company) THEN RAISE EXCEPTION 'Catégorie hors de cette entreprise'; END IF;
  IF _p->>'truck_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.jsc_trucks WHERE id=(_p->>'truck_id')::uuid AND company_id=_company) THEN RAISE EXCEPTION 'Camion hors de cette entreprise'; END IF;
  IF _p->>'project_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ent_crm_projects WHERE id=(_p->>'project_id')::uuid AND company_id=_company) THEN RAISE EXCEPTION 'Chantier hors de cette entreprise'; END IF;
  IF _p->>'document_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ent_crm_files WHERE id=(_p->>'document_id')::uuid AND company_id=_company) THEN RAISE EXCEPTION 'Document hors de cette entreprise'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.fin_check_links(uuid,jsonb) FROM PUBLIC, anon, authenticated;

-- Création / modification d'une obligation (validation serveur)
CREATE OR REPLACE FUNCTION public.fin_save_obligation(_company uuid, _id uuid, _p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_obligations; oid uuid; q text := coalesce(_p->>'amount_quality','unknown'); amt numeric := nullif(_p->>'amount','')::numeric; bef jsonb; n int;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_p->>'label'),'') = '' THEN RAISE EXCEPTION 'Libellé requis'; END IF;
  IF q NOT IN ('confirmed','estimated','unknown') THEN RAISE EXCEPTION 'Qualité de montant invalide'; END IF;
  IF q='unknown' THEN amt := NULL; ELSIF amt IS NULL THEN RAISE EXCEPTION 'Montant requis (ou choisir « à compléter »)'; END IF;
  IF amt < 0 THEN RAISE EXCEPTION 'Montant négatif refusé'; END IF;
  PERFORM public.fin_check_links(_company, _p);
  IF _id IS NULL THEN
    IF (_p->>'anchor_date') IS NULL THEN RAISE EXCEPTION 'Date d''échéance requise'; END IF;
    INSERT INTO public.fin_obligations(company_id,label,payee_client_id,payee_label,category_id,nature,frequency,anchor_date,first_planned_date,month_day,end_date,max_count,contract_ref,notes,service_start,service_end,renewal_date,notice_date,owner_user_id,payment_method,autopay_declared,truck_id,project_id,document_id,status,created_by)
    VALUES (_company, btrim(_p->>'label'), (_p->>'payee_client_id')::uuid, nullif(btrim(_p->>'payee_label'),''), (_p->>'category_id')::uuid, coalesce(_p->>'nature','charge'),
      coalesce(_p->>'frequency','once'), (_p->>'anchor_date')::date, (_p->>'first_planned_date')::date,
      CASE WHEN coalesce(_p->>'frequency','once')='monthly' THEN coalesce((_p->>'month_day')::int, extract(day FROM (_p->>'anchor_date')::date)::int) END,
      (_p->>'end_date')::date, (_p->>'max_count')::int, _p->>'contract_ref', _p->>'notes', (_p->>'service_start')::date, (_p->>'service_end')::date,
      (_p->>'renewal_date')::date, (_p->>'notice_date')::date, (_p->>'owner_user_id')::uuid, _p->>'payment_method', coalesce((_p->>'autopay_declared')::boolean,false),
      (_p->>'truck_id')::uuid, (_p->>'project_id')::uuid, (_p->>'document_id')::uuid, coalesce(_p->>'status','active'), auth.uid())
    RETURNING id INTO oid;
    INSERT INTO public.fin_obligation_versions(company_id, obligation_id, effective_from, amount, amount_quality, created_by)
    VALUES (_company, oid, (_p->>'anchor_date')::date, amt, q, auth.uid());
    PERFORM public.fin_log(_company, oid, NULL, 'create', NULL, NULL, _p);
    RETURN oid;
  END IF;
  SELECT * INTO o FROM public.fin_obligations WHERE id=_id AND company_id=_company FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Obligation introuvable' USING ERRCODE='42501'; END IF;
  bef := to_jsonb(o);
  UPDATE public.fin_obligations SET label=btrim(_p->>'label'), payee_client_id=(_p->>'payee_client_id')::uuid, payee_label=nullif(btrim(_p->>'payee_label'),''),
    category_id=(_p->>'category_id')::uuid, nature=coalesce(_p->>'nature',nature), end_date=(_p->>'end_date')::date, max_count=(_p->>'max_count')::int,
    contract_ref=_p->>'contract_ref', notes=_p->>'notes', service_start=(_p->>'service_start')::date, service_end=(_p->>'service_end')::date,
    renewal_date=(_p->>'renewal_date')::date, notice_date=(_p->>'notice_date')::date, owner_user_id=(_p->>'owner_user_id')::uuid,
    payment_method=_p->>'payment_method', autopay_declared=coalesce((_p->>'autopay_declared')::boolean,false),
    truck_id=(_p->>'truck_id')::uuid, project_id=(_p->>'project_id')::uuid, document_id=(_p->>'document_id')::uuid,
    anchor_date = CASE WHEN o.status='draft' THEN coalesce((_p->>'anchor_date')::date, anchor_date) ELSE anchor_date END,
    month_day = CASE WHEN o.status='draft' AND o.frequency='monthly' THEN coalesce((_p->>'month_day')::int, extract(day FROM coalesce((_p->>'anchor_date')::date, anchor_date))::int) ELSE month_day END,
    first_planned_date = CASE WHEN o.status='draft' THEN (_p->>'first_planned_date')::date ELSE first_planned_date END,
    status = CASE WHEN o.status='draft' AND _p->>'status'='active' THEN 'active' ELSE status END,
    updated_at=now() WHERE id=_id;
  IF o.status='draft' THEN
    UPDATE public.fin_obligation_versions SET effective_from=coalesce((_p->>'anchor_date')::date, effective_from), amount=amt, amount_quality=q WHERE obligation_id=_id;
  END IF;
  -- Fin de série raccourcie : occurrences hors série annulées (jamais supprimées)
  UPDATE public.fin_occurrences oc SET status='cancelled', cancel_reason='Hors de la série modifiée', updated_at=now()
   FROM public.fin_obligations ob WHERE ob.id=_id AND oc.obligation_id=_id AND oc.status='active' AND oc.due_date >= current_date
     AND ob.end_date IS NOT NULL AND oc.due_date > ob.end_date;
  PERFORM public.fin_log(_company, _id, NULL, 'update', NULL, bef, _p);
  RETURN _id;
END $$;

-- Montant : cette occurrence seulement ou celle-ci et les suivantes non figées
CREATE OR REPLACE FUNCTION public.fin_edit_amount(_occ uuid, _scope text, _amount numeric, _quality text, _dry boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE oc public.fin_occurrences; n int; vid uuid; a numeric := _amount; ids jsonb;
BEGIN
  SELECT * INTO oc FROM public.fin_occurrences WHERE id=_occ;
  IF oc.id IS NULL OR NOT public.fin_can_write(oc.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _quality NOT IN ('confirmed','estimated','unknown') THEN RAISE EXCEPTION 'Qualité invalide'; END IF;
  IF _quality='unknown' THEN a := NULL; ELSIF a IS NULL OR a < 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF _scope='this' THEN
    IF _dry THEN RETURN jsonb_build_object('count',1,'dates',jsonb_build_array(oc.due_date)); END IF;
    UPDATE public.fin_occurrences SET amount=a, amount_quality=_quality, amount_override=true, updated_at=now() WHERE id=_occ;
    PERFORM public.fin_log(oc.company_id, oc.obligation_id, _occ, 'amount_this', NULL, jsonb_build_object('amount',oc.amount,'quality',oc.amount_quality), jsonb_build_object('amount',a,'quality',_quality));
    RETURN jsonb_build_object('count',1);
  ELSIF _scope='following' THEN
    SELECT count(*), coalesce(jsonb_agg(due_date ORDER BY due_date),'[]') INTO n, ids FROM public.fin_occurrences
     WHERE obligation_id=oc.obligation_id AND due_date>=oc.due_date AND status='active' AND NOT amount_override;
    IF _dry THEN RETURN jsonb_build_object('count',n,'dates',ids); END IF;
    INSERT INTO public.fin_obligation_versions(company_id, obligation_id, effective_from, amount, amount_quality, created_by)
    VALUES (oc.company_id, oc.obligation_id, oc.due_date, a, _quality, auth.uid()) RETURNING id INTO vid;
    UPDATE public.fin_occurrences SET amount=a, amount_quality=_quality, version_id=vid, updated_at=now()
     WHERE obligation_id=oc.obligation_id AND due_date>=oc.due_date AND status='active' AND NOT amount_override;
    PERFORM public.fin_log(oc.company_id, oc.obligation_id, _occ, 'amount_following', NULL, jsonb_build_object('from',oc.due_date,'amount',oc.amount), jsonb_build_object('amount',a,'quality',_quality,'count',n));
    RETURN jsonb_build_object('count',n);
  END IF;
  RAISE EXCEPTION 'Portée invalide';
END $$;

CREATE OR REPLACE FUNCTION public.fin_reschedule(_occ uuid, _planned date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE oc public.fin_occurrences;
BEGIN
  SELECT * INTO oc FROM public.fin_occurrences WHERE id=_occ;
  IF oc.id IS NULL OR NOT public.fin_can_write(oc.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _planned IS NULL THEN RAISE EXCEPTION 'Date planifiée requise'; END IF;
  UPDATE public.fin_occurrences SET planned_date=_planned, planned_override=(_planned<>due_date), updated_at=now() WHERE id=_occ;
  PERFORM public.fin_log(oc.company_id, oc.obligation_id, _occ, 'reschedule', NULL, jsonb_build_object('planned',oc.planned_date), jsonb_build_object('planned',_planned));
END $$;

CREATE OR REPLACE FUNCTION public.fin_cancel_occurrence(_occ uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE oc public.fin_occurrences;
BEGIN
  SELECT * INTO oc FROM public.fin_occurrences WHERE id=_occ;
  IF oc.id IS NULL OR NOT public.fin_can_write(oc.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_reason),'')='' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF oc.status='cancelled' THEN RETURN; END IF;
  UPDATE public.fin_occurrences SET status='cancelled', cancel_reason=btrim(_reason), updated_at=now() WHERE id=_occ;
  PERFORM public.fin_log(oc.company_id, oc.obligation_id, _occ, 'cancel', btrim(_reason), NULL, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.fin_archive_obligation(_id uuid, _effective date) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fin_obligations; n int;
BEGIN
  SELECT * INTO o FROM public.fin_obligations WHERE id=_id;
  IF o.id IS NULL OR NOT public.fin_can_write(o.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _effective IS NULL THEN RAISE EXCEPTION 'Date effective requise'; END IF;
  UPDATE public.fin_obligations SET status='archived', archived_effective=_effective, updated_at=now() WHERE id=_id;
  UPDATE public.fin_occurrences SET status='cancelled', cancel_reason='Série archivée', updated_at=now()
   WHERE obligation_id=_id AND due_date>=_effective AND status='active';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public.fin_log(o.company_id, _id, NULL, 'archive', NULL, NULL, jsonb_build_object('effective',_effective,'cancelled',n));
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.fin_ensure_occurrences(uuid,date,date), public.fin_period_totals(uuid,date,date,text,jsonb), public.fin_list(uuid,date,date,text,jsonb,text,int,int),
  public.fin_save_obligation(uuid,uuid,jsonb), public.fin_edit_amount(uuid,text,numeric,text,boolean), public.fin_reschedule(uuid,date), public.fin_cancel_occurrence(uuid,text),
  public.fin_archive_obligation(uuid,date), public.fin_seed_categories(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_ensure_occurrences(uuid,date,date), public.fin_period_totals(uuid,date,date,text,jsonb), public.fin_list(uuid,date,date,text,jsonb,text,int,int),
  public.fin_save_obligation(uuid,uuid,jsonb), public.fin_edit_amount(uuid,text,numeric,text,boolean), public.fin_reschedule(uuid,date), public.fin_cancel_occurrence(uuid,text),
  public.fin_archive_obligation(uuid,date), public.fin_seed_categories(uuid), public.fin_can_read(uuid), public.fin_can_write(uuid) TO authenticated;
