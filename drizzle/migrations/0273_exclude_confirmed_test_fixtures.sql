-- Essais fictifs confirmés conservés (historique figé) mais retirés du travail opérationnel.
CREATE TABLE IF NOT EXISTS public.test_fixture_records (
  record_id uuid PRIMARY KEY,
  table_name text NOT NULL,
  label text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.test_fixture_records TO service_role;
GRANT SELECT ON public.test_fixture_records TO authenticated;
ALTER TABLE public.test_fixture_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read fixtures" ON public.test_fixture_records FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.is_test_fixture(_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT _id IS NOT NULL AND EXISTS (SELECT 1 FROM public.test_fixture_records WHERE record_id=_id) $$;

INSERT INTO public.test_fixture_records(record_id,table_name,label,reason) VALUES
('24d65de9-1d76-41dd-b868-7c8818a5c031','submissions','#773 / Dompe 934 Camille Fictif EXEC-01','exec01-publication@remblai.test'),
('342f1785-d190-4f16-9515-e9288dc490d3','submissions','#823 / Dompe 984 TEST R4K','r4k-demande@test.invalid'),
('483d4b78-8598-4a4d-b3b0-bbbdc18695ce','submissions','#824 / Dompe 985 TEST R4K','r4k-forge@test.invalid'),
('b7a52ea3-4ce8-4322-a59a-24c536a7a0f7','submissions','#826 / Dompe 986 TEST R4K','r4k-ancienne1@test.invalid'),
('0216d082-fa38-400b-ab3a-33cce84ad544','submissions','#827 / Dompe 987 TEST R4K','r4k-ancienne2@test.invalid'),
('5101bddf-c0ce-4189-858f-35cf98b7c250','transport_requests','DT-0056','issu exclusivement d''un essai R4K'),
('c9d57ed8-9656-4c2c-ab33-f3a074f7c518','transport_requests','DT-0057','issu exclusivement d''un essai R4K'),
('d162b4e0-f063-4821-9f12-501596ff75ca','drv_missions','mission chauffeur fictive','essai R4K'),
('125b2ef9-d3f9-47a7-bbd0-e98ce5129d00','drv_missions','mission chauffeur fictive','essai R4K'),
('5fad4362-a275-4031-b739-fb31619a6299','cpn_books','carnet CPN fictif','essai R4K')
ON CONFLICT DO NOTHING;

CREATE POLICY "hide test fixtures" ON public.submissions AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (NOT public.is_test_fixture(id));
CREATE POLICY "hide test fixtures" ON public.transport_requests AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (NOT public.is_test_fixture(id) AND NOT public.is_test_fixture(origin_submission_id));
CREATE POLICY "hide test fixtures" ON public.drv_missions AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (NOT public.is_test_fixture(id));
CREATE POLICY "hide test fixtures" ON public.cpn_books AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (NOT public.is_test_fixture(id));
CREATE POLICY "hide test fixtures" ON public.crm_notifications AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (NOT public.is_test_fixture(entity_id));

CREATE OR REPLACE FUNCTION public.fx_live(_a uuid, _b uuid DEFAULT NULL) RETURNS SETOF integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM public.test_fixture_records WHERE record_id IN (_a,_b)) $$;
REVOKE EXECUTE ON FUNCTION public.fx_live(uuid,uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.access_requests_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'today', (SELECT count(*) FROM public.transport_requests _fxt JOIN public.fx_live(_fxt.id, _fxt.origin_submission_id) ON true WHERE created_at >= date_trunc('day', now())),
    'week', (SELECT count(*) FROM public.transport_requests _fxt JOIN public.fx_live(_fxt.id, _fxt.origin_submission_id) ON true WHERE created_at >= date_trunc('week', now())),
    'month', (SELECT count(*) FROM public.transport_requests _fxt JOIN public.fx_live(_fxt.id, _fxt.origin_submission_id) ON true WHERE created_at >= date_trunc('month', now())),
    'total', (SELECT count(*) FROM public.transport_requests _fxt JOIN public.fx_live(_fxt.id, _fxt.origin_submission_id) ON true),
    'accepted', (SELECT count(*) FROM public.transport_requests _fxt JOIN public.fx_live(_fxt.id, _fxt.origin_submission_id) ON true WHERE status::text IN ('acceptee','planifiee','en_cours')),
    'refused', (SELECT count(*) FROM public.transport_requests _fxt JOIN public.fx_live(_fxt.id, _fxt.origin_submission_id) ON true WHERE status::text = 'refusee'),
    'cancelled', (SELECT count(*) FROM public.transport_requests _fxt JOIN public.fx_live(_fxt.id, _fxt.origin_submission_id) ON true WHERE status::text = 'annulee'),
    'done', (SELECT count(*) FROM public.transport_requests _fxt JOIN public.fx_live(_fxt.id, _fxt.origin_submission_id) ON true WHERE status::text = 'terminee'),
    'pending', (SELECT count(*) FROM public.transport_requests _fxt JOIN public.fx_live(_fxt.id, _fxt.origin_submission_id) ON true WHERE status::text IN ('nouvelle','en_analyse','a_rappeler','en_attente_proprietaire','soumission_envoyee')),
    'avg_response_hours', (
      SELECT round(avg(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600.0)::numeric, 1)
      FROM public.transport_requests _fxt JOIN public.fx_live(_fxt.id, _fxt.origin_submission_id) ON true WHERE status::text NOT IN ('nouvelle') AND updated_at > created_at
    ),
    'top_cities', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT site_city AS name, count(*) AS n FROM public.transport_requests _fxt JOIN public.fx_live(_fxt.id, _fxt.origin_submission_id) ON true WHERE site_city IS NOT NULL AND site_city <> ''
        GROUP BY 1 ORDER BY n DESC LIMIT 5
      ) x), '[]'::jsonb),
    'top_materials', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT material_type AS name, count(*) AS n FROM public.transport_requests _fxt JOIN public.fx_live(_fxt.id, _fxt.origin_submission_id) ON true WHERE material_type IS NOT NULL AND material_type <> ''
        GROUP BY 1 ORDER BY n DESC LIMIT 5
      ) x), '[]'::jsonb),
    'top_dumps', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT dump_name AS name, count(*) AS n FROM public.transport_requests _fxt JOIN public.fx_live(_fxt.id, _fxt.origin_submission_id) ON true WHERE dump_name IS NOT NULL AND dump_name <> ''
        GROUP BY 1 ORDER BY n DESC LIMIT 5
      ) x), '[]'::jsonb),
    'active_entrepreneurs', (
      SELECT count(DISTINCT COALESCE(user_id::text, lower(client_email)))
      FROM public.transport_requests _fxt JOIN public.fx_live(_fxt.id, _fxt.origin_submission_id) ON true WHERE created_at >= now() - interval '30 days'
    )
  ) INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.count_active_dumps_by_city(_city_slug text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::int FROM public.submissions s JOIN public.fx_live(s.id) ON true
  WHERE trim(both '-' from regexp_replace(lower(public.unaccent_string(coalesce(s.city,''))), '[^a-z0-9]+', '-', 'g'))
        = trim(both '-' from regexp_replace(lower(public.unaccent_string(coalesce(_city_slug,''))), '[^a-z0-9]+', '-', 'g'))
    AND public.is_usable_fill_request(s, true);
$function$;

CREATE OR REPLACE FUNCTION public.crm_intake_gaps()
 RETURNS TABLE(origin_table text, origin_record_id uuid, reference text, contact text, email text, created_at timestamp with time zone, reason text, error text, attempts integer, is_test boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'accès refusé'; END IF;
  RETURN QUERY
  WITH g AS (
    SELECT 'transport_requests'::text ot, t.id oid, t.request_number::text ref, t.client_name::text ct, t.client_email::text em, t.created_at ca
      FROM public.transport_requests t JOIN public.fx_live(t.id, t.origin_submission_id) ON true
     WHERE t.origin_submission_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.submissions s JOIN public.fx_live(s.id) ON true WHERE s.origin_table='transport_requests' AND s.origin_record_id=t.id)
    UNION ALL
    SELECT 'mkt_quote_requests', m.id, m.request_number::text, m.contact_name::text, m.contact_email::text, m.created_at
      FROM mkt_quote_requests m
     WHERE NOT EXISTS (SELECT 1 FROM public.submissions s JOIN public.fx_live(s.id) ON true WHERE s.origin_table='mkt_quote_requests' AND s.origin_record_id=m.id)
    UNION ALL
    SELECT 'jsc_requests', j.id, j.request_number::text, coalesce(c.contact_name, c.name)::text, c.email::text, j.created_at
      FROM jsc_requests j LEFT JOIN jsc_clients c ON c.id = j.client_id
     WHERE j.source IN ('soumission_web','soumission_web_manuelle','rappel','assistant')
       AND j.crm_submission_id IS NULL
       AND (j.created_at < now() - interval '10 minutes'
            OR EXISTS (SELECT 1 FROM crm_intake_failures f2 WHERE f2.origin_table='jsc_requests' AND f2.origin_record_id=j.id AND f2.resolved_at IS NULL))
       AND NOT EXISTS (SELECT 1 FROM public.submissions s JOIN public.fx_live(s.id) ON true WHERE s.origin_table='jsc_requests' AND s.origin_record_id=j.id)
       AND NOT EXISTS (SELECT 1 FROM jsc_quotes q JOIN public.submissions s JOIN public.fx_live(s.id) ON true ON s.quote_id = q.id WHERE q.request_id = j.id)
  )
  SELECT g.ot, g.oid, g.ref, g.ct, g.em, g.ca,
    CASE WHEN f.id IS NOT NULL THEN 'transfert_echoue' ELSE 'non_rattache' END,
    f.error, coalesce(f.attempts, 0),
    coalesce(g.em ~* '(@test\.invalid|\.test$|\.example$|@example\.com$|^test-)', false)
  FROM g LEFT JOIN crm_intake_failures f ON f.origin_table = g.ot AND f.origin_record_id = g.oid AND f.resolved_at IS NULL
  ORDER BY g.ca DESC;
END $function$;

CREATE OR REPLACE FUNCTION public.crm_notifications_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d jsonb;
  v_lead_hours int; v_quote_days int; v_delivery_hours int; v_pay_days int;
  v_created int := 0;
  r record;
BEGIN
  SELECT delays INTO d FROM public.crm_notification_settings WHERE scope = 'global';
  v_lead_hours := coalesce((d->>'lead_untreated_hours')::int, 24);
  v_quote_days := coalesce((d->>'quote_followup_days')::int, 2);
  v_delivery_hours := coalesce((d->>'delivery_reminder_hours')::int, 24);
  v_pay_days := coalesce((d->>'payment_overdue_days')::int, 0);

  FOR r IN
    SELECT s.id, s.name, s.dompe_number, s.submission_number, s.phone
    FROM public.submissions s JOIN public.fx_live(s.id) ON true
    WHERE s.status = 'nouveau'
      AND s.created_at < now() - make_interval(hours => v_lead_hours)
      AND NOT EXISTS (SELECT 1 FROM public.crm_notifications n
                      WHERE n.dedupe_key = 'lead:untreated:' || s.id::text)
    LIMIT 200
  LOOP
    PERFORM public.crm_notify('lead:untreated:' || r.id::text, 'relance', 'lead_untreated', 'urgente',
      'Relance nécessaire — ' || coalesce(r.name,'Client'),
      'Le lead est toujours en attente de traitement depuis plus de ' || v_lead_hours || ' h.',
      'submission', r.id, '/admin?lead=' || r.id::text, r.name,
      coalesce(r.dompe_number, r.submission_number::text), now(),
      jsonb_build_object('phone', r.phone), false);
    v_created := v_created + 1;
  END LOOP;

  FOR r IN
    SELECT n.entity_id AS id, n.client_name, n.lead_number
    FROM public.crm_notifications n
    JOIN public.submissions s JOIN public.fx_live(s.id) ON true ON s.id = n.entity_id
    WHERE n.type = 'quote_sent'
      AND n.created_at < now() - make_interval(days => v_quote_days)
      AND s.status = 'soumission envoyée'
      AND NOT EXISTS (SELECT 1 FROM public.crm_notifications x
                      WHERE x.dedupe_key = 'lead:quote_followup:' || n.entity_id::text)
    LIMIT 200
  LOOP
    PERFORM public.crm_notify('lead:quote_followup:' || r.id::text, 'soumission', 'quote_followup', 'importante',
      'Relance de soumission — ' || coalesce(r.client_name,'Client'),
      'Aucune réponse depuis ' || v_quote_days || ' jour(s).',
      'submission', r.id, '/admin?lead=' || r.id::text, r.client_name, r.lead_number, now(),
      '{}'::jsonb, false);
    v_created := v_created + 1;
  END LOOP;

  FOR r IN
    SELECT e.id, e.title, e.client_name, e.dompe_number, e.start_at, e.delivery_address,
           e.material_type, e.trips_planned, e.submission_id
    FROM public.calendar_events e
    WHERE e.start_at BETWEEN now() AND now() + make_interval(hours => v_delivery_hours)
      AND e.status IN ('planifie','a_planifier','en_cours')
      AND NOT EXISTS (SELECT 1 FROM public.crm_notifications n
                      WHERE n.dedupe_key = 'delivery:soon:' || e.id::text)
    LIMIT 200
  LOOP
    PERFORM public.crm_notify('delivery:soon:' || r.id::text, 'livraison', 'delivery_soon', 'importante',
      'Livraison à venir — ' || coalesce(r.client_name, r.title, 'Client'),
      concat_ws(' · ', to_char(r.start_at AT TIME ZONE 'America/Toronto', 'DD/MM HH24:MI'),
                nullif(coalesce(r.material_type,''),''), nullif(coalesce(r.delivery_address,''),'')),
      'calendar_event', r.id, '/admin/calendrier?event=' || r.id::text,
      r.client_name, r.dompe_number, r.start_at,
      jsonb_build_object('trips', r.trips_planned, 'submission_id', r.submission_id), false);
    v_created := v_created + 1;
  END LOOP;

  FOR r IN
    SELECT t.id, t.invoice_number, t.due_date, t.submission_id, t.total_with_tax, t.total_price,
           s.name AS client_name
    FROM public.lead_trips t
    LEFT JOIN public.submissions s JOIN public.fx_live(s.id) ON true ON s.id = t.submission_id
    WHERE t.due_date IS NOT NULL
      AND t.due_date < (now() AT TIME ZONE 'America/Toronto')::date - v_pay_days
      AND coalesce(t.payment_status,'') NOT IN ('paye','payé','paid')
      AND NOT EXISTS (SELECT 1 FROM public.crm_notifications n
                      WHERE n.dedupe_key = 'invoice:overdue:' || t.id::text)
    LIMIT 200
  LOOP
    PERFORM public.crm_notify('invoice:overdue:' || r.id::text, 'paiement', 'payment_overdue', 'urgente',
      'Paiement en retard — ' || coalesce(r.client_name, r.invoice_number, 'Client'),
      'En retard de ' || ((now() AT TIME ZONE 'America/Toronto')::date - r.due_date) || ' jour(s).',
      'lead_trip', r.id,
      CASE WHEN r.submission_id IS NOT NULL THEN '/admin?lead=' || r.submission_id::text ELSE '/admin' END,
      r.client_name, r.invoice_number, r.due_date::timestamptz, '{}'::jsonb, false);
    v_created := v_created + 1;
  END LOOP;

  UPDATE public.crm_notifications n
  SET status = 'done', resolved_at = now(), updated_at = now(),
      push_status = CASE WHEN n.push_status = 'pending' THEN 'skipped' ELSE n.push_status END
  FROM public.submissions s JOIN public.fx_live(s.id) ON true
  WHERE n.entity_type = 'submission' AND n.entity_id = s.id
    AND n.status NOT IN ('done','archived')
    AND s.status IN ('perdu','archivé');

  UPDATE public.crm_notifications n
  SET status = 'done', resolved_at = now(), updated_at = now(),
      push_status = CASE WHEN n.push_status = 'pending' THEN 'skipped' ELSE n.push_status END
  FROM public.lead_trips t
  WHERE n.entity_type = 'lead_trip' AND n.entity_id = t.id
    AND n.status NOT IN ('done','archived')
    AND n.category IN ('paiement','facturation')
    AND coalesce(t.payment_status,'') IN ('paye','payé','paid');

  BEGIN PERFORM public.agd_reminders_sweep(); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'agd sweep: %', SQLERRM; END;
  BEGIN PERFORM public.obl_reminders_sweep(); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'obl sweep: %', SQLERRM; END;
  BEGIN PERFORM public.asr_sweep(); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'asr sweep: %', SQLERRM; END;

  RETURN jsonb_build_object('created', v_created, 'at', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.dompe_revalidation_queue(_limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, submission_number integer, dompe_number text, city text, status text, availability_status text, availability_updated_at timestamp with time zone, freshness text, materials text[], tonnage text, remaining_capacity text, cohort text, priority_score integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.submission_number, s.dompe_number, s.city, s.status,
    COALESCE(s.availability_status,'available'),
    s.availability_updated_at,
    public.dompe_freshness(s.availability_updated_at, public.dompe_revalidation_days(s), s.revalidation_requested_at) AS freshness,
    s.materials, s.tonnage, s.remaining_capacity,
    CASE WHEN lower(trim(coalesce(s.status,''))) IN ('perdu','archivé','archive') THEN 'cohorte_perdu_archive'
         WHEN s.availability_updated_at IS NULL THEN 'jamais_confirmee'
         ELSE 'confirmation_ancienne' END AS cohort,
    (CASE WHEN COALESCE(NULLIF(regexp_replace(coalesce(s.tonnage,''),'[^0-9]','','g'),'')::numeric,0) >= 1000 THEN 40 ELSE 0 END
     + LEAST(COALESCE(array_length(s.materials,1),0) * 5, 30)
     + CASE WHEN EXISTS (SELECT 1 FROM public.lead_trips t WHERE t.submission_id = s.id
                          AND t.created_at > now() - interval '120 days') THEN 20 ELSE 0 END
     + CASE WHEN s.created_at > now() - interval '90 days' THEN 10 ELSE 0 END)::int AS priority_score
  FROM public.submissions s JOIN public.fx_live(s.id) ON true
  WHERE public.has_role(auth.uid(),'admin')
    AND public.is_fill_request_type(s.request_type)
    AND public.dompe_freshness(s.availability_updated_at, public.dompe_revalidation_days(s), s.revalidation_requested_at)
        IN ('unknown','needs_revalidation')
  ORDER BY priority_score DESC, s.created_at DESC
  LIMIT COALESCE(_limit, 200);
$function$;

CREATE OR REPLACE FUNCTION public.get_entrepreneur_leads()
 RETURNS TABLE(id uuid, submission_number integer, dompe_number text, materials text[], other_material text, request_type text, property_type text, quantity text, tonnage text, deliver_or_remove text, contamination text, status text, priority text, postal_prefix text, latitude double precision, longitude double precision, machinery_available boolean, machinery_description text, accessibility text[], created_at timestamp with time zone, is_assigned boolean, availability_status text, availability_note text, truck_types_allowed text[], opening_hours text, remaining_capacity text, availability_updated_at timestamp with time zone, access_heavy_truck text, access_details jsonb, freshness text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.submission_number, s.dompe_number, s.materials, s.other_material,
    s.request_type, s.property_type, s.quantity, s.tonnage, s.deliver_or_remove,
    s.contamination, s.status, s.priority,
    LEFT(COALESCE(s.postal_code,''),3),
    s.public_latitude, s.public_longitude,
    s.machinery_available, s.machinery_description, s.accessibility, s.created_at,
    (s.assigned_entrepreneur IS NOT NULL),
    COALESCE(s.availability_status,'available'), s.availability_note, s.truck_types_allowed,
    s.opening_hours, s.remaining_capacity, s.availability_updated_at,
    s.access_heavy_truck, s.access_details,
    public.dompe_freshness(s.availability_updated_at, public.dompe_revalidation_days(s), s.revalidation_requested_at)
  FROM public.submissions s JOIN public.fx_live(s.id) ON true
  WHERE public.is_approved_entrepreneur(auth.uid())
    AND public.is_entrepreneur_visible_dompe(s);
$function$;

CREATE OR REPLACE FUNCTION public.get_public_dumps()
 RETURNS TABLE(id uuid, submission_number integer, dompe_number text, materials text[], latitude double precision, longitude double precision, availability_status text, truck_types_allowed text[], opening_hours text, remaining_capacity text, accessibility text[], freshness text, availability_updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.submission_number, s.dompe_number, s.materials,
    s.public_latitude, s.public_longitude,
    COALESCE(s.availability_status,'available'),
    s.truck_types_allowed, s.opening_hours, s.remaining_capacity, s.accessibility,
    public.dompe_freshness(s.availability_updated_at, public.dompe_revalidation_days(s), s.revalidation_requested_at),
    s.availability_updated_at
  FROM public.submissions s JOIN public.fx_live(s.id) ON true
  WHERE public.is_entrepreneur_visible_dompe(s);
$function$;

CREATE OR REPLACE FUNCTION public.matching_lab_candidates(_lat numeric DEFAULT NULL::numeric, _lng numeric DEFAULT NULL::numeric, _limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, dompe_number text, submission_number text, city text, address text, status text, availability_status text, availability_confirmed_at timestamp with time zone, materials text, other_material text, remaining_capacity text, truck_types_allowed text[], latitude numeric, longitude numeric, distance_km numeric, distance_kind text, accepted_materials jsonb, access jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id,
         s.dompe_number::text,
         s.submission_number::text,
         s.city,
         s.address,
         s.status,
         s.availability_status,
         s.availability_updated_at,
         s.materials::text,
         s.other_material,
         s.remaining_capacity::text,
         s.truck_types_allowed,
         s.latitude,
         s.longitude,
         CASE WHEN _lat IS NOT NULL AND _lng IS NOT NULL AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
              THEN public._haversine_km(_lat::double precision, _lng::double precision, s.latitude::double precision, s.longitude::double precision)::numeric
              ELSE NULL END,
         CASE WHEN _lat IS NOT NULL AND _lng IS NOT NULL AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
              THEN 'GEODESIQUE' ELSE 'INCONNUE' END,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'material_id', sam.material_id,
                    'slug', mc.slug,
                    'name', mc.name_fr,
                    'family_id', mc.family_id,
                    'family', mc.family,
                    'subfamily', mc.subfamily,
                    'stance', sam.stance,
                    'source', sam.source,
                    'confidence', sam.confidence,
                    'confirmation_status', sam.confirmation_status,
                    'original_value', sam.original_value))
           FROM public.submission_accepted_materials sam
           LEFT JOIN public.material_catalog mc ON mc.id = sam.material_id
           WHERE sam.submission_id = s.id
         ), '[]'::jsonb),
         COALESCE((SELECT to_jsonb(ac) FROM public.submission_access_constraints ac WHERE ac.submission_id = s.id LIMIT 1), 'null'::jsonb)
  FROM public.submissions s JOIN public.fx_live(s.id) ON true
  WHERE has_role(auth.uid(), 'admin'::app_role)
    AND public.is_fill_request_type(s.request_type)
  ORDER BY CASE WHEN _lat IS NOT NULL AND _lng IS NOT NULL AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
                THEN public._haversine_km(_lat::double precision, _lng::double precision, s.latitude::double precision, s.longitude::double precision)
                ELSE 1e9 END
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 100), 500));
$function$;

CREATE OR REPLACE FUNCTION public.matching_v2_network_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'algorithm_version', 'v2',
    'generated_at', now(),
    'remblai_total', count(*) FILTER (WHERE public.is_fill_request_type(s.request_type)),
    'remblai_usable', count(*) FILTER (WHERE public.is_usable_fill_request(s, false)),
    'without_capacity', count(*) FILTER (WHERE public.is_usable_fill_request(s, false) AND coalesce(s.remaining_capacity::text, '') = ''),
    'without_gps', count(*) FILTER (WHERE public.is_usable_fill_request(s, false) AND (s.latitude IS NULL OR s.longitude IS NULL)),
    'availability_unknown', count(*) FILTER (WHERE public.is_usable_fill_request(s, false) AND coalesce(s.availability_status, '') NOT IN ('available','lost','archived','unavailable'))
  )
  INTO result
  FROM public.submissions s JOIN public.fx_live(s.id) ON true;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_followups_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d jsonb; v_r1 int; v_r2 int; v_crit int; r record; v_new int := 0;
  v_label text; v_num text; v_email text; v_open boolean; v_age interval;
BEGIN
  SELECT delays INTO d FROM public.crm_notification_settings WHERE scope = 'global';
  v_r1 := coalesce((d->>'cc_first_reminder_min')::int, 15);
  v_r2 := coalesce((d->>'cc_second_reminder_min')::int, 60);
  v_crit := coalesce((d->>'cc_critical_hours')::int, 24);

  FOR r IN SELECT * FROM public.request_followups
           WHERE follow_status IN ('nouvelle','consultee') AND taken_at IS NULL AND escalation_stage < 3 LOOP
    IF r.entity_type = 'submission' THEN
      SELECT s.status = 'nouveau', coalesce(s.company, s.name), coalesce(s.dompe_number, '#'||s.submission_number), s.email
        INTO v_open, v_label, v_num, v_email FROM public.submissions s JOIN public.fx_live(s.id) ON true WHERE s.id = r.entity_id;
    ELSE
      SELECT t.status::text = 'nouvelle', coalesce(t.client_company, t.client_name), t.request_number, t.client_email
        INTO v_open, v_label, v_num, v_email FROM public.transport_requests t JOIN public.fx_live(t.id, t.origin_submission_id) ON true WHERE t.id = r.entity_id;
    END IF;
    IF NOT coalesce(v_open, false) THEN CONTINUE; END IF;  -- statut déjà avancé : plus de rappel
    v_age := now() - r.received_at;
    IF v_age >= make_interval(hours => v_crit) AND r.escalation_stage < 3 THEN
      PERFORM public.crm_notify('cc:'||r.id||':critique','alerte','cc_critique','urgente',
        'CRITIQUE — demande '||coalesce(v_num,'')||' non traitée depuis '||v_crit||' h', v_label,
        r.entity_type, r.entity_id, '/admin/centre-controle?demande='||r.entity_type||':'||r.entity_id,
        v_label, v_num, now(), jsonb_build_object('email', v_email, 'test', r.is_test), false);
      UPDATE public.request_followups SET escalation_stage = 3 WHERE id = r.id; v_new := v_new + 1;
    ELSIF v_age >= make_interval(mins => v_r2) AND r.escalation_stage < 2 THEN
      PERFORM public.crm_notify('cc:'||r.id||':r2','lead','cc_rappel_2','urgente',
        'Rappel — demande '||coalesce(v_num,'')||' toujours non prise en charge', v_label,
        r.entity_type, r.entity_id, '/admin/centre-controle?demande='||r.entity_type||':'||r.entity_id,
        v_label, v_num, now(), jsonb_build_object('email', v_email, 'test', r.is_test), false);
      UPDATE public.request_followups SET escalation_stage = 2 WHERE id = r.id; v_new := v_new + 1;
    ELSIF v_age >= make_interval(mins => v_r1) AND r.escalation_stage < 1 THEN
      PERFORM public.crm_notify('cc:'||r.id||':r1','lead','cc_rappel_1','importante',
        'Rappel — nouvelle demande '||coalesce(v_num,'')||' sans prise en charge', v_label,
        r.entity_type, r.entity_id, '/admin/centre-controle?demande='||r.entity_type||':'||r.entity_id,
        v_label, v_num, now(), jsonb_build_object('email', v_email, 'test', r.is_test), false);
      UPDATE public.request_followups SET escalation_stage = 1 WHERE id = r.id; v_new := v_new + 1;
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM public.request_followups
           WHERE follow_status <> 'resolue' AND next_reminder_at IS NOT NULL
             AND next_reminder_at <= now() AND reminder_fired_at IS NULL LOOP
    PERFORM public.crm_notify('cc:'||r.id||':prog:'||extract(epoch FROM r.next_reminder_at)::bigint,
      'relance','cc_rappel_programme','importante',
      'Rappel programmé : '||coalesce(r.reminder_reason, r.next_action, 'suivi de la demande'), r.next_action,
      r.entity_type, r.entity_id, '/admin/centre-controle?demande='||r.entity_type||':'||r.entity_id,
      NULL, NULL, r.next_reminder_at, jsonb_build_object('test', r.is_test), false);
    UPDATE public.request_followups SET reminder_fired_at = now() WHERE id = r.id;
    INSERT INTO public.request_followup_events(followup_id, entity_type, entity_id, action, detail)
    VALUES (r.id, r.entity_type, r.entity_id, 'rappel_declenche', jsonb_build_object('prevu', r.next_reminder_at));
    v_new := v_new + 1;
  END LOOP;
  RETURN jsonb_build_object('notifications', v_new, 'at', now());
END $function$;

CREATE OR REPLACE FUNCTION public.seo_city_coverage(_city_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _tid uuid; _name text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  SELECT g.id, c.name INTO _tid, _name FROM geo_territories g JOIN seo_cities c ON c.slug=g.seo_city_slug
   WHERE g.type='municipalite' AND g.status='active' AND g.seo_city_slug=_city_slug
   ORDER BY g.request_count DESC, g.id LIMIT 1;
  RETURN jsonb_build_object(
    'city_slug', _city_slug, 'city_name', _name, 'computed_at', now(),
    'materials', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug',m.slug,'name',m.name,
        'keys', (SELECT jsonb_agg(DISTINCT k) FROM unnest(array[seo_slugify(m.name)] || coalesce((SELECT array_agg(seo_slugify(x)) FROM unnest(coalesce(m.keywords,'{}'::text[])) x),'{}')) k)
      ) ORDER BY m.sort_order, m.slug),'[]') FROM seo_materials m WHERE m.active),
    'services', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug',s.slug,'name',s.name) ORDER BY s.slug),'[]') FROM seo_services s WHERE s.active),
    'territory_services', (SELECT coalesce(jsonb_agg(jsonb_build_object('key',t.service_key,'status',t.status,'requests',t.request_count) ORDER BY t.service_key),'[]')
      FROM geo_territory_services t WHERE t.territory_id=_tid),
    'terms', (SELECT coalesce(jsonb_agg(jsonb_build_object('raw',r.raw,'slug',r.slug,'count',r.n) ORDER BY r.slug),'[]') FROM (
      SELECT min(btrim(x)) raw, seo_slugify(x) slug, count(*)::int n
      FROM public.submissions s JOIN public.fx_live(s.id) ON true CROSS JOIN LATERAL unnest(coalesce(s.materials,'{}'::text[])) x
      WHERE s.territory_id=_tid AND nullif(btrim(x),'') IS NOT NULL AND seo_slugify(x) <> 'je-ne-suis-pas-certain'
      GROUP BY seo_slugify(x)) r),
    'pages', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug',p.slug,'status',p.status,'noindex',p.noindex,'published_at',p.published_at,
        'material_slug',p.material_slug,'service_slug',p.service_slug) ORDER BY p.slug),'[]') FROM seo_pages p WHERE p.city_slug=_city_slug)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.seo_city_coverage_all()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  RETURN (
  WITH registry AS (
    SELECT DISTINCT ON (g.seo_city_slug) g.id AS tid, g.seo_city_slug AS slug, c.name
    FROM geo_territories g JOIN seo_cities c ON c.slug=g.seo_city_slug AND c.active
    WHERE g.type='municipalite' AND g.status='active' AND g.seo_city_slug IS NOT NULL
    ORDER BY g.seo_city_slug, g.request_count DESC, g.id
  ),
  -- Règle validée Terre / Terre mélangée → Remblai : une demande distincte compte une fois,
  -- seulement si le contexte est clairement du remplissage (lecture seule, aucune écriture).
  terre AS (
    SELECT s.territory_id AS tid, count(DISTINCT s.id)::int AS n
    FROM public.submissions s JOIN public.fx_live(s.id) ON true
    CROSS JOIN LATERAL (SELECT lower(coalesce(s.description,'')||' '||coalesce(s.other_material,'')) AS d) t
    WHERE EXISTS (SELECT 1 FROM unnest(coalesce(s.materials,'{}'::text[])) x
                  WHERE seo_slugify(x) IN ('terre','terre-melangee','terre-melange','terre-melanger','terre-melamge'))
      AND s.contamination IS NULL
      AND regexp_replace(t.d,'(non|pas|sans|aucun\w*|z[ée]ro)\W+(\w+\W+){0,4}contamin\w*|non-?contamin\w*',' ','g') !~ 'contamin'
      AND s.request_type='remblai'
      AND coalesce(s.service_type,'') <> 'remblai_disposition'
      AND coalesce(s.deliver_or_remove,'') !~* 'sortir'
      AND t.d !~ 'pelouse|semences? [àa] gazon|terre [àa] gazon|poserons du gazon'
      AND t.d !~ 'v[ée]g[ée]tal|terre noire|top ?soil|jardin|gazon|potager|tourbe|semence'
      AND (s.service_type IS NULL OR s.service_type='materiel_remplissage')
    GROUP BY s.territory_id
  )
  SELECT jsonb_build_object(
    'computed_at', now(),
    'materials', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug',m.slug,'name',m.name,
        'keys', (SELECT jsonb_agg(DISTINCT k) FROM unnest(array[seo_slugify(m.name)] || coalesce((SELECT array_agg(seo_slugify(x)) FROM unnest(coalesce(m.keywords,'{}'::text[])) x),'{}')) k)
      ) ORDER BY m.sort_order, m.slug),'[]') FROM seo_materials m WHERE m.active),
    'services', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug',s.slug,'name',s.name) ORDER BY s.slug),'[]') FROM seo_services s WHERE s.active),
    'cities', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'city_slug', r.slug, 'city_name', r.name,
        'terre_remblai', coalesce((SELECT te.n FROM terre te WHERE te.tid=r.tid),0),
        'territory_services', (SELECT coalesce(jsonb_agg(jsonb_build_object('key',t.service_key,'status',t.status,'requests',t.request_count)),'[]') FROM geo_territory_services t WHERE t.territory_id=r.tid),
        'terms', (SELECT coalesce(jsonb_agg(jsonb_build_object('raw',q.raw,'slug',q.slug,'count',q.n)),'[]') FROM (
            SELECT min(btrim(x)) raw, seo_slugify(x) slug, count(*)::int n
            FROM public.submissions s JOIN public.fx_live(s.id) ON true CROSS JOIN LATERAL unnest(coalesce(s.materials,'{}'::text[])) x
            WHERE s.territory_id=r.tid AND nullif(btrim(x),'') IS NOT NULL AND seo_slugify(x) <> 'je-ne-suis-pas-certain'
            GROUP BY seo_slugify(x)) q),
        'pages', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug',p.slug,'status',p.status,'noindex',p.noindex,'published_at',p.published_at,'material_slug',p.material_slug,'service_slug',p.service_slug)),'[]') FROM seo_pages p WHERE p.city_slug=r.slug)
      ) ORDER BY r.slug),'[]') FROM registry r)
  ));
END $function$;

CREATE OR REPLACE FUNCTION public.seo_terre_remblai_requests()
 RETURNS TABLE(tid uuid, n integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.territory_id AS tid, count(DISTINCT s.id)::int AS n
  FROM public.submissions s JOIN public.fx_live(s.id) ON true
  CROSS JOIN LATERAL (SELECT lower(coalesce(s.description,'')||' '||coalesce(s.other_material,'')) AS d) t
  WHERE s.territory_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM unnest(coalesce(s.materials,'{}'::text[])) x
                WHERE seo_slugify(x) IN ('terre','terre-melangee','terre-melange','terre-melanger','terre-melamge'))
    AND s.contamination IS NULL
    AND regexp_replace(t.d,'(non|pas|sans|aucun\w*|z[ée]ro)\W+(\w+\W+){0,4}contamin\w*|non-?contamin\w*',' ','g') !~ 'contamin'
    AND s.request_type='remblai'
    AND coalesce(s.service_type,'') <> 'remblai_disposition'
    AND coalesce(s.deliver_or_remove,'') !~* 'sortir'
    AND t.d !~ 'pelouse|semences? [àa] gazon|terre [àa] gazon|poserons du gazon'
    AND t.d !~ 'v[ée]g[ée]tal|terre noire|top ?soil|jardin|gazon|potager|tourbe|semence'
    AND (s.service_type IS NULL OR s.service_type='materiel_remplissage')
  GROUP BY s.territory_id
$function$;