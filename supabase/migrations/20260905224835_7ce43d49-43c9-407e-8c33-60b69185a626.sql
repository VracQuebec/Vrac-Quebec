-- ============================================================
-- FLOTTE V2 — multi-entreprise + fiche maître enrichie
-- ============================================================

-- 1) Helper d'accès -------------------------------------------------
CREATE OR REPLACE FUNCTION public.fleet_can_access(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.jsc_company_members m
        WHERE m.user_id = auth.uid() AND m.company_id = _company_id
          AND m.is_active = true AND m.archived_at IS NULL
      )
$$;

-- 2) company_id partout ---------------------------------------------
ALTER TABLE public.trucks             ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.fleet_maintenance  ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.fleet_repairs      ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.fleet_inspections  ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.fleet_parts        ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.fleet_costs        ADD COLUMN IF NOT EXISTS company_id uuid;

UPDATE public.trucks            SET company_id = public.jsc_default_company_id() WHERE company_id IS NULL;
UPDATE public.fleet_maintenance SET company_id = public.jsc_default_company_id() WHERE company_id IS NULL;
UPDATE public.fleet_repairs     SET company_id = public.jsc_default_company_id() WHERE company_id IS NULL;
UPDATE public.fleet_inspections SET company_id = public.jsc_default_company_id() WHERE company_id IS NULL;
UPDATE public.fleet_parts       SET company_id = public.jsc_default_company_id() WHERE company_id IS NULL;
UPDATE public.fleet_costs       SET company_id = public.jsc_default_company_id() WHERE company_id IS NULL;

ALTER TABLE public.trucks            ALTER COLUMN company_id SET DEFAULT public.jsc_default_company_id();
ALTER TABLE public.fleet_maintenance ALTER COLUMN company_id SET DEFAULT public.jsc_default_company_id();
ALTER TABLE public.fleet_repairs     ALTER COLUMN company_id SET DEFAULT public.jsc_default_company_id();
ALTER TABLE public.fleet_inspections ALTER COLUMN company_id SET DEFAULT public.jsc_default_company_id();
ALTER TABLE public.fleet_parts       ALTER COLUMN company_id SET DEFAULT public.jsc_default_company_id();
ALTER TABLE public.fleet_costs       ALTER COLUMN company_id SET DEFAULT public.jsc_default_company_id();

CREATE INDEX IF NOT EXISTS idx_trucks_company ON public.trucks(company_id);
CREATE INDEX IF NOT EXISTS idx_fleet_maint_company ON public.fleet_maintenance(company_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_rep_company ON public.fleet_repairs(company_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_insp_company ON public.fleet_inspections(company_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_parts_company ON public.fleet_parts(company_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_costs_company ON public.fleet_costs(company_id, vehicle_id, incurred_on);

-- 3) Fiche véhicule enrichie -----------------------------------------
ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'camion',
  ADD COLUMN IF NOT EXISTS admin_status text NOT NULL DEFAULT 'actif',
  ADD COLUMN IF NOT EXISTS ops_status text NOT NULL DEFAULT 'disponible',
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS axles integer,
  ADD COLUMN IF NOT EXISTS configuration text,
  ADD COLUMN IF NOT EXISTS capacity text,
  ADD COLUMN IF NOT EXISTS transmission text,
  ADD COLUMN IF NOT EXISTS body_type text,
  ADD COLUMN IF NOT EXISTS body_length text,
  ADD COLUMN IF NOT EXISTS has_pto boolean,
  ADD COLUMN IF NOT EXISTS hydraulics text,
  ADD COLUMN IF NOT EXISTS engine_make text,
  ADD COLUMN IF NOT EXISTS engine_model text,
  ADD COLUMN IF NOT EXISTS engine_serial text,
  ADD COLUMN IF NOT EXISTS engine_power text,
  ADD COLUMN IF NOT EXISTS transmission_make text,
  ADD COLUMN IF NOT EXISTS transmission_model text,
  ADD COLUMN IF NOT EXISTS transmission_serial text,
  ADD COLUMN IF NOT EXISTS axle_make text,
  ADD COLUMN IF NOT EXISTS axle_model text,
  ADD COLUMN IF NOT EXISTS axle_ratio text,
  ADD COLUMN IF NOT EXISTS axle_serial text,
  ADD COLUMN IF NOT EXISTS components jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS purchase_date date,
  ADD COLUMN IF NOT EXISTS purchase_price numeric,
  ADD COLUMN IF NOT EXISTS purchase_odometer_km numeric,
  ADD COLUMN IF NOT EXISTS purchase_hours numeric,
  ADD COLUMN IF NOT EXISTS vendor text,
  ADD COLUMN IF NOT EXISTS warranty text,
  ADD COLUMN IF NOT EXISTS current_value numeric,
  ADD COLUMN IF NOT EXISTS acquisition_notes text,
  ADD COLUMN IF NOT EXISTS last_reading_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Reprise du statut de service existant vers les deux nouveaux statuts.
UPDATE public.trucks SET
  admin_status = CASE WHEN service_status = 'vendu' THEN 'vendu'
                      WHEN active = false THEN 'inactif' ELSE 'actif' END,
  ops_status   = CASE WHEN service_status = 'atelier' THEN 'au_garage'
                      WHEN service_status = 'hors_service' THEN 'hors_service'
                      WHEN service_status = 'vendu' THEN 'hors_service'
                      ELSE 'disponible' END
WHERE admin_status = 'actif' AND ops_status = 'disponible';

CREATE UNIQUE INDEX IF NOT EXISTS idx_trucks_unit_number_company
  ON public.trucks(company_id, lower(unit_number)) WHERE unit_number IS NOT NULL AND unit_number <> '';

-- 4) Nouveaux registres ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.fleet_meter_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id(),
  vehicle_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  odometer_km numeric,
  engine_hours numeric,
  source text NOT NULL DEFAULT 'manuel',
  source_table text,
  source_id uuid,
  is_correction boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_meter_readings TO authenticated;
GRANT ALL ON public.fleet_meter_readings TO service_role;
ALTER TABLE public.fleet_meter_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_meter_readings_company" ON public.fleet_meter_readings
  FOR ALL TO authenticated USING (public.fleet_can_access(company_id)) WITH CHECK (public.fleet_can_access(company_id));
CREATE INDEX IF NOT EXISTS idx_fleet_meter_vehicle ON public.fleet_meter_readings(vehicle_id, read_at DESC);

CREATE TABLE IF NOT EXISTS public.fleet_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id(),
  vehicle_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'normale',
  status text NOT NULL DEFAULT 'ouvert',
  source text NOT NULL DEFAULT 'manuel',
  inspection_id uuid REFERENCES public.fleet_inspections(id) ON DELETE SET NULL,
  check_key text,
  repair_id uuid REFERENCES public.fleet_repairs(id) ON DELETE SET NULL,
  occurrences integer NOT NULL DEFAULT 1,
  last_seen_on date NOT NULL DEFAULT CURRENT_DATE,
  scheduled_date date,
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_work_items TO authenticated;
GRANT ALL ON public.fleet_work_items TO service_role;
ALTER TABLE public.fleet_work_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_work_items_company" ON public.fleet_work_items
  FOR ALL TO authenticated USING (public.fleet_can_access(company_id)) WITH CHECK (public.fleet_can_access(company_id));
CREATE INDEX IF NOT EXISTS idx_fleet_work_vehicle ON public.fleet_work_items(vehicle_id, status);

CREATE TABLE IF NOT EXISTS public.fleet_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id(),
  vehicle_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  spent_on date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'autres',
  description text,
  amount_before_tax numeric,
  taxes numeric,
  amount numeric NOT NULL DEFAULT 0,
  supplier text,
  odometer_km numeric,
  engine_hours numeric,
  document_url text,
  notes text,
  maintenance_id uuid REFERENCES public.fleet_maintenance(id) ON DELETE SET NULL,
  repair_id uuid REFERENCES public.fleet_repairs(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_expenses TO authenticated;
GRANT ALL ON public.fleet_expenses TO service_role;
ALTER TABLE public.fleet_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_expenses_company" ON public.fleet_expenses
  FOR ALL TO authenticated USING (public.fleet_can_access(company_id)) WITH CHECK (public.fleet_can_access(company_id));
CREATE INDEX IF NOT EXISTS idx_fleet_expenses_vehicle ON public.fleet_expenses(vehicle_id, spent_on DESC);

CREATE TABLE IF NOT EXISTS public.fleet_part_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id(),
  vehicle_id uuid REFERENCES public.trucks(id) ON DELETE CASCADE,
  name text NOT NULL,
  part_number text,
  brand text,
  supplier text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_part_refs TO authenticated;
GRANT ALL ON public.fleet_part_refs TO service_role;
ALTER TABLE public.fleet_part_refs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_part_refs_company" ON public.fleet_part_refs
  FOR ALL TO authenticated USING (public.fleet_can_access(company_id)) WITH CHECK (public.fleet_can_access(company_id));

CREATE TABLE IF NOT EXISTS public.fleet_service_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id(),
  vehicle_id uuid REFERENCES public.trucks(id) ON DELETE CASCADE,
  category text,
  name text NOT NULL,
  interval_km numeric,
  interval_hours numeric,
  interval_days integer,
  alert_days_before integer NOT NULL DEFAULT 14,
  alert_km_margin numeric NOT NULL DEFAULT 2000,
  alert_hours_margin numeric NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_service_programs TO authenticated;
GRANT ALL ON public.fleet_service_programs TO service_role;
ALTER TABLE public.fleet_service_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_service_programs_company" ON public.fleet_service_programs
  FOR ALL TO authenticated USING (public.fleet_can_access(company_id)) WITH CHECK (public.fleet_can_access(company_id));

CREATE TABLE IF NOT EXISTS public.fleet_inspection_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.jsc_default_company_id(),
  name text NOT NULL,
  category text,
  points jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_inspection_templates TO authenticated;
GRANT ALL ON public.fleet_inspection_templates TO service_role;
ALTER TABLE public.fleet_inspection_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_inspection_templates_company" ON public.fleet_inspection_templates
  FOR ALL TO authenticated USING (public.fleet_can_access(company_id)) WITH CHECK (public.fleet_can_access(company_id));

-- 5) Champs complémentaires sur les tables existantes ------------------
ALTER TABLE public.fleet_maintenance
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.fleet_service_programs(id) ON DELETE SET NULL;
ALTER TABLE public.fleet_repairs
  ADD COLUMN IF NOT EXISTS work_item_id uuid REFERENCES public.fleet_work_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mechanic text,
  ADD COLUMN IF NOT EXISTS labor_hours numeric;
ALTER TABLE public.fleet_inspections
  ADD COLUMN IF NOT EXISTS engine_hours numeric,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.fleet_inspection_templates(id) ON DELETE SET NULL;

-- 6) Compteurs : jamais de recul automatique ---------------------------
CREATE OR REPLACE FUNCTION public.fleet_apply_meter_reading()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_km numeric; v_h numeric;
BEGIN
  SELECT odometer_km, engine_hours INTO v_km, v_h FROM public.trucks WHERE id = NEW.vehicle_id;
  UPDATE public.trucks SET
    odometer_km = CASE
      WHEN NEW.odometer_km IS NULL THEN odometer_km
      WHEN NEW.is_correction THEN NEW.odometer_km
      WHEN v_km IS NULL OR NEW.odometer_km >= v_km THEN NEW.odometer_km
      ELSE odometer_km END,
    engine_hours = CASE
      WHEN NEW.engine_hours IS NULL THEN engine_hours
      WHEN NEW.is_correction THEN NEW.engine_hours
      WHEN v_h IS NULL OR NEW.engine_hours >= v_h THEN NEW.engine_hours
      ELSE engine_hours END,
    last_reading_at = greatest(coalesce(last_reading_at, NEW.read_at), NEW.read_at),
    updated_at = now()
  WHERE id = NEW.vehicle_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fleet_apply_meter_reading ON public.fleet_meter_readings;
CREATE TRIGGER trg_fleet_apply_meter_reading AFTER INSERT ON public.fleet_meter_readings
  FOR EACH ROW EXECUTE FUNCTION public.fleet_apply_meter_reading();

-- 7) Dépenses -> coûts, sans double comptabilisation --------------------
CREATE OR REPLACE FUNCTION public.fleet_sync_expense_cost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.fleet_costs WHERE source_table = 'fleet_expenses' AND source_id = NEW.id;
  IF coalesce(NEW.amount, 0) > 0 AND NEW.maintenance_id IS NULL AND NEW.repair_id IS NULL THEN
    INSERT INTO public.fleet_costs (company_id, vehicle_id, cost_type, amount, incurred_on, source_table, source_id, notes)
    VALUES (NEW.company_id, NEW.vehicle_id, NEW.category, NEW.amount, NEW.spent_on, 'fleet_expenses', NEW.id, NEW.description);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fleet_sync_expense_cost ON public.fleet_expenses;
CREATE TRIGGER trg_fleet_sync_expense_cost AFTER INSERT OR UPDATE ON public.fleet_expenses
  FOR EACH ROW EXECUTE FUNCTION public.fleet_sync_expense_cost();

DROP TRIGGER IF EXISTS trg_fleet_expense_delete_cost ON public.fleet_expenses;
CREATE OR REPLACE FUNCTION public.fleet_delete_expense_cost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.fleet_costs WHERE source_table = 'fleet_expenses' AND source_id = OLD.id;
  RETURN OLD;
END; $$;
CREATE TRIGGER trg_fleet_expense_delete_cost AFTER DELETE ON public.fleet_expenses
  FOR EACH ROW EXECUTE FUNCTION public.fleet_delete_expense_cost();

-- 8) updated_at sur les nouvelles tables --------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fleet_meter_readings','fleet_work_items','fleet_expenses','fleet_part_refs','fleet_service_programs','fleet_inspection_templates'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.fleet_touch_updated_at()', t);
  END LOOP;
END $$;

-- 9) Isolation par entreprise sur les tables de flotte existantes -------
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['fleet_maintenance','fleet_repairs','fleet_inspections','fleet_parts','fleet_costs'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY "%1$s_company" ON public.%1$s FOR ALL TO authenticated USING (public.fleet_can_access(company_id)) WITH CHECK (public.fleet_can_access(company_id))', t);
  END LOOP;
END $$;
