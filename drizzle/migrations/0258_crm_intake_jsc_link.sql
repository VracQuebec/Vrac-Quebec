ALTER TABLE public.jsc_requests ADD COLUMN IF NOT EXISTS crm_submission_id uuid;
COMMENT ON COLUMN public.jsc_requests.crm_submission_id IS 'Demande du CRM habituel (submissions) dont ce dossier est une vue; plusieurs calculs peuvent pointer la même demande.';
CREATE INDEX IF NOT EXISTS jsc_requests_crm_submission_idx ON public.jsc_requests(crm_submission_id);

UPDATE public.jsc_requests j SET crm_submission_id = s.id
  FROM public.submissions s
 WHERE j.crm_submission_id IS NULL AND s.origin_table = 'jsc_requests' AND s.origin_record_id = j.id;
UPDATE public.jsc_requests j SET crm_submission_id = s.id
  FROM public.jsc_quotes q JOIN public.submissions s ON s.quote_id = q.id
 WHERE j.crm_submission_id IS NULL AND q.request_id = j.id;

CREATE OR REPLACE FUNCTION public.crm_intake_link(p_submission uuid, p_table text, p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM submissions WHERE id = p_submission) THEN RETURN false; END IF;
  IF p_table = 'jsc_requests' THEN
    UPDATE jsc_requests SET crm_submission_id = p_submission WHERE id = p_id AND crm_submission_id IS NULL;
    ok := EXISTS (SELECT 1 FROM jsc_requests WHERE id = p_id AND crm_submission_id = p_submission);
  END IF;
  UPDATE submissions SET origin_table = p_table, origin_record_id = p_id
   WHERE id = p_submission AND origin_record_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM submissions s2 WHERE s2.origin_table = p_table AND s2.origin_record_id = p_id);
  ok := ok OR EXISTS (SELECT 1 FROM submissions WHERE id = p_submission AND origin_table = p_table AND origin_record_id = p_id);
  IF ok THEN
    UPDATE crm_intake_failures SET resolved_at = now(), resolved_submission_id = p_submission
     WHERE origin_table = p_table AND origin_record_id = p_id AND resolved_at IS NULL;
  END IF;
  RETURN ok;
END $$;
REVOKE ALL ON FUNCTION public.crm_intake_link(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_intake_link(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.crm_intake_gaps()
RETURNS TABLE(origin_table text, origin_record_id uuid, reference text, contact text, email text, created_at timestamptz, reason text, error text, attempts int, is_test boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'accès refusé'; END IF;
  RETURN QUERY
  WITH g AS (
    SELECT 'transport_requests'::text ot, t.id oid, t.request_number::text ref, t.client_name::text ct, t.client_email::text em, t.created_at ca
      FROM transport_requests t
     WHERE t.origin_submission_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.origin_table='transport_requests' AND s.origin_record_id=t.id)
    UNION ALL
    SELECT 'mkt_quote_requests', m.id, m.request_number::text, m.contact_name::text, m.contact_email::text, m.created_at
      FROM mkt_quote_requests m
     WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.origin_table='mkt_quote_requests' AND s.origin_record_id=m.id)
    UNION ALL
    SELECT 'jsc_requests', j.id, j.request_number::text, coalesce(c.contact_name, c.name)::text, c.email::text, j.created_at
      FROM jsc_requests j LEFT JOIN jsc_clients c ON c.id = j.client_id
     WHERE j.source IN ('soumission_web','soumission_web_manuelle','rappel','assistant')
       AND j.crm_submission_id IS NULL
       AND (j.created_at < now() - interval '10 minutes'
            OR EXISTS (SELECT 1 FROM crm_intake_failures f2 WHERE f2.origin_table='jsc_requests' AND f2.origin_record_id=j.id AND f2.resolved_at IS NULL))
       AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.origin_table='jsc_requests' AND s.origin_record_id=j.id)
       AND NOT EXISTS (SELECT 1 FROM jsc_quotes q JOIN submissions s ON s.quote_id = q.id WHERE q.request_id = j.id)
  )
  SELECT g.ot, g.oid, g.ref, g.ct, g.em, g.ca,
    CASE WHEN f.id IS NOT NULL THEN 'transfert_echoue' ELSE 'non_rattache' END,
    f.error, coalesce(f.attempts, 0),
    coalesce(g.em ~* '(@test\.invalid|\.test$|\.example$|@example\.com$|^test-)', false)
  FROM g LEFT JOIN crm_intake_failures f ON f.origin_table = g.ot AND f.origin_record_id = g.oid AND f.resolved_at IS NULL
  ORDER BY g.ca DESC;
END $$;
REVOKE ALL ON FUNCTION public.crm_intake_gaps() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_intake_gaps() TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_intake_retry(p_table text, p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'accès refusé'; END IF;
  BEGIN
    v := public.crm_intake_mirror(p_table, p_id);
    IF p_table = 'jsc_requests' AND v IS NOT NULL THEN
      UPDATE jsc_requests SET crm_submission_id = v WHERE id = p_id AND crm_submission_id IS NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.crm_intake_record_failure(p_table, p_id, 'retry', SQLERRM);
    RETURN NULL;
  END;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.crm_intake_retry(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_intake_retry(text, uuid) TO authenticated;