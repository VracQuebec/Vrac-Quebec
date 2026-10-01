-- FIN-10 — comptes clients, états de compte, portail client privé, préparation de relance (simulation).
-- Lecture seule sur les moteurs existants (fin_invoice_position) : aucun recalcul de taxes, aucune écriture financière.

CREATE OR REPLACE FUNCTION public.fin_ar_lines(_company uuid, _on date)
RETURNS TABLE(invoice_id uuid, client_key text, client_id uuid, client_name text, number text, issue_date date, due_date date,
  is_test boolean, total numeric, credits numeric, collected numeric, rest numeric, unallocated numeric, held numeric, current_due numeric,
  not_due numeric, due_today numeric, b1_30 numeric, b31_60 numeric, b61_90 numeric, b90 numeric, future_ret numeric, unknown text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE i record; p jsonb; s jsonb; cd numeric; amt numeric; dt date; dd int;
BEGIN
  FOR i IN SELECT f.*, c.name AS crm_name FROM fin_invoices f LEFT JOIN ent_crm_clients c ON c.id = f.client_id AND c.company_id = f.company_id
           WHERE f.company_id = _company AND f.status = 'emise' AND f.credit_of IS NULL ORDER BY f.issue_date, f.number LOOP
    p := public.fin_invoice_position(i.id);
    invoice_id := i.id; client_id := i.client_id;
    client_name := coalesce(nullif(trim(i.crm_name),''), nullif(trim(i.client_name),''), '(client sans nom)');
    client_key := CASE WHEN i.client_id IS NOT NULL THEN 'c:' || i.client_id ELSE 'n:' || lower(client_name) END;
    number := i.number; issue_date := i.issue_date; due_date := i.due_date; is_test := coalesce(i.is_test,false);
    total := (p->>'total')::numeric; credits := (p->>'credits')::numeric; collected := (p->>'collected')::numeric;
    rest := (p->>'rest')::numeric; unallocated := (p->>'unallocated')::numeric; held := (p->>'held')::numeric;
    current_due := (p->>'current_due')::numeric;
    not_due := 0; due_today := 0; b1_30 := 0; b31_60 := 0; b61_90 := 0; b90 := 0; future_ret := 0; unknown := '{}';
    IF NOT coalesce((p->>'consistent')::boolean, false) THEN
      unknown := unknown || 'Retenue supérieure au solde : répartition indisponible';
    ELSE
      IF current_due > 0 THEN
        IF i.due_date IS NULL THEN unknown := unknown || 'Échéance de facture absente';
        ELSE dd := _on - i.due_date;
          IF dd < 0 THEN not_due := not_due + current_due; ELSIF dd = 0 THEN due_today := due_today + current_due;
          ELSIF dd <= 30 THEN b1_30 := b1_30 + current_due; ELSIF dd <= 60 THEN b31_60 := b31_60 + current_due;
          ELSIF dd <= 90 THEN b61_90 := b61_90 + current_due; ELSE b90 := b90 + current_due; END IF;
        END IF;
      END IF;
      FOR s IN SELECT * FROM jsonb_array_elements(coalesce(p->'retention_schedule','[]'::jsonb)) LOOP
        amt := (s->>'amount')::numeric; dt := nullif(s->>'date','')::date;
        IF dt IS NULL THEN unknown := unknown || 'Date de libération de retenue non fixée';
        ELSIF dt > _on THEN future_ret := future_ret + amt;
        ELSE dd := _on - dt;
          IF dd = 0 THEN due_today := due_today + amt; ELSIF dd <= 30 THEN b1_30 := b1_30 + amt; ELSIF dd <= 60 THEN b31_60 := b31_60 + amt;
          ELSIF dd <= 90 THEN b61_90 := b61_90 + amt; ELSE b90 := b90 + amt; END IF;
        END IF;
      END LOOP;
    END IF;
    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.fin_ar_lines(uuid, date) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_ar_sum(_rows jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'rest', coalesce(sum((r->>'rest')::numeric),0), 'unallocated', coalesce(sum((r->>'unallocated')::numeric),0),
    'not_due', coalesce(sum((r->>'not_due')::numeric),0), 'due_today', coalesce(sum((r->>'due_today')::numeric),0),
    'b1_30', coalesce(sum((r->>'b1_30')::numeric),0), 'b31_60', coalesce(sum((r->>'b31_60')::numeric),0),
    'b61_90', coalesce(sum((r->>'b61_90')::numeric),0), 'b90', coalesce(sum((r->>'b90')::numeric),0),
    'overdue', coalesce(sum((r->>'b1_30')::numeric + (r->>'b31_60')::numeric + (r->>'b61_90')::numeric + (r->>'b90')::numeric),0),
    'due_now', coalesce(sum((r->>'due_today')::numeric + (r->>'b1_30')::numeric + (r->>'b31_60')::numeric + (r->>'b61_90')::numeric + (r->>'b90')::numeric),0),
    'future_ret', coalesce(sum((r->>'future_ret')::numeric),0),
    'partial', coalesce(bool_or(jsonb_array_length(r->'unknown') > 0), false),
    'invoices', count(*))
  FROM jsonb_array_elements(coalesce(_rows,'[]'::jsonb)) r $$;
REVOKE ALL ON FUNCTION public.fin_ar_sum(jsonb) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_ar_accounts(_company uuid, _on date, _q text DEFAULT '', _filter text DEFAULT 'all', _limit int DEFAULT 25, _offset int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE q text := lower(trim(coalesce(_q,''))); res jsonb; tot jsonb; cnt int;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF _on IS NULL THEN RAISE EXCEPTION 'Date de référence requise'; END IF;
  IF coalesce(_filter,'all') NOT IN ('all','open','overdue','credit','partial') THEN RAISE EXCEPTION 'Filtre inconnu'; END IF;
  WITH l AS (SELECT to_jsonb(x) j, x.client_key, x.client_id, x.client_name FROM public.fin_ar_lines(_company, _on) x
             WHERE q = '' OR position(q IN lower(x.client_name)) > 0 OR position(q IN lower(coalesce(x.number,''))) > 0),
  a AS (SELECT client_key, min(client_id::text)::uuid client_id, min(client_name) client_name, public.fin_ar_sum(jsonb_agg(j)) s FROM l GROUP BY client_key),
  f AS (SELECT * FROM a WHERE CASE coalesce(_filter,'all') WHEN 'open' THEN (s->>'rest')::numeric > 0 WHEN 'overdue' THEN (s->>'overdue')::numeric > 0
          WHEN 'credit' THEN (s->>'unallocated')::numeric > 0 WHEN 'partial' THEN (s->>'partial')::boolean ELSE true END)
  SELECT count(*),
    (SELECT public.fin_ar_sum(jsonb_agg(l.j)) FROM l WHERE l.client_key IN (SELECT client_key FROM f)),
    coalesce((SELECT jsonb_agg(jsonb_build_object('client_key', client_key, 'client_id', client_id, 'client_name', client_name) || s ORDER BY (s->>'overdue')::numeric DESC, (s->>'rest')::numeric DESC, client_name)
              FROM (SELECT * FROM f ORDER BY (s->>'overdue')::numeric DESC, (s->>'rest')::numeric DESC, client_name LIMIT greatest(1, least(coalesce(_limit,25),100)) OFFSET greatest(0, coalesce(_offset,0))) pg), '[]'::jsonb)
  INTO cnt, tot, res FROM f;
  RETURN jsonb_build_object('on', _on, 'currency', 'CAD', 'count', cnt, 'totals', coalesce(tot, public.fin_ar_sum('[]')), 'rows', res,
    'q', coalesce(_q,''), 'filter', coalesce(_filter,'all'));
END $$;
REVOKE ALL ON FUNCTION public.fin_ar_accounts(uuid, date, text, text, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fin_ar_accounts(uuid, date, text, text, int, int) TO authenticated;

-- Portail : accès révocables par couple entreprise/client, demandes persistantes.
CREATE TABLE public.fin_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  client_id uuid NOT NULL REFERENCES public.ent_crm_clients(id),
  user_id uuid NOT NULL,
  expires_at timestamptz,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz, revoked_by uuid, revoke_reason text
);
CREATE UNIQUE INDEX fin_portal_access_active ON public.fin_portal_access(company_id, client_id, user_id) WHERE revoked_at IS NULL;
GRANT SELECT ON public.fin_portal_access TO authenticated;
GRANT ALL ON public.fin_portal_access TO service_role;
ALTER TABLE public.fin_portal_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "r" ON public.fin_portal_access FOR SELECT TO authenticated USING (public.fin_can_read(company_id) OR user_id = auth.uid());

CREATE TABLE public.fin_portal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_id uuid NOT NULL REFERENCES public.fin_portal_access(id),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  client_id uuid NOT NULL REFERENCES public.ent_crm_clients(id),
  invoice_id uuid REFERENCES public.fin_invoices(id),
  kind text NOT NULL CHECK (kind IN ('question','paiement_declare')),
  message text, reference text, amount numeric(14,2), paid_on date,
  status text NOT NULL DEFAULT 'a_verifier' CHECK (status IN ('a_verifier','traitee')),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz, handled_by uuid, handle_note text
);
GRANT SELECT ON public.fin_portal_requests TO authenticated;
GRANT ALL ON public.fin_portal_requests TO service_role;
ALTER TABLE public.fin_portal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "r" ON public.fin_portal_requests FOR SELECT TO authenticated USING (public.fin_can_read(company_id) OR created_by = auth.uid());

CREATE OR REPLACE FUNCTION public.fin_ar_statement_core(_company uuid, _client_key text, _on date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv jsonb; ids uuid[]; cid uuid; cname text; cemail text;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.issue_date, x.number), '[]'::jsonb), array_agg(x.invoice_id)
    INTO inv, ids FROM public.fin_ar_lines(_company, _on) x WHERE x.client_key = _client_key;
  IF _client_key LIKE 'c:%' THEN cid := substr(_client_key, 3)::uuid;
    SELECT name, email INTO cname, cemail FROM ent_crm_clients WHERE id = cid AND company_id = _company; END IF;
  RETURN jsonb_build_object('on', _on, 'currency', 'CAD', 'generated_at', now(),
    'seller', (SELECT jsonb_build_object('name', c.name) FROM jsc_companies c WHERE c.id = _company),
    'client', jsonb_build_object('key', _client_key, 'id', cid, 'name', coalesce(cname, inv->0->>'client_name'), 'email', cemail),
    'invoices', inv, 'totals', public.fin_ar_sum(inv),
    'receipts', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'invoice_id', r.invoice_id, 'invoice_number', i.number, 'amount', r.amount, 'received_on', r.received_on, 'method', r.method, 'reference', r.reference) ORDER BY r.received_on, r.created_at)
       FROM fin_invoice_receipts r JOIN fin_invoices i ON i.id = r.invoice_id WHERE r.invoice_id = ANY(coalesce(ids,'{}')) AND r.voided_at IS NULL), '[]'::jsonb),
    'credits', coalesce((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'invoice_id', n.invoice_id, 'invoice_number', i.number, 'number', n.number, 'total', n.total, 'issued_at', n.issued_at, 'reason', n.reason) ORDER BY n.issued_at)
       FROM fin_credit_notes n JOIN fin_invoices i ON i.id = n.invoice_id WHERE n.invoice_id = ANY(coalesce(ids,'{}')) AND n.status = 'emise'), '[]'::jsonb),
    'requests', CASE WHEN cid IS NULL THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'invoice_id', q.invoice_id, 'message', q.message, 'reference', q.reference, 'amount', q.amount, 'paid_on', q.paid_on, 'status', q.status, 'created_at', q.created_at, 'handle_note', q.handle_note) ORDER BY q.created_at DESC)
       FROM fin_portal_requests q WHERE q.company_id = _company AND q.client_id = cid), '[]'::jsonb) END);
END $$;
REVOKE ALL ON FUNCTION public.fin_ar_statement_core(uuid, text, date) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_ar_statement(_company uuid, _client_key text, _on date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF _on IS NULL OR coalesce(_client_key,'') = '' THEN RAISE EXCEPTION 'Client et date de référence requis'; END IF;
  RETURN public.fin_ar_statement_core(_company, _client_key, _on);
END $$;
REVOKE ALL ON FUNCTION public.fin_ar_statement(uuid, text, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fin_ar_statement(uuid, text, date) TO authenticated;

-- Relance : préparation et SIMULATION uniquement (aucune écriture, aucune file d'envoi).
CREATE OR REPLACE FUNCTION public.fin_ar_collect_preview(_company uuid, _client_key text, _on date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE st jsonb; l jsonb; props jsonb := '[]'; excl jsonb := '[]'; manual text[] := '{}'; s fin_reminder_settings; od numeric; tot numeric := 0;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  st := public.fin_ar_statement_core(_company, _client_key, _on);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(st->'requests') q WHERE q->>'status' = 'a_verifier') THEN
    manual := manual || 'Demande du client à vérifier (question ou paiement déclaré) : vérification manuelle avant toute relance'; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(st->'invoices') LOOP
    od := (l->>'b1_30')::numeric + (l->>'b31_60')::numeric + (l->>'b61_90')::numeric + (l->>'b90')::numeric;
    IF (l->>'rest')::numeric <= 0 THEN excl := excl || jsonb_build_object('number', l->>'number', 'reason', 'Facture soldée : aucune relance');
    ELSIF jsonb_array_length(l->'unknown') > 0 THEN excl := excl || jsonb_build_object('number', l->>'number', 'reason', 'Données insuffisantes : ' || array_to_string(ARRAY(SELECT jsonb_array_elements_text(l->'unknown')), ' ; '));
    ELSIF od <= 0 THEN excl := excl || jsonb_build_object('number', l->>'number', 'reason', CASE WHEN (l->>'future_ret')::numeric > 0 AND (l->>'current_due')::numeric <= 0 THEN 'Retenue à échéance future : non en retard' ELSE 'Aucune somme en retard' END);
    ELSE props := props || jsonb_build_object('number', l->>'number', 'invoice_id', l->>'invoice_id', 'due_date', l->>'due_date', 'rest', (l->>'rest')::numeric, 'overdue', od, 'future_ret', (l->>'future_ret')::numeric, 'is_test', (l->>'is_test')::boolean);
      tot := tot + od; END IF;
  END LOOP;
  SELECT * INTO s FROM fin_reminder_settings WHERE company_id = _company;
  RETURN jsonb_build_object('simulation', true, 'on', _on, 'currency', 'CAD', 'client', st->'client', 'proposals', props, 'excluded', excl,
    'overdue_total', tot, 'manual', to_jsonb(manual), 'can_prepare', cardinality(manual) = 0 AND jsonb_array_length(props) > 0,
    'preferences', jsonb_build_object('configured', s.company_id IS NOT NULL, 'channels', to_jsonb(s.channels), 'overdue_every_days', s.overdue_every_days,
       'quiet_start', s.quiet_start, 'quiet_end', s.quiet_end, 'client_email', st->'client'->>'email' IS NOT NULL AND st->'client'->>'email' <> ''),
    'dedupe_key', 'ar:' || _company || ':' || _client_key || ':' || _on);
END $$;
REVOKE ALL ON FUNCTION public.fin_ar_collect_preview(uuid, text, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fin_ar_collect_preview(uuid, text, date) TO authenticated;

-- Accès portail : compte existant seulement (aucune création), révocable, expiration facultative.
CREATE OR REPLACE FUNCTION public.fin_portal_grant(_company uuid, _client uuid, _email text, _expires date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u uuid; nid uuid;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM ent_crm_clients WHERE id = _client AND company_id = _company AND archived_at IS NULL) THEN RAISE EXCEPTION 'Client introuvable dans cette entreprise'; END IF;
  IF _expires IS NOT NULL AND _expires <= (now() AT TIME ZONE 'America/Toronto')::date THEN RAISE EXCEPTION 'Expiration dans le futur requise'; END IF;
  SELECT id INTO u FROM auth.users WHERE lower(email) = lower(trim(coalesce(_email,''))) LIMIT 1;
  IF u IS NULL THEN RAISE EXCEPTION 'Aucun compte existant pour cette adresse (aucune invitation envoyée)'; END IF;
  SELECT id INTO nid FROM fin_portal_access WHERE company_id = _company AND client_id = _client AND user_id = u AND revoked_at IS NULL;
  IF nid IS NOT NULL THEN RETURN nid; END IF;
  INSERT INTO fin_portal_access(company_id, client_id, user_id, expires_at, created_by)
  VALUES (_company, _client, u, CASE WHEN _expires IS NULL THEN NULL ELSE (_expires::timestamp AT TIME ZONE 'America/Toronto') END, auth.uid()) RETURNING id INTO nid;
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public.fin_portal_grant(uuid, uuid, text, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fin_portal_grant(uuid, uuid, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_portal_revoke(_access uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a fin_portal_access;
BEGIN
  SELECT * INTO a FROM fin_portal_access WHERE id = _access FOR UPDATE;
  IF a.id IS NULL OR NOT public.fin_can_write(a.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF a.revoked_at IS NOT NULL THEN RETURN; END IF;
  UPDATE fin_portal_access SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = left(coalesce(_reason,''), 300) WHERE id = _access;
END $$;
REVOKE ALL ON FUNCTION public.fin_portal_revoke(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fin_portal_revoke(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_portal_staff_list(_company uuid, _client uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'email', u.email, 'expires_at', a.expires_at, 'created_at', a.created_at, 'revoked_at', a.revoked_at) ORDER BY a.created_at DESC)
    FROM fin_portal_access a JOIN auth.users u ON u.id = a.user_id WHERE a.company_id = _company AND a.client_id = _client), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.fin_portal_staff_list(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fin_portal_staff_list(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_portal_active(_access uuid)
RETURNS fin_portal_access LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a fin_portal_access;
BEGIN
  SELECT * INTO a FROM fin_portal_access WHERE id = _access;
  IF a.id IS NULL OR a.user_id IS DISTINCT FROM auth.uid() OR a.revoked_at IS NOT NULL OR (a.expires_at IS NOT NULL AND a.expires_at <= now())
     OR NOT EXISTS (SELECT 1 FROM ent_crm_clients c WHERE c.id = a.client_id AND c.company_id = a.company_id) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.fin_portal_active(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_portal_mine()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'company', co.name, 'client', c.name, 'expires_at', a.expires_at) ORDER BY co.name, c.name), '[]'::jsonb)
  FROM fin_portal_access a JOIN jsc_companies co ON co.id = a.company_id JOIN ent_crm_clients c ON c.id = a.client_id AND c.company_id = a.company_id
  WHERE a.user_id = auth.uid() AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at > now()) $$;
REVOKE ALL ON FUNCTION public.fin_portal_mine() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fin_portal_mine() TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_portal_statement(_access uuid, _on date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a fin_portal_access; st jsonb;
BEGIN
  a := public.fin_portal_active(_access);
  st := public.fin_ar_statement_core(a.company_id, 'c:' || a.client_id, coalesce(_on, (now() AT TIME ZONE 'America/Toronto')::date));
  RETURN st || jsonb_build_object('documents', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'status', i.status, 'is_test', i.is_test,
      'issue_date', i.issue_date, 'due_date', i.due_date, 'terms', i.terms, 'lines', i.lines, 'tax_snapshot', i.tax_snapshot,
      'seller_snapshot', i.seller_snapshot, 'client_snapshot', i.client_snapshot, 'template_snapshot', i.template_snapshot - 'logo_path'))
    FROM fin_invoices i WHERE i.company_id = a.company_id AND i.client_id = a.client_id AND i.status = 'emise' AND i.credit_of IS NULL), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.fin_portal_statement(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fin_portal_statement(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_portal_request(_access uuid, _kind text, _invoice uuid, _message text, _reference text, _amount text, _paid_on text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a fin_portal_access; nid uuid; amt numeric; pd date;
BEGIN
  a := public.fin_portal_active(_access);
  IF _kind NOT IN ('question','paiement_declare') THEN RAISE EXCEPTION 'Type de demande inconnu'; END IF;
  IF _invoice IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fin_invoices WHERE id = _invoice AND company_id = a.company_id AND client_id = a.client_id AND status = 'emise') THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF _kind = 'question' AND length(trim(coalesce(_message,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Message requis (2000 caractères au plus)'; END IF;
  IF _kind = 'paiement_declare' THEN
    IF length(trim(coalesce(_reference,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Référence du paiement requise'; END IF;
    IF coalesce(_amount,'') <> '' THEN
      IF _amount !~ '^\d{1,12}(\.\d{1,2})?$' THEN RAISE EXCEPTION 'Montant invalide (2 décimales au plus)'; END IF;
      amt := _amount::numeric; IF amt <= 0 THEN RAISE EXCEPTION 'Montant positif requis'; END IF; END IF;
    IF coalesce(_paid_on,'') <> '' THEN
      BEGIN pd := _paid_on::date; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Date invalide (AAAA-MM-JJ)'; END;
      IF pd > (now() AT TIME ZONE 'America/Toronto')::date THEN RAISE EXCEPTION 'Date de paiement future refusée'; END IF; END IF;
  END IF;
  INSERT INTO fin_portal_requests(access_id, company_id, client_id, invoice_id, kind, message, reference, amount, paid_on, created_by)
  VALUES (a.id, a.company_id, a.client_id, _invoice, _kind, nullif(left(trim(coalesce(_message,'')),2000),''), nullif(left(trim(coalesce(_reference,'')),200),''), amt, pd, auth.uid())
  RETURNING id INTO nid;
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public.fin_portal_request(uuid, text, uuid, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fin_portal_request(uuid, text, uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_portal_request_handle(_id uuid, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r fin_portal_requests;
BEGIN
  SELECT * INTO r FROM fin_portal_requests WHERE id = _id FOR UPDATE;
  IF r.id IS NULL OR NOT public.fin_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  IF r.status = 'traitee' THEN RETURN; END IF;
  UPDATE fin_portal_requests SET status = 'traitee', handled_at = now(), handled_by = auth.uid(), handle_note = left(coalesce(_note,''), 500) WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.fin_portal_request_handle(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fin_portal_request_handle(uuid, text) TO authenticated;