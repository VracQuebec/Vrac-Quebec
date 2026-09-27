DROP POLICY IF EXISTS i ON public.ent_crm_saved_views;
CREATE POLICY i ON public.ent_crm_saved_views FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.entcrm_can_write(company_id));
DROP POLICY IF EXISTS u ON public.ent_crm_saved_views;
CREATE POLICY u ON public.ent_crm_saved_views FOR UPDATE TO authenticated USING (user_id = auth.uid() AND public.entcrm_can_write(company_id)) WITH CHECK (user_id = auth.uid() AND public.entcrm_can_write(company_id));
DROP POLICY IF EXISTS d ON public.ent_crm_saved_views;
CREATE POLICY d ON public.ent_crm_saved_views FOR DELETE TO authenticated USING (user_id = auth.uid() AND public.entcrm_can_write(company_id));
GRANT UPDATE ON public.ent_crm_saved_views TO authenticated;

CREATE TABLE public.ent_crm_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  title text, description text,
  category text NOT NULL DEFAULT 'autre' CHECK (category IN ('avant_travaux','apres_travaux','plan','devis','bon_livraison','billet_pesee','autre')),
  is_field boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  CHECK (mime_type IN ('image/jpeg','image/png','image/webp','image/heic','application/pdf')),
  CHECK (storage_path LIKE 'company/' || company_id::text || '/%')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ent_crm_files TO authenticated;
GRANT ALL ON public.ent_crm_files TO service_role;
ALTER TABLE public.ent_crm_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.ent_crm_files FOR SELECT TO authenticated USING (public.entcrm_can_commercial(company_id) OR (is_field AND public.entcrm_can_field(company_id)));
CREATE POLICY i ON public.ent_crm_files FOR INSERT TO authenticated WITH CHECK (public.entcrm_can_write(company_id));
CREATE POLICY u ON public.ent_crm_files FOR UPDATE TO authenticated USING (public.entcrm_can_write(company_id)) WITH CHECK (public.entcrm_can_write(company_id));
CREATE POLICY d ON public.ent_crm_files FOR DELETE TO authenticated USING (public.entcrm_can_admin(company_id));

CREATE TABLE public.ent_crm_file_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  file_id uuid NOT NULL REFERENCES public.ent_crm_files(id) ON DELETE CASCADE,
  owner_type text NOT NULL CHECK (owner_type IN ('lead','client','quote','project')),
  owner_id uuid NOT NULL,
  client_visible boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, owner_type, owner_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ent_crm_file_links TO authenticated;
GRANT ALL ON public.ent_crm_file_links TO service_role;
ALTER TABLE public.ent_crm_file_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.ent_crm_file_links FOR SELECT TO authenticated USING (public.entcrm_can_commercial(company_id) OR (owner_type='project' AND public.entcrm_can_field(company_id)));
CREATE POLICY i ON public.ent_crm_file_links FOR INSERT TO authenticated WITH CHECK (public.entcrm_can_write(company_id));
CREATE POLICY u ON public.ent_crm_file_links FOR UPDATE TO authenticated USING (public.entcrm_can_write(company_id)) WITH CHECK (public.entcrm_can_write(company_id));
CREATE POLICY d ON public.ent_crm_file_links FOR DELETE TO authenticated USING (public.entcrm_can_write(company_id));

CREATE OR REPLACE FUNCTION public.entcrm_file_link_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c uuid;
BEGIN
  SELECT company_id INTO c FROM ent_crm_files WHERE id = NEW.file_id;
  IF c IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Fichier hors entreprise'; END IF;
  EXECUTE format('SELECT company_id FROM %I WHERE id = $1',
    CASE NEW.owner_type WHEN 'lead' THEN 'ent_crm_leads' WHEN 'client' THEN 'ent_crm_clients' WHEN 'quote' THEN 'ent_crm_quotes' ELSE 'ent_crm_projects' END)
    INTO c USING NEW.owner_id;
  IF c IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Dossier hors entreprise'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER entcrm_file_link_guard BEFORE INSERT OR UPDATE ON public.ent_crm_file_links FOR EACH ROW EXECUTE FUNCTION public.entcrm_file_link_guard();

CREATE OR REPLACE FUNCTION public.entcrm_path_company(_path text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN split_part(_path,'/',1)='company' AND split_part(_path,'/',2) ~ '^[0-9a-f-]{36}$' THEN split_part(_path,'/',2)::uuid END $$;

CREATE POLICY "entcrm files read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id='entcrm-files' AND EXISTS (SELECT 1 FROM public.ent_crm_files f WHERE f.storage_path = name));
CREATE POLICY "entcrm files insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='entcrm-files' AND public.entcrm_can_write(public.entcrm_path_company(name))
  AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','heic','pdf'));
CREATE POLICY "entcrm files delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id='entcrm-files' AND public.entcrm_can_admin(public.entcrm_path_company(name)));

CREATE TABLE public.ent_crm_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  label text NOT NULL, description text,
  trades text[] NOT NULL DEFAULT '{}',
  unit text NOT NULL CHECK (unit IN ('heure','voyage','tonne','m3','m2','ml','unite','forfait')),
  price numeric CHECK (price IS NULL OR price >= 0),
  price_zero_confirmed boolean NOT NULL DEFAULT false,
  inclusions text, exclusions text, valid_until date,
  material_id uuid, equipment_ref text,
  private_notes text,
  is_demo boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (price IS DISTINCT FROM 0 OR price_zero_confirmed)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ent_crm_services TO authenticated;
GRANT ALL ON public.ent_crm_services TO service_role;
ALTER TABLE public.ent_crm_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.ent_crm_services FOR SELECT TO authenticated USING (public.entcrm_can_commercial(company_id));
CREATE POLICY i ON public.ent_crm_services FOR INSERT TO authenticated WITH CHECK (public.entcrm_can_write(company_id));
CREATE POLICY u ON public.ent_crm_services FOR UPDATE TO authenticated USING (public.entcrm_can_write(company_id)) WITH CHECK (public.entcrm_can_write(company_id));
CREATE POLICY d ON public.ent_crm_services FOR DELETE TO authenticated USING (public.entcrm_can_admin(company_id));

CREATE TABLE public.ent_crm_service_costs (
  service_id uuid PRIMARY KEY REFERENCES public.ent_crm_services(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  internal_cost numeric CHECK (internal_cost IS NULL OR internal_cost >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ent_crm_service_costs TO authenticated;
GRANT ALL ON public.ent_crm_service_costs TO service_role;
ALTER TABLE public.ent_crm_service_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.ent_crm_service_costs FOR SELECT TO authenticated USING (coalesce(public.entcrm_role(company_id),'') IN ('support','proprietaire','gestionnaire','comptabilite'));
CREATE POLICY w ON public.ent_crm_service_costs FOR ALL TO authenticated USING (coalesce(public.entcrm_role(company_id),'') IN ('support','proprietaire','gestionnaire')) WITH CHECK (coalesce(public.entcrm_role(company_id),'') IN ('support','proprietaire','gestionnaire') AND company_id = (SELECT s.company_id FROM public.ent_crm_services s WHERE s.id = service_id));

CREATE TABLE public.ent_crm_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  trade text NOT NULL, name text NOT NULL,
  lines jsonb NOT NULL DEFAULT '[]',
  inclusions text, exclusions text, conditions text,
  archived_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ent_crm_templates TO authenticated;
GRANT ALL ON public.ent_crm_templates TO service_role;
ALTER TABLE public.ent_crm_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.ent_crm_templates FOR SELECT TO authenticated USING (public.entcrm_can_commercial(company_id));
CREATE POLICY i ON public.ent_crm_templates FOR INSERT TO authenticated WITH CHECK (public.entcrm_can_write(company_id));
CREATE POLICY u ON public.ent_crm_templates FOR UPDATE TO authenticated USING (public.entcrm_can_write(company_id)) WITH CHECK (public.entcrm_can_write(company_id));
CREATE POLICY d ON public.ent_crm_templates FOR DELETE TO authenticated USING (public.entcrm_can_admin(company_id));

CREATE TABLE public.ent_crm_network_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
  source_type text NOT NULL CHECK (source_type IN ('submission','transport_request')),
  source_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.ent_crm_leads(id),
  source_fingerprint text,
  source_snapshot jsonb,
  source_checked_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, source_type, source_id)
);
GRANT SELECT ON public.ent_crm_network_links TO authenticated;
GRANT ALL ON public.ent_crm_network_links TO service_role;
ALTER TABLE public.ent_crm_network_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.ent_crm_network_links FOR SELECT TO authenticated USING (public.entcrm_can_commercial(company_id));

CREATE OR REPLACE FUNCTION public.entcrm_network_source(_type text, _id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE j jsonb;
BEGIN
  IF _type = 'submission' THEN
    SELECT jsonb_build_object('number', s.dompe_number, 'city', s.city, 'status', s.status, 'materials', s.materials, 'tonnage', s.tonnage) INTO j FROM submissions s WHERE s.id = _id;
  ELSIF _type = 'transport_request' THEN
    SELECT jsonb_build_object('number', t.request_number, 'status', t.status) INTO j FROM transport_requests t WHERE t.id = _id;
  END IF;
  RETURN j;
END $$;

CREATE OR REPLACE FUNCTION public.entcrm_insert_network_link(_company_id uuid, _type text, _id uuid, _lead uuid, _snap jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.entcrm_can_write(_company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF NOT EXISTS (SELECT 1 FROM ent_crm_leads WHERE id=_lead AND company_id=_company_id AND network_ref = _type || ':' || _id) THEN RAISE EXCEPTION 'Dossier hors entreprise'; END IF;
  INSERT INTO ent_crm_network_links (company_id, source_type, source_id, lead_id, source_fingerprint, source_snapshot, source_checked_at)
  VALUES (_company_id, _type, _id, _lead, md5(_snap::text), _snap, now());
END $$;
REVOKE EXECUTE ON FUNCTION public.entcrm_insert_network_link(uuid,text,uuid,uuid,jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.entcrm_insert_network_link(uuid,text,uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.entcrm_track_network(_company_id uuid, _type text, _id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE snap jsonb; existing uuid; lid uuid;
BEGIN
  IF NOT public.entcrm_can_write(_company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  SELECT lead_id INTO existing FROM ent_crm_network_links WHERE company_id=_company_id AND source_type=_type AND source_id=_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  snap := public.entcrm_network_source(_type, _id);
  IF snap IS NULL THEN RAISE EXCEPTION 'Demande non autorisée' USING ERRCODE='42501'; END IF;
  INSERT INTO ent_crm_leads (company_id, title, source, stage, need, network_ref, owner_user_id, next_action)
  VALUES (_company_id, 'Demande réseau ' || coalesce(snap->>'number',''), 'vrac_quebec', 'nouveau',
          concat_ws(' · ', snap->>'city', snap->>'tonnage'), _type || ':' || _id, auth.uid(), 'Évaluer la demande')
  RETURNING id INTO lid;
  PERFORM public.entcrm_insert_network_link(_company_id, _type, _id, lid, snap);
  RETURN lid;
END $$;

CREATE OR REPLACE FUNCTION public.entcrm_network_check(_link_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE l record; snap jsonb;
BEGIN
  SELECT * INTO l FROM ent_crm_network_links WHERE id=_link_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Introuvable' USING ERRCODE='42501'; END IF;
  snap := public.entcrm_network_source(l.source_type, l.source_id);
  IF snap IS NULL THEN RETURN jsonb_build_object('state','revoked'); END IF;
  RETURN jsonb_build_object('state', CASE WHEN md5(snap::text) = l.source_fingerprint THEN 'current' ELSE 'update_available' END, 'source', snap);
END $$;

CREATE OR REPLACE FUNCTION public.entcrm_jsc_attach_preview() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM jsc_clients),
    'by_company', (SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT c.company_id, co.name, count(*) n FROM jsc_clients c LEFT JOIN jsc_companies co ON co.id=c.company_id GROUP BY 1,2) x),
    'jsc_candidates', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') FROM jsc_companies WHERE name ILIKE '%jsc%'),
    'already_linked', (SELECT count(*) FROM ent_crm_clients WHERE jsc_client_id IS NOT NULL),
    'possible_matches', (SELECT count(*) FROM jsc_clients j JOIN ent_crm_clients e ON e.company_id=j.company_id AND e.jsc_client_id IS NULL AND (lower(e.email)=lower(j.email) OR regexp_replace(e.phone,'\D','','g')=regexp_replace(j.phone,'\D','','g')))
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.entcrm_jsc_attach_preview() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.entcrm_jsc_attach_preview() TO authenticated;