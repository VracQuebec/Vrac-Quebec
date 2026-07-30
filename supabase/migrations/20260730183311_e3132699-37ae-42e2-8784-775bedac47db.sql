
-- =========================================================
-- VRAC QUÉBEC OS — Sprint 1.5 : modèle de données central
-- =========================================================

-- ---------- 0. Compteurs & numérotation (zéro valeur en dur) ----------
CREATE TABLE public.jsc_number_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id() REFERENCES public.jsc_companies(id),
  kind text NOT NULL,
  current_value bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, kind)
);
GRANT SELECT ON public.jsc_number_counters TO authenticated;
GRANT ALL ON public.jsc_number_counters TO service_role;
ALTER TABLE public.jsc_number_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read jsc_number_counters" ON public.jsc_number_counters
  FOR SELECT TO authenticated USING (public.jsc_can_manage(auth.uid()));

CREATE OR REPLACE FUNCTION public.jsc_next_number(_company_id uuid, _kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := COALESCE(_company_id, public.jsc_default_company_id());
  v_prefix text;
  v_pad int;
  v_next bigint;
BEGIN
  SELECT value INTO v_prefix FROM public.jsc_settings
   WHERE key = 'numbering_' || _kind || '_prefix'
     AND (company_id = v_company OR company_id IS NULL)
   ORDER BY company_id NULLS LAST LIMIT 1;

  SELECT value::int INTO v_pad FROM public.jsc_settings
   WHERE key = 'numbering_padding'
     AND (company_id = v_company OR company_id IS NULL)
   ORDER BY company_id NULLS LAST LIMIT 1;

  INSERT INTO public.jsc_number_counters (company_id, kind, current_value)
  VALUES (v_company, _kind, 1)
  ON CONFLICT (company_id, kind)
  DO UPDATE SET current_value = public.jsc_number_counters.current_value + 1,
                updated_at = now()
  RETURNING current_value INTO v_next;

  RETURN COALESCE(v_prefix, upper(left(_kind, 3)) || '-')
         || to_char(now(), 'YYYY') || '-'
         || lpad(v_next::text, COALESCE(v_pad, 5), '0');
END;
$$;

-- ---------- 1. Catégories de matériaux ----------
CREATE TABLE public.jsc_material_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id() REFERENCES public.jsc_companies(id),
  name text NOT NULL,
  code text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.jsc_materials ADD COLUMN category_id uuid REFERENCES public.jsc_material_categories(id);

-- ---------- 2. Chauffeurs ----------
CREATE TABLE public.jsc_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id() REFERENCES public.jsc_companies(id),
  first_name text NOT NULL,
  last_name text,
  phone text,
  email text,
  license_number text,
  license_class text,
  default_truck_id uuid REFERENCES public.jsc_trucks(id),
  hourly_cost numeric,
  hire_date date,
  status text NOT NULL DEFAULT 'disponible',
  internal_notes text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- 3. Clients ----------
CREATE TABLE public.jsc_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id() REFERENCES public.jsc_companies(id),
  client_type text NOT NULL DEFAULT 'particulier',
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  billing_address text,
  city text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  tax_exempt boolean NOT NULL DEFAULT false,
  payment_terms text,
  internal_notes text,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- 4. Demandes ----------
CREATE TABLE public.jsc_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id() REFERENCES public.jsc_companies(id),
  request_number text,
  client_id uuid REFERENCES public.jsc_clients(id),
  source text NOT NULL DEFAULT 'web',
  status text NOT NULL DEFAULT 'nouvelle',
  material_id uuid REFERENCES public.jsc_materials(id),
  quantity numeric,
  quantity_unit text,
  delivery_address text,
  city text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  zone_id uuid REFERENCES public.jsc_zones(id),
  desired_date date,
  notes text,
  internal_notes text,
  created_by uuid,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- 5. Estimations (sortie du moteur) ----------
CREATE TABLE public.jsc_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id() REFERENCES public.jsc_companies(id),
  request_id uuid NOT NULL REFERENCES public.jsc_requests(id) ON DELETE CASCADE,
  engine_version text,
  carrier_id uuid REFERENCES public.jsc_companies(id),
  truck_id uuid REFERENCES public.jsc_trucks(id),
  supplier_id uuid REFERENCES public.jsc_suppliers(id),
  pickup_location_id uuid REFERENCES public.jsc_pickup_locations(id),
  material_id uuid REFERENCES public.jsc_materials(id),
  transport_rate_id uuid REFERENCES public.jsc_transport_rates(id),
  trips integer,
  distance_km numeric,
  billed_hours numeric,
  material_cost numeric,
  transport_cost numeric,
  surcharges numeric,
  margin numeric,
  subtotal numeric,
  tax_total numeric,
  total numeric,
  currency text NOT NULL DEFAULT 'CAD',
  decision jsonb,
  calculation jsonb,
  settings_snapshot jsonb,
  is_selected boolean NOT NULL DEFAULT false,
  computed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- 6. Soumissions ----------
CREATE TABLE public.jsc_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id() REFERENCES public.jsc_companies(id),
  quote_number text,
  request_id uuid REFERENCES public.jsc_requests(id),
  estimate_id uuid REFERENCES public.jsc_estimates(id),
  client_id uuid REFERENCES public.jsc_clients(id),
  status text NOT NULL DEFAULT 'brouillon',
  valid_until date,
  public_payload jsonb,
  subtotal numeric,
  tax_total numeric,
  total numeric,
  currency text NOT NULL DEFAULT 'CAD',
  sent_at timestamptz,
  accepted_at timestamptz,
  refused_at timestamptz,
  refusal_reason text,
  created_by uuid,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- 7. Commandes ----------
CREATE TABLE public.jsc_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id() REFERENCES public.jsc_companies(id),
  order_number text,
  quote_id uuid REFERENCES public.jsc_quotes(id),
  request_id uuid REFERENCES public.jsc_requests(id),
  client_id uuid REFERENCES public.jsc_clients(id),
  carrier_id uuid REFERENCES public.jsc_companies(id),
  truck_id uuid REFERENCES public.jsc_trucks(id),
  driver_id uuid REFERENCES public.jsc_drivers(id),
  supplier_id uuid REFERENCES public.jsc_suppliers(id),
  pickup_location_id uuid REFERENCES public.jsc_pickup_locations(id),
  material_id uuid REFERENCES public.jsc_materials(id),
  status text NOT NULL DEFAULT 'planifiee',
  scheduled_date date,
  scheduled_time text,
  trips_planned integer,
  trips_completed integer NOT NULL DEFAULT 0,
  delivered_quantity numeric,
  delivered_unit text,
  subtotal numeric,
  tax_total numeric,
  total numeric,
  currency text NOT NULL DEFAULT 'CAD',
  completed_at timestamptz,
  cancelled_at timestamptz,
  internal_notes text,
  created_by uuid,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- 8. Factures ----------
CREATE TABLE public.jsc_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id() REFERENCES public.jsc_companies(id),
  invoice_number text,
  order_id uuid REFERENCES public.jsc_orders(id),
  client_id uuid REFERENCES public.jsc_clients(id),
  status text NOT NULL DEFAULT 'brouillon',
  issued_at date,
  due_at date,
  payment_terms text,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_total numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  balance numeric GENERATED ALWAYS AS (total - amount_paid) STORED,
  currency text NOT NULL DEFAULT 'CAD',
  notes text,
  created_by uuid,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.jsc_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id() REFERENCES public.jsc_companies(id),
  invoice_id uuid NOT NULL REFERENCES public.jsc_invoices(id) ON DELETE CASCADE,
  line_type text NOT NULL DEFAULT 'transport',
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit text,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  tax_ids uuid[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- 9. Droits d'accès (admins plateforme + services internes) ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'jsc_material_categories','jsc_drivers','jsc_clients','jsc_requests',
    'jsc_estimates','jsc_quotes','jsc_orders','jsc_invoices','jsc_invoice_lines'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "Admins manage %1$s" ON public.%1$I FOR ALL TO authenticated
         USING (public.jsc_can_manage(auth.uid()))
         WITH CHECK (public.jsc_can_manage(auth.uid()))', t);
    EXECUTE format(
      'CREATE TRIGGER %1$s_touch BEFORE UPDATE ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t);
    EXECUTE format(
      'CREATE TRIGGER %1$s_audit AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION public.jsc_audit_trigger()', t);
  END LOOP;
END $$;

CREATE TRIGGER jsc_number_counters_touch BEFORE UPDATE ON public.jsc_number_counters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- 10. Numérotation automatique ----------
CREATE OR REPLACE FUNCTION public.jsc_assign_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col text := TG_ARGV[0];
  v_kind text := TG_ARGV[1];
  v_current text;
BEGIN
  EXECUTE format('SELECT ($1).%I::text', v_col) INTO v_current USING NEW;
  IF v_current IS NULL OR v_current = '' THEN
    NEW := jsonb_populate_record(
      NEW,
      to_jsonb(NEW) || jsonb_build_object(v_col, public.jsc_next_number(NEW.company_id, v_kind))
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER jsc_requests_number BEFORE INSERT ON public.jsc_requests
  FOR EACH ROW EXECUTE FUNCTION public.jsc_assign_number('request_number', 'request');
CREATE TRIGGER jsc_quotes_number BEFORE INSERT ON public.jsc_quotes
  FOR EACH ROW EXECUTE FUNCTION public.jsc_assign_number('quote_number', 'quote');
CREATE TRIGGER jsc_orders_number BEFORE INSERT ON public.jsc_orders
  FOR EACH ROW EXECUTE FUNCTION public.jsc_assign_number('order_number', 'order');
CREATE TRIGGER jsc_invoices_number BEFORE INSERT ON public.jsc_invoices
  FOR EACH ROW EXECUTE FUNCTION public.jsc_assign_number('invoice_number', 'invoice');

-- ---------- 11. Journal d'audit central étendu ----------
ALTER TABLE public.jsc_audit_log
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS context jsonb;

CREATE INDEX IF NOT EXISTS jsc_audit_log_entity_idx ON public.jsc_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jsc_audit_log_record_idx ON public.jsc_audit_log (record_id, created_at DESC);

-- Journalisation applicative (calculs, décisions moteur, envois, etc.)
CREATE OR REPLACE FUNCTION public.jsc_log_event(
  _action text,
  _entity_type text,
  _entity_id uuid,
  _label text DEFAULT NULL,
  _context jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.jsc_audit_log (
    company_id, table_name, record_id, record_label, action,
    actor_id, actor_email, entity_type, entity_id, context
  ) VALUES (
    public.jsc_default_company_id(), COALESCE(_entity_type, 'system'), _entity_id, _label, _action,
    auth.uid(), public.current_user_email(), _entity_type, _entity_id, COALESCE(_context, '{}'::jsonb)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ---------- 12. Index de relations ----------
CREATE INDEX ON public.jsc_requests (client_id);
CREATE INDEX ON public.jsc_requests (status, created_at DESC);
CREATE INDEX ON public.jsc_estimates (request_id);
CREATE INDEX ON public.jsc_quotes (request_id);
CREATE INDEX ON public.jsc_orders (quote_id);
CREATE INDEX ON public.jsc_orders (status, scheduled_date);
CREATE INDEX ON public.jsc_invoices (order_id);
CREATE INDEX ON public.jsc_invoice_lines (invoice_id);
CREATE INDEX ON public.jsc_drivers (company_id);
CREATE INDEX ON public.jsc_materials (category_id);

-- ---------- 13. Paramètres administrateur de numérotation ----------
INSERT INTO public.jsc_settings (key, label, category, value_type, value, description, sort_order)
VALUES
  ('numbering_padding', 'Nombre de chiffres des numéros', 'numerotation', 'number', '5', 'Longueur de la partie numérique des numéros de demande, soumission, commande et facture.', 10),
  ('numbering_request_prefix', 'Préfixe des demandes', 'numerotation', 'text', 'DEM-', 'Préfixe utilisé pour numéroter les demandes.', 20),
  ('numbering_quote_prefix', 'Préfixe des soumissions', 'numerotation', 'text', 'SOU-', 'Préfixe utilisé pour numéroter les soumissions.', 30),
  ('numbering_order_prefix', 'Préfixe des commandes', 'numerotation', 'text', 'CMD-', 'Préfixe utilisé pour numéroter les commandes.', 40),
  ('numbering_invoice_prefix', 'Préfixe des factures', 'numerotation', 'text', 'FAC-', 'Préfixe utilisé pour numéroter les factures.', 50)
ON CONFLICT DO NOTHING;
