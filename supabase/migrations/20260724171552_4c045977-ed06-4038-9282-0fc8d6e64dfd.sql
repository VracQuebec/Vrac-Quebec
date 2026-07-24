
-- CLIENTS
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  email text, phone text, address text, city text, postal_code text,
  latitude double precision, longitude double precision,
  tags text[] NOT NULL DEFAULT '{}',
  notes text, source text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clients_email_idx  ON public.clients (lower(email));
CREATE INDEX IF NOT EXISTS clients_phone_idx  ON public.clients (phone);
CREATE INDEX IF NOT EXISTS clients_active_idx ON public.clients (is_active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage clients" ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS clients_touch_updated_at ON public.clients;
CREATE TRIGGER clients_touch_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.submissions        ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.transport_requests ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.payments           ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS submissions_client_id_idx        ON public.submissions (client_id);
CREATE INDEX IF NOT EXISTS transport_requests_client_id_idx ON public.transport_requests (client_id);
CREATE INDEX IF NOT EXISTS payments_client_id_idx           ON public.payments (client_id);

-- CARRIERS
CREATE TABLE IF NOT EXISTS public.carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text, email text, phone text,
  address text, city text, postal_code text,
  service_zones text[] NOT NULL DEFAULT '{}',
  truck_types  text[] NOT NULL DEFAULT '{}',
  insurance_policy text, insurance_expires_at date,
  permit_number    text, permit_expires_at    date,
  base_rate_per_km numeric(10,2),
  base_rate_per_hour numeric(10,2),
  rating numeric(3,2),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carriers_active_idx ON public.carriers (is_active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carriers TO authenticated;
GRANT ALL ON public.carriers TO service_role;
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage carriers" ON public.carriers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS carriers_touch_updated_at ON public.carriers;
CREATE TRIGGER carriers_touch_updated_at BEFORE UPDATE ON public.carriers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.trucks  ADD COLUMN IF NOT EXISTS carrier_id uuid REFERENCES public.carriers(id) ON DELETE SET NULL;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS carrier_id uuid REFERENCES public.carriers(id) ON DELETE SET NULL;

-- DUMPS
CREATE TABLE IF NOT EXISTS public.dumps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid REFERENCES public.submissions(id) ON DELETE SET NULL,
  owner_entrepreneur_id uuid REFERENCES public.entrepreneurs(id) ON DELETE SET NULL,
  name text NOT NULL,
  address text, city text, postal_code text,
  latitude double precision, longitude double precision,
  materials_accepted  text[] NOT NULL DEFAULT '{}',
  truck_types_allowed text[] NOT NULL DEFAULT '{}',
  accessibility text[] NOT NULL DEFAULT '{}',
  equipment     text[] NOT NULL DEFAULT '{}',
  opening_hours text,
  capacity_total_m3     numeric(12,2),
  capacity_remaining_m3 numeric(12,2),
  availability_status text NOT NULL DEFAULT 'available',
  price_per_material jsonb NOT NULL DEFAULT '{}'::jsonb,
  photos text[] NOT NULL DEFAULT '{}',
  rating numeric(3,2),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dumps_active_idx ON public.dumps (is_active);
CREATE INDEX IF NOT EXISTS dumps_owner_idx  ON public.dumps (owner_entrepreneur_id);
CREATE INDEX IF NOT EXISTS dumps_city_idx   ON public.dumps (city);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dumps TO authenticated;
GRANT ALL ON public.dumps TO service_role;
ALTER TABLE public.dumps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage dumps" ON public.dumps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Approved entrepreneurs read active dumps" ON public.dumps FOR SELECT TO authenticated
  USING (is_active = true AND public.is_approved_entrepreneur(auth.uid()));
DROP TRIGGER IF EXISTS dumps_touch_updated_at ON public.dumps;
CREATE TRIGGER dumps_touch_updated_at BEFORE UPDATE ON public.dumps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- DOCUMENTS
CREATE TABLE IF NOT EXISTS public.crm_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('client','carrier','dump','entrepreneur','submission','transport_request')),
  owner_id uuid NOT NULL,
  kind text NOT NULL,
  title text, url text NOT NULL,
  mime_type text, size_bytes bigint,
  expires_at date,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_documents_owner_idx   ON public.crm_documents (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS crm_documents_expires_idx ON public.crm_documents (expires_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_documents TO authenticated;
GRANT ALL ON public.crm_documents TO service_role;
ALTER TABLE public.crm_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage crm_documents" ON public.crm_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Uploaders read own crm_documents" ON public.crm_documents FOR SELECT TO authenticated
  USING (uploaded_by = auth.uid());
DROP TRIGGER IF EXISTS crm_documents_touch_updated_at ON public.crm_documents;
CREATE TRIGGER crm_documents_touch_updated_at BEFORE UPDATE ON public.crm_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ACTIVITIES
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('client','carrier','dump','entrepreneur','submission','transport_request')),
  owner_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('call','email','sms','note','task','reminder','meeting','status_change')),
  subject text, body text, outcome text,
  due_at timestamptz, completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_activities_owner_idx   ON public.crm_activities (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS crm_activities_due_idx     ON public.crm_activities (due_at) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_activities_created_idx ON public.crm_activities (created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;
GRANT ALL ON public.crm_activities TO service_role;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage crm_activities" ON public.crm_activities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Creators read own crm_activities" ON public.crm_activities FOR SELECT TO authenticated
  USING (created_by = auth.uid());
DROP TRIGGER IF EXISTS crm_activities_touch_updated_at ON public.crm_activities;
CREATE TRIGGER crm_activities_touch_updated_at BEFORE UPDATE ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- VUES
CREATE OR REPLACE VIEW public.crm_clients_v WITH (security_invoker = true) AS
SELECT c.*,
  (SELECT COUNT(*) FROM public.submissions        s WHERE s.client_id = c.id) AS submissions_count,
  (SELECT COUNT(*) FROM public.transport_requests t WHERE t.client_id = c.id) AS transport_requests_count,
  (SELECT COALESCE(SUM(p.total),0) FROM public.payments p WHERE p.client_id = c.id) AS revenue_total
FROM public.clients c;

CREATE OR REPLACE VIEW public.crm_carriers_v WITH (security_invoker = true) AS
SELECT ca.*,
  (SELECT COUNT(*) FROM public.trucks  t WHERE t.carrier_id = ca.id) AS trucks_count,
  (SELECT COUNT(*) FROM public.drivers d WHERE d.carrier_id = ca.id) AS drivers_count
FROM public.carriers ca;

CREATE OR REPLACE VIEW public.crm_dumps_v WITH (security_invoker = true) AS
SELECT d.*, e.name AS owner_name
FROM public.dumps d
LEFT JOIN public.entrepreneurs e ON e.id = d.owner_entrepreneur_id;

CREATE OR REPLACE VIEW public.crm_deals_v WITH (security_invoker = true) AS
SELECT
  s.id,
  'submission'::text AS source,
  s.created_at,
  s.status,
  s.client_id,
  NULL::uuid         AS user_id,
  ARRAY(SELECT unnest(s.materials))::text[] AS materials,
  s.tonnage::text    AS tonnage,
  s.latitude, s.longitude,
  s.city, s.postal_code
FROM public.submissions s
UNION ALL
SELECT
  tr.id,
  'transport_request'::text AS source,
  tr.created_at,
  tr.status::text,
  tr.client_id,
  tr.user_id,
  ARRAY[tr.material_type]::text[] AS materials,
  tr.quantity::text    AS tonnage,
  tr.site_latitude  AS latitude,
  tr.site_longitude AS longitude,
  tr.site_city      AS city,
  NULL::text        AS postal_code
FROM public.transport_requests tr;

GRANT SELECT ON public.crm_clients_v  TO authenticated;
GRANT SELECT ON public.crm_carriers_v TO authenticated;
GRANT SELECT ON public.crm_dumps_v    TO authenticated;
GRANT SELECT ON public.crm_deals_v    TO authenticated;
