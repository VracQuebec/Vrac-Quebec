
-- Enum for status
DO $$ BEGIN
  CREATE TYPE public.transport_request_status AS ENUM (
    'nouvelle','a_rappeler','en_analyse','soumission_envoyee',
    'acceptee','planifiee','en_cours','terminee','annulee'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sequence for human-readable numbering
CREATE SEQUENCE IF NOT EXISTS public.transport_requests_number_seq START 1;

-- Main table
CREATE TABLE public.transport_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text UNIQUE,

  -- Client
  client_name text NOT NULL,
  client_company text,
  client_phone text NOT NULL,
  client_email text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Chantier
  site_address text NOT NULL,
  site_latitude double precision,
  site_longitude double precision,
  site_city text,

  -- Matériau
  material_type text NOT NULL,
  material_other text,

  -- Quantité
  quantity numeric,
  quantity_unit text CHECK (quantity_unit IN ('tonnes','verges','inconnu')),

  -- Dompe sélectionnée
  dump_submission_id uuid REFERENCES public.submissions(id) ON DELETE SET NULL,
  dump_name text,
  distance_km numeric,
  travel_time_minutes integer,

  -- Transport
  truck_type text,
  estimated_trips integer,
  desired_date date,
  desired_time time,

  -- Gestion interne
  status public.transport_request_status NOT NULL DEFAULT 'nouvelle',
  assigned_dispatcher uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  truck_id uuid REFERENCES public.trucks(id) ON DELETE SET NULL,
  internal_notes text,

  source text NOT NULL DEFAULT 'wizard_public',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tr_status ON public.transport_requests(status);
CREATE INDEX idx_tr_created ON public.transport_requests(created_at DESC);
CREATE INDEX idx_tr_user ON public.transport_requests(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_requests TO authenticated;
GRANT INSERT ON public.transport_requests TO anon;
GRANT ALL ON public.transport_requests TO service_role;

ALTER TABLE public.transport_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can create a request
CREATE POLICY "Anyone can create transport request"
  ON public.transport_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Users see their own requests
CREATE POLICY "Users view own transport requests"
  ON public.transport_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins manage all
CREATE POLICY "Admins manage all transport requests"
  ON public.transport_requests FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- History table
CREATE TABLE public.transport_request_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.transport_requests(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  user_id uuid,
  user_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tr_hist_request ON public.transport_request_history(request_id);

GRANT SELECT, INSERT ON public.transport_request_history TO authenticated;
GRANT ALL ON public.transport_request_history TO service_role;

ALTER TABLE public.transport_request_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view request history"
  ON public.transport_request_history FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins insert request history"
  ON public.transport_request_history FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Assign request number trigger
CREATE OR REPLACE FUNCTION public.assign_transport_request_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.request_number IS NULL OR btrim(NEW.request_number) = '' THEN
    NEW.request_number := 'DT-' || lpad(nextval('public.transport_requests_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tr_assign_number
  BEFORE INSERT ON public.transport_requests
  FOR EACH ROW EXECUTE FUNCTION public.assign_transport_request_number();

-- updated_at trigger (reuse existing touch_updated_at)
CREATE TRIGGER trg_tr_touch_updated
  BEFORE UPDATE ON public.transport_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Change-history trigger
CREATE OR REPLACE FUNCTION public.log_transport_request_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text := public.current_user_email();
  old_j jsonb := to_jsonb(OLD);
  new_j jsonb := to_jsonb(NEW);
  k text;
  ov jsonb;
  nv jsonb;
  ignored text[] := ARRAY['id','request_number','created_at','updated_at'];
BEGIN
  FOR k IN SELECT jsonb_object_keys(new_j) LOOP
    IF k = ANY(ignored) THEN CONTINUE; END IF;
    ov := old_j->k;
    nv := new_j->k;
    IF ov IS DISTINCT FROM nv THEN
      INSERT INTO public.transport_request_history(request_id, field_key, old_value, new_value, user_id, user_email)
      VALUES (NEW.id, k, ov, nv, uid, uemail);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tr_history
  AFTER UPDATE ON public.transport_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_transport_request_changes();
