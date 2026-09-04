
-- ============ 1. Véhicules : enrichissement de trucks (registre unique) ============
ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS make text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS year integer,
  ADD COLUMN IF NOT EXISTS unit_number text,
  ADD COLUMN IF NOT EXISTS vin text,
  ADD COLUMN IF NOT EXISTS odometer_km numeric,
  ADD COLUMN IF NOT EXISTS engine_hours numeric,
  ADD COLUMN IF NOT EXISTS service_status text NOT NULL DEFAULT 'en_service',
  ADD COLUMN IF NOT EXISTS in_service_since date;

-- ============ 2. Entretiens ============
CREATE TABLE IF NOT EXISTS public.fleet_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  performed_on date,
  odometer_km numeric,
  engine_hours numeric,
  maintenance_type text NOT NULL DEFAULT 'entretien',
  work_done text,
  parts_summary text,
  supplier text,
  cost numeric NOT NULL DEFAULT 0,
  next_type text,
  next_due_date date,
  next_due_km numeric,
  notes text,
  document_url text,
  calendar_event_id uuid REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_maintenance TO authenticated;
GRANT ALL ON public.fleet_maintenance TO service_role;
ALTER TABLE public.fleet_maintenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_maintenance_admin" ON public.fleet_maintenance
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ 3. Inspections ============
CREATE TABLE IF NOT EXISTS public.fleet_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  inspected_on date NOT NULL DEFAULT current_date,
  odometer_km numeric,
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  comment text,
  signature text,
  has_problem boolean NOT NULL DEFAULT false,
  calendar_event_id uuid REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inspections TO authenticated;
GRANT ALL ON public.fleet_inspections TO service_role;
ALTER TABLE public.fleet_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_inspections_admin" ON public.fleet_inspections
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ 4. Réparations ============
CREATE TABLE IF NOT EXISTS public.fleet_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  problem text NOT NULL,
  reported_on date NOT NULL DEFAULT current_date,
  odometer_km numeric,
  description text,
  priority text NOT NULL DEFAULT 'normale',
  status text NOT NULL DEFAULT 'a_diagnostiquer',
  cost_estimated numeric,
  cost_actual numeric,
  scheduled_date date,
  completed_date date,
  parts_summary text,
  supplier text,
  document_url text,
  notes text,
  inspection_id uuid REFERENCES public.fleet_inspections(id) ON DELETE SET NULL,
  calendar_event_id uuid REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_repairs TO authenticated;
GRANT ALL ON public.fleet_repairs TO service_role;
ALTER TABLE public.fleet_repairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_repairs_admin" ON public.fleet_repairs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ 5. Pièces remplacées ============
CREATE TABLE IF NOT EXISTS public.fleet_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  maintenance_id uuid REFERENCES public.fleet_maintenance(id) ON DELETE CASCADE,
  repair_id uuid REFERENCES public.fleet_repairs(id) ON DELETE CASCADE,
  name text NOT NULL,
  part_number text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  supplier text,
  installed_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_parts TO authenticated;
GRANT ALL ON public.fleet_parts TO service_role;
ALTER TABLE public.fleet_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_parts_admin" ON public.fleet_parts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ 6. Coûts (structure rentabilité future) ============
CREATE TABLE IF NOT EXISTS public.fleet_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  cost_type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  incurred_on date NOT NULL DEFAULT current_date,
  source_table text,
  source_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_costs TO authenticated;
GRANT ALL ON public.fleet_costs TO service_role;
ALTER TABLE public.fleet_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_costs_admin" ON public.fleet_costs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ 7. Liaison au calendrier existant ============
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.trucks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fleet_ref_type text,
  ADD COLUMN IF NOT EXISTS fleet_ref_id uuid;

CREATE INDEX IF NOT EXISTS calendar_events_vehicle_idx ON public.calendar_events(vehicle_id);
CREATE INDEX IF NOT EXISTS fleet_maintenance_vehicle_idx ON public.fleet_maintenance(vehicle_id);
CREATE INDEX IF NOT EXISTS fleet_repairs_vehicle_idx ON public.fleet_repairs(vehicle_id);
CREATE INDEX IF NOT EXISTS fleet_inspections_vehicle_idx ON public.fleet_inspections(vehicle_id);
CREATE INDEX IF NOT EXISTS fleet_parts_vehicle_idx ON public.fleet_parts(vehicle_id);
CREATE INDEX IF NOT EXISTS fleet_costs_vehicle_idx ON public.fleet_costs(vehicle_id);

-- ============ 8. updated_at ============
CREATE OR REPLACE FUNCTION public.fleet_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS fleet_maintenance_touch ON public.fleet_maintenance;
CREATE TRIGGER fleet_maintenance_touch BEFORE UPDATE ON public.fleet_maintenance
  FOR EACH ROW EXECUTE FUNCTION public.fleet_touch_updated_at();
DROP TRIGGER IF EXISTS fleet_repairs_touch ON public.fleet_repairs;
CREATE TRIGGER fleet_repairs_touch BEFORE UPDATE ON public.fleet_repairs
  FOR EACH ROW EXECUTE FUNCTION public.fleet_touch_updated_at();
DROP TRIGGER IF EXISTS fleet_inspections_touch ON public.fleet_inspections;
CREATE TRIGGER fleet_inspections_touch BEFORE UPDATE ON public.fleet_inspections
  FOR EACH ROW EXECUTE FUNCTION public.fleet_touch_updated_at();
DROP TRIGGER IF EXISTS fleet_parts_touch ON public.fleet_parts;
CREATE TRIGGER fleet_parts_touch BEFORE UPDATE ON public.fleet_parts
  FOR EACH ROW EXECUTE FUNCTION public.fleet_touch_updated_at();
DROP TRIGGER IF EXISTS fleet_costs_touch ON public.fleet_costs;
CREATE TRIGGER fleet_costs_touch BEFORE UPDATE ON public.fleet_costs
  FOR EACH ROW EXECUTE FUNCTION public.fleet_touch_updated_at();

-- ============ 9. Coûts alimentés automatiquement ============
CREATE OR REPLACE FUNCTION public.fleet_sync_cost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_amount numeric; v_date date; v_type text;
BEGIN
  IF TG_TABLE_NAME = 'fleet_maintenance' THEN
    v_amount := coalesce(NEW.cost, 0); v_date := coalesce(NEW.performed_on, current_date); v_type := 'entretien';
  ELSE
    v_amount := coalesce(NEW.cost_actual, NEW.cost_estimated, 0);
    v_date := coalesce(NEW.completed_date, NEW.scheduled_date, NEW.reported_on, current_date);
    v_type := 'reparation';
  END IF;

  DELETE FROM public.fleet_costs WHERE source_table = TG_TABLE_NAME AND source_id = NEW.id;
  IF v_amount > 0 THEN
    INSERT INTO public.fleet_costs (vehicle_id, cost_type, amount, incurred_on, source_table, source_id)
    VALUES (NEW.vehicle_id, v_type, v_amount, v_date, TG_TABLE_NAME, NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS fleet_maintenance_cost ON public.fleet_maintenance;
CREATE TRIGGER fleet_maintenance_cost AFTER INSERT OR UPDATE ON public.fleet_maintenance
  FOR EACH ROW EXECUTE FUNCTION public.fleet_sync_cost();
DROP TRIGGER IF EXISTS fleet_repairs_cost ON public.fleet_repairs;
CREATE TRIGGER fleet_repairs_cost AFTER INSERT OR UPDATE ON public.fleet_repairs
  FOR EACH ROW EXECUTE FUNCTION public.fleet_sync_cost();

-- ============ 10. Alertes via le centre de notifications existant ============
CREATE OR REPLACE FUNCTION public.fleet_notify_repair()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_label text;
BEGIN
  SELECT coalesce(name, 'Véhicule') INTO v_label FROM public.trucks WHERE id = NEW.vehicle_id;

  IF NEW.status = 'terminee' THEN
    PERFORM public.crm_resolve('fleet_repair', NEW.id);
    RETURN NEW;
  END IF;

  IF NEW.priority = 'urgente' THEN
    PERFORM public.crm_notify(
      'fleet:repair:' || NEW.id || ':urgente', 'alerte', 'fleet_repair_urgent', 'urgente',
      'Réparation urgente — ' || v_label, NEW.problem,
      'fleet_repair', NEW.id, '/admin/flotte/vehicule/' || NEW.vehicle_id || '?tab=reparations',
      NULL, NULL, NEW.scheduled_date::timestamptz, jsonb_build_object('vehicle_id', NEW.vehicle_id));
  ELSIF NEW.status = 'a_planifier' THEN
    PERFORM public.crm_notify(
      'fleet:repair:' || NEW.id || ':a_planifier', 'alerte', 'fleet_repair_plan', 'importante',
      'Réparation à planifier — ' || v_label, NEW.problem,
      'fleet_repair', NEW.id, '/admin/flotte/vehicule/' || NEW.vehicle_id || '?tab=reparations',
      NULL, NULL, NULL, jsonb_build_object('vehicle_id', NEW.vehicle_id));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS fleet_repairs_notify ON public.fleet_repairs;
CREATE TRIGGER fleet_repairs_notify AFTER INSERT OR UPDATE ON public.fleet_repairs
  FOR EACH ROW EXECUTE FUNCTION public.fleet_notify_repair();

CREATE OR REPLACE FUNCTION public.fleet_notify_inspection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_label text;
BEGIN
  IF NOT NEW.has_problem THEN RETURN NEW; END IF;
  SELECT coalesce(name, 'Véhicule') INTO v_label FROM public.trucks WHERE id = NEW.vehicle_id;
  PERFORM public.crm_notify(
    'fleet:inspection:' || NEW.id || ':probleme', 'alerte', 'fleet_inspection_problem', 'importante',
    'Problème détecté à l''inspection — ' || v_label, NEW.comment,
    'fleet_inspection', NEW.id, '/admin/flotte/vehicule/' || NEW.vehicle_id || '?tab=inspections',
    NULL, NULL, NULL, jsonb_build_object('vehicle_id', NEW.vehicle_id));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS fleet_inspections_notify ON public.fleet_inspections;
CREATE TRIGGER fleet_inspections_notify AFTER INSERT OR UPDATE ON public.fleet_inspections
  FOR EACH ROW EXECUTE FUNCTION public.fleet_notify_inspection();

-- Balayage des échéances d'entretien (date ou kilométrage) : anti-doublon par dedupe_key
CREATE OR REPLACE FUNCTION public.fleet_scan_due()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR r IN
    SELECT m.id, m.vehicle_id, m.next_type, m.next_due_date, m.next_due_km,
           t.name AS vehicle_name, t.odometer_km
    FROM public.fleet_maintenance m
    JOIN public.trucks t ON t.id = m.vehicle_id
    WHERE (m.next_due_date IS NOT NULL OR m.next_due_km IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM public.fleet_maintenance m2
        WHERE m2.vehicle_id = m.vehicle_id AND m2.created_at > m.created_at
          AND coalesce(m2.maintenance_type,'') = coalesce(m.next_type, m.maintenance_type,''))
  LOOP
    IF r.next_due_date IS NOT NULL AND r.next_due_date < current_date THEN
      PERFORM public.crm_notify('fleet:maint:' || r.id || ':retard', 'alerte', 'fleet_maintenance_late', 'urgente',
        'Entretien en retard — ' || r.vehicle_name, coalesce(r.next_type, 'Entretien préventif'),
        'fleet_maintenance', r.id, '/admin/flotte/vehicule/' || r.vehicle_id || '?tab=entretien',
        NULL, NULL, r.next_due_date::timestamptz, jsonb_build_object('vehicle_id', r.vehicle_id));
      n := n + 1;
    ELSIF (r.next_due_date IS NOT NULL AND r.next_due_date <= current_date + 14)
       OR (r.next_due_km IS NOT NULL AND r.odometer_km IS NOT NULL AND r.odometer_km >= r.next_due_km - 2000) THEN
      PERFORM public.crm_notify('fleet:maint:' || r.id || ':bientot', 'alerte', 'fleet_maintenance_due', 'importante',
        'Entretien bientôt dû — ' || r.vehicle_name, coalesce(r.next_type, 'Entretien préventif'),
        'fleet_maintenance', r.id, '/admin/flotte/vehicule/' || r.vehicle_id || '?tab=entretien',
        NULL, NULL, r.next_due_date::timestamptz, jsonb_build_object('vehicle_id', r.vehicle_id));
      n := n + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('checked', true, 'notified', n);
END; $$;

REVOKE ALL ON FUNCTION public.fleet_scan_due() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_scan_due() TO authenticated, service_role;
