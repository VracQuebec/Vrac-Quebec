
-- Rôles : commercial = voit leads/clients; terrain = chantiers + ses tâches; lecture = lecture seule.
CREATE OR REPLACE FUNCTION public.entcrm_can_commercial(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.entcrm_role(_company_id) IN ('support','proprietaire','gestionnaire','comptabilite','lecture') $$;
CREATE OR REPLACE FUNCTION public.entcrm_can_finance(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.entcrm_role(_company_id) IN ('support','proprietaire','gestionnaire','comptabilite','lecture') $$;
CREATE OR REPLACE FUNCTION public.entcrm_can_field(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.entcrm_role(_company_id) IN ('support','proprietaire','gestionnaire','mecanicien','chauffeur','operateur') $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ent_crm_clients','ent_crm_contacts','ent_crm_leads'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "r" ON public.%I', t);
    EXECUTE format('CREATE POLICY "r" ON public.%I FOR SELECT TO authenticated USING (public.entcrm_can_commercial(company_id))', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "r" ON public.ent_crm_tasks;
CREATE POLICY "r" ON public.ent_crm_tasks FOR SELECT TO authenticated
  USING (public.entcrm_can_commercial(company_id) OR (public.entcrm_can_read(company_id) AND assignee_user_id = auth.uid()));

-- Réglages par entreprise (métiers)
CREATE TABLE public.ent_crm_settings (
  company_id uuid PRIMARY KEY REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  trades text[] NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);
-- Étapes configurables
CREATE TABLE public.ent_crm_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  key text NOT NULL, label text NOT NULL, position int NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'ouverte' CHECK (kind IN ('ouverte','gagnee','perdue')),
  UNIQUE (company_id, key)
);
-- Vues enregistrées (par utilisateur, dans une entreprise)
CREATE TABLE public.ent_crm_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(), name text NOT NULL, params text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ent_crm_settings, public.ent_crm_stages, public.ent_crm_saved_views TO authenticated;
GRANT ALL ON public.ent_crm_settings, public.ent_crm_stages, public.ent_crm_saved_views TO service_role;
ALTER TABLE public.ent_crm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_crm_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ent_crm_saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "r" ON public.ent_crm_settings FOR SELECT TO authenticated USING (public.entcrm_can_read(company_id));
CREATE POLICY "w" ON public.ent_crm_settings FOR ALL TO authenticated USING (public.entcrm_can_admin(company_id)) WITH CHECK (public.entcrm_can_admin(company_id));
CREATE POLICY "r" ON public.ent_crm_stages FOR SELECT TO authenticated USING (public.entcrm_can_read(company_id));
CREATE POLICY "i" ON public.ent_crm_stages FOR INSERT TO authenticated WITH CHECK (public.entcrm_can_admin(company_id));
CREATE POLICY "u" ON public.ent_crm_stages FOR UPDATE TO authenticated USING (public.entcrm_can_admin(company_id)) WITH CHECK (public.entcrm_can_admin(company_id));
CREATE POLICY "r" ON public.ent_crm_saved_views FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.entcrm_can_read(company_id));
CREATE POLICY "i" ON public.ent_crm_saved_views FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.entcrm_can_read(company_id));
CREATE POLICY "d" ON public.ent_crm_saved_views FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Retrait d'une étape avec remplacement
CREATE OR REPLACE FUNCTION public.entcrm_delete_stage(_stage_id uuid, _replacement text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s ent_crm_stages;
BEGIN
  SELECT * INTO s FROM ent_crm_stages WHERE id=_stage_id;
  IF s.id IS NULL OR NOT public.entcrm_can_admin(s.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF NOT EXISTS (SELECT 1 FROM ent_crm_stages WHERE company_id=s.company_id AND key=_replacement AND id<>s.id) THEN RAISE EXCEPTION 'Étape de remplacement invalide'; END IF;
  UPDATE ent_crm_leads SET stage=_replacement, updated_at=now() WHERE company_id=s.company_id AND stage=s.key;
  DELETE FROM ent_crm_stages WHERE id=s.id;
END $$;

-- Conversion lead -> client, idempotente
CREATE OR REPLACE FUNCTION public.entcrm_convert_lead(_lead_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE l ent_crm_leads; cid uuid;
BEGIN
  SELECT * INTO l FROM ent_crm_leads WHERE id=_lead_id FOR UPDATE;
  IF l.id IS NULL OR NOT public.entcrm_can_write(l.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF l.client_id IS NOT NULL THEN RETURN l.client_id; END IF;
  INSERT INTO ent_crm_clients(company_id, name, phone, email, notes)
  VALUES (l.company_id, coalesce(nullif(l.contact_name,''), l.title),
    CASE WHEN l.contact_value ~ '\d{3}' AND l.contact_value !~ '@' THEN l.contact_value END,
    CASE WHEN l.contact_value ~ '@' THEN l.contact_value END, l.need) RETURNING id INTO cid;
  UPDATE ent_crm_leads SET client_id=cid, updated_at=now() WHERE id=l.id;
  UPDATE ent_crm_tasks SET client_id=cid WHERE lead_id=l.id AND client_id IS NULL;
  RETURN cid;
END $$;

-- Soumission acceptée : contenu figé
CREATE OR REPLACE FUNCTION public.entcrm_lock_accepted() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status='acceptee' AND (NEW.lines IS DISTINCT FROM OLD.lines OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.conditions IS DISTINCT FROM OLD.conditions OR NEW.inclusions IS DISTINCT FROM OLD.inclusions
     OR NEW.exclusions IS DISTINCT FROM OLD.exclusions OR NEW.version IS DISTINCT FROM OLD.version OR NEW.status <> 'acceptee'
     OR NEW.accepted_source IS DISTINCT FROM OLD.accepted_source OR NEW.accepted_by_name IS DISTINCT FROM OLD.accepted_by_name) THEN
    RAISE EXCEPTION 'Soumission acceptée : créez une révision';
  END IF;
  IF NEW.status='acceptee' AND OLD.status<>'acceptee' AND current_setting('entcrm.accepting', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Acceptation : utilisez l''acceptation documentée';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER entcrm_lock BEFORE UPDATE ON public.ent_crm_quotes FOR EACH ROW EXECUTE FUNCTION public.entcrm_lock_accepted();
ALTER TABLE public.ent_crm_quotes ADD COLUMN IF NOT EXISTS parent_quote_id uuid REFERENCES public.ent_crm_quotes(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.entcrm_accept_quote(_quote_id uuid, _source text, _by text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE q ent_crm_quotes;
BEGIN
  SELECT * INTO q FROM ent_crm_quotes WHERE id=_quote_id;
  IF q.id IS NULL OR NOT public.entcrm_can_write(q.company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF q.status='acceptee' THEN RETURN q.id; END IF;
  IF coalesce(trim(_source),'')='' OR coalesce(trim(_by),'')='' THEN RAISE EXCEPTION 'Source et auteur requis'; END IF;
  PERFORM set_config('entcrm.accepting','on',true);
  UPDATE ent_crm_quotes SET status='acceptee', accepted_source=_source, accepted_by_name=_by, accepted_at=now(), accepted_recorded_by=auth.uid(), updated_at=now() WHERE id=_quote_id;
  PERFORM set_config('entcrm.accepting','off',true);
  RETURN _quote_id;
END $$;

-- Équipe
CREATE OR REPLACE FUNCTION public.entcrm_list_members(_company_id uuid)
RETURNS TABLE(user_id uuid, email text, role text, is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.entcrm_can_read(_company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN QUERY SELECT m.user_id, u.email::text, m.role, (m.is_active AND m.archived_at IS NULL)
    FROM jsc_company_members m JOIN auth.users u ON u.id=m.user_id WHERE m.company_id=_company_id ORDER BY u.email;
END $$;

CREATE OR REPLACE FUNCTION public.entcrm_set_member(_company_id uuid, _email text, _role text, _active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  IF NOT public.entcrm_can_admin(_company_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _role NOT IN ('proprietaire','gestionnaire','comptabilite','chauffeur','mecanicien','operateur','lecture') THEN RAISE EXCEPTION 'Rôle non autorisé'; END IF;
  SELECT id INTO uid FROM auth.users WHERE lower(email)=lower(trim(_email));
  IF uid IS NULL THEN RAISE EXCEPTION 'Aucun compte existant avec ce courriel (aucune invitation envoyée)'; END IF;
  IF uid = auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Vous ne pouvez pas modifier votre propre accès'; END IF;
  INSERT INTO jsc_company_members(company_id, user_id, role, is_active)
  VALUES (_company_id, uid, _role, _active)
  ON CONFLICT (company_id, user_id) DO UPDATE SET role=EXCLUDED.role, is_active=EXCLUDED.is_active, archived_at=NULL;
  INSERT INTO ent_crm_history(company_id, entity, entity_id, action, after, origin)
  VALUES (_company_id, 'membres', uid, 'droits', jsonb_build_object('email',_email,'role',_role,'actif',_active),
    CASE WHEN public.has_role(auth.uid(),'admin') THEN 'support_vrac_quebec' ELSE 'entreprise' END);
END $$;
REVOKE EXECUTE ON FUNCTION public.entcrm_set_member(uuid,text,text,boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entcrm_list_members(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entcrm_delete_stage(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.entcrm_convert_lead(uuid) FROM anon;
