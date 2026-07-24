
-- =========================================================================
-- OPS ENGINE — Fondation
-- =========================================================================

-- Enum statuts de voyage
DO $$ BEGIN
  CREATE TYPE public.trip_status AS ENUM (
    'demande','soumission_envoyee','accepte','planifie','en_route',
    'chargement','transport','livraison','termine','facture','paye','annule'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Séquence numéro voyage
CREATE SEQUENCE IF NOT EXISTS public.trip_number_seq START 1;

-- ---------- trips ----------
CREATE TABLE IF NOT EXISTS public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_number TEXT UNIQUE,
  transport_request_id UUID REFERENCES public.transport_requests(id) ON DELETE SET NULL,
  submission_id UUID REFERENCES public.submissions(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  entrepreneur_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  carrier_id UUID REFERENCES public.carriers(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  truck_id UUID REFERENCES public.trucks(id) ON DELETE SET NULL,
  dump_id UUID REFERENCES public.dumps(id) ON DELETE SET NULL,
  material TEXT,
  quarry_address TEXT,
  pickup_address TEXT,
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  delivery_address TEXT,
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION,
  distance_km NUMERIC(10,2),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  loaded_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status public.trip_status NOT NULL DEFAULT 'planifie',
  cost NUMERIC(12,2) DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  margin NUMERIC(12,2) GENERATED ALWAYS AS (COALESCE(revenue,0) - COALESCE(cost,0)) STORED,
  notes TEXT,
  signature_url TEXT,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assignment_mode TEXT NOT NULL DEFAULT 'manual' CHECK (assignment_mode IN ('auto','manual')),
  calendar_event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trips_status_idx ON public.trips(status);
CREATE INDEX IF NOT EXISTS trips_scheduled_idx ON public.trips(scheduled_at);
CREATE INDEX IF NOT EXISTS trips_truck_scheduled_idx ON public.trips(truck_id, scheduled_at);
CREATE INDEX IF NOT EXISTS trips_carrier_idx ON public.trips(carrier_id);
CREATE INDEX IF NOT EXISTS trips_client_idx ON public.trips(client_id);
CREATE INDEX IF NOT EXISTS trips_entrepreneur_idx ON public.trips(entrepreneur_id);
CREATE INDEX IF NOT EXISTS trips_request_idx ON public.trips(transport_request_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trips admin all" ON public.trips;
CREATE POLICY "trips admin all" ON public.trips
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "trips entrepreneur read own" ON public.trips;
CREATE POLICY "trips entrepreneur read own" ON public.trips
  FOR SELECT TO authenticated
  USING (entrepreneur_id = auth.uid());

-- ---------- trip_status_history ----------
CREATE TABLE IF NOT EXISTS public.trip_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  from_status public.trip_status,
  to_status public.trip_status NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tsh_trip_idx ON public.trip_status_history(trip_id, changed_at DESC);

GRANT SELECT, INSERT ON public.trip_status_history TO authenticated;
GRANT ALL ON public.trip_status_history TO service_role;
ALTER TABLE public.trip_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tsh admin all" ON public.trip_status_history;
CREATE POLICY "tsh admin all" ON public.trip_status_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "tsh entrepreneur read own" ON public.trip_status_history;
CREATE POLICY "tsh entrepreneur read own" ON public.trip_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.entrepreneur_id = auth.uid()));

-- ---------- dispatch_scenarios ----------
CREATE TABLE IF NOT EXISTS public.dispatch_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transport_request_id UUID NOT NULL REFERENCES public.transport_requests(id) ON DELETE CASCADE,
  rank INT NOT NULL,
  carrier_id UUID REFERENCES public.carriers(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  truck_id UUID REFERENCES public.trucks(id) ON DELETE SET NULL,
  dump_id UUID REFERENCES public.dumps(id) ON DELETE SET NULL,
  estimated_distance_km NUMERIC(10,2),
  estimated_duration_min INT,
  estimated_cost NUMERIC(12,2),
  estimated_revenue NUMERIC(12,2),
  estimated_margin NUMERIC(12,2),
  score NUMERIC(6,2) NOT NULL DEFAULT 0,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 minutes',
  chosen_at TIMESTAMPTZ,
  chosen_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ds_request_idx ON public.dispatch_scenarios(transport_request_id, rank);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_scenarios TO authenticated;
GRANT ALL ON public.dispatch_scenarios TO service_role;
ALTER TABLE public.dispatch_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ds admin all" ON public.dispatch_scenarios;
CREATE POLICY "ds admin all" ON public.dispatch_scenarios FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- ---------- dispatch_rules ----------
CREATE TABLE IF NOT EXISTS public.dispatch_rules (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  weight NUMERIC(5,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_rules TO authenticated;
GRANT ALL ON public.dispatch_rules TO service_role;
ALTER TABLE public.dispatch_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dr admin all" ON public.dispatch_rules;
CREATE POLICY "dr admin all" ON public.dispatch_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "dr read all" ON public.dispatch_rules;
CREATE POLICY "dr read all" ON public.dispatch_rules FOR SELECT TO authenticated USING (true);

INSERT INTO public.dispatch_rules(key,label,weight) VALUES
  ('distance','Distance chargement → livraison',30),
  ('dump_availability','Disponibilité de la dompe',20),
  ('truck_fit','Adéquation type camion / tonnage',20),
  ('carrier_load','Charge courante du transporteur',15),
  ('carrier_history','Historique de performance',10),
  ('cost_margin','Coût estimé vs marge cible',5)
ON CONFLICT (key) DO NOTHING;

-- =========================================================================
-- TRIGGERS
-- =========================================================================

-- Assign trip_number + touch updated_at + margin (déjà via GENERATED)
CREATE OR REPLACE FUNCTION public.trips_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.trip_number IS NULL OR btrim(NEW.trip_number) = '' THEN
    NEW.trip_number := 'V-' || lpad(nextval('public.trip_number_seq')::text, 4, '0');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_trips_before_write ON public.trips;
CREATE TRIGGER trg_trips_before_write BEFORE INSERT OR UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.trips_before_write();

-- Status audit + last_activity_at + calendar_event sync
CREATE OR REPLACE FUNCTION public.trips_status_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _from public.trip_status;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _from := NULL;
  ELSE
    _from := OLD.status;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.trip_status_history(trip_id, from_status, to_status, changed_by)
      VALUES (NEW.id, _from, NEW.status, auth.uid());

    -- CRM activity: journalise si owner_type/owner_id disponibles
    IF NEW.client_id IS NOT NULL THEN
      INSERT INTO public.crm_activities(owner_type, owner_id, type, title, meta, created_by)
      VALUES ('client', NEW.client_id, 'status_change',
              'Voyage ' || NEW.trip_number || ' → ' || NEW.status::text,
              jsonb_build_object('trip_id', NEW.id, 'from', _from, 'to', NEW.status), auth.uid());
      UPDATE public.clients SET last_activity_at = now() WHERE id = NEW.client_id;
    END IF;
    IF NEW.carrier_id IS NOT NULL THEN
      UPDATE public.carriers SET last_activity_at = now() WHERE id = NEW.carrier_id;
    END IF;
    IF NEW.dump_id IS NOT NULL THEN
      UPDATE public.dumps SET last_activity_at = now() WHERE id = NEW.dump_id;
    END IF;

    -- Sync statut demande de transport (mapping simple)
    IF NEW.transport_request_id IS NOT NULL AND NEW.status IN ('planifie','en_route','chargement','transport','livraison','termine','annule') THEN
      UPDATE public.transport_requests SET status =
        CASE NEW.status
          WHEN 'planifie' THEN 'planifiee'::transport_request_status
          WHEN 'en_route' THEN 'en_cours'::transport_request_status
          WHEN 'chargement' THEN 'en_cours'::transport_request_status
          WHEN 'transport' THEN 'en_cours'::transport_request_status
          WHEN 'livraison' THEN 'en_cours'::transport_request_status
          WHEN 'termine' THEN 'terminee'::transport_request_status
          WHEN 'annule' THEN 'annulee'::transport_request_status
          ELSE status
        END
      WHERE id = NEW.transport_request_id;
    END IF;

    -- Timestamps auto
    IF NEW.status = 'en_route' AND NEW.started_at IS NULL THEN NEW.started_at := now(); END IF;
    IF NEW.status = 'chargement' AND NEW.loaded_at IS NULL THEN NEW.loaded_at := now(); END IF;
    IF NEW.status = 'livraison' AND NEW.delivered_at IS NULL THEN NEW.delivered_at := now(); END IF;
    IF NEW.status = 'termine' AND NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_trips_status_audit ON public.trips;
CREATE TRIGGER trg_trips_status_audit BEFORE INSERT OR UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.trips_status_audit();

-- =========================================================================
-- HELPERS DÉTERMINISTES
-- =========================================================================

CREATE OR REPLACE FUNCTION public._haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN lat1 IS NULL OR lat2 IS NULL OR lng1 IS NULL OR lng2 IS NULL THEN NULL
  ELSE ROUND((
    2 * 6371 * asin(sqrt(
      power(sin(radians((lat2-lat1)/2)),2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians((lng2-lng1)/2)),2)
    ))
  )::numeric, 2) END
$$;

-- =========================================================================
-- RPC: dispatch_generate_scenarios
-- =========================================================================
CREATE OR REPLACE FUNCTION public.dispatch_generate_scenarios(_request_id uuid, _limit int DEFAULT 5)
RETURNS SETOF public.dispatch_scenarios
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _req RECORD;
  _pickup_lat DOUBLE PRECISION;
  _pickup_lng DOUBLE PRECISION;
  _rank INT := 0;
  _rec RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT * INTO _req FROM public.transport_requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;

  -- Purger anciens scénarios non appliqués
  DELETE FROM public.dispatch_scenarios WHERE transport_request_id = _request_id AND chosen_at IS NULL;

  -- Point d'origine : chantier ou postal
  _pickup_lat := COALESCE(_req.latitude, _req.postal_latitude);
  _pickup_lng := COALESCE(_req.longitude, _req.postal_longitude);

  -- Générer combinaisons (carrier x truck x dump disponibles)
  FOR _rec IN
    WITH carriers AS (
      SELECT c.id AS carrier_id, c.name AS carrier_name, c.base_rate_per_km,
             (SELECT COUNT(*) FROM public.trips t WHERE t.carrier_id = c.id AND t.status IN ('planifie','en_route','chargement','transport','livraison')) AS active_load,
             (SELECT COALESCE(
                100.0 * COUNT(*) FILTER (WHERE t2.status='termine') / NULLIF(COUNT(*),0),
                50)
              FROM public.trips t2 WHERE t2.carrier_id = c.id) AS success_pct
      FROM public.carriers c
      WHERE c.is_active = true AND c.archived_at IS NULL
    ),
    trucks AS (
      SELECT tr.id AS truck_id, tr.carrier_id, tr.type::text AS truck_type
      FROM public.trucks tr
      WHERE tr.carrier_id IS NOT NULL
    ),
    dumps AS (
      SELECT d.id AS dump_id, d.name AS dump_name, d.latitude AS d_lat, d.longitude AS d_lng,
             d.materials_accepted, d.availability_status, d.truck_types_allowed
      FROM public.dumps d
      WHERE d.is_active = true AND d.archived_at IS NULL
        AND COALESCE(d.availability_status,'available') IN ('available','busy')
    )
    SELECT c.carrier_id, c.carrier_name, c.base_rate_per_km, c.active_load, c.success_pct,
           t.truck_id, t.truck_type,
           d.dump_id, d.dump_name, d.d_lat, d.d_lng, d.availability_status, d.truck_types_allowed,
           public._haversine_km(_pickup_lat, _pickup_lng, d.d_lat, d.d_lng) AS distance_km
      FROM carriers c
      JOIN trucks t ON t.carrier_id = c.carrier_id
      CROSS JOIN dumps d
     WHERE (d.truck_types_allowed IS NULL OR array_length(d.truck_types_allowed,1) IS NULL
            OR t.truck_type = ANY(d.truck_types_allowed))
  LOOP
    DECLARE
      _score NUMERIC := 0;
      _dist_score NUMERIC := 0;
      _avail_score NUMERIC := 0;
      _fit_score NUMERIC := 20; -- truck already filtered
      _load_score NUMERIC := 0;
      _hist_score NUMERIC := 0;
      _reasons JSONB := '[]'::jsonb;
      _cost NUMERIC := 0;
      _dur INT := NULL;
    BEGIN
      -- distance : 30 max si <= 5km, décroit à 0 à 200km
      IF _rec.distance_km IS NULL THEN
        _dist_score := 10;
        _reasons := _reasons || jsonb_build_array('Distance inconnue');
      ELSE
        _dist_score := GREATEST(0, 30 - (_rec.distance_km * 30.0 / 200.0));
        _dur := CEIL(_rec.distance_km / 60.0 * 60)::int; -- 60 km/h moyen
      END IF;

      -- dispo dompe
      IF _rec.availability_status = 'available' THEN _avail_score := 20;
      ELSIF _rec.availability_status = 'busy' THEN _avail_score := 8;
      ELSE _avail_score := 0; END IF;

      -- charge transporteur : 15 si 0, 0 si >=10
      _load_score := GREATEST(0, 15 - LEAST(15, COALESCE(_rec.active_load,0) * 1.5));

      -- historique
      _hist_score := COALESCE(_rec.success_pct,50) * 0.10; -- 0..10

      _score := _dist_score + _avail_score + _fit_score + _load_score + _hist_score;

      -- coût brut : distance * base rate * 2 (retour), défaut 2.5/km
      _cost := ROUND(COALESCE(_rec.distance_km,0) * COALESCE(_rec.base_rate_per_km, 2.5) * 2, 2);

      INSERT INTO public.dispatch_scenarios(
        transport_request_id, rank, carrier_id, truck_id, dump_id,
        estimated_distance_km, estimated_duration_min, estimated_cost, estimated_margin,
        score, reasons, breakdown
      ) VALUES (
        _request_id, 0, _rec.carrier_id, _rec.truck_id, _rec.dump_id,
        _rec.distance_km, _dur, _cost, NULL,
        ROUND(_score,2),
        jsonb_build_array(
          _rec.carrier_name || ' • ' || _rec.dump_name,
          CASE WHEN _rec.distance_km IS NOT NULL THEN _rec.distance_km::text || ' km' ELSE 'Distance inconnue' END,
          'Dompe: ' || COALESCE(_rec.availability_status,'?')
        ),
        jsonb_build_object(
          'distance', ROUND(_dist_score,2),
          'availability', _avail_score,
          'fit', _fit_score,
          'load', ROUND(_load_score,2),
          'history', ROUND(_hist_score,2)
        )
      );
    END;
  END LOOP;

  -- Reranker
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC NULLS LAST) AS rn
      FROM public.dispatch_scenarios
     WHERE transport_request_id = _request_id AND chosen_at IS NULL
  )
  UPDATE public.dispatch_scenarios s SET rank = r.rn
    FROM ranked r WHERE s.id = r.id;

  -- Retourner top-N
  RETURN QUERY
    SELECT * FROM public.dispatch_scenarios
     WHERE transport_request_id = _request_id AND chosen_at IS NULL
     ORDER BY rank ASC
     LIMIT COALESCE(_limit,5);
END $$;

-- =========================================================================
-- RPC: dispatch_apply_scenario
-- =========================================================================
CREATE OR REPLACE FUNCTION public.dispatch_apply_scenario(_scenario_id uuid, _scheduled_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s RECORD;
  _req RECORD;
  _trip_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT * INTO _s FROM public.dispatch_scenarios WHERE id = _scenario_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scénario introuvable'; END IF;
  IF _s.chosen_at IS NOT NULL THEN RAISE EXCEPTION 'Scénario déjà appliqué'; END IF;

  SELECT * INTO _req FROM public.transport_requests WHERE id = _s.transport_request_id;

  INSERT INTO public.trips(
    transport_request_id, client_id, entrepreneur_id, carrier_id, truck_id, dump_id,
    material, pickup_address, pickup_lat, pickup_lng,
    distance_km, scheduled_at, status, cost,
    assigned_by, assignment_mode
  ) VALUES (
    _req.id, _req.client_id, _req.user_id, _s.carrier_id, _s.truck_id, _s.dump_id,
    NULLIF(array_to_string(_req.materials,', '),''),
    _req.address, COALESCE(_req.latitude,_req.postal_latitude), COALESCE(_req.longitude,_req.postal_longitude),
    _s.estimated_distance_km, COALESCE(_scheduled_at, now() + interval '1 day'),
    'planifie'::trip_status, COALESCE(_s.estimated_cost,0),
    auth.uid(), 'auto'
  ) RETURNING id INTO _trip_id;

  UPDATE public.dispatch_scenarios
     SET chosen_at = now(), chosen_by = auth.uid(), trip_id = _trip_id
   WHERE id = _scenario_id;

  RETURN _trip_id;
END $$;

-- =========================================================================
-- RPC: trip_advance_status
-- =========================================================================
CREATE OR REPLACE FUNCTION public.trip_advance_status(_trip_id uuid, _next public.trip_status, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  UPDATE public.trips SET status = _next WHERE id = _trip_id;
  IF _reason IS NOT NULL THEN
    UPDATE public.trip_status_history SET reason = _reason
      WHERE id = (SELECT id FROM public.trip_status_history WHERE trip_id = _trip_id ORDER BY changed_at DESC LIMIT 1);
  END IF;
END $$;

-- =========================================================================
-- RPC: ops_dashboard_stats
-- =========================================================================
CREATE OR REPLACE FUNCTION public.ops_dashboard_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _out jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT jsonb_build_object(
    'computed_at', now(),
    'trips_today', (SELECT COUNT(*) FROM public.trips WHERE scheduled_at::date = current_date),
    'trips_week',  (SELECT COUNT(*) FROM public.trips WHERE scheduled_at >= date_trunc('week', now())),
    'trips_month', (SELECT COUNT(*) FROM public.trips WHERE scheduled_at >= date_trunc('month', now())),
    'trips_active', (SELECT COUNT(*) FROM public.trips WHERE status IN ('planifie','en_route','chargement','transport','livraison')),
    'trucks_active', (SELECT COUNT(DISTINCT truck_id) FROM public.trips WHERE status IN ('en_route','chargement','transport','livraison')),
    'carriers_active', (SELECT COUNT(DISTINCT carrier_id) FROM public.trips WHERE scheduled_at >= now() - interval '30 days'),
    'clients_active', (SELECT COUNT(DISTINCT client_id) FROM public.trips WHERE scheduled_at >= now() - interval '30 days'),
    'dumps_active', (SELECT COUNT(*) FROM public.dumps WHERE is_active AND archived_at IS NULL),
    'revenue_today', (SELECT COALESCE(SUM(revenue),0) FROM public.trips WHERE completed_at::date = current_date),
    'revenue_month', (SELECT COALESCE(SUM(revenue),0) FROM public.trips WHERE completed_at >= date_trunc('month', now())),
    'margin_month',  (SELECT COALESCE(SUM(margin),0) FROM public.trips WHERE completed_at >= date_trunc('month', now())),
    'avg_duration_min', (SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - loaded_at))/60))::int,0)
                          FROM public.trips WHERE delivered_at IS NOT NULL AND loaded_at IS NOT NULL),
    'top_materials', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT material, COUNT(*) AS n FROM public.trips
         WHERE material IS NOT NULL AND scheduled_at >= now() - interval '30 days'
         GROUP BY material ORDER BY n DESC LIMIT 5
      ) t),
    'top_cities', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT c.city, COUNT(*) AS n
          FROM public.trips t
          LEFT JOIN public.clients c ON c.id = t.client_id
         WHERE c.city IS NOT NULL AND t.scheduled_at >= now() - interval '30 days'
         GROUP BY c.city ORDER BY n DESC LIMIT 5
      ) t)
  ) INTO _out;
  RETURN _out;
END $$;

-- =========================================================================
-- RPC: ops_planning_range
-- =========================================================================
CREATE OR REPLACE FUNCTION public.ops_planning_range(_from timestamptz, _to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _out jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.scheduled_at), '[]'::jsonb) INTO _out
    FROM (
      SELECT tp.id, tp.trip_number, tp.status::text AS status, tp.scheduled_at, tp.pickup_address,
             tp.material, tp.truck_id, tp.carrier_id, tp.dump_id, tp.client_id,
             tk.plate AS truck_plate, tk.type::text AS truck_type,
             c.name AS carrier_name, d.name AS dump_name, cl.name AS client_name,
             tp.pickup_lat, tp.pickup_lng
        FROM public.trips tp
        LEFT JOIN public.trucks tk ON tk.id = tp.truck_id
        LEFT JOIN public.carriers c ON c.id = tp.carrier_id
        LEFT JOIN public.dumps d ON d.id = tp.dump_id
        LEFT JOIN public.clients cl ON cl.id = tp.client_id
       WHERE tp.scheduled_at BETWEEN _from AND _to
    ) t;
  RETURN _out;
END $$;

-- =========================================================================
-- Realtime
-- =========================================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.trips;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_status_history;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_scenarios;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
