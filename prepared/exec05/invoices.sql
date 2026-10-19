-- PREPARED ONLY. Apply solely to an authorized isolated environment, never shared Cloud.
-- Extend existing invoices, no second invoice or receipt ledger.
ALTER TABLE public.fin_invoices ADD COLUMN IF NOT EXISTS draft_create_key text;
CREATE UNIQUE INDEX IF NOT EXISTS fin_invoice_draft_key_uq ON public.fin_invoices(company_id,draft_create_key) WHERE draft_create_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fin_invoice_draft_create(_company uuid, _key text, _client uuid DEFAULT NULL, _project uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid; i fin_invoices; c ent_crm_clients; p ent_crm_projects;
BEGIN
  IF NOT public.fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _key IS NULL OR length(btrim(_key)) < 8 OR length(_key) > 200 THEN RAISE EXCEPTION 'Clé requise' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fin_draft:'||_company::text||':'||_key));
  SELECT * INTO i FROM fin_invoices WHERE company_id=_company AND draft_create_key=_key;
  IF FOUND THEN
    IF i.client_id IS DISTINCT FROM _client OR i.project_id IS DISTINCT FROM _project THEN RAISE EXCEPTION 'Clé utilisée pour une autre facture' USING ERRCODE='P0409'; END IF;
    RETURN i.id;
  END IF;
  IF _client IS NOT NULL THEN
    SELECT * INTO c FROM ent_crm_clients WHERE id=_client AND company_id=_company AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Client inaccessible' USING ERRCODE='42501'; END IF;
  END IF;
  IF _project IS NOT NULL THEN
    SELECT * INTO p FROM ent_crm_projects WHERE id=_project AND company_id=_company AND archived_at IS NULL;
    IF NOT FOUND OR (_client IS NOT NULL AND p.client_id IS DISTINCT FROM _client) THEN RAISE EXCEPTION 'Chantier inaccessible ou client incompatible' USING ERRCODE='42501'; END IF;
    IF _client IS NULL AND p.client_id IS NOT NULL THEN SELECT * INTO c FROM ent_crm_clients WHERE id=p.client_id AND company_id=_company AND archived_at IS NULL; END IF;
  END IF;
  INSERT INTO fin_invoices(company_id,draft_create_key,client_id,project_id,client_name,client_email,client_phone,client_address,issue_date,terms,lines)
  VALUES(_company,_key,c.id,_project,c.name,c.email,c.phone,nullif(concat_ws(', ',nullif(c.address,''),nullif(c.city,'')),''),(now() AT TIME ZONE 'America/Toronto')::date,
    (SELECT default_terms FROM fin_invoice_settings WHERE company_id=_company), '[{"desc":"","qty":1,"unit":"unité","price":null,"tax":null}]') RETURNING id INTO v;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.fin_invoice_draft_create(uuid,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_invoice_draft_create(uuid,text,uuid,uuid) TO authenticated,service_role;

-- Enrich quote conversion only at initial insertion; issued documents never reread CRM identity.
CREATE OR REPLACE FUNCTION public.fin_invoice_quote_context() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c ent_crm_clients; p uuid;
BEGIN
  IF NEW.quote_id IS NOT NULL AND NEW.status='brouillon' THEN
    SELECT * INTO c FROM ent_crm_clients WHERE id=NEW.client_id AND company_id=NEW.company_id;
    NEW.client_address := coalesce(NEW.client_address,nullif(concat_ws(', ',nullif(c.address,''),nullif(c.city,'')),''));
    SELECT id INTO p FROM ent_crm_projects WHERE quote_id=NEW.quote_id AND company_id=NEW.company_id AND archived_at IS NULL ORDER BY created_at,id LIMIT 1;
    NEW.project_id := coalesce(NEW.project_id,p);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fin_invoice_quote_context BEFORE INSERT ON public.fin_invoices FOR EACH ROW EXECUTE FUNCTION public.fin_invoice_quote_context();