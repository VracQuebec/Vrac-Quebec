-- FIN-10 : texte || text[] interprété comme tableau → array_append explicite.
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
      unknown := array_append(unknown, 'Retenue supérieure au solde : répartition indisponible'::text);
    ELSE
      IF current_due > 0 THEN
        IF i.due_date IS NULL THEN unknown := array_append(unknown, 'Échéance de facture absente'::text);
        ELSE dd := _on - i.due_date;
          IF dd < 0 THEN not_due := not_due + current_due; ELSIF dd = 0 THEN due_today := due_today + current_due;
          ELSIF dd <= 30 THEN b1_30 := b1_30 + current_due; ELSIF dd <= 60 THEN b31_60 := b31_60 + current_due;
          ELSIF dd <= 90 THEN b61_90 := b61_90 + current_due; ELSE b90 := b90 + current_due; END IF;
        END IF;
      END IF;
      FOR s IN SELECT * FROM jsonb_array_elements(coalesce(p->'retention_schedule','[]'::jsonb)) LOOP
        amt := (s->>'amount')::numeric; dt := nullif(s->>'date','')::date;
        IF dt IS NULL THEN unknown := array_append(unknown, 'Date de libération de retenue non fixée'::text);
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

CREATE OR REPLACE FUNCTION public.fin_ar_collect_preview(_company uuid, _client_key text, _on date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE st jsonb; l jsonb; props jsonb := '[]'; excl jsonb := '[]'; manual text[] := '{}'; s fin_reminder_settings; od numeric; tot numeric := 0;
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  st := public.fin_ar_statement_core(_company, _client_key, _on);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(st->'requests') q WHERE q->>'status' = 'a_verifier') THEN
    manual := array_append(manual, 'Demande du client à vérifier (question ou paiement déclaré) : vérification manuelle avant toute relance'::text); END IF;
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