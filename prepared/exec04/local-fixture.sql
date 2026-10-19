-- LOCAL structural fixture, no hosted data. Fields extracted from existing migrations. External/JWT/tax providers excluded.
CREATE TABLE jsc_companies(id uuid PRIMARY KEY, name text);
CREATE TABLE jsc_company_members(company_id uuid,user_id uuid,role text,is_active boolean DEFAULT true,archived_at timestamptz);
CREATE TABLE entrepreneurs(id uuid PRIMARY KEY,name text,company text,email text,city text,user_id uuid,is_network_visible boolean DEFAULT true);
CREATE TABLE fin_invoices(id uuid PRIMARY KEY,company_id uuid,status text,subtotal numeric,total numeric,private_note text,issued_at timestamptz);
CREATE TABLE fin_expected_inflows(id uuid PRIMARY KEY,invoice_id uuid,received numeric);
-- Empty external finance contract fixture; production uses its canonical immutable credit/receipt engine.
CREATE FUNCTION fin_invoice_balance(_invoice uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('paid',coalesce(f.received,0)>0 AND f.received>=i.total,'settled_by_credit',false) FROM fin_invoices i LEFT JOIN fin_expected_inflows f ON f.invoice_id=i.id WHERE i.id=_invoice;
$$;
CREATE TABLE suppressed_emails(email text PRIMARY KEY,reason text);
CREATE TABLE email_unsubscribe_tokens(email text PRIMARY KEY,token text,used_at timestamptz);
CREATE TABLE public.mkt_service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid ,
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
CREATE TABLE public.mkt_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE ,
  profile_id uuid ,
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
CREATE TABLE public.mkt_partner_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL ,
  category_id uuid NOT NULL ,
  note text,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, category_id)
);
CREATE TABLE public.mkt_partner_territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL ,
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
CREATE TABLE public.mkt_partner_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL ,
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
CREATE TABLE public.mkt_quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text UNIQUE,
  client_user_id uuid,
  client_id uuid ,
  client_type text NOT NULL DEFAULT 'particulier' CHECK (client_type IN
    ('particulier','commerce','entreprise','entrepreneur','entrepreneur_general','promoteur',
     'gestionnaire_immobilier','institution','ville','municipalite','organisme_public')),
  contact_name text,
  contact_phone text,
  contact_email text,
  organization_name text,
  category_id uuid ,
  subcategory_id uuid ,
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
CREATE TABLE public.mkt_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid ,
  category_id uuid ,
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
  award_id uuid ,
  request_id uuid ,
  company_id uuid ,
  rule_id uuid ,
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
CREATE TABLE public.mkt_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL ,
  lot_id uuid ,
  invitation_id uuid ,
  company_id uuid NOT NULL ,
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
CREATE TABLE public.mkt_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(trim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id uuid,
  entity text NOT NULL DEFAULT 'vrac_quebec',
  scope text NOT NULL DEFAULT 'promotions_courriel',
  consent_text text NOT NULL, consent_version text NOT NULL,
  sender_snapshot jsonb NOT NULL,
  source text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz, withdrawn_source text,
  mc_status text NOT NULL DEFAULT 'a_synchroniser' CHECK (mc_status IN ('a_synchroniser','pending','subscribed','unsubscribed','erreur')),
  mc_last_sync_at timestamptz, mc_error text, mc_attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.mkt_promo_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL, campaign text NOT NULL, sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mkt_consents_one_active ON mkt_consents(email,entity,scope) WHERE withdrawn_at IS NULL;
ALTER TABLE mkt_commissions ADD COLUMN contested_at timestamptz;
ALTER TABLE mkt_commissions ADD COLUMN model text;
ALTER TABLE mkt_commissions ADD COLUMN label text;

-- Exact municipal reference contract, empty except explicitly fictitious test cities.
CREATE TABLE seo_cities(name text,province text,territory_type text,region_admin text);
INSERT INTO seo_cities VALUES('Québec','QC','ville','Capitale-Nationale'),('Gatineau','QC','ville','Outaouais'),('Lévis','QC','ville','Chaudière-Appalaches');
