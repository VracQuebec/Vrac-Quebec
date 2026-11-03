ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS origin_table text, ADD COLUMN IF NOT EXISTS origin_record_id uuid;
ALTER TABLE public.submissions ADD CONSTRAINT submissions_origin_table_chk
  CHECK (origin_table IS NULL OR origin_table IN ('transport_requests','mkt_quote_requests','jsc_requests'));
CREATE UNIQUE INDEX IF NOT EXISTS submissions_origin_uniq ON public.submissions(origin_table, origin_record_id) WHERE origin_record_id IS NOT NULL;
COMMENT ON COLUMN public.submissions.origin_table IS 'Dossier opérationnel lié (vue spécialisée) : une demande, plusieurs vues.';

CREATE TABLE public.crm_intake_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_table text NOT NULL,
  origin_record_id uuid NOT NULL,
  stage text NOT NULL,
  error text,
  attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_submission_id uuid,
  UNIQUE (origin_table, origin_record_id)
);
GRANT SELECT ON public.crm_intake_failures TO authenticated;
GRANT ALL ON public.crm_intake_failures TO service_role;
ALTER TABLE public.crm_intake_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins lisent les échecs de transfert CRM" ON public.crm_intake_failures
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.crm_intake_record_failure(p_table text, p_id uuid, p_stage text, p_error text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.crm_intake_failures(origin_table, origin_record_id, stage, error)
  VALUES (p_table, p_id, left(p_stage, 60), left(p_error, 1000))
  ON CONFLICT (origin_table, origin_record_id) DO UPDATE
    SET attempts = crm_intake_failures.attempts + 1, last_attempt_at = now(),
        error = excluded.error, stage = excluded.stage, resolved_at = NULL;
$$;

CREATE OR REPLACE FUNCTION public.crm_intake_mirror(p_table text, p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; t record; m record; j record; c record; v_closed boolean;
BEGIN
  SELECT id INTO v_id FROM submissions WHERE origin_table = p_table AND origin_record_id = p_id;
  IF v_id IS NOT NULL THEN
    UPDATE crm_intake_failures SET resolved_at = now(), resolved_submission_id = v_id
     WHERE origin_table = p_table AND origin_record_id = p_id AND resolved_at IS NULL;
    RETURN v_id;
  END IF;
  PERFORM set_config('vq.crm_intake', 'on', true);
  IF p_table = 'transport_requests' THEN
    SELECT * INTO t FROM transport_requests WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'dossier introuvable'; END IF;
    IF t.origin_submission_id IS NOT NULL THEN
      PERFORM set_config('vq.crm_intake', 'off', true);
      RETURN t.origin_submission_id;
    END IF;
    v_closed := t.status::text IN ('terminee','annulee','refusee');
    INSERT INTO submissions(materials, other_material, property_type, quantity, tonnage, address, postal_code, city,
      latitude, longitude, name, company, email, phone, description, request_type, service_type, desired_date,
      status, created_at, created_by, creation_origin, lead_source, lead_category, geocoding_status,
      origin_table, origin_record_id)
    VALUES (ARRAY[coalesce(nullif(t.material_type,''), 'Matériau à confirmer')], t.material_other, 'Non spécifié',
      coalesce(t.quantity::text || coalesce(' ' || t.quantity_unit, ''), ''), '',
      coalesce(t.site_address, ''), '', t.site_city, t.site_latitude, t.site_longitude,
      coalesce(nullif(t.client_name,''), t.client_company, 'Client à confirmer'), t.client_company,
      coalesce(t.client_email, ''), t.client_phone,
      concat_ws(E'\n',
        CASE WHEN t.request_kind = 'dump_access' THEN 'Demande d''accès à une dompe ' ELSE 'Demande de transport ' END || coalesce(t.request_number, ''),
        CASE WHEN t.dump_name IS NOT NULL THEN 'Dompe : ' || t.dump_name END,
        'Statut du dossier opérationnel : ' || t.status::text,
        nullif(t.client_notes, '')),
      'transport', CASE WHEN t.request_kind = 'dump_access' THEN 'acces_dompe' ELSE 'transport_livraison' END,
      t.desired_date, CASE WHEN v_closed THEN 'archivé' ELSE 'nouveau' END, t.created_at, t.user_id,
      'crm_intake', 'vracquebec.ca', 'transport',
      CASE WHEN t.site_latitude IS NOT NULL THEN 'ok' ELSE 'pending' END,
      p_table, p_id)
    ON CONFLICT (origin_table, origin_record_id) WHERE origin_record_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_id;
  ELSIF p_table = 'mkt_quote_requests' THEN
    SELECT * INTO m FROM mkt_quote_requests WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'dossier introuvable'; END IF;
    INSERT INTO submissions(materials, property_type, quantity, tonnage, address, postal_code, city, latitude, longitude,
      name, company, email, phone, description, request_type, service_type, desired_date, status, created_at,
      created_by, creation_origin, lead_source, lead_category, geocoding_status, origin_table, origin_record_id)
    VALUES (ARRAY[coalesce(nullif(m.title,''), 'Service à confirmer')], 'Non spécifié', '', '',
      coalesce(m.address, ''), coalesce(m.postal_code, ''), m.city, m.latitude, m.longitude,
      coalesce(nullif(m.contact_name,''), m.organization_name, 'Client à confirmer'), m.organization_name,
      coalesce(m.contact_email, ''), m.contact_phone,
      concat_ws(E'\n', 'Demande de services ' || coalesce(m.request_number, ''), m.title, nullif(m.description, '')),
      'services', 'place_de_marche', m.desired_date,
      CASE WHEN m.status IN ('annulee','fermee','archivee') OR m.archived_at IS NOT NULL THEN 'archivé' ELSE 'nouveau' END,
      m.created_at, m.client_user_id, 'crm_intake', 'vracquebec.ca', 'autre',
      CASE WHEN m.latitude IS NOT NULL THEN 'ok' ELSE 'pending' END, p_table, p_id)
    ON CONFLICT (origin_table, origin_record_id) WHERE origin_record_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_id;
  ELSIF p_table = 'jsc_requests' THEN
    SELECT * INTO j FROM jsc_requests WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'dossier introuvable'; END IF;
    SELECT * INTO c FROM jsc_clients WHERE id = j.client_id;
    INSERT INTO submissions(materials, property_type, quantity, tonnage, address, postal_code, city, latitude, longitude,
      name, company, email, phone, description, request_type, service_type, desired_date, status, created_at,
      creation_origin, lead_source, lead_category, geocoding_status, origin_table, origin_record_id)
    VALUES (ARRAY[coalesce(nullif(j.custom_material_description,''), 'Matériau à confirmer')], 'Non spécifié',
      coalesce(j.quantity::text || coalesce(' ' || j.quantity_unit, ''), ''),
      CASE WHEN j.quantity_unit = 'tonne' THEN coalesce(j.quantity::text, '') ELSE '' END,
      coalesce(j.delivery_address, ''), coalesce(j.postal_code, ''), j.city, j.latitude, j.longitude,
      coalesce(nullif(c.contact_name,''), c.name, 'Client à confirmer'), CASE WHEN c.client_type = 'entreprise' THEN c.name END,
      coalesce(c.email, ''), c.phone,
      concat_ws(E'\n', 'Soumission ' || coalesce(j.request_number, ''), nullif(j.notes, '')),
      'vrac', 'vrac_achat', j.desired_date, 'nouveau', j.created_at, 'crm_intake', 'vracquebec.ca', 'autre',
      CASE WHEN j.latitude IS NOT NULL THEN 'ok' ELSE 'pending' END, p_table, p_id)
    ON CONFLICT (origin_table, origin_record_id) WHERE origin_record_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'origine non prise en charge';
  END IF;
  PERFORM set_config('vq.crm_intake', 'off', true);
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM submissions WHERE origin_table = p_table AND origin_record_id = p_id;
  END IF;
  UPDATE crm_intake_failures SET resolved_at = now(), resolved_submission_id = v_id
   WHERE origin_table = p_table AND origin_record_id = p_id AND resolved_at IS NULL;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.crm_intake_mirror(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_intake_record_failure(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_intake_mirror(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_intake_record_failure(text, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.crm_intake_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.crm_intake_mirror(TG_TABLE_NAME, NEW.id);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.crm_intake_record_failure(TG_TABLE_NAME, NEW.id, 'insert', SQLERRM);
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER zzz_crm_intake AFTER INSERT ON public.transport_requests FOR EACH ROW EXECUTE FUNCTION public.crm_intake_on_insert();
CREATE TRIGGER zzz_crm_intake AFTER INSERT ON public.mkt_quote_requests FOR EACH ROW EXECUTE FUNCTION public.crm_intake_on_insert();

CREATE OR REPLACE FUNCTION public.crm_intake_link(p_submission uuid, p_table text, p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE submissions SET origin_table = p_table, origin_record_id = p_id
   WHERE id = p_submission AND origin_record_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM submissions s2 WHERE s2.origin_table = p_table AND s2.origin_record_id = p_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE crm_intake_failures SET resolved_at = now(), resolved_submission_id = p_submission
   WHERE origin_table = p_table AND origin_record_id = p_id AND resolved_at IS NULL;
  RETURN n > 0 OR EXISTS (SELECT 1 FROM submissions WHERE id = p_submission AND origin_table = p_table AND origin_record_id = p_id);
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
     WHERE j.source IN ('soumission_web','soumission_web_manuelle','rappel')
       AND j.created_at < now() - interval '10 minutes'
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
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.crm_intake_record_failure(p_table, p_id, 'retry', SQLERRM);
    RETURN NULL;
  END;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.crm_intake_retry(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_intake_retry(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_submission_insert_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cat text;
  v_mat text;
  v_src text;
  v_med text;
  v_ref text;
BEGIN
  IF coalesce(current_setting('vq.crm_intake', true), '') = 'on' THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  NEW.status := 'nouveau';
  NEW.priority := 'normal';
  NEW.internal_notes := '';
  NEW.dompe_number := '';
  NEW.visible_to_entrepreneur := false;
  NEW.show_on_admin_map := true;
  NEW.assigned_entrepreneur := NULL;
  NEW.geocoding_status := 'pending';
  NEW.geocoding_provider := 'nominatim';
  NEW.formatted_address := NULL;
  NEW.place_id := NULL;
  NEW.location_type := NULL;
  NEW.latitude := NULL;
  NEW.longitude := NULL;
  NEW.postal_latitude := NULL;
  NEW.postal_longitude := NULL;
  NEW.latitude_old := NULL;
  NEW.longitude_old := NULL;
  NEW.postal_latitude_old := NULL;
  NEW.postal_longitude_old := NULL;
  NEW.creation_origin := 'public_form';
  NEW.created_by := NULL;

  NEW.utm_source := nullif(left(lower(trim(coalesce(NEW.utm_source, ''))), 80), '');
  NEW.utm_medium := nullif(left(lower(trim(coalesce(NEW.utm_medium, ''))), 80), '');
  NEW.utm_campaign := nullif(left(trim(coalesce(NEW.utm_campaign, '')), 120), '');
  NEW.landing_referrer := nullif(left(lower(trim(coalesce(NEW.landing_referrer, ''))), 300), '');

  v_src := coalesce(NEW.utm_source, '');
  v_med := coalesce(NEW.utm_medium, '');
  v_ref := coalesce(NEW.landing_referrer, '');

  IF v_src LIKE '%google%' OR v_ref LIKE '%google.%' THEN
    NEW.lead_source := CASE WHEN v_med IN ('organic', 'seo') OR v_src = '' THEN 'referencement_naturel' ELSE 'google' END;
  ELSIF v_src LIKE '%facebook%' OR v_src IN ('fb', 'meta') OR v_src LIKE '%instagram%'
        OR v_ref LIKE '%facebook.%' OR v_ref LIKE '%instagram.%' THEN
    NEW.lead_source := 'facebook';
  ELSIF v_med IN ('organic', 'seo') THEN
    NEW.lead_source := 'referencement_naturel';
  ELSIF v_src = 'page_locale' OR v_med = 'page_locale' THEN
    NEW.lead_source := 'pages_locales';
  ELSIF v_src <> '' OR NEW.utm_campaign IS NOT NULL THEN
    NEW.lead_source := 'campagne';
  ELSE
    NEW.lead_source := 'vracquebec.ca';
  END IF;

  v_mat := lower(coalesce(array_to_string(NEW.materials, ' '), '') || ' ' || coalesce(NEW.other_material, ''));

  IF NEW.service_type = 'remblai_disposition' OR NEW.deliver_or_remove ILIKE '%sortir%' THEN
    v_cat := 'excavation';
  ELSIF NEW.request_type = 'transport' THEN
    v_cat := 'transport';
  ELSIF v_mat LIKE '%terre%' THEN
    v_cat := 'terre';
  ELSIF v_mat LIKE '%sable%' THEN
    v_cat := 'sable';
  ELSIF v_mat LIKE '%gravier%' THEN
    v_cat := 'gravier';
  ELSIF v_mat LIKE '%pierre%' OR v_mat LIKE '%roche%' OR v_mat LIKE '%concass%' THEN
    v_cat := 'pierre';
  ELSIF v_mat LIKE '%remblai%' OR NEW.service_type = 'materiel_remplissage' OR NEW.request_type = 'remblai' THEN
    v_cat := 'remblai';
  ELSE
    v_cat := 'autre';
  END IF;

  NEW.lead_category := v_cat;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_notify_submission_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_num text := coalesce(NEW.dompe_number, NEW.submission_number::text, '');
  v_mat text := coalesce(array_to_string(NEW.materials, ', '), NEW.other_material, 'Matériau à confirmer');
BEGIN
  IF coalesce(current_setting('vq.crm_intake', true), '') = 'on' THEN RETURN NULL; END IF;
  PERFORM public.crm_notify(
    'lead:new:' || NEW.id::text, 'lead', 'lead_new', 'importante',
    'Nouveau lead reçu — ' || coalesce(NEW.name, 'Client à confirmer'),
    trim(both ' ' from concat_ws(' · ', nullif(v_mat,''), nullif(coalesce(NEW.quantity, NEW.tonnage::text),''),
         nullif(coalesce(NEW.city, NEW.address),''))),
    'submission', NEW.id, '/admin?lead=' || NEW.id::text,
    NEW.name, nullif(v_num,''), now(),
    jsonb_build_object('phone', NEW.phone, 'email', NEW.email, 'address', NEW.address,
                       'material', v_mat, 'request_type', NEW.request_type),
    true
  );
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_followups_on_new_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_type text := CASE TG_TABLE_NAME WHEN 'submissions' THEN 'submission' ELSE 'transport_request' END;
  v_email text := CASE TG_TABLE_NAME WHEN 'submissions' THEN to_jsonb(NEW)->>'email' ELSE to_jsonb(NEW)->>'client_email' END;
  v_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'submissions' AND coalesce(current_setting('vq.crm_intake', true), '') = 'on' THEN RETURN NULL; END IF;
  INSERT INTO public.request_followups(entity_type, entity_id, received_at, is_test)
  VALUES (v_type, NEW.id, coalesce(NEW.created_at, now()), coalesce(v_email ILIKE '%@test.invalid', false))
  ON CONFLICT (entity_type, entity_id) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.request_followup_events(followup_id, entity_type, entity_id, action, detail)
    VALUES (v_id, v_type, NEW.id, 'recue', jsonb_build_object('source', TG_TABLE_NAME));
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'request_followups_on_new_request: %', SQLERRM;
  RETURN NULL;
END $function$;