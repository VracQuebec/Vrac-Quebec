-- ASSUR-01 : assurances entreprise. Lecture par RLS (asr_can_read), écritures sensibles par RPC asr_*.
CREATE TABLE public.asr_support_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL, company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(trim(reason)) >= 5),
  granted_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '4 hours'
);
GRANT SELECT ON public.asr_support_access TO authenticated;
GRANT ALL ON public.asr_support_access TO service_role;
ALTER TABLE public.asr_support_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY asr_sa_read ON public.asr_support_access FOR SELECT TO authenticated USING (admin_id = auth.uid() OR public.entcrm_can_admin(company_id));

CREATE OR REPLACE FUNCTION public.asr_role(_c uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN public.has_role(auth.uid(),'admin') THEN
    CASE WHEN EXISTS (SELECT 1 FROM asr_support_access WHERE admin_id=auth.uid() AND company_id=_c AND expires_at > now()) THEN 'support' END
  ELSE (SELECT m.role FROM jsc_company_members m WHERE m.company_id=_c AND m.user_id=auth.uid() AND m.is_active AND m.archived_at IS NULL LIMIT 1) END
$$;
CREATE OR REPLACE FUNCTION public.asr_can_read(_c uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(public.asr_role(_c) NOT IN ('chauffeur','mecanicien'), false)
$$;
CREATE OR REPLACE FUNCTION public.asr_can_write(_c uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(public.asr_role(_c) IN ('support','proprietaire','gestionnaire'), false)
$$;
GRANT EXECUTE ON FUNCTION public.asr_role(uuid), public.asr_can_read(uuid), public.asr_can_write(uuid) TO authenticated;

CREATE TABLE public.asr_settings (
  company_id uuid PRIMARY KEY REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  tz text NOT NULL DEFAULT 'America/Toronto', reminder_hour int NOT NULL DEFAULT 9 CHECK (reminder_hour BETWEEN 0 AND 23),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.asr_settings TO authenticated;
GRANT ALL ON public.asr_settings TO service_role;
ALTER TABLE public.asr_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY asr_set_r ON public.asr_settings FOR SELECT TO authenticated USING (public.asr_can_read(company_id));
CREATE POLICY asr_set_i ON public.asr_settings FOR INSERT TO authenticated WITH CHECK (public.asr_can_write(company_id));
CREATE POLICY asr_set_u ON public.asr_settings FOR UPDATE TO authenticated USING (public.asr_can_write(company_id)) WITH CHECK (public.asr_can_write(company_id));

CREATE TABLE public.asr_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  label text NOT NULL, sort int NOT NULL DEFAULT 100, archived_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.asr_categories TO authenticated;
GRANT ALL ON public.asr_categories TO service_role;
ALTER TABLE public.asr_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY asr_cat_r ON public.asr_categories FOR SELECT TO authenticated USING (company_id IS NULL OR public.asr_can_read(company_id));
CREATE POLICY asr_cat_i ON public.asr_categories FOR INSERT TO authenticated WITH CHECK (company_id IS NOT NULL AND public.asr_can_write(company_id));
CREATE POLICY asr_cat_u ON public.asr_categories FOR UPDATE TO authenticated USING (company_id IS NOT NULL AND public.asr_can_write(company_id)) WITH CHECK (company_id IS NOT NULL AND public.asr_can_write(company_id));
INSERT INTO public.asr_categories(label, sort) VALUES
 ('Responsabilité civile commerciale',10),('Véhicules et flotte',20),('Remorques',30),('Machinerie et équipements',40),
 ('Bâtiments et contenu',50),('Biens ou équipements loués',60),('Marchandises transportées',70),('Pertes d''exploitation',80),
 ('Pollution et responsabilité environnementale',90),('Cyberrisques',100),('Responsabilité professionnelle',110),
 ('Administrateurs et dirigeants',120),('Autres',999);

CREATE TABLE public.asr_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) > 0), category_id uuid REFERENCES public.asr_categories(id),
  insurer text, policy_number text, named_insureds text,
  broker_name text, broker_phone text, broker_email text, claims_contact text,
  responsible_user uuid, notes text, archived_at timestamptz,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.asr_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.asr_policies(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  previous_id uuid REFERENCES public.asr_periods(id),
  effective_from date, effective_time time, expires_on date, expires_time time, contract_tz text,
  renewal_terms text, notice_date date,
  premium numeric(12,2) CHECK (premium IS NULL OR premium >= 0), taxes numeric(12,2) CHECK (taxes IS NULL OR taxes >= 0),
  fees numeric(12,2) CHECK (fees IS NULL OR fees >= 0), total numeric(12,2) CHECK (total IS NULL OR total >= 0),
  currency text NOT NULL DEFAULT 'CAD', installments text, financing_fees numeric(12,2) CHECK (financing_fees IS NULL OR financing_fees >= 0),
  confirmed_at timestamptz, confirmed_by uuid, confirm_doc_id uuid,
  suspended_reason text, suspended_at timestamptz, suspended_by uuid,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_from IS NULL OR expires_on IS NULL OR expires_on > effective_from)
);
CREATE INDEX asr_periods_policy ON public.asr_periods(policy_id);
CREATE TABLE public.asr_coverages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.asr_periods(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  label text NOT NULL, description text, limit_amount numeric(14,2), limit_text text, sublimits text,
  deductible numeric(14,2), deductible_form text, limit_basis text, territory text, activities text,
  exclusions text, conditions text, endorsements text, source_doc_id uuid, source_ref text,
  state text NOT NULL DEFAULT 'non_renseigne' CHECK (state IN ('indique','exclu','a_confirmer','non_renseigne')),
  archived_at timestamptz,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.asr_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.asr_periods(id) ON DELETE CASCADE,
  coverage_id uuid REFERENCES public.asr_coverages(id) ON DELETE SET NULL,
  truck_id uuid REFERENCES public.trucks(id), asset_label text,
  archived_at timestamptz, created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (truck_id IS NOT NULL OR length(trim(coalesce(asset_label,''))) > 0)
);
CREATE TABLE public.asr_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES public.asr_policies(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.asr_periods(id), quote_id uuid, question_id uuid,
  doc_type text NOT NULL CHECK (doc_type IN ('police','avenant','certificat','preuve_provisoire','avis_renouvellement','soumission','confirmation','correspondance','autre')),
  title text NOT NULL, storage_path text NOT NULL UNIQUE, file_name text NOT NULL, mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 104857600),
  supersedes_id uuid REFERENCES public.asr_documents(id), version int NOT NULL DEFAULT 1,
  archived_at timestamptz,
  uploaded_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (storage_path LIKE company_id::text || '/%')
);
CREATE TABLE public.asr_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  period_id uuid NOT NULL UNIQUE REFERENCES public.asr_periods(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'a_preparer' CHECK (stage IN ('a_preparer','magasinage','soumissions_recues','choix_en_attente','renouvellement_confirme','remplacement_confirme','non_renouvellement')),
  responsible_user uuid, due_date date, task_id uuid, agd_event_id uuid,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb, criteria jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(criteria)='array'),
  chosen_quote_id uuid, nonrenew_reason text, new_period_id uuid REFERENCES public.asr_periods(id), closed_at timestamptz,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.asr_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  renewal_id uuid NOT NULL REFERENCES public.asr_renewals(id) ON DELETE CASCADE,
  insurer text, broker text, period_from date, period_to date, valid_until date,
  total numeric(12,2) CHECK (total IS NULL OR total >= 0), currency text NOT NULL DEFAULT 'CAD',
  cost_basis text NOT NULL DEFAULT 'a_confirmer' CHECK (cost_basis IN ('prime_taxes_frais','prime_seule','prime_taxes','a_confirmer')),
  installments text, financing_fees numeric(12,2),
  limit_amount numeric(14,2), deductible numeric(14,2), exclusions text, territory text, assets_activities text, conditions text,
  criteria_eval jsonb NOT NULL DEFAULT '{}'::jsonb, notes text, archived_at timestamptz,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.asr_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.asr_policies(id) ON DELETE CASCADE,
  coverage_id uuid REFERENCES public.asr_coverages(id), asset text, question text NOT NULL CHECK (length(trim(question)) > 0),
  status text NOT NULL DEFAULT 'ouverte' CHECK (status IN ('ouverte','repondue','a_confirmer')),
  answer text, answer_source text CHECK (answer_source IN ('courtier','assureur','note_interne')), answer_by_name text, answer_date date, answer_doc_id uuid,
  answered_by uuid, answered_at timestamptz,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.asr_events (
  id bigserial PRIMARY KEY, company_id uuid NOT NULL, entity text NOT NULL, entity_id uuid, action text NOT NULL,
  actor uuid DEFAULT auth.uid(), at timestamptz NOT NULL DEFAULT now(), detail jsonb
);
CREATE INDEX asr_events_c ON public.asr_events(company_id, at DESC);
CREATE TABLE public.asr_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL, period_id uuid NOT NULL REFERENCES public.asr_periods(id) ON DELETE CASCADE,
  occurrence text NOT NULL, due_date date NOT NULL, user_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('app','email','push','sms')),
  state text NOT NULL CHECK (state IN ('creee','envoi_accepte','livree','echec','canal_indisponible','bloque_test','sans_adresse')),
  attempts int NOT NULL DEFAULT 1, last_error text, obsolete_at timestamptz, read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, period_id, occurrence, user_id, channel)
);
CREATE TABLE public.asr_sweep_runs (
  id bigserial PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  simulated_now timestamptz, created int NOT NULL DEFAULT 0, renewals_opened int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0, skipped_locked boolean NOT NULL DEFAULT false
);
CREATE TABLE public.asr_sweep_errors (
  id bigserial PRIMARY KEY, run_id bigint REFERENCES public.asr_sweep_runs(id), period_id uuid, company_id uuid,
  error text NOT NULL, at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.asr_policies, public.asr_periods, public.asr_coverages, public.asr_assets, public.asr_documents, public.asr_quotes, public.asr_questions TO authenticated;
GRANT SELECT, UPDATE ON public.asr_renewals TO authenticated;
GRANT SELECT ON public.asr_events, public.asr_deliveries TO authenticated;
GRANT ALL ON public.asr_policies, public.asr_periods, public.asr_coverages, public.asr_assets, public.asr_documents, public.asr_renewals, public.asr_quotes, public.asr_questions, public.asr_events, public.asr_deliveries, public.asr_sweep_runs, public.asr_sweep_errors TO service_role;
GRANT USAGE ON SEQUENCE public.asr_events_id_seq TO service_role;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['asr_policies','asr_periods','asr_coverages','asr_assets','asr_documents','asr_quotes','asr_questions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.asr_can_read(company_id))', t||'_r', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.asr_can_write(company_id))', t||'_i', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.asr_can_write(company_id)) WITH CHECK (public.asr_can_write(company_id))', t||'_u', t);
  END LOOP;
END $$;
DROP POLICY asr_questions_i ON public.asr_questions;
CREATE POLICY asr_questions_i ON public.asr_questions FOR INSERT TO authenticated WITH CHECK (public.asr_can_read(company_id) AND created_by = auth.uid() AND answer IS NULL);
ALTER TABLE public.asr_renewals ENABLE ROW LEVEL SECURITY;
CREATE POLICY asr_ren_r ON public.asr_renewals FOR SELECT TO authenticated USING (public.asr_can_read(company_id));
CREATE POLICY asr_ren_u ON public.asr_renewals FOR UPDATE TO authenticated USING (public.asr_can_write(company_id)) WITH CHECK (public.asr_can_write(company_id));
ALTER TABLE public.asr_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY asr_ev_r ON public.asr_events FOR SELECT TO authenticated USING (public.asr_can_read(company_id));
ALTER TABLE public.asr_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY asr_del_r ON public.asr_deliveries FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.asr_can_write(company_id));
ALTER TABLE public.asr_sweep_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asr_sweep_errors ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.asr_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE pc uuid;
BEGIN
  IF TG_TABLE_NAME = 'asr_periods' THEN SELECT company_id INTO pc FROM asr_policies WHERE id = NEW.policy_id;
  ELSIF TG_TABLE_NAME IN ('asr_coverages','asr_assets') THEN SELECT company_id INTO pc FROM asr_periods WHERE id = NEW.period_id;
  ELSIF TG_TABLE_NAME = 'asr_quotes' THEN SELECT company_id INTO pc FROM asr_renewals WHERE id = NEW.renewal_id;
  ELSIF TG_TABLE_NAME = 'asr_questions' THEN SELECT company_id INTO pc FROM asr_policies WHERE id = NEW.policy_id;
  ELSIF TG_TABLE_NAME = 'asr_documents' THEN
    pc := NEW.company_id;
    IF NEW.policy_id IS NOT NULL AND (SELECT company_id FROM asr_policies WHERE id=NEW.policy_id) <> NEW.company_id THEN RAISE EXCEPTION 'Entreprise incohérente'; END IF;
    IF TG_OP = 'UPDATE' AND (NEW.storage_path <> OLD.storage_path OR NEW.size_bytes <> OLD.size_bytes) THEN RAISE EXCEPTION 'Le fichier original ne peut pas être remplacé'; END IF;
    IF TG_OP = 'INSERT' AND NEW.supersedes_id IS NOT NULL THEN
      SELECT version + 1 INTO NEW.version FROM asr_documents WHERE id = NEW.supersedes_id AND company_id = NEW.company_id;
      IF NEW.version IS NULL THEN RAISE EXCEPTION 'Version précédente introuvable'; END IF;
    END IF;
  ELSE pc := NEW.company_id; END IF;
  IF pc IS NULL OR pc <> NEW.company_id THEN RAISE EXCEPTION 'Entreprise incohérente' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME = 'asr_assets' AND NEW.truck_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM trucks WHERE id=NEW.truck_id AND company_id=NEW.company_id) THEN
    RAISE EXCEPTION 'Bien d''une autre entreprise' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME = 'asr_questions' AND TG_OP = 'UPDATE' AND NEW.answer IS DISTINCT FROM OLD.answer THEN
    NEW.answered_by := auth.uid(); NEW.answered_at := now();
  END IF;
  IF TG_TABLE_NAME = 'asr_periods' AND TG_OP = 'UPDATE' AND current_setting('asr.rpc', true) IS DISTINCT FROM '1' AND
     (NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason OR NEW.previous_id IS DISTINCT FROM OLD.previous_id) THEN
    RAISE EXCEPTION 'Utilisez les actions prévues (confirmation, suspension)'; END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME <> 'asr_documents' THEN NEW.updated_at := now(); END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['asr_periods','asr_coverages','asr_assets','asr_documents','asr_quotes','asr_questions','asr_policies'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.asr_guard()', t||'_guard', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.asr_ren_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF current_setting('asr.rpc', true) IS DISTINCT FROM '1' AND (
     (NEW.stage IN ('renouvellement_confirme','remplacement_confirme','non_renouvellement') AND NEW.stage IS DISTINCT FROM OLD.stage)
     OR (OLD.closed_at IS NOT NULL) OR NEW.new_period_id IS DISTINCT FROM OLD.new_period_id OR NEW.period_id <> OLD.period_id OR NEW.company_id <> OLD.company_id) THEN
    RAISE EXCEPTION 'Utilisez « Confirmer le renouvellement » ou « Déclarer un non-renouvellement »';
  END IF;
  NEW.updated_at := now(); RETURN NEW;
END $$;
CREATE TRIGGER asr_renewals_guard BEFORE UPDATE ON public.asr_renewals FOR EACH ROW EXECUTE FUNCTION public.asr_ren_guard();

CREATE OR REPLACE FUNCTION public.asr_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d jsonb := '{}'::jsonb; k text; o jsonb; n jsonb;
BEGIN
  n := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN
    o := to_jsonb(OLD);
    FOR k IN SELECT jsonb_object_keys(n) LOOP
      IF k NOT IN ('updated_at') AND (o->k) IS DISTINCT FROM (n->k) THEN d := d || jsonb_build_object(k, jsonb_build_object('avant', o->k, 'apres', n->k)); END IF;
    END LOOP;
    IF d = '{}'::jsonb THEN RETURN NULL; END IF;
  ELSE
    d := jsonb_strip_nulls(n - 'company_id' - 'created_at' - 'updated_at');
  END IF;
  INSERT INTO asr_events(company_id, entity, entity_id, action, detail)
  VALUES (NEW.company_id, TG_TABLE_NAME, NEW.id, CASE WHEN TG_OP='INSERT' THEN 'creation' ELSE 'modification' END, d);
  RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['asr_policies','asr_periods','asr_coverages','asr_assets','asr_documents','asr_renewals','asr_quotes','asr_questions'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.asr_audit()', t||'_audit', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.asr_period_dates_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE asr_deliveries SET obsolete_at = now()
   WHERE period_id = NEW.id AND obsolete_at IS NULL AND due_date IS DISTINCT FROM NEW.expires_on;
  RETURN NULL;
END $$;
CREATE TRIGGER asr_periods_dates AFTER UPDATE OF expires_on ON public.asr_periods FOR EACH ROW WHEN (OLD.expires_on IS DISTINCT FROM NEW.expires_on) EXECUTE FUNCTION public.asr_period_dates_changed();

CREATE OR REPLACE FUNCTION public.asr_support_open(_company uuid, _reason text) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  INSERT INTO asr_support_access(admin_id, company_id, reason) VALUES (auth.uid(), _company, trim(_reason)) RETURNING expires_at INTO e;
  INSERT INTO asr_events(company_id, entity, action, detail) VALUES (_company, 'assistance', 'acces_contenu_autorise', jsonb_build_object('motif', trim(_reason), 'expire', e));
  RETURN e;
END $$;
GRANT EXECUTE ON FUNCTION public.asr_support_open(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.asr_admin_stats() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'entreprises', (SELECT count(DISTINCT company_id) FROM asr_policies WHERE archived_at IS NULL),
    'polices', (SELECT count(*) FROM asr_policies WHERE archived_at IS NULL),
    'renouvellements_ouverts', (SELECT count(*) FROM asr_renewals WHERE closed_at IS NULL),
    'rappels_7j', (SELECT count(*) FROM asr_deliveries WHERE created_at > now() - interval '7 days'),
    'erreurs_7j', (SELECT count(*) FROM asr_sweep_errors WHERE at > now() - interval '7 days'),
    'dernier_passage', (SELECT to_jsonb(r) FROM (SELECT started_at, finished_at, created, renewals_opened, errors, skipped_locked FROM asr_sweep_runs WHERE simulated_now IS NULL ORDER BY id DESC LIMIT 1) r),
    'canaux', jsonb_build_object('app','operationnel','email','desactive pendant les essais','push','non raccorde','sms','non raccorde'));
END $$;
GRANT EXECUTE ON FUNCTION public.asr_admin_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.asr_continuity(_period uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o asr_periods; n asr_periods;
BEGIN
  SELECT * INTO o FROM asr_periods WHERE id=_period;
  SELECT * INTO n FROM asr_periods WHERE previous_id=_period AND confirmed_at IS NOT NULL ORDER BY effective_from NULLS LAST LIMIT 1;
  IF n.id IS NULL THEN RETURN 'non_documentee'; END IF;
  IF o.expires_on IS NULL OR n.effective_from IS NULL THEN RETURN 'a_confirmer'; END IF;
  IF n.effective_from < o.expires_on THEN RETURN 'documentee'; END IF;
  IF n.effective_from > o.expires_on THEN RETURN 'intervalle'; END IF;
  IF o.expires_time IS NULL OR n.effective_time IS NULL THEN RETURN 'a_confirmer'; END IF;
  RETURN CASE WHEN n.effective_time <= o.expires_time THEN 'documentee' ELSE 'intervalle' END;
END $$;
GRANT EXECUTE ON FUNCTION public.asr_continuity(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.asr_open_renewal_internal(_period uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p asr_periods; pol asr_policies; rid uuid; tid uuid; ev uuid; due date; s timestamptz;
BEGIN
  SELECT * INTO p FROM asr_periods WHERE id=_period;
  SELECT * INTO pol FROM asr_policies WHERE id=p.policy_id;
  due := CASE WHEN p.expires_on IS NOT NULL THEN (p.expires_on - interval '1 month')::date END;
  INSERT INTO asr_renewals(company_id, period_id, responsible_user, due_date) VALUES (p.company_id, p.id, pol.responsible_user, due)
  ON CONFLICT (period_id) DO NOTHING RETURNING id INTO rid;
  IF rid IS NULL THEN SELECT id INTO rid FROM asr_renewals WHERE period_id=p.id; RETURN rid; END IF;
  INSERT INTO ent_crm_tasks(company_id, title, description, due_at, assignee_user_id, color, priority, checklist)
  VALUES (p.company_id, 'Renouvellement d''assurance : '||pol.title,
          'Préparer le renouvellement'||coalesce(' de la police '||pol.policy_number,'')||coalesce(' ('||pol.insurer||')','')||'. Ouvrir Assurances entreprise.',
          CASE WHEN due IS NOT NULL THEN (due::timestamp + time '17:00') AT TIME ZONE 'America/Toronto' END,
          pol.responsible_user, 'orange', 'haute',
          '[{"label":"Activités","done":false},{"label":"Chiffre d''affaires demandé par le courtier","done":false},{"label":"Nouveaux véhicules ou équipements","done":false},{"label":"Valeurs déclarées","done":false},{"label":"Lieux et territoires","done":false},{"label":"Sinistres","done":false},{"label":"Besoins à revoir","done":false}]'::jsonb)
  RETURNING id INTO tid;
  IF p.expires_on IS NOT NULL THEN
    s := p.expires_on::timestamp AT TIME ZONE 'America/Toronto';
    INSERT INTO agd_events(company_id, title, description, category, color, status, start_at, end_at, all_day, owner_user_id, reminders)
    VALUES (p.company_id, 'Échéance d''assurance : '||pol.title, coalesce(pol.insurer,'Assureur non renseigné')||' · renouvellement à confirmer', 'autre', 'orange', 'planifie', s, s + interval '23 hours 59 minutes', true, pol.responsible_user, '[]'::jsonb)
    RETURNING id INTO ev;
  END IF;
  PERFORM set_config('asr.rpc','1',true);
  UPDATE asr_renewals SET task_id=tid, agd_event_id=ev WHERE id=rid;
  PERFORM set_config('asr.rpc','',true);
  RETURN rid;
END $$;
REVOKE EXECUTE ON FUNCTION public.asr_open_renewal_internal(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.asr_renewal_open(_period uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c uuid;
BEGIN
  SELECT company_id INTO c FROM asr_periods WHERE id=_period;
  IF c IS NULL OR NOT public.asr_can_write(c) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  RETURN asr_open_renewal_internal(_period);
END $$;
GRANT EXECUTE ON FUNCTION public.asr_renewal_open(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.asr_renewal_confirm(_renewal uuid, _kind text, _f jsonb, _proof uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r asr_renewals; o asr_periods; pol asr_policies; npol uuid; np uuid;
BEGIN
  SELECT * INTO r FROM asr_renewals WHERE id=_renewal FOR UPDATE;
  IF r.id IS NULL OR NOT public.asr_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF r.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Dossier déjà clos'; END IF;
  IF _kind NOT IN ('renouvellement','remplacement') THEN RAISE EXCEPTION 'Type invalide'; END IF;
  IF NOT EXISTS (SELECT 1 FROM asr_documents WHERE id=_proof AND company_id=r.company_id AND archived_at IS NULL AND doc_type IN ('confirmation','police','certificat','preuve_provisoire','avenant')) THEN
    RAISE EXCEPTION 'Preuve documentaire de confirmation requise (police, certificat, preuve provisoire, avenant ou confirmation écrite)'; END IF;
  IF nullif(_f->>'effective_from','') IS NULL OR nullif(_f->>'expires_on','') IS NULL THEN RAISE EXCEPTION 'Nouvelles dates de prise d''effet et d''échéance requises'; END IF;
  SELECT * INTO o FROM asr_periods WHERE id=r.period_id;
  SELECT * INTO pol FROM asr_policies WHERE id=o.policy_id;
  IF _kind = 'remplacement' THEN
    INSERT INTO asr_policies(company_id, title, category_id, insurer, policy_number, named_insureds, broker_name, broker_phone, broker_email, claims_contact, responsible_user)
    VALUES (r.company_id, coalesce(nullif(_f->>'title',''), pol.title), pol.category_id, nullif(_f->>'insurer',''), nullif(_f->>'policy_number',''), pol.named_insureds,
            coalesce(nullif(_f->>'broker_name',''), pol.broker_name), pol.broker_phone, pol.broker_email, NULL, pol.responsible_user)
    RETURNING id INTO npol;
  ELSE npol := pol.id; END IF;
  PERFORM set_config('asr.rpc','1',true);
  INSERT INTO asr_periods(policy_id, company_id, previous_id, effective_from, effective_time, expires_on, expires_time, contract_tz, renewal_terms,
                          premium, taxes, fees, total, currency, installments, financing_fees, confirmed_at, confirmed_by, confirm_doc_id)
  VALUES (npol, r.company_id, o.id, (_f->>'effective_from')::date, nullif(_f->>'effective_time','')::time, (_f->>'expires_on')::date, nullif(_f->>'expires_time','')::time,
          coalesce(nullif(_f->>'contract_tz',''), o.contract_tz), o.renewal_terms,
          nullif(_f->>'premium','')::numeric, nullif(_f->>'taxes','')::numeric, nullif(_f->>'fees','')::numeric, nullif(_f->>'total','')::numeric,
          coalesce(nullif(_f->>'currency',''),'CAD'), nullif(_f->>'installments',''), nullif(_f->>'financing_fees','')::numeric, now(), auth.uid(), _proof)
  RETURNING id INTO np;
  INSERT INTO asr_coverages(period_id, company_id, label, description, limit_amount, limit_text, sublimits, deductible, deductible_form, limit_basis, territory, activities, exclusions, conditions, endorsements, state)
  SELECT np, company_id, label, description, limit_amount, limit_text, sublimits, deductible, deductible_form, limit_basis, territory, activities, exclusions, conditions, endorsements, 'a_confirmer'
  FROM asr_coverages WHERE period_id=o.id AND archived_at IS NULL;
  INSERT INTO asr_assets(company_id, period_id, truck_id, asset_label)
  SELECT company_id, np, truck_id, asset_label FROM asr_assets WHERE period_id=o.id AND archived_at IS NULL;
  UPDATE asr_documents SET period_id = coalesce(period_id, np) WHERE id=_proof;
  UPDATE asr_renewals SET stage = CASE WHEN _kind='remplacement' THEN 'remplacement_confirme' ELSE 'renouvellement_confirme' END,
         new_period_id=np, closed_at=now(), chosen_quote_id = coalesce(nullif(_f->>'quote_id','')::uuid, chosen_quote_id) WHERE id=r.id;
  PERFORM set_config('asr.rpc','',true);
  IF r.task_id IS NOT NULL THEN UPDATE ent_crm_tasks SET status='termine', done_at=now(), done_by=auth.uid() WHERE id=r.task_id AND done_at IS NULL; END IF;
  INSERT INTO asr_events(company_id, entity, entity_id, action, detail) VALUES (r.company_id, 'asr_renewals', r.id, 'confirmation_'||_kind,
    jsonb_build_object('nouvelle_periode', np, 'preuve', _proof, 'continuite', asr_continuity(o.id)));
  RETURN np;
EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'Dates invalides : l''échéance doit suivre la prise d''effet';
END $$;
GRANT EXECUTE ON FUNCTION public.asr_renewal_confirm(uuid,text,jsonb,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.asr_renewal_nonrenew(_renewal uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r asr_renewals;
BEGIN
  SELECT * INTO r FROM asr_renewals WHERE id=_renewal FOR UPDATE;
  IF r.id IS NULL OR NOT public.asr_can_write(r.company_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF r.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Dossier déjà clos'; END IF;
  IF length(trim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'Motif requis'; END IF;
  PERFORM set_config('asr.rpc','1',true);
  UPDATE asr_renewals SET stage='non_renouvellement', nonrenew_reason=trim(_reason), closed_at=now() WHERE id=r.id;
  PERFORM set_config('asr.rpc','',true);
END $$;
GRANT EXECUTE ON FUNCTION public.asr_renewal_nonrenew(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.asr_period_suspend(_period uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c uuid;
BEGIN
  SELECT company_id INTO c FROM asr_periods WHERE id=_period;
  IF c IS NULL OR NOT public.asr_can_write(c) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _reason IS NOT NULL AND length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'Raison requise pour suspendre les rappels'; END IF;
  PERFORM set_config('asr.rpc','1',true);
  UPDATE asr_periods SET suspended_reason=nullif(trim(_reason),''), suspended_at=CASE WHEN _reason IS NULL THEN NULL ELSE now() END,
         suspended_by=CASE WHEN _reason IS NULL THEN NULL ELSE auth.uid() END WHERE id=_period;
  PERFORM set_config('asr.rpc','',true);
END $$;
GRANT EXECUTE ON FUNCTION public.asr_period_suspend(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.asr_broker_task(_company uuid, _subject text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t uuid;
BEGIN
  IF NOT public.asr_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  INSERT INTO ent_crm_tasks(company_id, title, description, color, priority)
  VALUES (_company, 'Vérifier avec le courtier : '||left(trim(_subject),150), 'Nouveau bien ou nouvelle activité : confirmer la protection avec le courtier. Rien n''est considéré assuré tant que ce n''est pas documenté.', 'orange', 'normale')
  RETURNING id INTO t;
  INSERT INTO asr_events(company_id, entity, entity_id, action, detail) VALUES (_company, 'tache', t, 'verifier_courtier', jsonb_build_object('sujet', _subject));
  RETURN t;
END $$;
GRANT EXECUTE ON FUNCTION public.asr_broker_task(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.asr_driver_doc_ok(_doc uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM asr_documents d JOIN asr_periods p ON p.id = d.period_id
                  JOIN asr_assets a ON a.period_id = p.id AND a.archived_at IS NULL AND a.truck_id IS NOT NULL
                  JOIN trucks t ON t.id = a.truck_id AND t.company_id = d.company_id AND t.archived_at IS NULL
                 WHERE d.id=_doc AND d.archived_at IS NULL AND d.doc_type IN ('certificat','preuve_provisoire')
                   AND public.asr_role(d.company_id) IN ('chauffeur','mecanicien'))
$$;
CREATE OR REPLACE FUNCTION public.asr_driver_proofs(_company uuid)
RETURNS TABLE(doc_id uuid, title text, insurer text, policy_number text, claims_contact text, expires_on date, vehicles text, storage_path text, mime_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT d.id, d.title, pol.insurer, pol.policy_number, pol.claims_contact, p.expires_on,
         string_agg(DISTINCT coalesce(t.unit_number, t.name), ', '), d.storage_path, d.mime_type
  FROM asr_documents d JOIN asr_periods p ON p.id=d.period_id JOIN asr_policies pol ON pol.id=p.policy_id
  JOIN asr_assets a ON a.period_id=p.id AND a.archived_at IS NULL JOIN trucks t ON t.id=a.truck_id AND t.archived_at IS NULL
  WHERE d.company_id=_company AND (public.asr_driver_doc_ok(d.id) OR public.asr_can_read(_company))
    AND d.doc_type IN ('certificat','preuve_provisoire') AND d.archived_at IS NULL
  GROUP BY d.id, pol.id, p.id
$$;
GRANT EXECUTE ON FUNCTION public.asr_driver_proofs(uuid) TO authenticated;

CREATE POLICY asr_files_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id='asr-files' AND (public.asr_can_read(((storage.foldername(name))[1])::uuid)
    OR EXISTS (SELECT 1 FROM public.asr_documents d WHERE d.storage_path = name AND public.asr_driver_doc_ok(d.id))));
CREATE POLICY asr_files_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='asr-files' AND public.asr_can_write(((storage.foldername(name))[1])::uuid));

CREATE OR REPLACE FUNCTION public.asr_my_bell(_limit int DEFAULT 30)
RETURNS TABLE(delivery_id uuid, company_id uuid, policy_id uuid, title text, insurer text, occurrence text, due_date date, read_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT d.id, d.company_id, pol.id, pol.title, pol.insurer, d.occurrence, d.due_date, d.read_at, d.created_at
  FROM asr_deliveries d JOIN asr_periods p ON p.id=d.period_id JOIN asr_policies pol ON pol.id=p.policy_id
  WHERE d.user_id=auth.uid() AND d.channel='app' AND d.obsolete_at IS NULL AND public.asr_can_read(d.company_id)
  ORDER BY d.created_at DESC LIMIT least(greatest(_limit,1),100)
$$;
GRANT EXECUTE ON FUNCTION public.asr_my_bell(int) TO authenticated;
CREATE OR REPLACE FUNCTION public.asr_mark_read(_delivery uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE asr_deliveries SET read_at=coalesce(read_at, now()) WHERE id=_delivery AND user_id=auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.asr_mark_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.asr_occurrences(_exp date, _notice date)
RETURNS TABLE(code text, on_date date) LANGUAGE sql IMMUTABLE AS $$
  SELECT 'm3', (_exp - interval '3 months')::date
  UNION ALL SELECT 'm2', (_exp - interval '2 months')::date
  UNION ALL SELECT 'm1', (_exp - interval '1 month')::date
  UNION ALL SELECT 's'||g::date, g::date FROM generate_series((_exp - interval '1 month')::date + 7, _exp - 1, interval '7 days') g
  UNION ALL SELECT 'j0', _exp
  UNION ALL SELECT 'preavis_j14', _notice - 14 WHERE _notice IS NOT NULL AND _notice < _exp
  UNION ALL SELECT 'preavis_j0', _notice WHERE _notice IS NOT NULL AND _notice < _exp
$$;
GRANT EXECUTE ON FUNCTION public.asr_occurrences(date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.asr_sweep(_now timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE run bigint; p record; ren asr_renewals; cont text; tz text; hr int; lnow timestamp; best_d date; best_c text;
        k int; o record; r record; ch text; st text; v_created int := 0; v_opened int := 0; v_errs int := 0; closed boolean;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('asr_sweep')) THEN
    INSERT INTO asr_sweep_runs(simulated_now, skipped_locked, finished_at) VALUES (_now, true, now());
    RETURN jsonb_build_object('skipped', true);
  END IF;
  INSERT INTO asr_sweep_runs(simulated_now) VALUES (_now) RETURNING id INTO run;
  FOR p IN SELECT pe.*, pol.responsible_user AS resp FROM asr_periods pe JOIN asr_policies pol ON pol.id=pe.policy_id
            WHERE pe.expires_on IS NOT NULL AND pe.suspended_reason IS NULL AND pol.archived_at IS NULL LOOP
    BEGIN
      SELECT coalesce(s.tz,'America/Toronto'), coalesce(s.reminder_hour,9) INTO tz, hr FROM (SELECT 1) x LEFT JOIN asr_settings s ON s.company_id=p.company_id;
      lnow := coalesce(_now, now()) AT TIME ZONE tz;
      SELECT * INTO ren FROM asr_renewals WHERE period_id=p.id;
      closed := ren.closed_at IS NOT NULL;
      IF closed AND ren.stage='non_renouvellement' THEN CONTINUE; END IF;
      cont := CASE WHEN closed THEN asr_continuity(p.id) ELSE 'non_documentee' END;
      IF closed AND cont='documentee' THEN CONTINUE; END IF;
      best_d := NULL; best_c := NULL;
      FOR o IN SELECT * FROM asr_occurrences(p.expires_on, p.notice_date) ORDER BY on_date LOOP
        IF closed AND o.code <> 'j0' THEN CONTINUE; END IF;
        IF o.on_date + make_time(hr,0,0) <= lnow AND (best_d IS NULL OR o.on_date >= best_d) THEN
          best_d := o.on_date; best_c := CASE WHEN closed THEN 'continuite' ELSE o.code END;
        END IF;
      END LOOP;
      IF NOT closed AND lnow::date > p.expires_on THEN
        k := (lnow::date - p.expires_on) / 7;
        IF k >= 1 AND (p.expires_on + 7*k) + make_time(hr,0,0) <= lnow THEN best_d := p.expires_on + 7*k; best_c := 'retard'||k; END IF;
      END IF;
      IF NOT closed AND ren.id IS NULL AND lnow::date >= (p.expires_on - interval '3 months')::date THEN
        PERFORM asr_open_renewal_internal(p.id); v_opened := v_opened + 1;
      END IF;
      CONTINUE WHEN best_c IS NULL;
      FOR r IN SELECT DISTINCT ON (m.user_id) m.user_id, m.email FROM jsc_company_members m
                WHERE m.company_id=p.company_id AND m.is_active AND m.archived_at IS NULL AND m.user_id IS NOT NULL
                  AND (m.user_id = coalesce(ren.responsible_user, p.resp) OR (coalesce(ren.responsible_user, p.resp) IS NULL AND m.role IN ('proprietaire','gestionnaire'))) LOOP
        FOREACH ch IN ARRAY ARRAY['app','email'] LOOP
          st := CASE WHEN ch='app' THEN 'creee'
                     WHEN r.email IS NULL THEN 'sans_adresse'
                     WHEN r.email ~* '(\.invalid|\.test|\.example|@example\.com)$' THEN 'bloque_test'
                     ELSE 'canal_indisponible' END;
          INSERT INTO asr_deliveries(company_id, period_id, occurrence, due_date, user_id, channel, state, last_error)
          VALUES (p.company_id, p.id, best_c||':'||best_d, p.expires_on, r.user_id, ch, st,
                  CASE WHEN st='canal_indisponible' THEN 'Courriel désactivé pendant les essais' END)
          ON CONFLICT DO NOTHING;
          IF FOUND THEN
            v_created := v_created + 1;
            IF ch='app' THEN INSERT INTO asr_events(company_id, entity, entity_id, action, actor, detail)
              VALUES (p.company_id, 'asr_periods', p.id, 'rappel', NULL, jsonb_build_object('occurrence', best_c, 'date', best_d, 'destinataire', r.user_id)); END IF;
          END IF;
        END LOOP;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      v_errs := v_errs + 1;
      INSERT INTO asr_sweep_errors(run_id, period_id, company_id, error) VALUES (run, p.id, p.company_id, SQLERRM);
    END;
  END LOOP;
  UPDATE asr_sweep_runs SET finished_at=now(), created=v_created, renewals_opened=v_opened, errors=v_errs WHERE id=run;
  RETURN jsonb_build_object('created', v_created, 'renewals_opened', v_opened, 'errors', v_errs);
END $$;
REVOKE EXECUTE ON FUNCTION public.asr_sweep(timestamptz) FROM PUBLIC, anon, authenticated;

DO $$ DECLARE def text; marker text := 'BEGIN PERFORM public.obl_reminders_sweep(); EXCEPTION WHEN OTHERS THEN RAISE WARNING ''obl sweep: %'', SQLERRM; END;';
BEGIN
  def := pg_get_functiondef('public.crm_notifications_sweep()'::regprocedure);
  IF position('asr_sweep' in def) = 0 THEN
    IF position(marker in def) = 0 THEN RAISE EXCEPTION 'Point de raccordement introuvable'; END IF;
    EXECUTE replace(def, marker, marker || E'\n  BEGIN PERFORM public.asr_sweep(); EXCEPTION WHEN OTHERS THEN RAISE WARNING ''asr sweep: %'', SQLERRM; END;');
  END IF;
END $$;
