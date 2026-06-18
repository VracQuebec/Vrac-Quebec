
-- Enums
DO $$ BEGIN
  CREATE TYPE public.truck_type AS ENUM ('6_roues','10_roues','12_roues','semi_remorque','fardier','autre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.driver_status AS ENUM ('disponible','occupe','inactif');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.calendar_event_status AS ENUM ('a_planifier','planifie','en_cours','termine','reporte','annule');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Shared updated_at helper (reuse if exists)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- TRUCKS
CREATE TABLE public.trucks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type public.truck_type NOT NULL DEFAULT 'autre',
  plate TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trucks TO authenticated;
GRANT ALL ON public.trucks TO service_role;
ALTER TABLE public.trucks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage trucks" ON public.trucks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_trucks_updated BEFORE UPDATE ON public.trucks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- DRIVERS
CREATE TABLE public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status public.driver_status NOT NULL DEFAULT 'disponible',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage drivers" ON public.drivers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_drivers_updated BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- CALENDAR EVENTS
CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  status public.calendar_event_status NOT NULL DEFAULT 'planifie',

  dompe_number TEXT,
  dompe_address TEXT,
  loading_address TEXT,
  delivery_address TEXT,
  material_type TEXT,

  trips_planned INTEGER,
  tonnage_estimated NUMERIC,
  quantity_estimated TEXT,

  entrepreneur_id UUID REFERENCES public.entrepreneurs(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  truck_id UUID REFERENCES public.trucks(id) ON DELETE SET NULL,
  submission_id UUID REFERENCES public.submissions(id) ON DELETE SET NULL,

  client_name TEXT,
  admin_notes TEXT,
  special_instructions TEXT,

  -- Vision future (nullable)
  sms_sent_at TIMESTAMPTZ,
  client_signature_url TEXT,
  google_event_id TEXT,
  last_known_lat DOUBLE PRECISION,
  last_known_lng DOUBLE PRECISION,

  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage calendar_events" ON public.calendar_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_calendar_events_updated BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_calendar_events_start ON public.calendar_events(start_at);
CREATE INDEX idx_calendar_events_status ON public.calendar_events(status);
CREATE INDEX idx_calendar_events_truck ON public.calendar_events(truck_id);
CREATE INDEX idx_calendar_events_driver ON public.calendar_events(driver_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trucks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
