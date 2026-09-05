
-- ============================================================
-- PLACE DE MARCHÉ VRAC QUÉBEC — FONDATIONS (Prompt 1)
-- Réutilise jsc_companies (entreprises), jsc_company_members (employés),
-- jsc_clients (clients), user_roles/has_role (admin). Rien n'est supprimé.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mkt_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Membre actif d'une entreprise partenaire
CREATE OR REPLACE FUNCTION public.mkt_is_member(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.jsc_company_members m
    WHERE m.company_id = _company_id AND m.user_id = auth.uid()
      AND coalesce(m.is_active, true) AND m.archived_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.mkt_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

REVOKE EXECUTE ON FUNCTION public.mkt_is_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mkt_is_admin() FROM anon;

-- ------------------------------------------------------------
-- 1. TAXONOMIE : catégorie -> sous-catégorie -> service
-- ------------------------------------------------------------
CREATE TABLE public.mkt_service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.mkt_service_categories(id) ON DELETE CASCADE,
  level text NOT NULL DEFAULT 'categorie' CHECK (level IN ('categorie','sous_categorie','service')),
  code text,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  icon text,
  keywords text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_id, slug)
);
CREATE INDEX idx_mkt_cat_parent ON public.mkt_service_categories(parent_id);
GRANT SELECT ON public.mkt_service_categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.mkt_service_categories TO authenticated;
GRANT ALL ON public.mkt_service_categories TO service_role;
ALTER TABLE public.mkt_service_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY mkt_cat_public_read ON public.mkt_service_categories FOR SELECT USING (true);
CREATE POLICY mkt_cat_admin_write ON public.mkt_service_categories FOR ALL TO authenticated
  USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());
CREATE TRIGGER trg_mkt_cat_touch BEFORE UPDATE ON public.mkt_service_categories
  FOR EACH ROW EXECUTE FUNCTION public.mkt_touch();

-- ------------------------------------------------------------
-- 2. PROFIL PARTENAIRE (extension de jsc_companies)
-- ------------------------------------------------------------
CREATE TABLE public.mkt_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.jsc_marketplace_profiles(id) ON DELETE SET NULL,
  legal_name text,
  trade_name text,
  neq text,
  founded_year integer,
  description text,
  logo_url text,
  website text,
  phone text,
  email text,
  contact_name text,
  address text,
  city text,
  region text,
  postal_code text,
  latitude numeric,
  longitude numeric,
  -- capacité de travaux
  project_sizes text[] NOT NULL DEFAULT '{}',
  accepts_tenders boolean NOT NULL DEFAULT false,
  accepts_subcontracting boolean NOT NULL DEFAULT false,
  min_project_amount numeric,
  max_project_amount numeric,
  max_distance_km numeric,
  availability_status text NOT NULL DEFAULT 'disponible'
    CHECK (availability_status IN ('disponible','limitee','complet','urgences','inactif')),
  availability_note text,
  is_public boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  onboarding_status text NOT NULL DEFAULT 'brouillon'
    CHECK (onboarding_status IN ('brouillon','en_revision','approuve','suspendu')),
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mkt_partners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.mkt_partners TO authenticated;
GRANT ALL ON public.mkt_partners TO service_role;
ALTER TABLE public.mkt_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY mkt_partners_public_read ON public.mkt_partners FOR SELECT
  USING (is_public AND is_active AND archived_at IS NULL);
CREATE POLICY mkt_partners_member_read ON public.mkt_partners FOR SELECT TO authenticated
  USING (public.mkt_is_member(company_id) OR public.mkt_is_admin());
CREATE POLICY mkt_partners_member_write ON public.mkt_partners FOR ALL TO authenticated
  USING (public.mkt_is_member(company_id) OR public.mkt_is_admin())
  WITH CHECK (public.mkt_is_member(company_id) OR public.mkt_is_admin());
CREATE TRIGGER trg_mkt_partners_touch BEFORE UPDATE ON public.mkt_partners
  FOR EACH ROW EXECUTE FUNCTION public.mkt_touch();

-- Rôles commerciaux multiples
CREATE TABLE public.mkt_partner_business_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  business_role text NOT NULL CHECK (business_role IN
    ('entrepreneur','transporteur','fournisseur','carriere','sabliere','site_disposition','sous_traitant','donneur_ouvrage')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, business_role)
);

-- Services offerts (N-N avec la taxonomie)
CREATE TABLE public.mkt_partner_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.mkt_service_categories(id) ON DELETE CASCADE,
  note text,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, category_id)
);

-- Territoires desservis
CREATE TABLE public.mkt_partner_territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'ville' CHECK (scope IN ('ville','region','rayon','province')),
  region text,
  city text,
  center_address text,
  latitude numeric,
  longitude numeric,
  radius_km numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Types de clientèle acceptés
CREATE TABLE public.mkt_partner_client_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  client_type text NOT NULL CHECK (client_type IN
    ('particulier','commercial','industriel','institutionnel','entrepreneur','entrepreneur_general','municipal','gouvernemental')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, client_type)
);

-- Équipements disponibles
CREATE TABLE public.mkt_partner_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  equipment_type text NOT NULL,
  description text,
  quantity integer NOT NULL DEFAULT 1,
  capacity text,
  with_operator boolean,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Documents et conformité
CREATE TABLE public.mkt_partner_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  name text NOT NULL,
  file_path text,
  issuer text,
  reference text,
  issued_on date,
  expires_on date,
  status text NOT NULL DEFAULT 'a_valider' CHECK (status IN ('a_valider','valide','refuse','expire')),
  validated_by uuid,
  validated_at timestamptz,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Préférences de soumissions
CREATE TABLE public.mkt_partner_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  category_ids uuid[] NOT NULL DEFAULT '{}',
  regions text[] NOT NULL DEFAULT '{}',
  cities text[] NOT NULL DEFAULT '{}',
  radius_km numeric,
  min_project_amount numeric,
  max_project_amount numeric,
  client_types text[] NOT NULL DEFAULT '{}',
  notify_in_app boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT true,
  notify_sms boolean NOT NULL DEFAULT false,
  paused_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Disponibilité déclarée (créneaux / capacité)
CREATE TABLE public.mkt_partner_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'disponible'
    CHECK (status IN ('disponible','limitee','complet','urgences','inactif')),
  starts_on date,
  ends_on date,
  resource_label text,
  quantity numeric,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Scores et performance
CREATE TABLE public.mkt_partner_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  internal_score numeric NOT NULL DEFAULT 0,
  public_score numeric,
  show_public_score boolean NOT NULL DEFAULT false,
  profile_completion numeric NOT NULL DEFAULT 0,
  response_rate numeric,
  avg_response_hours numeric,
  invitations_count integer NOT NULL DEFAULT 0,
  bids_count integer NOT NULL DEFAULT 0,
  awards_count integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  cancelled_count integer NOT NULL DEFAULT 0,
  disputes_count integer NOT NULL DEFAULT 0,
  satisfaction numeric,
  last_activity_at timestamptz,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 3. DEMANDES DE SOUMISSIONS
-- ------------------------------------------------------------
CREATE TABLE public.mkt_number_counters (
  year integer PRIMARY KEY,
  seq integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mkt_number_counters TO authenticated;
GRANT ALL ON public.mkt_number_counters TO service_role;
ALTER TABLE public.mkt_number_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY mkt_counters_admin ON public.mkt_number_counters FOR SELECT TO authenticated
  USING (public.mkt_is_admin());

CREATE OR REPLACE FUNCTION public.mkt_next_request_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE y integer := extract(year from now())::int; n integer;
BEGIN
  INSERT INTO public.mkt_number_counters(year, seq) VALUES (y, 1)
  ON CONFLICT (year) DO UPDATE SET seq = public.mkt_number_counters.seq + 1, updated_at = now()
  RETURNING seq INTO n;
  RETURN 'VQ-' || y || '-' || lpad(n::text, 5, '0');
END; $$;

CREATE TABLE public.mkt_quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text UNIQUE,
  client_user_id uuid,
  client_id uuid REFERENCES public.jsc_clients(id) ON DELETE SET NULL,
  client_type text NOT NULL DEFAULT 'particulier' CHECK (client_type IN
    ('particulier','commerce','entreprise','entrepreneur','entrepreneur_general','promoteur',
     'gestionnaire_immobilier','institution','ville','municipalite','organisme_public')),
  contact_name text,
  contact_phone text,
  contact_email text,
  organization_name text,
  category_id uuid REFERENCES public.mkt_service_categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES public.mkt_service_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  address text,
  city text,
  region text,
  postal_code text,
  latitude numeric,
  longitude numeric,
  desired_date date,
  schedule_note text,
  deadline_at timestamptz,
  budget_min numeric,
  budget_max numeric,
  estimated_value numeric,
  is_multi_lot boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'site',
  status text NOT NULL DEFAULT 'nouvelle' CHECK (status IN
    ('brouillon','nouvelle','a_qualifier','a_matcher','distribuee','sans_soumission',
     'soumissions_recues','attribution_a_confirmer','attribuee','en_cours','terminee','annulee','litige')),
  distribution_mode text NOT NULL DEFAULT 'manuel' CHECK (distribution_mode IN ('auto','manuel','semi_auto')),
  contact_visibility text NOT NULL DEFAULT 'apres_attribution' CHECK (contact_visibility IN
    ('toujours_cachees','apres_soumission','apres_preselection','apres_attribution','manuelle','visibles')),
  internal_notes text,
  assigned_to uuid,
  created_by uuid,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mkt_req_status ON public.mkt_quote_requests(status);
CREATE INDEX idx_mkt_req_client ON public.mkt_quote_requests(client_user_id);
CREATE INDEX idx_mkt_req_cat ON public.mkt_quote_requests(category_id);

CREATE OR REPLACE FUNCTION public.mkt_assign_request_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.request_number IS NULL THEN
    NEW.request_number := public.mkt_next_request_number();
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_mkt_req_number BEFORE INSERT ON public.mkt_quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.mkt_assign_request_number();

CREATE TABLE public.mkt_request_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.mkt_quote_requests(id) ON DELETE CASCADE,
  lot_number text NOT NULL,
  title text NOT NULL,
  category_id uuid REFERENCES public.mkt_service_categories(id) ON DELETE SET NULL,
  description text,
  quantity numeric,
  quantity_unit text,
  schedule_note text,
  starts_on date,
  ends_on date,
  estimated_amount numeric,
  status text NOT NULL DEFAULT 'ouvert' CHECK (status IN
    ('ouvert','distribue','soumissions_recues','attribue','annule','termine')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, lot_number)
);

-- Invitations (résultat du moteur de matching)
CREATE TABLE public.mkt_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.mkt_quote_requests(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.mkt_request_lots(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  match_score numeric,
  match_reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  distance_km numeric,
  mode text NOT NULL DEFAULT 'manuel' CHECK (mode IN ('auto','manuel')),
  status text NOT NULL DEFAULT 'suggeree' CHECK (status IN
    ('suggeree','exclue','envoyee','vue','interessee','declinee','soumise','expiree')),
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  decline_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, lot_id, company_id)
);
CREATE INDEX idx_mkt_inv_company ON public.mkt_invitations(company_id, status);

-- Soumissions reçues
CREATE TABLE public.mkt_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.mkt_quote_requests(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.mkt_request_lots(id) ON DELETE CASCADE,
  invitation_id uuid REFERENCES public.mkt_invitations(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  submitted_by uuid,
  price_type text NOT NULL DEFAULT 'forfait' CHECK (price_type IN
    ('forfait','horaire','tonne','verge','voyage','unite','estimation')),
  amount numeric,
  taxes_included boolean NOT NULL DEFAULT false,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  lead_time text,
  available_from date,
  scope text,
  conditions text,
  valid_until date,
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN
    ('brouillon','envoyee','vue','preselectionnee','retenue','non_retenue','retiree','expiree')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mkt_bids_request ON public.mkt_bids(request_id);
CREATE INDEX idx_mkt_bids_company ON public.mkt_bids(company_id, status);

-- Attribution
CREATE TABLE public.mkt_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.mkt_quote_requests(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.mkt_request_lots(id) ON DELETE CASCADE,
  bid_id uuid REFERENCES public.mkt_bids(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  amount numeric,
  final_amount numeric,
  status text NOT NULL DEFAULT 'a_confirmer' CHECK (status IN
    ('a_confirmer','confirmee','en_cours','terminee','annulee','litige')),
  awarded_at timestamptz NOT NULL DEFAULT now(),
  client_confirmed_at timestamptz,
  partner_confirmed_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 4. REVENUS / COMMISSIONS
-- ------------------------------------------------------------
CREATE TABLE public.mkt_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.mkt_service_categories(id) ON DELETE CASCADE,
  label text NOT NULL,
  model text NOT NULL CHECK (model IN
    ('commission_pourcentage','commission_fixe','marge','frais_par_lead','frais_deblocage',
     'abonnement','credits','gratuit','entente_personnalisee')),
  rate_percent numeric,
  fixed_amount numeric,
  min_amount numeric,
  max_amount numeric,
  valid_from date,
  valid_until date,
  priority integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'actif' CHECK (status IN ('actif','inactif','brouillon')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mkt_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id uuid REFERENCES public.mkt_awards(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.mkt_quote_requests(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.jsc_companies(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES public.mkt_pricing_rules(id) ON DELETE SET NULL,
  rule_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  base_amount numeric,
  amount numeric,
  status text NOT NULL DEFAULT 'a_confirmer' CHECK (status IN
    ('a_confirmer','a_facturer','facturee','payee','annulee','contestee')),
  invoiced_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 5. DOCUMENTS ET MESSAGERIE
-- ------------------------------------------------------------
CREATE TABLE public.mkt_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.mkt_quote_requests(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.mkt_request_lots(id) ON DELETE CASCADE,
  bid_id uuid REFERENCES public.mkt_bids(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'piece_jointe',
  name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  visibility text NOT NULL DEFAULT 'partenaires' CHECK (visibility IN ('client','partenaires','interne','public')),
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mkt_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.mkt_quote_requests(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.mkt_request_lots(id) ON DELETE CASCADE,
  bid_id uuid REFERENCES public.mkt_bids(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  subject text,
  kind text NOT NULL DEFAULT 'question' CHECK (kind IN ('question','client_partenaire','interne','support')),
  status text NOT NULL DEFAULT 'ouvert' CHECK (status IN ('ouvert','ferme')),
  last_message_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mkt_thread_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.mkt_threads(id) ON DELETE CASCADE,
  user_id uuid,
  company_id uuid REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  party text NOT NULL DEFAULT 'client' CHECK (party IN ('client','partenaire','vrac_quebec')),
  last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mkt_part_user ON public.mkt_thread_participants(user_id);

CREATE OR REPLACE FUNCTION public.mkt_in_thread(_thread_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mkt_thread_participants p
    WHERE p.thread_id = _thread_id
      AND (p.user_id = auth.uid() OR public.mkt_is_member(p.company_id))
  );
$$;
REVOKE EXECUTE ON FUNCTION public.mkt_in_thread(uuid) FROM anon;

CREATE TABLE public.mkt_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.mkt_threads(id) ON DELETE CASCADE,
  author_user_id uuid,
  author_company_id uuid REFERENCES public.jsc_companies(id) ON DELETE SET NULL,
  party text NOT NULL DEFAULT 'client' CHECK (party IN ('client','partenaire','vrac_quebec')),
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mkt_msg_thread ON public.mkt_messages(thread_id, created_at);

-- ------------------------------------------------------------
-- 6. GRANTS + RLS pour les tables restantes
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mkt_partners','mkt_partner_business_roles','mkt_partner_services','mkt_partner_territories',
    'mkt_partner_client_types','mkt_partner_equipment','mkt_partner_documents','mkt_partner_preferences',
    'mkt_partner_availability','mkt_partner_scores','mkt_quote_requests','mkt_request_lots',
    'mkt_invitations','mkt_bids','mkt_awards','mkt_pricing_rules','mkt_commissions',
    'mkt_documents','mkt_threads','mkt_thread_participants','mkt_messages'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger tg
      WHERE tg.tgrelid = format('public.%I', t)::regclass
        AND tg.tgname = 'trg_' || t || '_touch'
    ) THEN
      EXECUTE format('CREATE TRIGGER trg_%I_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.mkt_touch()', t, t);
    END IF;
  END LOOP;
END $$;

-- Sous-tables du profil partenaire : membre de l'entreprise ou admin
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mkt_partner_business_roles','mkt_partner_services','mkt_partner_territories',
    'mkt_partner_client_types','mkt_partner_equipment','mkt_partner_documents',
    'mkt_partner_preferences','mkt_partner_availability','mkt_partner_scores'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.mkt_is_member(company_id) OR public.mkt_is_admin()) WITH CHECK (public.mkt_is_member(company_id) OR public.mkt_is_admin())',
      t || '_member', t);
  END LOOP;
END $$;

-- Lecture publique des services/territoires des partenaires publiés (annuaire SEO)
CREATE POLICY mkt_services_public_read ON public.mkt_partner_services FOR SELECT USING (
  is_active AND EXISTS (SELECT 1 FROM public.mkt_partners p
    WHERE p.company_id = mkt_partner_services.company_id AND p.is_public AND p.is_active)
);
CREATE POLICY mkt_territories_public_read ON public.mkt_partner_territories FOR SELECT USING (
  is_active AND EXISTS (SELECT 1 FROM public.mkt_partners p
    WHERE p.company_id = mkt_partner_territories.company_id AND p.is_public AND p.is_active)
);
GRANT SELECT ON public.mkt_partner_services, public.mkt_partner_territories TO anon;

-- Demandes : client propriétaire, entreprises invitées, admin
CREATE POLICY mkt_req_client ON public.mkt_quote_requests FOR ALL TO authenticated
  USING (client_user_id = auth.uid() OR public.mkt_is_admin())
  WITH CHECK (client_user_id = auth.uid() OR public.mkt_is_admin());
CREATE POLICY mkt_req_invited_read ON public.mkt_quote_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mkt_invitations i
    WHERE i.request_id = mkt_quote_requests.id AND i.status <> 'exclue'
      AND public.mkt_is_member(i.company_id)));

CREATE OR REPLACE FUNCTION public.mkt_can_see_request(_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mkt_is_admin() OR EXISTS (
    SELECT 1 FROM public.mkt_quote_requests r
    WHERE r.id = _request_id AND r.client_user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.mkt_invitations i
    WHERE i.request_id = _request_id AND i.status <> 'exclue' AND public.mkt_is_member(i.company_id)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.mkt_can_see_request(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.mkt_owns_request(_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mkt_is_admin() OR EXISTS (
    SELECT 1 FROM public.mkt_quote_requests r
    WHERE r.id = _request_id AND r.client_user_id = auth.uid()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.mkt_owns_request(uuid) FROM anon;

CREATE POLICY mkt_lots_read ON public.mkt_request_lots FOR SELECT TO authenticated
  USING (public.mkt_can_see_request(request_id));
CREATE POLICY mkt_lots_write ON public.mkt_request_lots FOR ALL TO authenticated
  USING (public.mkt_owns_request(request_id)) WITH CHECK (public.mkt_owns_request(request_id));

CREATE POLICY mkt_inv_read ON public.mkt_invitations FOR SELECT TO authenticated
  USING (public.mkt_is_member(company_id) OR public.mkt_is_admin() OR public.mkt_owns_request(request_id));
CREATE POLICY mkt_inv_admin_write ON public.mkt_invitations FOR ALL TO authenticated
  USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());
CREATE POLICY mkt_inv_partner_update ON public.mkt_invitations FOR UPDATE TO authenticated
  USING (public.mkt_is_member(company_id)) WITH CHECK (public.mkt_is_member(company_id));

CREATE POLICY mkt_bids_partner ON public.mkt_bids FOR ALL TO authenticated
  USING (public.mkt_is_member(company_id) OR public.mkt_is_admin())
  WITH CHECK (public.mkt_is_member(company_id) OR public.mkt_is_admin());
CREATE POLICY mkt_bids_client_read ON public.mkt_bids FOR SELECT TO authenticated
  USING (status IN ('envoyee','vue','preselectionnee','retenue','non_retenue','expiree')
     AND public.mkt_owns_request(request_id));

CREATE POLICY mkt_awards_read ON public.mkt_awards FOR SELECT TO authenticated
  USING (public.mkt_is_member(company_id) OR public.mkt_is_admin() OR public.mkt_owns_request(request_id));
CREATE POLICY mkt_awards_admin_write ON public.mkt_awards FOR ALL TO authenticated
  USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());

CREATE POLICY mkt_rules_admin ON public.mkt_pricing_rules FOR ALL TO authenticated
  USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());
CREATE POLICY mkt_rules_partner_read ON public.mkt_pricing_rules FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.mkt_is_member(company_id));

CREATE POLICY mkt_commissions_admin ON public.mkt_commissions FOR ALL TO authenticated
  USING (public.mkt_is_admin()) WITH CHECK (public.mkt_is_admin());

CREATE POLICY mkt_docs_read ON public.mkt_documents FOR SELECT TO authenticated
  USING (public.mkt_is_admin()
     OR (company_id IS NOT NULL AND public.mkt_is_member(company_id))
     OR (request_id IS NOT NULL AND visibility <> 'interne' AND public.mkt_can_see_request(request_id)));
CREATE POLICY mkt_docs_write ON public.mkt_documents FOR ALL TO authenticated
  USING (public.mkt_is_admin() OR uploaded_by = auth.uid())
  WITH CHECK (public.mkt_is_admin() OR uploaded_by = auth.uid());

CREATE POLICY mkt_threads_read ON public.mkt_threads FOR SELECT TO authenticated
  USING (public.mkt_is_admin() OR public.mkt_in_thread(id));
CREATE POLICY mkt_threads_write ON public.mkt_threads FOR ALL TO authenticated
  USING (public.mkt_is_admin() OR created_by = auth.uid())
  WITH CHECK (public.mkt_is_admin() OR created_by = auth.uid());

CREATE POLICY mkt_participants_read ON public.mkt_thread_participants FOR SELECT TO authenticated
  USING (public.mkt_is_admin() OR public.mkt_in_thread(thread_id));
CREATE POLICY mkt_participants_write ON public.mkt_thread_participants FOR ALL TO authenticated
  USING (public.mkt_is_admin() OR user_id = auth.uid())
  WITH CHECK (public.mkt_is_admin() OR user_id = auth.uid());

CREATE POLICY mkt_messages_read ON public.mkt_messages FOR SELECT TO authenticated
  USING ((public.mkt_is_admin() OR (public.mkt_in_thread(thread_id) AND NOT is_internal)));
CREATE POLICY mkt_messages_write ON public.mkt_messages FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid() AND (public.mkt_is_admin() OR public.mkt_in_thread(thread_id)));
CREATE POLICY mkt_messages_update ON public.mkt_messages FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid() OR public.mkt_is_admin())
  WITH CHECK (author_user_id = auth.uid() OR public.mkt_is_admin());
