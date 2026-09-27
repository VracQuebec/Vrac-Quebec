ALTER TABLE public.ent_crm_clients ADD COLUMN IF NOT EXISTS jsc_client_id uuid REFERENCES public.jsc_clients(id);
CREATE UNIQUE INDEX IF NOT EXISTS ent_crm_clients_jsc_link_uq ON public.ent_crm_clients(company_id, jsc_client_id) WHERE jsc_client_id IS NOT NULL;
COMMENT ON COLUMN public.ent_crm_clients.jsc_client_id IS 'Lien stable vers jsc_clients (source d''autorité de l''identité). Champs d''identité synchronisés, jamais saisis en double.';

CREATE OR REPLACE FUNCTION public.entcrm_jsc_link_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsc_clients;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.jsc_client_id IS NOT NULL AND NEW.jsc_client_id IS DISTINCT FROM OLD.jsc_client_id THEN
    RAISE EXCEPTION 'Lien client Transport JSC non modifiable';
  END IF;
  IF NEW.jsc_client_id IS NOT NULL THEN
    SELECT * INTO j FROM jsc_clients WHERE id = NEW.jsc_client_id;
    IF j.id IS NULL OR j.company_id IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Client hors entreprise'; END IF;
    NEW.name := j.name; NEW.phone := j.phone; NEW.email := j.email; NEW.address := j.billing_address; NEW.city := j.city;
    NEW.kind := CASE WHEN j.client_type IN ('particulier','entreprise','organisme') THEN j.client_type ELSE coalesce(NEW.kind,'entreprise') END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS entcrm_jsc_link_guard ON public.ent_crm_clients;
CREATE TRIGGER entcrm_jsc_link_guard BEFORE INSERT OR UPDATE ON public.ent_crm_clients FOR EACH ROW EXECUTE FUNCTION public.entcrm_jsc_link_guard();

CREATE OR REPLACE FUNCTION public.entcrm_jsc_candidates(_company_id uuid)
RETURNS TABLE(jsc_client_id uuid, name text, contact_name text, phone text, email text, city text, linked_client_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.entcrm_can_write(_company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN QUERY SELECT j.id, j.name, j.contact_name, j.phone, j.email, j.city,
    (SELECT c.id FROM ent_crm_clients c WHERE c.company_id = _company_id AND c.jsc_client_id = j.id)
  FROM jsc_clients j WHERE j.company_id = _company_id AND j.archived_at IS NULL ORDER BY j.name;
END $$;

CREATE OR REPLACE FUNCTION public.entcrm_link_jsc_client(_company_id uuid, _jsc_client_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  IF NOT public.entcrm_can_write(_company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT id INTO cid FROM ent_crm_clients WHERE company_id = _company_id AND jsc_client_id = _jsc_client_id;
  IF cid IS NOT NULL THEN RETURN cid; END IF;
  INSERT INTO ent_crm_clients(company_id, name, jsc_client_id, notes)
  VALUES (_company_id, '-', _jsc_client_id, 'Rattaché explicitement au dossier client Transport JSC') RETURNING id INTO cid;
  RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION public.entcrm_jsc_client_refs(_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c ent_crm_clients;
BEGIN
  SELECT * INTO c FROM ent_crm_clients WHERE id = _client_id;
  IF c.id IS NULL OR NOT public.entcrm_can_read(c.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF c.jsc_client_id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'requests', (SELECT count(*) FROM jsc_requests WHERE client_id = c.jsc_client_id),
    'quotes', (SELECT count(*) FROM jsc_quotes WHERE client_id = c.jsc_client_id),
    'orders', (SELECT count(*) FROM jsc_orders WHERE client_id = c.jsc_client_id),
    'invoices', (SELECT count(*) FROM jsc_invoices WHERE client_id = c.jsc_client_id));
END $$;

REVOKE ALL ON FUNCTION public.entcrm_jsc_candidates(uuid), public.entcrm_link_jsc_client(uuid,uuid), public.entcrm_jsc_client_refs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entcrm_jsc_candidates(uuid), public.entcrm_link_jsc_client(uuid,uuid), public.entcrm_jsc_client_refs(uuid) TO authenticated;