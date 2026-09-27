
CREATE OR REPLACE FUNCTION public.entcrm_role(_company_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.has_role(auth.uid(),'admin') THEN 'support'
  ELSE (SELECT m.role FROM public.jsc_company_members m WHERE m.company_id=_company_id AND m.user_id=auth.uid() AND m.is_active AND m.archived_at IS NULL LIMIT 1) END
$$;
CREATE OR REPLACE FUNCTION public.entcrm_can_read(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.entcrm_role(_company_id) IS NOT NULL $$;
CREATE OR REPLACE FUNCTION public.entcrm_can_write(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.entcrm_role(_company_id) IN ('support','proprietaire','gestionnaire') $$;
CREATE OR REPLACE FUNCTION public.entcrm_can_field(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.entcrm_role(_company_id) IN ('support','proprietaire','gestionnaire','mecanicien','chauffeur') $$;
CREATE OR REPLACE FUNCTION public.entcrm_can_finance(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.entcrm_role(_company_id) IN ('support','proprietaire','gestionnaire','comptabilite') $$;
CREATE OR REPLACE FUNCTION public.entcrm_can_admin(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.entcrm_role(_company_id) IN ('support','proprietaire') $$;

CREATE TABLE public.ent_crm_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'particulier' CHECK (kind IN ('particulier','entreprise','organisme')),
  name text NOT NULL, phone text, email text, address text, city text, notes text,
  owner_user_id uuid, archived_at timestamptz,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ent_crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.ent_crm_clients(id) ON DELETE CASCADE,
  name text NOT NULL, role text, phone text, email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ent_crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.ent_crm_clients(id) ON DELETE SET NULL,
  title text NOT NULL, contact_name text, contact_value text,
  need text, source text NOT NULL DEFAULT 'autre' CHECK (source IN ('appel','reference','facebook','site','courriel','import','vrac_quebec','autre')),
  trade text, trade_fields jsonb NOT NULL DEFAULT '{}',
  stage text NOT NULL DEFAULT 'nouveau', priority text NOT NULL DEFAULT 'normale',
  estimated_amount numeric, lost_reason text,
  next_action text, next_action_at timestamptz, owner_user_id uuid,
  network_ref text, archived_at timestamptz,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ent_crm_leads_network_uniq ON public.ent_crm_leads(company_id, network_ref) WHERE network_ref IS NOT NULL;
CREATE TABLE public.ent_crm_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.ent_crm_clients(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.ent_crm_leads(id) ON DELETE SET NULL,
  number text, version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','remise','acceptee','refusee')),
  lines jsonb NOT NULL DEFAULT '[]', inclusions text, exclusions text, conditions text, valid_until date,
  subtotal numeric NOT NULL DEFAULT 0,
  accepted_source text, accepted_by_name text, accepted_at timestamptz, accepted_recorded_by uuid,
  invoiced_amount numeric, paid_amount numeric,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ent_crm_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.ent_crm_clients(id) ON DELETE SET NULL,
  quote_id uuid UNIQUE REFERENCES public.ent_crm_quotes(id) ON DELETE SET NULL,
  name text NOT NULL, address text, start_date date, end_date date,
  status text NOT NULL DEFAULT 'a_planifier', owner_user_id uuid, archived_at timestamptz,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ent_crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  title text NOT NULL, due_at timestamptz, assignee_user_id uuid,
  lead_id uuid REFERENCES public.ent_crm_leads(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.ent_crm_clients(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.ent_crm_projects(id) ON DELETE CASCADE,
  done_at timestamptz, result text,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ent_crm_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  entity text NOT NULL, entity_id uuid, action text NOT NULL,
  before jsonb, after jsonb,
  actor_id uuid DEFAULT auth.uid(), origin text NOT NULL DEFAULT 'entreprise',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ent_crm_clients, public.ent_crm_contacts, public.ent_crm_leads, public.ent_crm_quotes, public.ent_crm_projects, public.ent_crm_tasks TO authenticated;
GRANT SELECT ON public.ent_crm_history TO authenticated;
GRANT ALL ON public.ent_crm_clients, public.ent_crm_contacts, public.ent_crm_leads, public.ent_crm_quotes, public.ent_crm_projects, public.ent_crm_tasks, public.ent_crm_history TO service_role;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ent_crm_clients','ent_crm_contacts','ent_crm_leads','ent_crm_projects'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "r" ON public.%I FOR SELECT TO authenticated USING (public.entcrm_can_read(company_id))', t);
    EXECUTE format('CREATE POLICY "i" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.entcrm_can_write(company_id))', t);
    EXECUTE format('CREATE POLICY "u" ON public.%I FOR UPDATE TO authenticated USING (public.entcrm_can_write(company_id)) WITH CHECK (public.entcrm_can_write(company_id))', t);
    EXECUTE format('CREATE POLICY "d" ON public.%I FOR DELETE TO authenticated USING (public.entcrm_can_admin(company_id))', t);
  END LOOP;
END $$;
ALTER TABLE public.ent_crm_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "r" ON public.ent_crm_quotes FOR SELECT TO authenticated USING (public.entcrm_can_finance(company_id));
CREATE POLICY "i" ON public.ent_crm_quotes FOR INSERT TO authenticated WITH CHECK (public.entcrm_can_write(company_id));
CREATE POLICY "u" ON public.ent_crm_quotes FOR UPDATE TO authenticated USING (public.entcrm_can_write(company_id)) WITH CHECK (public.entcrm_can_write(company_id));
CREATE POLICY "d" ON public.ent_crm_quotes FOR DELETE TO authenticated USING (public.entcrm_can_admin(company_id));
ALTER TABLE public.ent_crm_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "r" ON public.ent_crm_tasks FOR SELECT TO authenticated USING (public.entcrm_can_write(company_id) OR (public.entcrm_can_read(company_id) AND assignee_user_id = auth.uid()));
CREATE POLICY "i" ON public.ent_crm_tasks FOR INSERT TO authenticated WITH CHECK (public.entcrm_can_write(company_id));
CREATE POLICY "u" ON public.ent_crm_tasks FOR UPDATE TO authenticated USING (public.entcrm_can_write(company_id) OR (public.entcrm_can_field(company_id) AND assignee_user_id = auth.uid())) WITH CHECK (public.entcrm_can_field(company_id));
CREATE POLICY "d" ON public.ent_crm_tasks FOR DELETE TO authenticated USING (public.entcrm_can_admin(company_id));
ALTER TABLE public.ent_crm_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "r" ON public.ent_crm_history FOR SELECT TO authenticated USING (public.entcrm_can_write(company_id));

-- Cohérence parent/enfant : même entreprise
CREATE OR REPLACE FUNCTION public.entcrm_same_company() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb := to_jsonb(NEW); c uuid;
BEGIN
  IF j ? 'client_id' AND j->>'client_id' IS NOT NULL THEN
    SELECT company_id INTO c FROM ent_crm_clients WHERE id=(j->>'client_id')::uuid;
    IF c IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Client hors entreprise'; END IF; END IF;
  IF j ? 'lead_id' AND j->>'lead_id' IS NOT NULL THEN
    SELECT company_id INTO c FROM ent_crm_leads WHERE id=(j->>'lead_id')::uuid;
    IF c IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Lead hors entreprise'; END IF; END IF;
  IF j ? 'quote_id' AND j->>'quote_id' IS NOT NULL THEN
    SELECT company_id INTO c FROM ent_crm_quotes WHERE id=(j->>'quote_id')::uuid;
    IF c IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Soumission hors entreprise'; END IF; END IF;
  IF j ? 'project_id' AND j->>'project_id' IS NOT NULL THEN
    SELECT company_id INTO c FROM ent_crm_projects WHERE id=(j->>'project_id')::uuid;
    IF c IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'Chantier hors entreprise'; END IF; END IF;
  IF TG_OP='UPDATE' AND NEW.company_id <> OLD.company_id THEN RAISE EXCEPTION 'Entreprise non modifiable'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.entcrm_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record := COALESCE(NEW, OLD);
BEGIN
  INSERT INTO ent_crm_history(company_id, entity, entity_id, action, before, after, actor_id, origin)
  VALUES (r.company_id, TG_TABLE_NAME, r.id, lower(TG_OP),
    CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END, CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END,
    auth.uid(), CASE WHEN public.has_role(auth.uid(),'admin') THEN 'support_vrac_quebec' ELSE 'entreprise' END);
  RETURN COALESCE(NEW, OLD);
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ent_crm_clients','ent_crm_contacts','ent_crm_leads','ent_crm_quotes','ent_crm_projects','ent_crm_tasks'] LOOP
    EXECUTE format('CREATE TRIGGER entcrm_same BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.entcrm_same_company()', t);
    EXECUTE format('CREATE TRIGGER entcrm_log AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.entcrm_log()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.entcrm_open_support(_company_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  INSERT INTO ent_crm_history(company_id, entity, action, origin) VALUES (_company_id,'crm','ouverture_assistance','support_vrac_quebec');
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.entcrm_accept_quote(_quote_id uuid, _source text, _by text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE q ent_crm_quotes; pid uuid;
BEGIN
  SELECT * INTO q FROM ent_crm_quotes WHERE id=_quote_id;
  IF q.id IS NULL OR NOT public.entcrm_can_write(q.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(trim(_source),'')='' OR coalesce(trim(_by),'')='' THEN RAISE EXCEPTION 'Source et auteur requis'; END IF;
  UPDATE ent_crm_quotes SET status='acceptee', accepted_source=_source, accepted_by_name=_by, accepted_at=now(), accepted_recorded_by=auth.uid(), updated_at=now() WHERE id=_quote_id;
  RETURN _quote_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.entcrm_open_support(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entcrm_accept_quote(uuid,text,text) FROM anon;
