CREATE TABLE public.fin_gl_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opening_entry_id uuid REFERENCES public.fin_gl_entries(id),
  closed_at timestamptz, closed_by uuid,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);
CREATE UNIQUE INDEX fin_gl_years_opening ON public.fin_gl_years(opening_entry_id) WHERE opening_entry_id IS NOT NULL;
GRANT SELECT ON public.fin_gl_years TO authenticated;
GRANT ALL ON public.fin_gl_years TO service_role;
ALTER TABLE public.fin_gl_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gl years read" ON public.fin_gl_years FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE TABLE public.fin_gl_year_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id uuid NOT NULL REFERENCES public.fin_gl_years(id),
  company_id uuid NOT NULL,
  action text NOT NULL,
  reason text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid, at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fin_gl_year_events TO authenticated;
GRANT ALL ON public.fin_gl_year_events TO service_role;
ALTER TABLE public.fin_gl_year_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gl year events read" ON public.fin_gl_year_events FOR SELECT TO authenticated USING (public.fin_can_read(company_id));

CREATE OR REPLACE FUNCTION public.fin_gl_closed_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'validated' AND (TG_OP = 'INSERT' OR OLD.status <> 'validated') AND EXISTS (
     SELECT 1 FROM fin_gl_years y WHERE y.company_id = NEW.company_id AND y.status = 'closed' AND NEW.entry_date BETWEEN y.start_date AND y.end_date) THEN
    RAISE EXCEPTION 'Période fermée : aucune écriture ne peut être validée au %', NEW.entry_date USING ERRCODE = 'P0410';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_gl_closed_guard BEFORE INSERT OR UPDATE ON public.fin_gl_entries FOR EACH ROW EXECUTE FUNCTION public.fin_gl_closed_guard();

CREATE OR REPLACE FUNCTION public.fin_gl_year_save(_company uuid, _label text, _start date, _end date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid uuid;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF coalesce(btrim(_label),'') = '' THEN RAISE EXCEPTION 'Libellé requis'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fin_gl_years:' || _company::text));
  IF EXISTS (SELECT 1 FROM fin_gl_years WHERE company_id = _company AND daterange(start_date, end_date, '[]') && daterange(_start, _end, '[]')) THEN
    RAISE EXCEPTION 'Cet exercice chevauche un exercice existant' USING ERRCODE = 'P0410'; END IF;
  INSERT INTO fin_gl_years(company_id, label, start_date, end_date, created_by) VALUES (_company, btrim(_label), _start, _end, auth.uid()) RETURNING id INTO nid;
  INSERT INTO fin_gl_year_events(year_id, company_id, action, actor, data) VALUES (nid, _company, 'create', auth.uid(), jsonb_build_object('start', _start, 'end', _end));
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_opening_draft(_year uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE y fin_gl_years; e fin_gl_entries; nid uuid;
BEGIN
  SELECT * INTO y FROM fin_gl_years WHERE id = _year FOR UPDATE;
  IF NOT FOUND OR NOT public.fin_can_write(y.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF y.status = 'closed' THEN RAISE EXCEPTION 'Exercice fermé' USING ERRCODE = 'P0410'; END IF;
  IF y.opening_entry_id IS NOT NULL THEN
    SELECT * INTO e FROM fin_gl_entries WHERE id = y.opening_entry_id;
    IF e.id IS NOT NULL AND (e.status = 'draft' OR e.reversed_by_id IS NULL) THEN RETURN e.id; END IF;
  END IF;
  INSERT INTO fin_gl_entries(company_id, entry_date, reference, description, origin, created_by)
  VALUES (y.company_id, y.start_date, 'OUVERTURE ' || y.label, 'Soldes d''ouverture à la date de coupure ' || y.start_date || ' — saisis une seule fois', 'manual', auth.uid())
  RETURNING id INTO nid;
  UPDATE fin_gl_years SET opening_entry_id = nid WHERE id = y.id;
  INSERT INTO fin_gl_year_events(year_id, company_id, action, actor, data) VALUES (y.id, y.company_id, 'opening_draft', auth.uid(), jsonb_build_object('entry', nid));
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_year_close(_year uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE y fin_gl_years; drafts int; d numeric; c numeric;
BEGIN
  SELECT * INTO y FROM fin_gl_years WHERE id = _year FOR UPDATE;
  IF NOT FOUND OR NOT public.fin_can_write(y.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF y.status = 'closed' THEN RETURN jsonb_build_object('replay', true); END IF;
  SELECT count(*) INTO drafts FROM fin_gl_entries WHERE company_id = y.company_id AND status = 'draft' AND entry_date BETWEEN y.start_date AND y.end_date;
  IF drafts > 0 THEN RAISE EXCEPTION 'Clôture refusée : % brouillon(s) daté(s) dans l''exercice', drafts USING ERRCODE = 'P0410'; END IF;
  SELECT coalesce(sum(l.debit),0), coalesce(sum(l.credit),0) INTO d, c FROM fin_gl_lines l JOIN fin_gl_entries e ON e.id = l.entry_id
   WHERE e.company_id = y.company_id AND e.status = 'validated' AND e.entry_date <= y.end_date;
  IF d <> c THEN RAISE EXCEPTION 'Clôture refusée : balance déséquilibrée (% / %)', d, c USING ERRCODE = 'P0410'; END IF;
  UPDATE fin_gl_years SET status = 'closed', closed_at = now(), closed_by = auth.uid() WHERE id = y.id;
  INSERT INTO fin_gl_year_events(year_id, company_id, action, reason, actor, data) VALUES (y.id, y.company_id, 'close', nullif(btrim(_reason),''), auth.uid(), jsonb_build_object('debit', d, 'credit', c));
  RETURN jsonb_build_object('closed', true, 'debit', d, 'credit', c);
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_year_reopen(_year uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE y fin_gl_years;
BEGIN
  SELECT * INTO y FROM fin_gl_years WHERE id = _year FOR UPDATE;
  IF NOT FOUND OR NOT (public.has_role(auth.uid(),'admin') OR coalesce(public.fleet_member_role(y.company_id) IN ('proprietaire','admin'), false)) THEN
    RAISE EXCEPTION 'Réouverture réservée au propriétaire de l''entreprise' USING ERRCODE = '42501'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif de réouverture requis'; END IF;
  IF y.status <> 'closed' THEN RAISE EXCEPTION 'Exercice déjà ouvert' USING ERRCODE = 'P0409'; END IF;
  UPDATE fin_gl_years SET status = 'open', closed_at = NULL, closed_by = NULL WHERE id = y.id;
  INSERT INTO fin_gl_year_events(year_id, company_id, action, reason, actor) VALUES (y.id, y.company_id, 'reopen', btrim(_reason), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.fin_gl_statements(_company uuid, _from date, _to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  WITH mv AS (
    SELECT a.id, a.number, a.name, a.category,
      coalesce(sum(l.debit - l.credit) FILTER (WHERE e.id IS NOT NULL AND e.entry_date BETWEEN _from AND _to), 0) AS period,
      coalesce(sum(l.debit - l.credit) FILTER (WHERE e.id IS NOT NULL AND e.entry_date <= _to), 0) AS cumul,
      count(l.id) FILTER (WHERE e.id IS NOT NULL AND e.entry_date BETWEEN _from AND _to) AS n
    FROM fin_gl_accounts a
    LEFT JOIN fin_gl_lines l ON l.gl_account_id = a.id
    LEFT JOIN fin_gl_entries e ON e.id = l.entry_id AND e.status = 'validated'
    WHERE a.company_id = _company
    GROUP BY a.id)
  SELECT jsonb_build_object(
    'company', (SELECT name FROM jsc_companies WHERE id = _company), 'from', _from, 'to', _to,
    'currency', coalesce((SELECT currency FROM jsc_companies WHERE id = _company), 'CAD'),
    'income', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'number', number, 'name', name, 'category', category, 'amount', CASE WHEN category='revenus' THEN -period ELSE period END, 'lines', n) ORDER BY number) FROM mv WHERE category IN ('revenus','depenses') AND period <> 0), '[]'),
    'balance', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'number', number, 'name', name, 'category', category, 'amount', CASE WHEN category='actif' THEN cumul ELSE -cumul END) ORDER BY number) FROM mv WHERE category IN ('actif','passif','capitaux') AND cumul <> 0), '[]'),
    'result_cumul', coalesce((SELECT -sum(cumul) FROM mv WHERE category IN ('revenus','depenses')), 0),
    'drafts_in_period', (SELECT count(*) FROM fin_gl_entries WHERE company_id = _company AND status='draft' AND entry_date BETWEEN _from AND _to)
  ) INTO r;
  RETURN r;
END $$;

REVOKE EXECUTE ON FUNCTION public.fin_gl_year_save(uuid,text,date,date), public.fin_gl_opening_draft(uuid), public.fin_gl_year_close(uuid,text), public.fin_gl_year_reopen(uuid,text), public.fin_gl_statements(uuid,date,date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fin_gl_year_save(uuid,text,date,date), public.fin_gl_opening_draft(uuid), public.fin_gl_year_close(uuid,text), public.fin_gl_year_reopen(uuid,text), public.fin_gl_statements(uuid,date,date) TO authenticated;