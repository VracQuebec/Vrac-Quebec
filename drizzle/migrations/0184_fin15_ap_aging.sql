CREATE OR REPLACE FUNCTION public.fin_ap_aging(_company uuid, _on date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s record; b jsonb; bal jsonb; rows jsonb := '[]'; r jsonb; d int; rest numeric;
  t jsonb; tot jsonb := jsonb_build_object('rest',0,'not_due',0,'b1_30',0,'b31_60',0,'b61_90',0,'b90',0,'unknown',0,'available',0);
BEGIN
  IF NOT public.fin_can_read(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _on IS NULL THEN RAISE EXCEPTION 'Date de référence requise' USING ERRCODE='22023'; END IF;
  FOR s IN SELECT p.client_id, coalesce(c.name, 'Fournisseur') AS name FROM public.fin_supplier_profiles p
    LEFT JOIN public.ent_crm_clients c ON c.id = p.client_id WHERE p.company_id = _company ORDER BY 2 LOOP
    bal := public.fin_supplier_balances(_company, s.client_id);
    t := jsonb_build_object('rest',0,'not_due',0,'b1_30',0,'b31_60',0,'b61_90',0,'b90',0,'unknown',0,
      'available', coalesce((bal->>'overpaid_available')::numeric,0) + coalesce((bal->>'credit_available')::numeric,0));
    FOR b IN SELECT * FROM jsonb_array_elements(bal->'bills') LOOP
      rest := coalesce((b->>'rest')::numeric, 0);
      CONTINUE WHEN rest <= 0;
      t := jsonb_set(t, '{rest}', to_jsonb((t->>'rest')::numeric + rest));
      IF (b->>'due_unknown')::boolean OR b->>'due_date' IS NULL THEN
        t := jsonb_set(t, '{unknown}', to_jsonb((t->>'unknown')::numeric + rest));
      ELSE
        d := _on - (b->>'due_date')::date;
        t := jsonb_set(t, ARRAY[CASE WHEN d <= 0 THEN 'not_due' WHEN d <= 30 THEN 'b1_30' WHEN d <= 60 THEN 'b31_60' WHEN d <= 90 THEN 'b61_90' ELSE 'b90' END],
          to_jsonb((t->>(CASE WHEN d <= 0 THEN 'not_due' WHEN d <= 30 THEN 'b1_30' WHEN d <= 60 THEN 'b31_60' WHEN d <= 90 THEN 'b61_90' ELSE 'b90' END))::numeric + rest));
      END IF;
    END LOOP;
    CONTINUE WHEN (t->>'rest')::numeric = 0 AND (t->>'available')::numeric = 0;
    rows := rows || jsonb_build_array(t || jsonb_build_object('supplier_id', s.client_id, 'name', s.name));
    SELECT jsonb_object_agg(k, (tot->>k)::numeric + (t->>k)::numeric) INTO tot FROM jsonb_object_keys(tot) k;
  END LOOP;
  RETURN jsonb_build_object('on', _on, 'currency', 'CAD', 'rows', rows, 'totals', tot);
END $$;
REVOKE ALL ON FUNCTION public.fin_ap_aging(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_ap_aging(uuid, date) TO authenticated, service_role;