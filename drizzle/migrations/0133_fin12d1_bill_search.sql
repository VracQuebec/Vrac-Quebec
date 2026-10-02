CREATE OR REPLACE FUNCTION public.fin_exp_bill_search(_company uuid, _q text DEFAULT NULL, _id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE q text := nullif(btrim(coalesce(_q,'')),''); res jsonb;
BEGIN
  -- FIN-12D1 : rattachement à un achat réservé aux responsables Finances (fin_can_write); jamais exposé aux employés.
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'doc_date' DESC NULLS LAST), '[]') INTO res FROM (
    SELECT jsonb_build_object('id', b.id, 'supplier', c.name, 'reference', b.reference, 'doc_date', b.doc_date, 'total', b.total, 'status', b.status) x
    FROM public.fin_supplier_bills b LEFT JOIN public.ent_crm_clients c ON c.id = b.supplier_id AND c.company_id = b.company_id
    WHERE b.company_id = _company AND b.status <> 'void'
      AND (_id IS NULL OR b.id = _id)
      AND (_id IS NOT NULL OR q IS NULL OR c.name ILIKE '%'||q||'%' OR b.reference ILIKE '%'||q||'%' OR b.doc_date::text LIKE q||'%' OR b.total::text LIKE replace(q, ',', '.')||'%')
    ORDER BY b.doc_date DESC NULLS LAST LIMIT 20) s;
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.fin_exp_bill_search(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_exp_bill_search(uuid, text, uuid) TO authenticated;