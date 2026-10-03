-- Sommaires annuels T4 / RL-1 (préparation, non transmis) calculés depuis les seules paies finalisées, par année de date de paie.
CREATE OR REPLACE FUNCTION public.pay_year_slips(_company uuid, _year int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE mgr boolean := public.pay_can_manage(_company);
BEGIN
  IF NOT mgr AND NOT EXISTS (SELECT 1 FROM jsc_company_members WHERE company_id = _company AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(x ORDER BY x->>'name') FROM (
    SELECT jsonb_build_object('user_id', st.user_id, 'name', max(st.full_name), 'runs', count(*),
      'income', sum(st.gross + st.vacation), 'qpp', sum(st.qpp), 'ei', sum(st.ei), 'qpip', sum(st.qpip),
      'fed_tax', sum(st.fed_tax), 'qc_tax', sum(st.qc_tax), 'net', sum(st.net)) x
    FROM pay_stubs st JOIN pay_runs r ON r.id = st.run_id
    WHERE r.company_id = _company AND r.status = 'finalise' AND extract(year FROM r.pay_date) = _year
      AND (mgr OR st.user_id = auth.uid())
    GROUP BY st.user_id) q), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.pay_year_slips(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_year_slips(uuid, int) TO authenticated;